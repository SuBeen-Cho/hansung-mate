import { formatCredit } from "@hansung/academic-engine";
import { AlertTriangle, Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import { findProgram, graduationFor } from "../catalog";
import { type AcademicData, useAcademicData } from "./AcademicData";
import { ConfirmDialog } from "./ConfirmDialog";
import { type PlanItem, type Profile, type SavedPlan, trackChoiceKey } from "./model";
import {
  areaProgress,
  categoryWords,
  graduationLeft,
  isTrackSystem,
  type RoadmapCourse,
  type RoadmapTerm,
  roadmapTerms,
  slotWords,
  stageOf,
} from "./roadmap-data";
import { planningTerms } from "./SemesterBoard";

const credit = (milli: number) => formatCredit(milli);
const slotOf = (c: RoadmapCourse): 1 | 2 | null =>
  c.kind === "MAJOR1" ? 1 : c.kind === "MAJOR2" ? 2 : null;

function chipText(c: RoadmapCourse) {
  const word = categoryWords[c.category]?.plain;
  if (c.kind === "LIBERAL") return `교양${word ? ` · ${word}` : ""}`;
  if (c.kind === "OTHER") return word === "일반선택" ? "일반선택" : "전공 외";
  return `${c.kind === "MAJOR1" ? "주 전공" : "두 번째"}${word ? ` · ${word}` : ""}`;
}
function CourseRow({ c, onAssign }: { c: RoadmapCourse; onAssign?: (c: RoadmapCourse) => void }) {
  const chip = (
    <>
      {c.shared && (
        <span className="j-ov-shared" title="두 과목표에 모두 있어 한 전공에만 인정">
          공통 →
        </span>
      )}
      <span className="j-ov-chip" data-kind={c.kind}>
        {chipText(c)}
        {c.chosen ? " · 직접" : ""}
      </span>
    </>
  );
  return (
    <li className="j-ov-course">
      <span className="j-ov-grow">{c.name}</span>
      {c.shared && c.recordId && onAssign ? (
        <button
          type="button"
          className="j-ov-chips"
          aria-label={`${c.name} 배정 바꾸기 · 지금 ${chipText(c)}${c.chosen ? " · 직접 정함" : ""}`}
          onClick={() => onAssign(c)}
        >
          {chip}
        </button>
      ) : (
        <span className="j-ov-chips">{chip}</span>
      )}
      <span className="j-ov-credit">{credit(c.creditMilli)}</span>
    </li>
  );
}

function nextTerm(term: string) {
  const i = planningTerms.indexOf(term);
  return i >= 0 ? planningTerms[i + 1] : undefined;
}
const majorSplit = (terms: RoadmapTerm[]) =>
  terms.map((t) => ({
    term: t.term,
    m1: t.courses.filter((c) => c.kind === "MAJOR1").reduce((n, c) => n + c.creditMilli, 0),
    m2: t.courses.filter((c) => c.kind === "MAJOR2").reduce((n, c) => n + c.creditMilli, 0),
    all: t.creditMilli,
  }));

function DoneGroup({
  terms,
  split,
  summaryMilli,
  onAssign,
}: {
  terms: RoadmapTerm[];
  split: boolean;
  summaryMilli: number;
  onAssign: (c: RoadmapCourse) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!terms.length) return null;
  const rows = majorSplit(terms);
  const sum = (k: "m1" | "m2" | "all") => rows.reduce((n, r) => n + r[k], 0);
  const total = sum("all");
  return (
    <li data-status="DONE">
      <section className="j-ov-card j-ov-term">
        <div className="j-row">
          <span>
            <b>
              {terms[0]?.label}
              {terms.length > 1 ? ` – ${terms.at(-1)?.label}` : ""}
            </b>
            <small>{terms.length}학기 이수 완료</small>
          </span>
          <b>{credit(total)}학점</b>
        </div>
        {split ? (
          <div className="j-ov-split">
            {rows.map((r) => (
              <div key={r.term}>
                <span>{r.term}</span>
                <span
                  className="j-ov-split-bar"
                  role="img"
                  aria-label={`${r.term} 주 전공 ${credit(r.m1)}학점, 두 번째 전공 ${credit(r.m2)}학점`}
                >
                  <span data-slot="1" style={{ flexGrow: r.m1 }} />
                  <span data-slot="2" style={{ flexGrow: r.m2 }} />
                  <span style={{ flexGrow: Math.max(0, r.all - r.m1 - r.m2) }} />
                </span>
                <span>
                  주 {credit(r.m1)} · 두 {credit(r.m2)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="j-ov-done-grid">
            {terms.map((t) => (
              <span key={t.term}>
                {t.term}
                <b>{credit(t.creditMilli)}</b>
              </span>
            ))}
          </div>
        )}
        <small>
          주 전공 {credit(sum("m1"))} · 두 번째 전공 {credit(sum("m2"))}학점
        </small>
        {summaryMilli > 0 && (
          <small>
            학기 정보 없는 요약 기록 {credit(summaryMilli)}학점(교양·일반선택)은 졸업 학점에만
            더해요
          </small>
        )}
        <button
          type="button"
          className="j-link"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "학기별 과목 접기" : "학기별 과목 펼치기"}
        </button>
        {open &&
          terms.map((t) => (
            <div key={t.term} className="j-ov-done-term">
              <small>{t.label}</small>
              <ul className="j-ov-courses">
                {t.courses.map((c) => (
                  <CourseRow key={c.key} c={c} onAssign={onAssign} />
                ))}
              </ul>
            </div>
          ))}
      </section>
    </li>
  );
}

function TermCard({
  t,
  limitMilli,
  creditLimit,
  canMove,
  onMove,
  onAdd,
  onAssign,
}: {
  t: RoadmapTerm;
  limitMilli: number;
  creditLimit: number;
  canMove: boolean;
  onMove: () => void;
  onAdd: () => void;
  onAssign: (c: RoadmapCourse) => void;
}) {
  return (
    <li data-status={t.status}>
      <section
        className="j-ov-card j-ov-term"
        data-status={t.status}
        aria-label={`${t.label} ${t.status === "NOW" ? "지금" : "계획"}`}
      >
        <div className="j-row">
          <span className="j-ov-title-row">
            <b>{t.label}</b>
            <span className="j-ov-pill" data-level={t.status}>
              {t.status === "NOW" ? "지금" : "계획"}
            </span>
          </span>
          <b data-over={t.overLimit}>
            {credit(t.creditMilli)} / {credit(limitMilli)}학점
          </b>
        </div>
        {t.overLimit && (
          <div className="j-ov-alert" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span className="j-ov-grow">
              <span>
                <b>
                  학기 상한 {creditLimit}학점을 {credit(t.creditMilli - limitMilli)}학점 넘어요.
                </b>{" "}
                한 과목을 다음 학기로 옮기면 줄일 수 있어요.
              </span>
              {canMove && (
                <button type="button" onClick={onMove}>
                  마지막 과목을 다음 학기로 옮기기
                </button>
              )}
            </span>
          </div>
        )}
        {t.courses.length > 0 && (
          <ul className="j-ov-courses">
            {t.courses.map((c) => (
              <CourseRow key={c.key} c={c} onAssign={onAssign} />
            ))}
          </ul>
        )}
        {t.status === "PLAN" && (
          <button type="button" className="j-ov-add" onClick={onAdd}>
            + 과목 담기
            {t.creditMilli < limitMilli && (
              <small> · {credit(limitMilli - t.creditMilli)}학점 더 담을 수 있어요</small>
            )}
          </button>
        )}
        {t.status === "NOW" && t.courses.length === 0 && (
          <small>이번 학기 과목을 담으면 여기에 보여요.</small>
        )}
      </section>
    </li>
  );
}

/** Bottom sheet for a course listed in both curricula: choose which program counts it. */
export function AssignSheet({
  course,
  profile,
  items,
  onChoose,
  onClose,
}: {
  course: RoadmapCourse;
  profile: Profile;
  items: PlanItem[];
  onChoose: (slot: 1 | 2 | null) => void;
  onClose: () => void;
}) {
  const data = useAcademicData();
  const current = slotOf(course);
  const [pick, setPick] = useState<1 | 2>(current ?? 1);
  const key = trackChoiceKey(profile.track1, profile.track2, course.recordId ?? "");
  const withChoice = (slot: 1 | 2): AcademicData => ({
    ...data,
    trackChoices: { ...(data.trackChoices ?? {}), [key]: slot },
  });
  const preview = (slot: 1 | 2) =>
    areaProgress(profile, withChoice(slot), items).areas.filter((a) => a.key.startsWith("major"));
  return (
    <ConfirmDialog
      title={`${course.name} 배정 바꾸기`}
      confirmLabel="이렇게 넣기"
      onCancel={onClose}
      onConfirm={() => onChoose(pick)}
    >
      <p className="j-caption">
        두 전공 과목표에 모두 있는 과목이라 한 전공에만 인정돼요. {credit(course.creditMilli)}학점
      </p>
      <fieldset className="j-ov-assign">
        <legend>어느 전공에 넣을까요?</legend>
        {([1, 2] as const).map((slot) => {
          const [a, b] = preview(slot);
          return (
            <label key={slot} data-selected={pick === slot}>
              <input
                type="radio"
                name="assign-slot"
                checked={pick === slot}
                onChange={() => setPick(slot)}
              />
              <span className="j-ov-grow">
                <b>
                  {slotWords(slot)} <small>{slot === 1 ? profile.track1 : profile.track2}</small>
                </b>
                <small>
                  넣으면 주 전공 {credit(a?.completedMilli ?? 0)} / {credit(a?.targetMilli ?? 0)} ·
                  두 번째 {credit(b?.completedMilli ?? 0)} / {credit(b?.targetMilli ?? 0)}
                </small>
                {current === slot && !course.chosen && (
                  <small className="j-ov-auto">자동 배정</small>
                )}
              </span>
            </label>
          );
        })}
      </fieldset>
      <details className="j-basis">
        <summary>자동 배정은 이렇게 정해요</summary>
        <p>① 한쪽 과목표에만 있으면 그 전공</p>
        <p>② 양쪽에 있으면 기초(전기)·필수(전필)가 덜 찬 전공</p>
        <p>③ 그다음은 총학점이 덜 찬 전공, 같으면 주 전공</p>
        <p>전공마다 구분이 다를 수 있어요. 예) 기초필묵: 동양화전공 필수 · 서양화전공 선택</p>
      </details>
      {course.chosen && (
        <button type="button" className="j-link" onClick={() => onChoose(null)}>
          자동 배정으로 되돌리기
        </button>
      )}
      <p className="j-caption">
        직접 정한 배정이 자동 배정보다 우선해요. 실제 전공 인정은 학과 확인이 필요해요.
      </p>
    </ConfirmDialog>
  );
}

export function Roadmap({
  profile,
  baseProfile,
  plan,
  isScenario,
  onSavePlan,
  onAddCourses,
  onScenarios,
  onChoose,
}: {
  profile: Profile;
  /** The student's current programs (the roadmap may follow a 시나리오). */
  baseProfile: Profile;
  plan: SavedPlan | undefined;
  /** The roadmap follows a program pair other than the student's current one. */
  isScenario: boolean;
  onSavePlan: (plan: SavedPlan) => void;
  onAddCourses: () => void;
  onScenarios: () => void;
  onChoose: (recordId: string, slot: 1 | 2 | null) => void;
}) {
  const data = useAcademicData();
  const [assign, setAssign] = useState<RoadmapCourse | null>(null);
  const items = plan?.items ?? [];
  const { terms, summaryMilli } = roadmapTerms(profile, data, items);
  const left = graduationLeft(baseProfile, data, profile, items);
  const limit = data.creditLimit * 1000;
  const staged = isTrackSystem(profile);
  const unit = findProgram(profile.track1)?.unit;
  function moveOne(t: RoadmapTerm) {
    if (!plan) return;
    const to = nextTerm(t.term);
    const movable = [...plan.items].reverse().find((i) => i.term === t.term);
    if (!to || !movable) return;
    onSavePlan({
      ...plan,
      items: plan.items.map((i) => (i.code === movable.code ? { ...i, term: to } : i)),
      updatedAt: new Date().toISOString(),
      revision: (plan.revision ?? 1) + 1,
    });
  }
  const termCards = (list: RoadmapTerm[]) =>
    list.map((t) => (
      <TermCard
        key={t.term}
        t={t}
        limitMilli={limit}
        creditLimit={data.creditLimit}
        canMove={!!plan && !!nextTerm(t.term)}
        onMove={() => moveOne(t)}
        onAdd={onAddCourses}
        onAssign={setAssign}
      />
    ));
  const stages = staged
    ? ([1, 2, 3] as const).map((stage) => ({
        stage,
        terms: terms.filter((t) => stageOf(t.term) === stage),
      }))
    : [{ stage: 0 as const, terms }];
  const gradReqs = [profile.track1, profile.track2]
    .filter((t, i, a) => t && a.indexOf(t) === i)
    .map((t) => graduationFor(t))
    .filter((g) => g?.found);
  return (
    <div className="j-stack j-ov">
      <header className="j-ov-head">
        <h1>학기별 로드맵</h1>
        <p>
          졸업까지 <b className="j-ov-accent">{credit(left)}학점</b>
        </p>
      </header>
      <button type="button" className="j-ov-card j-ov-scenario-bar" onClick={onScenarios}>
        <span className="j-ov-pill" data-level={isScenario ? "PLAN" : "NOW"}>
          {isScenario ? "시나리오" : "대표"}
        </span>
        <span className="j-ov-grow">
          <b>{isScenario ? (plan?.name ?? "다른 길") : "지금 그대로"}</b>
          <small>
            {profile.track1}
            {profile.track2 && profile.track2 !== profile.track1 ? ` + ${profile.track2}` : ""}
          </small>
        </span>
        <span className="j-ov-accent j-ov-small-strong">다른 길 비교 ›</span>
      </button>
      <div className="j-ov-key">
        <span className="j-ov-chip" data-kind="MAJOR1">
          주 전공
        </span>
        <span className="j-ov-chip" data-kind="MAJOR2">
          두 번째 전공
        </span>
        <span className="j-ov-chip" data-kind="LIBERAL">
          교양
        </span>
        <span className="j-ov-shared">공통 →</span>
        <small>두 과목표에 다 있는 과목 · 한 전공에만 인정 · 눌러서 바꾸기</small>
      </div>
      {stages.map(({ stage, terms: list }) => {
        if (!list.length) return null;
        const done = list.filter((t) => t.status === "DONE");
        const ahead = list.filter((t) => t.status !== "DONE");
        return (
          <section key={stage} className="j-ov-stage" aria-label={stage ? `${stage}단계` : "학기"}>
            {stage > 0 && (
              <h2 className="j-ov-stage-title">
                {stage}단계 · {stage === 1 ? "1학년" : stage === 2 ? "2~3학년" : "4학년"}{" "}
                <span>
                  {stage === 1
                    ? `${unit ?? "학부"} 공통`
                    : stage === 2
                      ? "트랙별로 나뉨"
                      : "졸업 준비"}
                </span>
              </h2>
            )}
            <ol className="j-ov-timeline">
              <DoneGroup
                terms={done}
                split={stage !== 1}
                summaryMilli={stage === 1 || stage === 0 ? summaryMilli : 0}
                onAssign={setAssign}
              />
              {termCards(ahead)}
            </ol>
            {stage === 1 && done.length > 0 && (
              <p className="j-ov-milestone">
                <Check size={16} aria-hidden="true" />
                <span>
                  <b>1학년 11월 트랙 선택</b> · {profile.track1} + {profile.track2}
                </span>
              </p>
            )}
            {stage === 3 && gradReqs.length > 0 && (
              <p className="j-ov-milestone" data-open="true">
                <span className="j-ov-mark" aria-hidden="true" />
                <span>
                  <b>학과 졸업요건</b> · {gradReqs.length}개 전공 모두 따로 확인 · 남은 것 탭에서
                  보기
                </span>
              </p>
            )}
          </section>
        );
      })}
      {!staged && (
        <p className="j-caption">학과제 전공이 포함돼 학년 단계 대신 학기 순서로 보여줘요.</p>
      )}
      <button type="button" className="j-ov-card j-ov-dark" onClick={onScenarios}>
        <span className="j-ov-grow">
          <b>다른 길도 비교해볼까요?</b>
          <small>트랙 변경 · 전과 · 두 번째 전공만 바꾸기</small>
        </span>
        <ChevronRight size={20} aria-hidden="true" />
      </button>
      <details className="j-basis">
        <summary>이 로드맵으로 확인하지 못하는 것</summary>
        <p>
          실제 개설 여부, 선수과목·수강 제한, 재수강·대체·트랙 간 중복 인정은 이 화면에서 판정하지
          않아요. 공통 과목 배정은 계획용이고 실제 전공 인정은 학과 확인이 필요해요.
        </p>
      </details>
      {assign && (
        <AssignSheet
          course={assign}
          profile={profile}
          items={items}
          onClose={() => setAssign(null)}
          onChoose={(slot) => {
            if (assign.recordId) onChoose(assign.recordId, slot);
            setAssign(null);
          }}
        />
      )}
    </div>
  );
}
