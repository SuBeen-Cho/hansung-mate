import type { StudentCourseRecord } from "@hansung/contracts";
export type PersonalRecord = StudentCourseRecord & {
  grade: string;
  origin: "DEMO" | "MANUAL";
  recognition: "UNVERIFIED";
};
export type PlanningCourse = {
  code: string;
  name: string;
  creditMilli: number;
  mappings: {
    track: string;
    category: string;
    sourceUrl: string;
    recommendedYear: string;
    semester: string;
  }[];
};
export type PlanningItem = { code: string; term: string; track: 1 | 2 };
export const PLANNING_ENGINE_VERSION = "mate-planning-3";
export const PASSING_GRADES = [
  "A+ · 4.5",
  "A0 · 4.0",
  "B+ · 3.5",
  "B0 · 3.0",
  "C+ · 2.5",
  "C0 · 2.0",
  "D+ · 1.5",
  "D0 · 1.0",
  "P",
];
export const RETAKE_GRADES = ["C+ · 2.5", "C0 · 2.0", "D+ · 1.5", "D0 · 1.0"];
export function earnedRecords(records: PersonalRecord[]) {
  return records.filter(
    (r) => PASSING_GRADES.includes(r.grade) && Number.isInteger(r.creditMilli) && r.creditMilli > 0,
  );
}
export function recordErrors(record: PersonalRecord, records: PersonalRecord[]) {
  const errors: string[] = [];
  if (![...PASSING_GRADES, "F", "NP"].includes(record.grade)) errors.push("성적을 확인해 주세요.");
  if (!record.name.trim()) errors.push("과목명을 입력해 주세요.");
  if (
    !Number.isInteger(record.creditMilli) ||
    record.creditMilli <= 0 ||
    record.creditMilli > 60000
  )
    errors.push("학점은 0보다 크고 60 이하로 입력해 주세요.");
  if (!/^[1-6]-[12]$/.test(record.term) && record.term !== "DEMO")
    errors.push("실제 수강 학기를 선택해 주세요.");
  if (
    record.courseCode &&
    records.some((r) => r.id !== record.id && r.courseCode === record.courseCode)
  )
    errors.push(
      "같은 과목코드는 기존 기록에서 수정해 주세요. 재수강했다면 최종 성적(최대 A)으로 바꿔 주세요.",
    );
  return errors;
}
export function allocationPreview(
  records: PersonalRecord[],
  catalog: PlanningCourse[],
  before: string[],
  after: string[],
) {
  return earnedRecords(records)
    .filter((r) => r.courseCode)
    .map((r) => {
      const c = catalog.find((c) => c.code === r.courseCode);
      const find = (tracks: string[]) =>
        tracks.flatMap((track, i) => {
          const m = c?.mappings.find((m) => m.track === track);
          return m ? [{ slot: i + 1, category: m.category, sourceUrl: m.sourceUrl }] : [];
        });
      return { ...r, before: find(before), after: find(after), recognition: "UNKNOWN" as const };
    });
}
export type PlanIssue = {
  level: "ERROR" | "WARNING" | "UNKNOWN";
  code: string;
  message: string;
  courseCode?: string;
  term?: string;
};
export function auditPlan(input: {
  items: PlanningItem[];
  records: PersonalRecord[];
  catalog: PlanningCourse[];
  tracks: string[];
  currentTerm: string;
  creditLimitMilli: number;
}) {
  const issues: PlanIssue[] = [];
  const seen = new Set<string>();
  const completed = new Set(earnedRecords(input.records).map((r) => r.courseCode));
  // Hansung: a course graded C+ or lower may be retaken; the new grade replaces it (max A).
  const retakeable = new Set(
    earnedRecords(input.records)
      .filter((r) => RETAKE_GRADES.includes(r.grade))
      .map((r) => r.courseCode),
  );
  const totals = new Map<string, number>();
  const retakeTotals = new Map<string, number>();
  const validLimit =
    Number.isInteger(input.creditLimitMilli) &&
    input.creditLimitMilli >= 1000 &&
    input.creditLimitMilli <= 30000;
  if (!validLimit)
    issues.push({
      level: "ERROR",
      code: "INVALID_LIMIT",
      message: "학기 목표 상한은 1~30학점으로 정해 주세요.",
    });
  for (const item of input.items) {
    const c = input.catalog.find((c) => c.code === item.code);
    const error = (code: string, message: string) =>
      issues.push({ level: "ERROR", code, message, courseCode: item.code, term: item.term });
    if (seen.has(item.code)) {
      error("DUPLICATE", "같은 과목이 계획에 두 번 들어 있어요.");
      continue;
    }
    seen.add(item.code);
    if (
      !c ||
      !Number.isInteger(c.creditMilli) ||
      c.creditMilli <= 0 ||
      ![1, 2].includes(item.track)
    ) {
      error("INVALID_COURSE", "과목·학점 또는 트랙 배정을 확인해 주세요.");
      continue;
    }
    if (!/^[1-6]-[12]$/.test(item.term)) {
      error("INVALID_TERM", "수강 예정 학기를 확인해 주세요.");
      continue;
    }
    if (!c.mappings.some((m) => m.track === input.tracks[item.track - 1]))
      error("TRACK_MISMATCH", `${c.name}: 선택한 트랙 과목표에 없어요.`);
    if (completed.has(item.code) && retakeable.has(item.code)) {
      const retaken = (retakeTotals.get(item.term) ?? 0) + c.creditMilli;
      retakeTotals.set(item.term, retaken);
      if (retaken > 3000) error("RETAKE_LIMIT", `${item.term} 재수강이 학기당 3학점을 넘어요.`);
      issues.push({
        level: "WARNING",
        code: "RETAKE",
        message: `${c.name}: 재수강 계획이에요. 최종 성적만 인정되고 최대 A까지 받을 수 있으며, 학기당 3학점·재학 중 12학점 한도가 있어요.`,
        courseCode: item.code,
        term: item.term,
      });
    } else if (completed.has(item.code)) {
      error("COMPLETED", `${c.name}: 이미 이수한 과목이에요. 중복 학점으로 계산하지 않아요.`);
      continue;
    }
    if (item.term < input.currentTerm)
      issues.push({
        level: "WARNING",
        code: "PAST_TERM",
        courseCode: item.code,
        term: item.term,
        message: `${c.name}: 현재보다 이전 학기로 계획했어요.`,
      });
    totals.set(item.term, (totals.get(item.term) ?? 0) + c.creditMilli);
  }
  for (const [term, credit] of totals)
    if (validLimit && credit > input.creditLimitMilli)
      issues.push({
        level: "WARNING",
        code: "PERSONAL_LIMIT",
        term,
        message: `${term}학기: 내가 정한 ${input.creditLimitMilli / 1000}학점 상한을 넘었어요.`,
      });
  if (input.items.length) {
    issues.push({
      level: "UNKNOWN",
      code: "OFFERING",
      message: "실제 개설 학기 미확인 · 과목표의 권장 학기를 개설 보장으로 사용하지 않아요.",
    });
    issues.push({
      level: "UNKNOWN",
      code: "PREREQUISITE",
      message: "선수과목·수강 제한 미확인 · 수강신청 전 강의계획서를 확인해 주세요.",
    });
    issues.push({
      level: "UNKNOWN",
      code: "RECOGNITION",
      message: "재수강·대체·트랙 간 중복 인정 미확인 · 이 계획은 공식 졸업 판정이 아니에요.",
    });
  }
  return {
    engineVersion: PLANNING_ENGINE_VERSION,
    status: issues.some((i) => i.level === "ERROR")
      ? ("INVALID" as const)
      : ("INDETERMINATE" as const),
    issues,
    terms: [...totals].map(([term, creditMilli]) => ({ term, creditMilli })),
  };
}

export function proposePlans(
  input: Parameters<typeof auditPlan>[0] & {
    preference: string;
    startTerm: string;
    terms: string[];
    count: number;
  },
) {
  const completed = new Set(earnedRecords(input.records).map((r) => r.courseCode));
  const existing = new Set(input.items.map((i) => i.code));
  const tokens = input.preference.split(/[\s,·]+/).filter((word) => word.length >= 2);
  const candidates = input.catalog.filter(
    (c) =>
      !completed.has(c.code) &&
      !existing.has(c.code) &&
      c.mappings.some((m) => input.tracks.includes(m.track)),
  );
  const terms = input.terms
    .filter((t) => /^[1-6]-[12]$/.test(t) && t >= input.startTerm && t >= input.currentTerm)
    .sort();
  return (["REQUIRED", "BALANCED", "INTEREST"] as const).map((strategy) => {
    const additions: PlanningItem[] = [];
    const reasons: { code: string; text: string; sourceUrl: string }[] = [];
    const totalByTerm = new Map(auditPlan(input).terms.map((t) => [t.term, t.creditMilli]));
    const interest = (c: PlanningCourse) =>
      tokens.some((token) => c.name.toLowerCase().includes(token.toLowerCase()));
    const required = (c: PlanningCourse) =>
      c.mappings.some((m) => input.tracks.includes(m.track) && m.category === "전필");
    const ranked = [...candidates].sort((a, b) => {
      if (strategy === "INTEREST" && interest(a) !== interest(b))
        return Number(interest(b)) - Number(interest(a));
      return Number(required(b)) - Number(required(a)) || a.code.localeCompare(b.code);
    });
    for (const c of ranked) {
      if (additions.length >= Math.min(8, Math.max(1, input.count))) break;
      const chosenTerms =
        strategy === "BALANCED"
          ? [...terms].sort(
              (a, b) => (totalByTerm.get(a) ?? 0) - (totalByTerm.get(b) ?? 0) || a.localeCompare(b),
            )
          : terms;
      const term = chosenTerms.find(
        (t) => (totalByTerm.get(t) ?? 0) + c.creditMilli <= input.creditLimitMilli,
      );
      if (!term) continue;
      const slot = input.tracks.findIndex((track) => c.mappings.some((m) => m.track === track)) + 1;
      if (slot !== 1 && slot !== 2) continue;
      const mapping = c.mappings.find((m) => m.track === input.tracks[slot - 1]);
      if (!mapping) continue;
      additions.push({ code: c.code, term, track: slot });
      totalByTerm.set(term, (totalByTerm.get(term) ?? 0) + c.creditMilli);
      reasons.push({
        code: c.code,
        sourceUrl: mapping.sourceUrl,
        text:
          strategy === "INTEREST" && interest(c)
            ? "입력한 관심 단어가 과목명과 일치해요."
            : strategy === "BALANCED"
              ? "계획 학점이 적은 학기부터 배치했어요."
              : `${mapping.category} 과목표 분류와 미이수 여부를 참고했어요.`,
      });
    }
    return {
      strategy,
      title: {
        REQUIRED: "필수부터 채우기",
        BALANCED: "학기 부담 나누기",
        INTEREST: "관심 분야 먼저",
      }[strategy],
      additions,
      reasons,
      audit: auditPlan({ ...input, items: [...input.items, ...additions] }),
    };
  });
}
