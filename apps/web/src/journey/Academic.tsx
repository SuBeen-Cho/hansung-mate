import {
  compareTrackCatalog,
  earnedRecords,
  formatCredit,
  HANSUNG_FUSION_I_2026,
  type PersonalRecord,
  PLANNING_ENGINE_VERSION,
  planningProgress,
  summarizeCourseRecords,
} from "@hansung/academic-engine";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  type CatalogCourse,
  catalogCourses,
  catalogTracks,
  coursesForTrack,
  isOffered,
  microDegrees,
  offeringTerm,
  pairingError,
  primaryMappingForTrack,
} from "../catalog";
import { initialRecords, useAcademicData } from "./AcademicData";
import { ChoiceField } from "./ChoiceField";
import { ACADEMIC_DRAFT_KEY, readDraft, useDraftStorage } from "./drafts";
import {
  choicesFor,
  demoAllocatedRecords,
  demoPlanRecords,
  majorTargets,
  type PlanItem,
  type Profile,
  profileTerm,
  type SavedPlan,
  uid,
} from "./model";
import { PlanReview, TrackAllocationPreview } from "./PlanReview";
import { PlanSuggestions } from "./PlanSuggestions";
import { ProcedureFacts } from "./ProcedureFacts";
import { planningTerms, SemesterBoard, termLabel } from "./SemesterBoard";

const statusNote: Record<string, string> = {
  LEGACY: "이전 교육과정 · 재학생용",
  FUTUREPLUS: "미래플러스대학",
  CONTRACT: "계약학과",
};
const kindNote: Record<string, string> = {
  DEPARTMENT: "학과",
  MAJOR: "전공",
  SELF_DESIGNED: "자기설계",
  CONTRACT: "계약학과",
};
export function TrackPicker({
  label,
  value,
  onChange,
  slot,
  pairWith,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  slot?: 1 | 2;
  pairWith?: string;
}) {
  const allowed = catalogTracks.filter(
    (p) =>
      (slot === 1 ? p.firstSlotAllowed : slot === 2 ? p.secondSlotAllowed : true) &&
      !(slot === 2 && pairWith && pairingError(pairWith, p.name)),
  );
  const order = (status: string) => (status === "ACTIVE" ? 0 : status === "LEGACY" ? 2 : 1);
  const options = [
    { value: "", label: "미선택" },
    ...[...allowed]
      .sort((a, b) => order(a.status) - order(b.status))
      .map((p) => ({
        value: p.name,
        label: p.name,
        description: [
          kindNote[p.kind],
          statusNote[p.status],
          p.courseCount ? `${p.courseCount}과목` : "과목표 미공개",
          slot && p.slotNote ? p.slotNote : "",
        ]
          .filter(Boolean)
          .join(" · "),
        group:
          p.status === "LEGACY"
            ? `${p.college ?? "소속 확인 중"} · 이전 트랙`
            : (p.college ?? "소속 확인 중"),
      })),
  ];
  if (value && !options.some((option) => option.value === value)) {
    options.push({ value, label: value, description: "저장된 이전 선택", group: "기타" });
  }
  return <ChoiceField label={label} value={value} options={options} onChange={onChange} />;
}
const semesterTitle: Record<string, string> = {
  "1": "1학기",
  "2": "2학기",
  "1·2": "1·2학기",
  계절: "계절학기",
};
/**
 * Groups a curriculum by recommended term in school order. Terms the school publishes outside the
 * regular 1·2학기 grid (1·2학기 공통, 계절학기, 학년 미정) get their own groups instead of being hidden.
 */
export function termGroups<T extends CatalogCourse>(list: T[], track: string) {
  const order = (year: string, semester: string) =>
    (Number(year) || 9) * 10 + ({ "1": 1, "1·2": 1.5, "2": 2, 계절: 3 }[semester] ?? 4);
  const groups = new Map<string, { key: string; title: string; sort: number; rows: T[] }>();
  for (const c of list) {
    const m = primaryMappingForTrack(c, track);
    const year = m?.recommendedYear ?? "미정";
    const semester = m?.semester ?? "미정";
    const key = `${year}-${semester}`;
    const title =
      year === "미정" || !Number(year)
        ? "학년 미정"
        : `${year}학년 ${semesterTitle[semester] ?? "학기 미정"}`;
    const group = groups.get(key) ?? { key, title, sort: order(year, semester), rows: [] };
    group.rows.push(c);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.sort - b.sort);
}
const targetNames = {
  required: "전공 필수(전필)",
  elective: "전공 자유 선택(전선)",
  total: "총 졸업학점",
};
function planProgress(
  items: PlanItem[],
  track1: string,
  track2: string,
  entryYear: number | undefined,
  records: PersonalRecord[] = initialRecords,
  choices: Record<string, 1 | 2> | undefined = undefined,
) {
  return planningProgress(
    [
      ...demoAllocatedRecords(
        track1,
        track2,
        earnedRecords(records).filter((r) => r.courseCode),
        choicesFor(choices, track1, track2),
      ),
      ...earnedRecords(records).filter((r) => !r.courseCode),
      ...demoPlanRecords(items, track1, track2),
    ],
    majorTargets(track1, track2, entryYear),
  );
}
const signedCredit = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatCredit(Math.abs(value))}`;
export function Targets({
  items,
  track1,
  track2,
  entryYear,
}: {
  items: PlanItem[];
  track1: string;
  track2: string;
  entryYear?: number;
}) {
  const data = useAcademicData();
  const rows = planProgress(items, track1, track2, entryYear, data.records, data.trackChoices);
  const allocated = demoAllocatedRecords(
    track1,
    track2,
    earnedRecords(data.records).filter((r) => r.courseCode),
    choicesFor(data.trackChoices, track1, track2),
  );
  const names = targetNames;
  const goal = majorTargets(track1, track2, entryYear);
  return (
    <section className="j-targets" aria-label="목표 학점">
      <div className="j-row">
        <h3>목표 학점</h3>
        <span className="j-tag">{goal.label}</span>
      </div>
      {rows.map((r) => (
        <div className="j-target" key={r.key}>
          <div className="j-row">
            <b>{names[r.key]}</b>
            <span>
              {formatCredit(r.completed)} 이수 + {formatCredit(r.planned)} 계획 /{" "}
              <strong>{formatCredit(r.target)}학점</strong>
            </span>
          </div>
          <progress
            aria-label={names[r.key]}
            value={Math.min(r.completed + r.planned, r.target)}
            max={r.target}
          />
          <small>계획까지 반영하면 {formatCredit(r.remaining)}학점 남아요</small>
        </div>
      ))}
      <div className="j-track-goals">
        {(goal.single ? ([1] as const) : ([1, 2] as const)).map((slot) => {
          const owned = allocated.filter((r) => r.assignedTrack === slot);
          const planned = demoPlanRecords(
            items.filter((i) => i.track === slot),
            track1,
            track2,
          );
          const total = planningProgress([...owned, ...planned], {
            required: 0,
            elective: 0,
            total: goal.perTrack,
          }).find((r) => r.key === "total");
          return (
            <p key={slot}>
              {goal.single ? "단일 전공" : `${slot}트랙`} · {formatCredit(total?.completed ?? 0)}{" "}
              이수 + {formatCredit(total?.planned ?? 0)} 계획 / {formatCredit(goal.perTrack)}학점
            </p>
          );
        })}
      </div>
      <p className="j-caption">
        데모 배정은 같은 과목코드를 1트랙 우선으로 한 번만 배정합니다. 미일치 과목의 전공 인정은
        미확인으로 남겨요.
      </p>
      <p className="j-caption">
        전공 기준: {goal.basis} (17학번 이후 학교 안내). 총 {formatCredit(goal.total)}학점은 계획용
        목표이며 학번·전형별 졸업 기준은 학사 안내로 확인해요.
      </p>
    </section>
  );
}
export function CourseList({
  track,
  completedOnly = false,
  onPick,
  items = [],
}: {
  track: string;
  completedOnly?: boolean;
  onPick?: (code: string) => void;
  items?: PlanItem[];
}) {
  const data = useAcademicData();
  const records = earnedRecords(data.records);
  const [onlyDone, setOnlyDone] = useState(completedOnly);
  const [query, setQuery] = useState("");
  const [detailCode, setDetailCode] = useState("");
  const list = coursesForTrack(track).filter(
    (c) =>
      (!query || `${c.name} ${c.code}`.includes(query)) &&
      (!onlyDone || records.some((r) => r.courseCode === c.code)),
  );
  return (
    <>
      <div className="j-row j-wrap">
        <label className="j-check">
          <input
            type="checkbox"
            checked={onlyDone}
            onChange={(e) => setOnlyDone(e.target.checked)}
          />
          이수한 과목만
        </label>
        <span className="j-caption">
          {data.records.some((r) => r.origin === "DEMO") ? "가상 성적 포함" : "직접 입력한 성적"}
        </span>
      </div>
      <label className="j-field">
        과목명·코드 검색
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="전체 학년에서 찾기"
        />
      </label>
      {termGroups(list, track).map(({ key, title, rows }) => {
        return (
          <section key={key} className="j-term">
            <h3>
              {title} <small>권장 학기</small>
            </h3>
            {rows.map((c) => {
              const done = records.find((r) => r.courseCode === c.code);
              const selected = items.some((i) => i.code === c.code);
              const category = primaryMappingForTrack(c, track)?.category;
              return (
                <article className={`j-course${done ? " j-course-completed" : ""}`} key={c.code}>
                  <div>
                    <div className="j-course-badges">
                      <span
                        className="j-course-category"
                        data-category={category}
                        title={
                          category === "전필"
                            ? "전공 필수"
                            : category === "전선"
                              ? "전공 선택"
                              : undefined
                        }
                      >
                        {category ?? "분류 확인 중"}
                      </span>
                      {isOffered(c.code) && (
                        <span className="j-course-offered" title="이번 학기 강의시간표에 있는 과목">
                          {offeringTerm} 개설
                        </span>
                      )}
                      {done && (
                        <span className="j-course-completion">
                          <Check size={14} strokeWidth={2.5} aria-hidden="true" /> 이수 완료
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="j-course-title"
                      aria-expanded={detailCode === c.code}
                      onClick={() => setDetailCode(detailCode === c.code ? "" : c.code)}
                    >
                      {c.name}
                    </button>
                    <small>{c.code}</small>
                  </div>
                  <div className="j-credit-grade">
                    <span>{formatCredit(c.creditMilli)}학점</span>
                    <strong>{done?.grade ?? "미수강"}</strong>
                  </div>
                  {onPick && !done && (
                    <button
                      type="button"
                      className={selected ? "j-small selected" : "j-small"}
                      onClick={() => onPick(c.code)}
                      aria-label={`${c.name} ${selected ? "계획에서 빼기" : "계획에 담기"}`}
                    >
                      {selected ? <Check size={17} /> : "+"}
                      <span>{selected ? "담음" : "담기"}</span>
                    </button>
                  )}
                  {detailCode === c.code && (
                    <section className="j-course-detail" aria-label={`${c.name} 상세`}>
                      <h4>과목 상세</h4>
                      <p>
                        {track} · {primaryMappingForTrack(c, track)?.category}
                      </p>
                      <p>
                        권장 {title} · 실제 수강 {done ? termLabel(done.term) : "미수강"} · 내 성적{" "}
                        {done?.grade ?? "미수강"}
                      </p>
                      <p>
                        동일 코드가 있는 트랙:{" "}
                        {c.mappings
                          .map((m) => m.track)
                          .filter((value, i, all) => all.indexOf(value) === i)
                          .join(", ")}
                      </p>
                      <p className="j-caption">
                        선수과목·실제 개설 학기·중복 인정은 아직 확인되지 않았어요.
                      </p>
                      <a
                        href={primaryMappingForTrack(c, track)?.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        공식 과목표 보기
                      </a>
                    </section>
                  )}
                </article>
              );
            })}
          </section>
        );
      })}
      {!list.length && (
        <div className="j-empty">
          <img className="j-mascot" src="/brand/boogie-sorry.png" alt="" width="96" height="96" />이
          조건의 과목표가 없어요. 학교 홈페이지에 과목표가 공개되지 않은 트랙이거나 이수 필터가 켜져
          있어요.
        </div>
      )}
      <p className="j-caption">
        권장 학년과 실제 수강 예정 학기는 다릅니다. 개설 여부·선수과목은 학교 확인이 필요해요.
      </p>
    </>
  );
}
type AcademicDraft = {
  view: "overview" | "courses" | "wizard" | "planner";
  slot: 1 | 2;
  step: number;
  mode: string;
  t1: string;
  t2: string;
  optional: string;
  items: PlanItem[];
  term: string;
  editingId: string;
  planName: string;
  createdAt: string;
  revision: number;
};
function isAcademicDraft(v: unknown): v is AcademicDraft {
  if (!v || typeof v !== "object") return false;
  const d = v as AcademicDraft;
  return (
    ["wizard", "planner"].includes(d.view) &&
    typeof d.t1 === "string" &&
    typeof d.t2 === "string" &&
    Array.isArray(d.items) &&
    d.items.every(
      (i) => typeof i.code === "string" && typeof i.term === "string" && [1, 2].includes(i.track),
    ) &&
    typeof d.term === "string" &&
    [0, 1, 2].includes(d.step)
  );
}
export function Academic({
  profile,
  onProfile,
  onSave,
  initialPlan,
  onLeavePlan,
}: {
  profile: Profile;
  onProfile: (p: Profile) => void;
  onSave: (p: SavedPlan) => void;
  initialPlan?: SavedPlan | undefined;
  onLeavePlan: () => void;
}) {
  const data = useAcademicData();
  const records = earnedRecords(data.records);
  const [restored] = useState(() =>
    initialPlan ? null : readDraft(ACADEMIC_DRAFT_KEY, isAcademicDraft),
  );
  const [view, setView] = useState<"overview" | "courses" | "wizard" | "planner">(
    initialPlan ? "planner" : (restored?.view ?? "overview"),
  );
  const [slot, setSlot] = useState<1 | 2>(restored?.slot ?? 1);
  const [step, setStep] = useState(restored?.step ?? 0);
  const [mode, setMode] = useState(restored?.mode ?? "KEEP");
  const [t1, setT1] = useState(initialPlan?.track1 ?? restored?.t1 ?? profile.track1);
  const [t2, setT2] = useState(initialPlan?.track2 ?? restored?.t2 ?? profile.track2);
  const [optional, setOptional] = useState(
    initialPlan?.optional ?? restored?.optional ?? profile.optional,
  );
  const [items, setItems] = useState<PlanItem[]>(initialPlan?.items ?? restored?.items ?? []);
  const [term, setTerm] = useState(restored?.term ?? profileTerm(profile));
  const [editingId, setEditingId] = useState(initialPlan?.id ?? restored?.editingId ?? "");
  const [planName, setPlanName] = useState(initialPlan?.name ?? restored?.planName ?? "");
  const [createdAt, setCreatedAt] = useState(initialPlan?.createdAt ?? restored?.createdAt ?? "");
  const [revision, setRevision] = useState(initialPlan?.revision ?? restored?.revision ?? 0);
  const [notice, setNotice] = useState(restored ? "이전에 작성하던 계획을 복원했어요." : "");
  const draftError = useDraftStorage(
    ACADEMIC_DRAFT_KEY,
    {
      view: (view === "overview" || view === "courses") && items.length ? "planner" : view,
      slot,
      step,
      mode,
      t1,
      t2,
      optional,
      items,
      term,
      editingId,
      planName,
      createdAt,
      revision,
    },
    ["wizard", "planner"].includes(view) || items.length > 0,
  );
  const [plannerView, setPlannerView] = useState<"catalog" | "semesters">("catalog");
  const [pendingChange, setPendingChange] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [dockCompact, setDockCompact] = useState(false);
  const targetsRef = useRef<HTMLDivElement>(null);
  const [creditFeedback, setCreditFeedback] = useState<{
    message: string;
    before: ReturnType<typeof planProgress>;
    version: number;
  } | null>(null);
  const progress = planProgress(items, t1, t2, profile.entryYear, data.records, data.trackChoices);
  const summary = summarizeCourseRecords(records);
  // Same department in both slots = one 78-credit curriculum; keep every pick on slot 1.
  const activeSlot: 1 | 2 = t1 && t1 === t2 ? 1 : slot;
  const activeTrack = activeSlot === 1 ? t1 : t2;
  function save(asCopy = false) {
    const now = new Date().toISOString();
    const plan: SavedPlan = {
      id: asCopy || !editingId ? uid() : editingId,
      name: (planName.trim() || `${t1 || "미선택"} + ${t2 || "미선택"}`) + (asCopy ? " 사본" : ""),
      track1: t1,
      track2: t2,
      optional,
      items: [...items],
      createdAt: asCopy ? now : createdAt || now,
      updatedAt: now,
      revision: asCopy ? 1 : revision + 1,
      mode: "DEMO",
      recordRevision: data.revision,
      engineVersion: PLANNING_ENGINE_VERSION,
      rulePackId: HANSUNG_FUSION_I_2026.id,
    };
    onSave(plan);
    setEditingId(plan.id);
    setPlanName(plan.name);
    setCreatedAt(plan.createdAt);
    setRevision(plan.revision ?? 1);
    setNotice("로드맵을 내 정보에 저장했어요.");
    return plan;
  }
  function openWizard() {
    if (items.length) setPendingChange(true);
    else {
      if (view === "overview") {
        setT1(profile.track1);
        setT2(profile.track2);
        setOptional(profile.optional);
      }
      setTerm(profileTerm(profile));
      setView("wizard");
      setStep(0);
    }
  }
  function updatePlan(next: PlanItem[], message: string) {
    setCreditFeedback((prev) => ({ message, before: progress, version: (prev?.version ?? 0) + 1 }));
    setItems(next);
    setNotice("");
  }
  function add(code: string) {
    const existing = items.find((i) => i.code === code);
    const course = catalogCourses.find((c) => c.code === code);
    if (!course) return;
    const category =
      primaryMappingForTrack(
        course,
        existing?.track === 1 ? t1 : existing?.track === 2 ? t2 : activeTrack,
      )?.category ?? "미분류";
    updatePlan(
      existing
        ? items.filter((i) => i.code !== code)
        : [...items, { code, term, track: activeSlot }],
      `${course.name} ${existing ? "뺐어요" : "담았어요"} · ${category} ${signedCredit(existing ? -course.creditMilli : course.creditMilli)}학점`,
    );
  }
  if (view === "overview")
    return (
      <div className="j-stack">
        <div>
          <p className="j-eyebrow">MY CAMPUS PLANNER</p>
          <h1>내 학업 상태예요</h1>
        </div>
        <div className="j-track-pair">
          {(profile.track1 && profile.track1 === profile.track2
            ? ([1] as const)
            : ([1, 2] as const)
          ).map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => {
                setSlot(n);
                setView("courses");
              }}
            >
              <span>
                {profile.track1 && profile.track1 === profile.track2 ? "1·2트랙 심화" : `${n}트랙`}
              </span>
              <b>{n === 1 ? profile.track1 || "선택 전" : profile.track2 || "선택 전"}</b>
              <ChevronRight size={19} />
            </button>
          ))}
        </div>
        <small className="j-caption">
          추가 과정 · {profile.optional || "마이크로디그리·부전공 선택 안 함"}
        </small>
        <section className="j-paper">
          <span>현재 이수 학점</span>
          <div className="j-big-number">
            {formatCredit(summary.completedCreditMilli)}
            <small>학점</small>
          </div>
          <div className="j-credit-split">
            <span>
              전공{" "}
              {formatCredit(
                summarizeCourseRecords(
                  records.filter((r) => ["전기", "전필", "전선"].includes(r.category)),
                ).completedCreditMilli,
              )}
            </span>
            <span>
              교양{" "}
              {formatCredit(
                summarizeCourseRecords(
                  records.filter((r) => ["교양필수", "선택필수", "자율교양"].includes(r.category)),
                ).completedCreditMilli,
              )}
            </span>
            <span>
              일반{" "}
              {formatCredit(
                summarizeCourseRecords(records.filter((r) => r.category === "일선"))
                  .completedCreditMilli,
              )}
            </span>
          </div>
          <details>
            <summary>분류별 학점과 학점 인정 보기</summary>
            {summary.categoryCredits.map((c) => (
              <p key={c.category}>
                {c.category} · {formatCredit(c.completedCreditMilli)}학점
              </p>
            ))}
            <p>
              K-MOOC·학점 교류 인정: 데모 기록 없음. 인정 결과와 증빙을 별도로 보관할 예정이에요.
            </p>
          </details>
        </section>
        <button type="button" className="j-primary" onClick={openWizard}>
          내 로드맵 만들기 <ArrowRight size={18} />
        </button>
        <button
          type="button"
          className="j-link"
          onClick={() => {
            setMode("CHANGE");
            openWizard();
          }}
        >
          전과하거나 트랙을 바꾸고 싶어요
        </button>
        <p className="j-caption">최종 졸업 요건 확인은 내 정보에서 볼 수 있어요.</p>
      </div>
    );
  if (view === "courses")
    return (
      <div className="j-stack">
        <button className="j-back" type="button" onClick={() => setView("overview")}>
          <ArrowLeft size={18} />
          학업
        </button>
        <h1>{slot}트랙 과목</h1>
        <p>{(slot === 1 ? profile.track1 : profile.track2) || "트랙을 먼저 선택해 주세요"}</p>
        <CourseList track={slot === 1 ? profile.track1 : profile.track2} />
      </div>
    );
  if (view === "wizard") {
    const entries = coursesForTrack(t1).concat(coursesForTrack(t2));
    const comparison = compareTrackCatalog(records, [
      ...new Map(
        entries.map((c) => [
          c.code,
          {
            code: c.code,
            name: c.name,
            creditMilli: c.creditMilli,
            category:
              primaryMappingForTrack(c, t1)?.category ??
              primaryMappingForTrack(c, t2)?.category ??
              "전선",
            recommendedYear: "",
            semester: "",
          },
        ]),
      ).values(),
    ]);
    return (
      <div className="j-stack j-enter" key={`wizard-${step}`}>
        <button
          className="j-back"
          type="button"
          onClick={() => (step ? setStep(step - 1) : setView("overview"))}
        >
          <ArrowLeft size={18} />
          이전
        </button>
        <p className="j-eyebrow">로드맵 시작 · {step + 1} / 3</p>
        {step === 0 ? (
          <>
            <h1>어떤 계획을 세울까요?</h1>
            {[
              ["KEEP", "현재 전공으로 계획할래요"],
              ["CHANGE", "트랙 변경·전과를 고민해요"],
              ["FIRST", "처음 트랙을 결정할래요"],
            ].map(([v, label]) => (
              <button
                type="button"
                className={`j-choice ${mode === v ? "selected" : ""}`}
                aria-pressed={mode === v}
                key={v}
                onClick={() => setMode(v ?? "KEEP")}
              >
                {label}
                <ChevronRight size={18} />
              </button>
            ))}
            <button
              className="j-primary"
              type="button"
              onClick={() => {
                if (mode === "FIRST") {
                  setT1("");
                  setT2("");
                }
                setStep(1);
              }}
            >
              다음
            </button>
          </>
        ) : step === 1 ? (
          <>
            <h1>{mode === "KEEP" ? "현재 트랙을 확인할게요" : "1·2트랙을 각각 선택해요"}</h1>
            <TrackPicker
              label="1트랙"
              {...(mode === "KEEP" ? {} : { slot: 1 as const })}
              value={t1}
              onChange={setT1}
            />
            <TrackPicker
              label="2트랙"
              {...(mode === "KEEP" ? {} : { slot: 2 as const, pairWith: t1 })}
              value={t2}
              onChange={setT2}
            />
            <ChoiceField
              label="추가 과정 · 선택 사항"
              value={optional}
              onChange={setOptional}
              options={[
                { value: "", label: "없음" },
                ...microDegrees.map((m) => ({
                  value: m.name,
                  label: m.name,
                  description: `MD 유형${m.mdType} · ${formatCredit(m.creditMilli)}학점${m.courses.length ? ` · ${m.courses.length}과목` : ""}`,
                  group: `마이크로디그리 · ${m.category}`,
                })),
                ...catalogTracks
                  .filter((p) => p.status === "ACTIVE" && p.name !== t1 && p.name !== t2)
                  .map((p) => ({
                    value: `부전공 · ${p.name}`,
                    label: `${p.name} 부전공`,
                    description: "전기 3 · 전필 12 · 전선 6 = 21학점",
                    group: "부전공",
                  })),
              ]}
            />
            <p className="j-caption">
              학과제와 트랙제를 선택해 흐름을 체험할 수 있어요. 실제 선택 가능한 조합은 아직
              판정하지 않아요.
            </p>
            {pairingError(t1, t2) && <p className="j-warning">{pairingError(t1, t2)}</p>}
            <button
              className="j-primary"
              type="button"
              disabled={!t1 || !t2 || !!pairingError(t1, t2)}
              onClick={() => setStep(2)}
            >
              이 조합으로 비교하기
            </button>
          </>
        ) : (
          <>
            <h1>변경하면 무엇이 달라질까요?</h1>
            <section className="j-paper">
              <h3>지금 이수한 과목 중</h3>
              <p className="j-big-number">
                {comparison.matched.length}
                <small>과목이 새 과목표와 겹쳐요</small>
              </p>
              <p>{formatCredit(comparison.matchedCreditMilli)}학점 · 과목코드 기준</p>
              <p className="j-caption">
                겹침은 전공 인정 확정이 아닙니다. 실제 전공 인정과 남은 학점은 입학년도별 규칙을
                확보한 뒤 계산합니다.
              </p>
            </section>
            <details open>
              <summary>신청 일정과 선발 정보</summary>
              <ProcedureFacts mode={mode} targets={[t1, t2]} />
            </details>
            <TrackAllocationPreview before={[profile.track1, profile.track2]} after={[t1, t2]} />
            <Targets items={[]} track1={t1} track2={t2} entryYear={profile.entryYear} />
            <button
              className="j-primary"
              type="button"
              onClick={() => {
                setItems([]);
                setEditingId("");
                setPlanName("");
                setCreatedAt("");
                setRevision(0);
                setCreditFeedback(null);
                setView("planner");
              }}
            >
              로드맵을 설계할래요
            </button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="j-stack j-planner">
      <p className={draftError ? "j-error" : "j-caption"} role={draftError ? "alert" : undefined}>
        {draftError
          ? "임시 저장을 사용할 수 없어요. 저장 공간을 확인해 주세요."
          : "이 브라우저에 작성 내용을 임시 저장해요."}
      </p>
      <div className="j-row">
        <div>
          <p className="j-eyebrow">SEMESTER ROADMAP</p>
          <h1>나의 다음 학기</h1>
        </div>
        <Bookmark size={25} />
      </div>
      <div className="j-tabs">
        {(t1 && t1 === t2 ? ([1] as const) : ([1, 2] as const)).map((n) => (
          <button key={n} type="button" aria-pressed={activeSlot === n} onClick={() => setSlot(n)}>
            {t1 && t1 === t2 ? "단일 전공(심화)" : `${n}트랙`}
          </button>
        ))}
      </div>
      <b>{activeTrack}</b>
      <div ref={targetsRef} tabIndex={-1} className="j-target-anchor">
        <Targets items={items} track1={t1} track2={t2} entryYear={profile.entryYear} />
      </div>
      <div className="j-tabs">
        <button
          type="button"
          aria-pressed={plannerView === "catalog"}
          onClick={() => setPlannerView("catalog")}
        >
          과목 찾기
        </button>
        <button
          type="button"
          aria-pressed={plannerView === "semesters"}
          onClick={() => setPlannerView("semesters")}
        >
          학기별 계획
        </button>
      </div>
      {plannerView === "semesters" ? (
        <SemesterBoard
          items={items}
          track1={t1}
          track2={t2}
          profile={profile}
          onChange={(next) => updatePlan(next, "학기별 계획을 반영했어요")}
        />
      ) : (
        <>
          <ChoiceField
            label="지금 담을 수강 예정 학기"
            value={term}
            options={planningTerms.map((value) => ({ value, label: termLabel(value) }))}
            onChange={setTerm}
          />
          <p className="j-caption">1학년 권장 과목도 3·4학년의 수강 예정 학기에 담을 수 있어요.</p>
          <button className="j-secondary" type="button" onClick={() => setAiOpen(!aiOpen)}>
            <Sparkles size={18} />
            AI와 계획 방향 잡기 · 데모
          </button>
          {aiOpen && (
            <PlanSuggestions
              items={items}
              tracks={[t1, t2]}
              profile={profile}
              term={term}
              onApply={(additions) =>
                updatePlan([...items, ...additions], `추천 과목 ${additions.length}개 담았어요`)
              }
            />
          )}
          <CourseList track={activeTrack} onPick={add} items={items} />
          <section className="j-paper">
            <h3>선택한 과목 · {items.length}개</h3>
            {items.length ? (
              items.map((i) => {
                const c = catalogCourses.find((c) => c.code === i.code);
                return (
                  <div className="j-plan-item" key={i.code}>
                    <b>{c?.name}</b>
                    <span>
                      {i.track}트랙 · {formatCredit(c?.creditMilli ?? 0)}학점
                    </span>
                    <label>
                      수강 예정 학기
                      <select
                        aria-label={`${c?.name} 수강 예정 학기`}
                        value={i.term}
                        onChange={(e) => {
                          const value = e.target.value;
                          setItems((prev) =>
                            prev.map((p) => (p.code === i.code ? { ...p, term: value } : p)),
                          );
                        }}
                      >
                        {planningTerms.map((term) => (
                          <option key={term} value={term}>
                            {termLabel(term)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="j-link" type="button" onClick={() => add(i.code)}>
                      계획에서 빼기
                    </button>
                  </div>
                );
              })
            ) : (
              <p>위 과목표에서 수강할 과목을 담아 주세요.</p>
            )}
          </section>
        </>
      )}
      <PlanReview items={items} tracks={[t1, t2]} profile={profile} />
      <label className="j-field">
        계획 이름
        <input
          value={planName}
          maxLength={60}
          placeholder={`${t1} + ${t2}`}
          onChange={(e) => setPlanName(e.target.value)}
        />
      </label>
      <button type="button" className="j-primary" onClick={() => save()}>
        {editingId ? "로드맵 수정 저장" : "현재 로드맵 저장"}
      </button>
      {editingId && (
        <button type="button" className="j-secondary" onClick={() => save(true)}>
          복사해서 새 계획 만들기
        </button>
      )}
      <button
        type="button"
        className="j-secondary"
        onClick={() => {
          save();
          onProfile({ ...profile, track1: t1, track2: t2, optional });
          setNotice("이 조합을 데모 학업 화면에 적용했어요. 학교 학적은 바뀌지 않아요.");
        }}
      >
        이 계획을 학업 화면에 적용
      </button>
      <button type="button" className="j-link" onClick={openWizard}>
        <SlidersHorizontal size={17} />
        다른 트랙으로 다시 계획하기
      </button>
      {pendingChange && (
        <section className="j-paper" role="dialog" aria-label="현재 계획 저장">
          <h3>현재 계획을 저장할까요?</h3>
          <div className="j-stack">
            <button
              className="j-primary"
              type="button"
              onClick={() => {
                save();
                setPendingChange(false);
                setStep(0);
                setView("wizard");
              }}
            >
              저장하고 다른 트랙 선택
            </button>
            <button
              className="j-secondary"
              type="button"
              onClick={() => {
                setPendingChange(false);
                setItems([]);
                setEditingId("");
                setPlanName("");
                setCreatedAt("");
                setRevision(0);
                setCreditFeedback(null);
                setStep(0);
                setView("wizard");
              }}
            >
              저장하지 않고 변경
            </button>
            <button className="j-link" type="button" onClick={() => setPendingChange(false)}>
              돌아가기
            </button>
          </div>
        </section>
      )}
      <button
        type="button"
        className="j-link"
        onClick={() => {
          setView("overview");
          onLeavePlan();
        }}
      >
        학업으로 돌아가기
      </button>
      <aside
        className={`j-credit-dock${dockCompact ? " j-credit-dock-compact" : ""}`}
        aria-label="실시간 목표 학점"
      >
        <div className="j-row">
          <b>
            담은 과목 {items.length}개 · 계획{" "}
            {formatCredit(progress.find((r) => r.key === "total")?.planned ?? 0)}학점
          </b>
          <button
            className="j-link"
            type="button"
            onClick={() => {
              targetsRef.current?.scrollIntoView({ block: "start" });
              targetsRef.current?.focus({ preventScroll: true });
            }}
          >
            목표 보기 <ChevronRight size={15} />
          </button>
        </div>
        <output aria-live="polite" aria-atomic="true" className="j-credit-change">
          <span key={creditFeedback?.version ?? 0}>
            {creditFeedback?.message ?? "과목을 담으면 학점 변화가 바로 보여요"}
          </span>
        </output>
        <button
          className="j-link j-dock-toggle"
          type="button"
          aria-expanded={!dockCompact}
          onClick={() => setDockCompact(!dockCompact)}
        >
          {dockCompact ? "학점 상세 펼치기" : "학점 상세 접기"}
        </button>
        <div className="j-credit-dock-values" hidden={dockCompact}>
          {progress.map((r) => {
            const previous = creditFeedback?.before.find((p) => p.key === r.key);
            const delta = previous ? r.planned - previous.planned : 0;
            return (
              <section key={r.key} aria-label={`${targetNames[r.key]} 계획 반영 학점`}>
                <span>{targetNames[r.key]}</span>
                <p>
                  <b>{formatCredit(r.completed + r.planned)}</b>
                  <small> / {formatCredit(r.target)}</small>
                </p>
                <small className={delta ? "j-credit-delta" : ""}>
                  {delta ? `${signedCredit(delta)}학점 · ` : ""}남은 {formatCredit(r.remaining)}
                </small>
              </section>
            );
          })}
        </div>
        <small className="j-dock-caption">
          이수 + 계획 / 목표 · 학교 최소 이수학점 기준 · 전기는 총 학점에만 반영
        </small>
      </aside>
      {notice && <output className="j-feedback">{notice}</output>}
    </div>
  );
}
