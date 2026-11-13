/**
 * Read-only overview shown on 홈 · 로드맵 · 남은 것 · 확인할 것.
 * It only composes academic-engine results and catalog lookups; no new credit rules live here.
 */
import {
  auditPlan,
  earnedRecords,
  type LiberalRecord,
  liberalArtsProgress,
  liberalRuleFor,
  type PersonalRecord,
  planningProgress,
} from "@hansung/academic-engine";
import {
  catalogCourses,
  catalogPrograms,
  coursesForTrack,
  findProgram,
  liberalAreaOf,
  liberalRules,
  pairingError,
  primaryMappingForTrack,
  procedures,
} from "../catalog";
import type { AcademicData } from "./academic-data-model";
import {
  academicCalendar,
  type ChangeKind,
  choicesFor,
  classifyChange,
  demoAllocatedRecords,
  demoPlanRecords,
  majorTargets,
  type PlanItem,
  type Profile,
  profileTerm,
  type SavedPlan,
  todayKst,
} from "./model";
import { planningTerms, termLabel } from "./SemesterBoard";

export const LIBERAL_CATEGORIES = ["교양필수", "선택필수", "자율교양"];
export type CourseKind = "MAJOR1" | "MAJOR2" | "LIBERAL" | "OTHER";
/** Plain words first; the school term stays next to it in small type. */
export const categoryWords: Record<string, { plain: string; school: string }> = {
  전기: { plain: "기초", school: "전기" },
  전필: { plain: "필수", school: "전필" },
  전선: { plain: "선택", school: "전선" },
  미분류: { plain: "구분 미공개", school: "미분류" },
  교양필수: { plain: "필수 교양", school: "교필" },
  선택필수: { plain: "분야별 교양", school: "배분이수" },
  자율교양: { plain: "자유 교양", school: "자율교양" },
  일선: { plain: "일반선택", school: "일선" },
};
export const slotWords = (slot: 1 | 2, single = false) =>
  single ? "단일 전공" : slot === 1 ? "주 전공" : "두 번째 전공";

/**
 * The plan the roadmap follows: the 대표 로드맵; otherwise the latest roadmap for the student's
 * own program pair (a saved 시나리오 is never shown as the roadmap unless chosen as 대표).
 */
export function roadmapPlan(
  plans: SavedPlan[],
  primaryPlanId?: string,
  profile?: Profile,
): SavedPlan | undefined {
  const primary = plans.find((p) => p.id === primaryPlanId);
  if (primary) return primary;
  if (!profile) return plans[0];
  return plans.find(
    (p) => !p.track1 || (p.track1 === profile.track1 && p.track2 === profile.track2),
  );
}
/** A saved roadmap may follow another program pair (a 시나리오); the roadmap uses the plan's pair. */
export function roadmapProfile(profile: Profile, plan: SavedPlan | undefined): Profile {
  return plan?.track1
    ? { ...profile, track1: plan.track1, track2: plan.track2 || profile.track2 }
    : profile;
}
/**
 * Hansung 트랙제: 1학년 is spent in the 학부 (교양·트랙기초), tracks split from 2학년.
 * Shown as three stages only when both programs are tracks; 학과제 keeps plain years.
 */
export function isTrackSystem(profile: Profile) {
  return (
    findProgram(profile.track1)?.kind === "TRACK" && findProgram(profile.track2)?.kind === "TRACK"
  );
}
export const stageOf = (term: string): 1 | 2 | 3 => {
  const year = Number(term.split("-")[0]);
  return year <= 1 ? 1 : year <= 3 ? 2 : 3;
};

export type RoadmapCourse = {
  key: string;
  /** Completed record id; only completed shared courses can be moved between programs. */
  recordId?: string | undefined;
  code?: string | undefined;
  name: string;
  creditMilli: number;
  kind: CourseKind;
  category: string;
  /** Listed in both programs' curricula (counted once). */
  shared: boolean;
  /** The student picked the program instead of the automatic rule. */
  chosen: boolean;
};
export type RoadmapTerm = {
  term: string;
  label: string;
  status: "DONE" | "NOW" | "PLAN";
  creditMilli: number;
  courses: RoadmapCourse[];
  overLimit: boolean;
};

const kindOf = (category: string, slot: number | null | undefined): CourseKind =>
  LIBERAL_CATEGORIES.includes(category)
    ? "LIBERAL"
    : slot === 1
      ? "MAJOR1"
      : slot === 2
        ? "MAJOR2"
        : "OTHER";

export function roadmapTerms(
  profile: Profile,
  data: AcademicData,
  items: PlanItem[],
  now = new Date(),
): { terms: RoadmapTerm[]; summaryMilli: number } {
  const current = profileTerm(profile, now);
  const earned = earnedRecords(data.records);
  const allocated = new Map(
    demoAllocatedRecords(
      profile.track1,
      profile.track2,
      earned,
      choicesFor(data.trackChoices, profile.track1, profile.track2),
    ).map((r) => [r.id, r]),
  );
  const byTerm = new Map<string, RoadmapCourse[]>();
  const push = (term: string, c: RoadmapCourse) =>
    byTerm.set(term, [...(byTerm.get(term) ?? []), c]);
  let summaryMilli = 0;
  for (const r of earned) {
    if (!/^[1-6]-[12]$/.test(r.term)) {
      summaryMilli += r.creditMilli;
      continue;
    }
    const a = r.courseCode ? allocated.get(r.id) : undefined;
    const category = LIBERAL_CATEGORIES.includes(r.category)
      ? r.category
      : (a?.category ?? r.category);
    push(r.term, {
      key: r.id,
      recordId: r.id,
      code: r.courseCode,
      name: r.name,
      creditMilli: r.creditMilli,
      kind: kindOf(category, a?.assignedTrack),
      category,
      shared: !!a?.shared,
      chosen: !!a?.chosen,
    });
  }
  const done = new Set(earned.map((r) => r.courseCode).filter(Boolean));
  for (const p of demoPlanRecords(items, profile.track1, profile.track2)) {
    const slot = items.find((i) => i.code === p.courseCode)?.track ?? null;
    if (done.has(p.courseCode) && p.term < current) continue;
    const course = catalogCourses.find((c) => c.code === p.courseCode);
    push(p.term, {
      key: `plan-${p.courseCode}`,
      code: p.courseCode,
      name: p.name,
      creditMilli: p.creditMilli,
      kind: kindOf(p.category, slot),
      category: p.category,
      shared:
        !!course &&
        profile.track1 !== profile.track2 &&
        !!primaryMappingForTrack(course, profile.track1) &&
        !!primaryMappingForTrack(course, profile.track2),
      chosen: false,
    });
  }
  const lastYear = Math.max(
    4,
    ...[...byTerm.keys()].map((t) => Number(t.split("-")[0])).filter(Number.isFinite),
  );
  const all = new Set([...byTerm.keys()]);
  for (let y = 1; y <= lastYear; y++)
    for (const s of [1, 2]) if (`${y}-${s}` >= current) all.add(`${y}-${s}`);
  const limit = data.creditLimit * 1000;
  const terms = [...all].sort().map((term) => {
    const courses = byTerm.get(term) ?? [];
    const creditMilli = courses.reduce((n, c) => n + c.creditMilli, 0);
    const status: RoadmapTerm["status"] =
      term < current ? "DONE" : term === current ? "NOW" : "PLAN";
    return {
      term,
      label: termLabel(term),
      status,
      creditMilli,
      courses,
      overLimit: status !== "DONE" && creditMilli > limit,
    };
  });
  return { terms, summaryMilli };
}

export type AreaProgress = {
  key: string;
  label: string;
  sub: string;
  targetMilli: number;
  completedMilli: number;
  plannedMilli: number;
};

/** 주 전공 · 두 번째 전공 · 교양 and the graduation total, from the same engine calls as 목표 학점. */
export function areaProgress(profile: Profile, data: AcademicData, items: PlanItem[]) {
  const { track1, track2, entryYear } = profile;
  const goal = majorTargets(track1, track2, entryYear);
  const earned = earnedRecords(data.records);
  const allocated = demoAllocatedRecords(
    track1,
    track2,
    earned.filter((r) => r.courseCode),
    choicesFor(data.trackChoices, track1, track2),
  );
  const totalRow = planningProgress(
    [
      ...allocated,
      ...earned.filter((r) => !r.courseCode),
      ...demoPlanRecords(items, track1, track2),
    ],
    goal,
  ).find((r) => r.key === "total");
  const slots: AreaProgress[] = (goal.single ? ([1] as const) : ([1, 2] as const)).map((slot) => {
    const owned = allocated.filter((r) => r.assignedTrack === slot);
    const planned = demoPlanRecords(
      items.filter((i) => i.track === slot),
      track1,
      track2,
    );
    const row = planningProgress([...owned, ...planned], {
      required: 0,
      elective: 0,
      total: goal.perTrack,
    }).find((r) => r.key === "total");
    return {
      key: `major${slot}`,
      label: slotWords(slot, goal.single),
      sub: (slot === 1 ? track1 : track2) || "선택 전",
      targetMilli: goal.perTrack,
      completedMilli: row?.completed ?? 0,
      plannedMilli: row?.planned ?? 0,
    };
  });
  const liberal = liberalProgressFor(entryYear, data.records);
  const areas = liberal
    ? [
        ...slots,
        {
          key: "liberal",
          label: "교양",
          sub: liberal.rule.cohorts,
          targetMilli: liberal.progress.total.target,
          completedMilli: liberal.progress.total.earned,
          plannedMilli: 0,
        },
      ]
    : slots;
  return {
    goal,
    areas,
    total: {
      targetMilli: goal.total,
      completedMilli: totalRow?.completed ?? 0,
      plannedMilli: totalRow?.planned ?? 0,
    },
  };
}

export function liberalProgressFor(entryYear: number, records: PersonalRecord[]) {
  const rule = liberalRuleFor(liberalRules, entryYear);
  if (!rule) return undefined;
  const liberal: LiberalRecord[] = earnedRecords(records)
    .filter((r) => LIBERAL_CATEGORIES.includes(r.category))
    .map((r) => ({
      name: r.name,
      creditMilli: r.creditMilli,
      category: r.category,
      area: liberalAreaOf(r.courseCode, r.name),
    }));
  return { rule, progress: liberalArtsProgress(rule, liberal) };
}

export type CheckTarget = "roadmap" | "profile" | "records" | "remaining";
export type Check = {
  id: string;
  level: "BLOCK" | "NOTE";
  where: string;
  title: string;
  detail?: string | undefined;
  target: CheckTarget;
};

/**
 * Every warning the student must look at, in two levels only:
 * BLOCK = the plan or application cannot go through as is; NOTE = confirm and move on.
 * Engine UNKNOWN items (개설·선수과목·인정 미확인) stay with the plan's 근거, not here.
 */
export function collectChecks(
  profile: Profile,
  data: AcademicData,
  plan: SavedPlan | undefined,
  now = new Date(),
): Check[] {
  const checks: Check[] = [];
  const pairing = pairingError(profile.track1, profile.track2);
  if (pairing)
    checks.push({
      id: "pairing",
      level: "BLOCK",
      where: "내 정보 · 전공",
      title: "두 번째 전공으로 고를 수 없는 조합이에요",
      detail: pairing,
      target: "profile",
    });
  const id = profile.studentId.trim();
  if (/^\d{7,}$/.test(id) && id.slice(0, 2) !== String(profile.entryYear).slice(2))
    checks.push({
      id: "student-id",
      level: "NOTE",
      where: "내 정보",
      title: "학번 앞자리와 입학년도가 달라요",
      detail: `편입·재입학이 아니라면 입학년도(${profile.entryYear})를 확인해 주세요.`,
      target: "profile",
    });
  if (data.creditLimit > 21 || data.creditLimit < 6)
    checks.push({
      id: "limit-range",
      level: "BLOCK",
      where: "남은 것 · 학기 상한",
      title: `학기 상한 ${data.creditLimit}학점은 학교 범위 밖이에요`,
      detail: "학교 수강신청 범위는 6~18학점, 직전학기 4.0 이상이면 21학점까지예요.",
      target: "remaining",
    });
  if (plan?.items.length) {
    const audit = auditPlan({
      items: plan.items,
      tracks: [plan.track1 || profile.track1, plan.track2 || profile.track2],
      records: data.records,
      catalog: catalogCourses,
      currentTerm: profileTerm(profile, now),
      creditLimitMilli: data.creditLimit * 1000,
    });
    audit.issues.forEach((issue, n) => {
      if (issue.level === "UNKNOWN") return;
      const blocking = issue.level === "ERROR" || issue.code === "PERSONAL_LIMIT";
      const termCredit = audit.terms.find((t) => t.term === issue.term)?.creditMilli ?? 0;
      checks.push({
        id: `plan-${issue.code}-${issue.courseCode ?? issue.term ?? n}`,
        level: blocking ? "BLOCK" : "NOTE",
        where: `로드맵 · ${issue.term ? termLabel(issue.term) : plan.name}`,
        title:
          issue.code === "PERSONAL_LIMIT"
            ? `학기 상한 ${data.creditLimit}학점을 ${(termCredit - data.creditLimit * 1000) / 1000}학점 넘어요`
            : issue.message,
        detail:
          issue.code === "PERSONAL_LIMIT"
            ? `지금 ${termCredit / 1000}학점이 담겨 있어요. 직전 학기 평점이 4.0 이상이면 21학점까지 들을 수 있어요.`
            : undefined,
        target: "roadmap",
      });
    });
  }
  for (const r of earnedRecords(data.records)) {
    const listed = r.courseCode ? catalogCourses.find((c) => c.code === r.courseCode) : undefined;
    if (listed && listed.creditMilli !== r.creditMilli)
      checks.push({
        id: `record-credit-${r.id}`,
        level: "NOTE",
        where: `이수 기록 · ${/^[1-6]-[12]$/.test(r.term) ? termLabel(r.term) : "요약"}`,
        title: `${r.name} 학점이 학교 과목표와 달라요`,
        detail: `입력 ${r.creditMilli / 1000}학점 · 학교 과목표 ${listed.creditMilli / 1000}학점. 성적표와 비교해 주세요.`,
        target: "records",
      });
  }
  return checks.sort((a, b) => (a.level === b.level ? 0 : a.level === "BLOCK" ? -1 : 1));
}

/** Next school deadlines and exams from the official calendar, earliest first. */
export function upcomingEvents(now = new Date(), count = 2) {
  const today = todayKst(now);
  const day = (d: string) => Date.parse(`${d}T00:00:00+09:00`);
  return [
    ...academicCalendar.events.map((e) => ({ name: e.name, start: e.start, end: e.end })),
    ...academicCalendar.exams.map((e) => ({
      name: (e.name ?? "시험").replace(/^\d{4}-\d /, ""),
      start: e.start,
      end: e.end,
    })),
  ]
    .filter((e) => e.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, count)
    .map((e) => ({
      ...e,
      ongoing: e.start <= today,
      daysLeft: Math.round((day(e.start) - day(today)) / 86_400_000),
    }));
}

export type Scenario = {
  id: string;
  name: string;
  track1: string;
  track2: string;
  /** Saved roadmap that holds this scenario, if any. */
  planId?: string | undefined;
};
export type ScenarioOutcome = {
  scenario: Scenario;
  kind: ChangeKind;
  pairing: string;
  majors: AreaProgress[];
  /** Credits needed before graduation: the larger of the total gap and the two major gaps. */
  leftMilli: number;
  termsLeft: number;
  graduationTerm: string;
  extraTerms: number;
  /** Completed major credits that stay major credits without any request. */
  keptMilli: number;
  /** Old 주 전공 courses that the new programs also list: major only after a 전공 인정 request. */
  recognizableMilli: number;
  /** Completed major credits that stop counting as major (전과: become 일반선택). */
  lostMilli: number;
  requiredLeft: number;
  apply?:
    | {
        type: string;
        label: string;
        start: string;
        end: string;
        /** true when this term's date is not out yet and last year's same-term window is shown. */
        lastYear: boolean;
      }
    | undefined;
  past: { term: string; total: number | null; accepted: number | null }[];
};

const procedureType: Partial<Record<ChangeKind, { type: string; label: string }>> = {
  TRANSFER: { type: "GENERAL_TRANSFER", label: "일반 전부(과) 신청" },
  TRACK_CHANGE: { type: "TRACK_CHANGE", label: "트랙변경 신청" },
};
const nextTerm = (term: string) => {
  const i = planningTerms.indexOf(term);
  return planningTerms[i + 1] ?? term;
};
function majorCreditsById(data: AcademicData, pair: [string, string]) {
  const earned = earnedRecords(data.records).filter((r) => r.courseCode);
  return new Map(
    demoAllocatedRecords(pair[0], pair[1], earned, choicesFor(data.trackChoices, ...pair)).map(
      (r) => [r.id, r.assignedTrack],
    ),
  );
}

/** What changes if the student follows another program pair, from the same allocation rule. */
export function scenarioOutcome(
  profile: Profile,
  data: AcademicData,
  scenario: Scenario,
  items: PlanItem[] = [],
  now = new Date(),
): ScenarioOutcome {
  const before: [string, string] = [profile.track1, profile.track2];
  const after: [string, string] = [scenario.track1, scenario.track2];
  const kind = classifyChange(before, after);
  const sp = { ...profile, track1: scenario.track1, track2: scenario.track2 };
  const { areas, total, goal } = areaProgress(sp, data, items);
  const majors = areas.filter((a) => a.key.startsWith("major"));
  const was = majorCreditsById(data, before);
  const now2 = majorCreditsById(data, after);
  let keptMilli = 0;
  let recognizableMilli = 0;
  let lostMilli = 0;
  const pendingBySlot = { 1: 0, 2: 0 };
  for (const r of earnedRecords(data.records).filter((x) => x.courseCode)) {
    const b = was.get(r.id);
    const a = now2.get(r.id);
    if (!b) continue;
    if (!a) lostMilli += r.creditMilli;
    else if (kind === "TRANSFER" && b === 1) {
      recognizableMilli += r.creditMilli;
      pendingBySlot[a] += r.creditMilli;
    } else keptMilli += r.creditMilli;
  }
  // 전과: old 주 전공 courses count as major again only after a recognition request,
  // so the gap is planned without them (the student may get some back).
  const majorGap = majors.reduce((n, a, i) => {
    const pending = pendingBySlot[(i + 1) as 1 | 2] ?? 0;
    return n + Math.max(0, a.targetMilli - (a.completedMilli - pending) - a.plannedMilli);
  }, 0);
  const totalGap = Math.max(0, total.targetMilli - total.completedMilli - total.plannedMilli);
  const leftMilli = Math.max(totalGap, majorGap) + total.plannedMilli;
  const limit = data.creditLimit * 1000;
  const termsLeft = Math.max(1, Math.ceil(leftMilli / limit));
  const current = profileTerm(profile, now);
  const start = planningTerms.indexOf(current);
  const graduationTerm =
    planningTerms[Math.min(planningTerms.length - 1, start + termsLeft - 1)] ?? current;
  const baseline = Math.max(0, planningTerms.indexOf("4-2") - start + 1);
  const done = new Set(earnedRecords(data.records).map((r) => r.courseCode));
  const requiredLeft = (goal.single ? [scenario.track1] : after).reduce(
    (n, track) =>
      n +
      coursesForTrack(track).filter(
        (c) => primaryMappingForTrack(c, track)?.category === "전필" && !done.has(c.code),
      ).length,
    0,
  );
  const proc = procedureType[kind];
  let apply: ScenarioOutcome["apply"];
  if (proc) {
    const today = todayKst(now);
    const target = nextTerm(current).replace(/^\d-/, "");
    const upcoming = academicCalendar.events.find((e) => e.type === proc.type && e.end >= today);
    const lastYear = [...academicCalendar.events]
      .reverse()
      .find((e) => e.type === proc.type && e.term.endsWith(`-${target}`));
    const pick = upcoming ?? lastYear;
    if (pick)
      apply = {
        type: proc.type,
        label: proc.label,
        start: pick.start,
        end: pick.end,
        lastYear: !upcoming,
      };
  }
  const changed = kind === "TRANSFER" || before[0] !== after[0] ? after[0] : after[1];
  const program = findProgram(changed);
  const names = [changed, program?.name, ...(program?.aliases ?? [])].filter(Boolean) as string[];
  const past = proc
    ? procedures
        .filter((p) => p.type === proc.type)
        .flatMap((p) => {
          const quota = p.quotas.find((q) => names.includes(q.unit));
          const result = p.results.filter((r) => names.some((n) => r.toUnit.includes(n)));
          if (!quota && !result.length) return [];
          return [
            {
              term: p.term,
              total: quota?.total ?? null,
              accepted: result.length ? result.reduce((n, r) => n + r.accepted, 0) : null,
            },
          ];
        })
        .reduce<ScenarioOutcome["past"]>((list, row) => {
          const prior = list.find((x) => x.term === row.term);
          if (!prior) {
            list.push(row);
            return list;
          }
          prior.total ??= row.total;
          prior.accepted ??= row.accepted;
          return list;
        }, [])
        .sort((a, b) => b.term.localeCompare(a.term))
        .slice(0, 3)
    : [];
  return {
    scenario,
    kind,
    pairing: pairingError(scenario.track1, scenario.track2),
    majors,
    leftMilli,
    termsLeft,
    graduationTerm,
    extraTerms: Math.max(0, termsLeft - baseline),
    keptMilli,
    recognizableMilli,
    lostMilli,
    requiredLeft,
    apply,
    past,
  };
}

/** Starting points for 다른 길 비교: keep, a same-학부 track change, plus saved scenario roadmaps. */
export function suggestedScenarios(profile: Profile, plans: SavedPlan[]): Scenario[] {
  const keep: Scenario = {
    id: "keep",
    name: "지금 그대로",
    track1: profile.track1,
    track2: profile.track2,
  };
  const list: Scenario[] = [keep];
  for (const plan of plans)
    if (
      plan.track1 &&
      (plan.track1 !== profile.track1 || plan.track2 !== profile.track2) &&
      !list.some((s) => s.track1 === plan.track1 && s.track2 === plan.track2)
    )
      list.push({
        id: `plan-${plan.id}`,
        name: plan.name,
        track1: plan.track1,
        track2: plan.track2,
        planId: plan.id,
      });
  const unit = findProgram(profile.track2)?.unit;
  const sibling = catalogPrograms
    .filter(
      (p) =>
        p.status === "ACTIVE" &&
        p.unit === unit &&
        p.kind === "TRACK" &&
        p.name !== profile.track1 &&
        p.name !== profile.track2 &&
        !pairingError(profile.track1, p.name),
    )
    .map((p) => p.name)[0];
  if (sibling && !list.some((s) => s.track1 === profile.track1 && s.track2 === sibling))
    list.push({
      id: "track-change",
      name: "트랙 변경",
      track1: profile.track1,
      track2: sibling,
    });
  return list;
}

export const changeWords: Record<ChangeKind, { label: string; hint: string }> = {
  NONE: { label: "지금 그대로", hint: "신청 없이 그대로 진행" },
  TRACK_CHANGE: { label: "트랙 변경", hint: "같은 학부 안에서 바꾸거나 두 번째 전공만 바꿔요" },
  TRANSFER: { label: "전과", hint: "주 전공이 다른 학부·학과로 바뀌어요" },
  FIRST_SELECT: { label: "처음 선택", hint: "전공을 처음 골라요" },
};

/**
 * Credits left before graduation for the roadmap's program pair, measured from the student's
 * current programs (so a 전과 roadmap does not count old 주 전공 courses before recognition).
 */
export function graduationLeft(
  base: Profile,
  data: AcademicData,
  roadmap: Profile,
  items: PlanItem[] = [],
  now = new Date(),
) {
  return scenarioOutcome(
    base,
    data,
    { id: "roadmap", name: "", track1: roadmap.track1, track2: roadmap.track2 },
    items,
    now,
  ).leftMilli;
}
