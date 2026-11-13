import { formatCredit } from "@hansung/academic-engine";
import { ArrowLeft, CalendarDays, Info } from "lucide-react";
import { Fragment, useState } from "react";
import { findProgram } from "../catalog";
import { TrackPicker } from "./Academic";
import { useAcademicData } from "./AcademicData";
import type { Profile, SavedPlan } from "./model";
import { Bar } from "./Overview";
import {
  changeWords,
  type Scenario,
  type ScenarioOutcome,
  scenarioOutcome,
  suggestedScenarios,
} from "./roadmap-data";
import { termLabel } from "./SemesterBoard";

const credit = (milli: number) => formatCredit(milli);
const date = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
const applyText = (o: ScenarioOutcome) =>
  !o.apply
    ? "신청 없이 그대로 진행"
    : o.apply.lastYear
      ? `${o.apply.label} · 다음 일정 공지 전 (작년 ${date(o.apply.start)}–${date(o.apply.end)})`
      : `${o.apply.label} ${date(o.apply.start)}–${date(o.apply.end)}`;
const pastText = (o: ScenarioOutcome) => {
  const p = o.past[0];
  if (!p) return o.kind === "NONE" ? "—" : "선발 공지 확인";
  return `${p.term} ${p.total ?? "?"}명 선발${p.accepted !== null ? ` · ${p.accepted}명 합격` : ""}`;
};
const tagTone: Record<string, string> = { NONE: "NOW", TRACK_CHANGE: "PLAN", TRANSFER: "BLOCK" };

function changeLine(base: Profile, s: Scenario) {
  const parts: string[] = [];
  if (s.track1 !== base.track1) parts.push(`주 전공: ${base.track1} → ${s.track1}`);
  if (s.track2 !== base.track2) parts.push(`두 번째 전공: ${base.track2} → ${s.track2}`);
  return parts.join(" · ") || `${s.track1} + ${s.track2}`;
}

export function ScenarioPlanner({
  profile,
  plans,
  onBack,
  onAdopt,
}: {
  profile: Profile;
  plans: SavedPlan[];
  onBack: () => void;
  /** Save the scenario as a roadmap; `primary` also makes it the 대표 로드맵. */
  onAdopt: (scenario: Scenario, primary: boolean) => void;
}) {
  const data = useAcademicData();
  const [custom, setCustom] = useState<Scenario[]>([]);
  const all = [...suggestedScenarios(profile, plans), ...custom];
  const [picked, setPicked] = useState<string[]>(() => all.slice(0, 3).map((s) => s.id));
  const [view, setView] = useState<"list" | "compare" | "detail" | "new">("list");
  const [detailId, setDetailId] = useState("");
  const [draft, setDraft] = useState({ track1: profile.track1, track2: profile.track2 });
  const outcomes = all.map((s) =>
    scenarioOutcome(
      profile,
      data,
      s,
      plans.find((p) => p.id === s.planId)?.items ??
        (s.id === "keep"
          ? (plans.find((p) => p.track1 === profile.track1 && p.track2 === profile.track2)?.items ??
            [])
          : []),
    ),
  );
  const chosen = outcomes.filter((o) => picked.includes(o.scenario.id));
  const toggle = (id: string) =>
    setPicked((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : list.length >= 3 ? list : [...list, id],
    );

  if (view === "new")
    return (
      <div className="j-stack j-ov">
        <button type="button" className="j-back" onClick={() => setView("list")}>
          <ArrowLeft size={18} />
          다른 길 비교
        </button>
        <header className="j-ov-head">
          <h1>직접 조합 만들기</h1>
          <p>전과는 주 전공을, 트랙 변경은 바꿀 전공을 골라요.</p>
        </header>
        <TrackPicker
          label="주 전공"
          slot={1}
          value={draft.track1}
          onChange={(track1) => setDraft((d) => ({ ...d, track1 }))}
        />
        <TrackPicker
          label="두 번째 전공"
          slot={2}
          pairWith={draft.track1}
          value={draft.track2}
          onChange={(track2) => setDraft((d) => ({ ...d, track2 }))}
        />
        <button
          type="button"
          className="j-primary"
          disabled={
            !draft.track1 ||
            !draft.track2 ||
            all.some((s) => s.track1 === draft.track1 && s.track2 === draft.track2)
          }
          onClick={() => {
            const id = `custom-${draft.track1}-${draft.track2}`;
            const kind = scenarioOutcome(profile, data, { id, name: "", ...draft }).kind;
            setCustom((list) => [...list, { id, name: changeWords[kind].label, ...draft }]);
            setPicked((list) => (list.length >= 3 ? [...list.slice(0, 2), id] : [...list, id]));
            setView("list");
          }}
        >
          시나리오에 추가
        </button>
        {all.some((s) => s.track1 === draft.track1 && s.track2 === draft.track2) && (
          <p className="j-caption">이미 목록에 있는 조합이에요.</p>
        )}
      </div>
    );

  const detail = outcomes.find((o) => o.scenario.id === detailId);
  if (view === "detail" && detail) {
    const o = detail;
    const before = o.keptMilli + o.recognizableMilli + o.lostMilli;
    const transfer = o.kind === "TRANSFER";
    return (
      <div className="j-stack j-ov">
        <button type="button" className="j-back" onClick={() => setView("compare")}>
          <ArrowLeft size={18} />
          비교로
        </button>
        <header className="j-ov-head">
          <span className="j-ov-pill j-ov-self-start" data-level={tagTone[o.kind]}>
            {changeWords[o.kind].label}
          </span>
          <h1>{changeLine(profile, o.scenario)}</h1>
          <p>{changeWords[o.kind].hint}</p>
        </header>
        <div className="j-ov-stats">
          <div className="j-ov-card">
            <small>졸업까지</small>
            <b>{credit(o.leftMilli)}학점</b>
          </div>
          <div className="j-ov-card">
            <small>예상 졸업</small>
            <b>{termLabel(o.graduationTerm)}</b>
            {o.extraTerms > 0 && <small data-level="BLOCK">+{o.extraTerms}학기</small>}
          </div>
        </div>
        <section className="j-ov-card" aria-label="들은 과목이 어떻게 바뀌나">
          <h2 className="j-ov-h2">들은 전공 {credit(before)}학점은 이렇게 바뀌어요</h2>
          <div
            className="j-ov-flow"
            role="img"
            aria-label={`그대로 ${credit(o.keptMilli)}학점, 인정 신청 필요 ${credit(o.recognizableMilli)}학점, 전공에서 빠짐 ${credit(o.lostMilli)}학점`}
          >
            <span data-part="kept" style={{ flexGrow: o.keptMilli }} />
            <span data-part="rec" style={{ flexGrow: o.recognizableMilli }} />
            <span data-part="lost" style={{ flexGrow: o.lostMilli }} />
          </div>
          <ul className="j-ov-reqs">
            <li>
              <span className="j-ov-dot" data-part="kept" />
              <span className="j-ov-grow">
                전공으로 그대로 인정
                <small className="j-ov-sub">배정은 새 조합 기준으로 다시 계산</small>
              </span>
              <span className="j-ov-num">{credit(o.keptMilli)}</span>
            </li>
            {o.recognizableMilli > 0 && (
              <li>
                <span className="j-ov-dot" data-part="rec" />
                <span className="j-ov-grow">
                  전공 인정 신청 필요
                  <small className="j-ov-sub">
                    이전 주 전공 과목 중 새 과목표에도 있는 과목 · 승인 전엔 일반선택
                  </small>
                </span>
                <span className="j-ov-num">{credit(o.recognizableMilli)}</span>
              </li>
            )}
            <li>
              <span className="j-ov-dot" data-part="lost" />
              <span className="j-ov-grow">
                {transfer ? "일반선택으로 바뀜" : "전공에서 빠짐"}
                <small className="j-ov-sub">졸업 총학점에는 그대로 들어가요</small>
              </span>
              <span className="j-ov-num">{credit(o.lostMilli)}</span>
            </li>
          </ul>
        </section>
        <section className="j-ov-card" aria-label="새 조합에서 남은 전공 학점">
          <h2 className="j-ov-h2">새 조합에서 남은 전공 학점</h2>
          {o.majors.map((m) => (
            <div className="j-ov-area" key={m.key}>
              <div className="j-row">
                <span>
                  {m.label} <small>{m.sub}</small>
                </span>
                <span>
                  <b>{credit(m.completedMilli)}</b> / {credit(m.targetMilli)}
                </span>
              </div>
              <Bar
                thin
                label={`${m.label} ${credit(m.completedMilli)}학점`}
                max={m.targetMilli}
                parts={[{ value: m.completedMilli, tone: "done" }]}
              />
            </div>
          ))}
          <small className="j-ov-muted">아직 안 들은 필수(전필) 과목 {o.requiredLeft}개</small>
        </section>
        <section className="j-ov-card" aria-label="신청 일정">
          <h2 className="j-ov-h2">신청</h2>
          <p className="j-ov-line">
            <CalendarDays size={16} aria-hidden="true" />
            {applyText(o)}
          </p>
          {o.kind === "TRACK_CHANGE" && (
            <p className="j-caption">
              바뀐 뒤 학기 초에 학점인정 과목 전공 인정 신청을 따로 해요 (작년 9.10–9.18).
            </p>
          )}
          {o.past.length > 0 && (
            <div className="j-ov-past">
              <span>학기</span>
              <span>선발</span>
              <span>합격</span>
              {o.past.map((p) => (
                <Fragment key={p.term}>
                  <span>{p.term}</span>
                  <b>{p.total !== null ? `${p.total}명` : "—"}</b>
                  <b>{p.accepted !== null ? `${p.accepted}명` : "자료 없음"}</b>
                </Fragment>
              ))}
            </div>
          )}
        </section>
        {(transfer || o.pairing) && (
          <div className="j-ov-note" data-level="BLOCK">
            <Info size={16} aria-hidden="true" />
            <span>
              {o.pairing ||
                "학교 안내에 따르면 전과 합격 후 이전 전공 성적은 일반선택으로 바뀌어요. 겹치는 과목의 전공 인정은 학과 승인 결과에 따라 달라요."}
            </span>
          </div>
        )}
        <div className="j-row j-ov-actions">
          <button
            type="button"
            className="j-secondary"
            onClick={() => onAdopt(o.scenario, false)}
            disabled={!!o.pairing}
          >
            로드맵으로 저장
          </button>
          <button
            type="button"
            className="j-primary"
            onClick={() => onAdopt(o.scenario, true)}
            disabled={!!o.pairing}
          >
            대표 로드맵으로
          </button>
        </div>
      </div>
    );
  }

  if (view === "compare" && chosen.length) {
    const best = (values: number[], low = true) => {
      const target = low ? Math.min(...values) : Math.max(...values);
      return values.map((v) => v === target);
    };
    const rows: {
      label: string;
      cells: string[];
      good?: boolean[];
      bad?: boolean[];
      big?: boolean;
    }[] = [
      { label: "주 전공", cells: chosen.map((o) => o.scenario.track1) },
      { label: "두 번째 전공", cells: chosen.map((o) => o.scenario.track2) },
      {
        label: "졸업까지",
        cells: chosen.map((o) => `${credit(o.leftMilli)}학점`),
        good: best(chosen.map((o) => o.leftMilli)),
        bad: chosen.map((o) => o.extraTerms > 0),
        big: true,
      },
      {
        label: "예상 졸업",
        cells: chosen.map(
          (o) => `${termLabel(o.graduationTerm)}${o.extraTerms ? ` (+${o.extraTerms})` : ""}`,
        ),
        good: chosen.map((o) => o.extraTerms === 0),
        bad: chosen.map((o) => o.extraTerms > 0),
        big: true,
      },
      {
        label: "전공 인정 유지",
        cells: chosen.map((o) => `${credit(o.keptMilli)}학점`),
        good: best(
          chosen.map((o) => o.keptMilli),
          false,
        ),
      },
      {
        label: "인정 신청 필요",
        cells: chosen.map((o) =>
          o.recognizableMilli ? `${credit(o.recognizableMilli)}학점` : "없음",
        ),
      },
      {
        label: "전공에서 빠짐",
        cells: chosen.map((o) =>
          o.lostMilli
            ? `${credit(o.lostMilli)}학점${o.kind === "TRANSFER" ? " · 일반선택" : ""}`
            : "없음",
        ),
        bad: chosen.map((o) => o.lostMilli > 0 && o.kind === "TRANSFER"),
      },
      { label: "남은 필수 과목", cells: chosen.map((o) => `${o.requiredLeft}개`) },
      { label: "신청", cells: chosen.map((o) => applyText(o)) },
      { label: "지난 선발", cells: chosen.map((o) => pastText(o)) },
    ];
    return (
      <div className="j-stack j-ov">
        <button type="button" className="j-back" onClick={() => setView("list")}>
          <ArrowLeft size={18} />
          다른 길 비교
        </button>
        <header className="j-ov-head">
          <h1>{chosen.length}가지 길 나란히 보기</h1>
          <p>파란 글씨가 그 줄에서 가장 유리한 쪽이에요</p>
        </header>
        <div className="j-ov-card j-table-scroll">
          <table className="j-ov-compare">
            <caption className="j-sr-hidden">시나리오 비교표</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="j-sr-hidden">항목</span>
                </th>
                {chosen.map((o) => (
                  <th key={o.scenario.id} scope="col">
                    {changeWords[o.kind].label !== o.scenario.name && (
                      <span className="j-ov-pill" data-level={tagTone[o.kind]}>
                        {changeWords[o.kind].label}
                      </span>
                    )}
                    <button
                      type="button"
                      className="j-link"
                      onClick={() => {
                        setDetailId(o.scenario.id);
                        setView("detail");
                      }}
                    >
                      {o.scenario.name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} data-big={r.big}>
                  <th scope="row">{r.label}</th>
                  {r.cells.map((c, i) => (
                    <td
                      key={`${r.label}-${chosen[i]?.scenario.id}`}
                      data-tone={
                        r.bad?.[i] ? "bad" : r.good?.[i] && chosen.length > 1 ? "good" : undefined
                      }
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="j-ov-card" aria-label="들은 전공 학점이 어디로 가나">
          <h2 className="j-ov-h2">들은 전공 학점이 어디로 가나</h2>
          {chosen.map((o) => (
            <div className="j-ov-flow-row" key={o.scenario.id}>
              <span>{o.scenario.name}</span>
              <div
                className="j-ov-flow"
                role="img"
                aria-label={`${o.scenario.name}: 그대로 ${credit(o.keptMilli)}, 인정 신청 ${credit(o.recognizableMilli)}, 빠짐 ${credit(o.lostMilli)}학점`}
              >
                <span data-part="kept" style={{ flexGrow: o.keptMilli }} />
                <span data-part="rec" style={{ flexGrow: o.recognizableMilli }} />
                <span data-part="lost" style={{ flexGrow: o.lostMilli }} />
              </div>
            </div>
          ))}
          <div className="j-ov-legend">
            <span data-tone="done">그대로 인정</span>
            <span data-tone="now">인정 신청 필요</span>
            <span data-tone="lost">전공에서 빠짐</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="j-stack j-ov">
      <button type="button" className="j-back" onClick={onBack}>
        <ArrowLeft size={18} />
        로드맵
      </button>
      <header className="j-ov-head">
        <h1>다른 길 비교</h1>
        <p>
          들은 과목은 그대로 두고 전공 조합만 바꿔서 계산해요. 최대 3개까지 골라 나란히 볼 수
          있어요.
        </p>
      </header>
      {outcomes.map((o) => (
        <article
          key={o.scenario.id}
          className="j-ov-card j-ov-scenario"
          data-picked={picked.includes(o.scenario.id)}
          aria-label={`${o.scenario.name} 시나리오`}
        >
          <div className="j-row">
            <span className="j-ov-grow">
              <span className="j-ov-title-row">
                <b>{o.scenario.name}</b>
                <span className="j-ov-pill" data-level={tagTone[o.kind]}>
                  {o.kind === "TRANSFER"
                    ? `다른 학부 · ${findProgram(o.scenario.track1)?.unit ?? ""}`
                    : o.kind === "TRACK_CHANGE"
                      ? findProgram(o.scenario.track1)?.unit ===
                        findProgram(o.scenario.track2)?.unit
                        ? "같은 학부"
                        : "두 번째 전공"
                      : "현재"}
                </span>
              </span>
              <small>{changeLine(profile, o.scenario)}</small>
            </span>
            <label className="j-ov-pick">
              <input
                type="checkbox"
                checked={picked.includes(o.scenario.id)}
                onChange={() => toggle(o.scenario.id)}
              />
              비교
            </label>
          </div>
          <div className="j-ov-mini-stats">
            <span>
              <small>졸업까지</small>
              <b>{credit(o.leftMilli)}학점</b>
            </span>
            <span>
              <small>예상 졸업</small>
              <b data-level={o.extraTerms ? "BLOCK" : undefined}>
                {o.graduationTerm}
                {o.extraTerms ? ` (+${o.extraTerms})` : ""}
              </b>
            </span>
            <span>
              <small>전공에서 빠짐</small>
              <b data-level={o.lostMilli && o.kind === "TRANSFER" ? "BLOCK" : undefined}>
                {credit(o.lostMilli)}학점
              </b>
            </span>
          </div>
          <p className="j-ov-line">
            <CalendarDays size={16} aria-hidden="true" />
            {applyText(o)}
          </p>
          {o.pairing && <p className="j-warning">{o.pairing}</p>}
          <button
            type="button"
            className="j-link"
            onClick={() => {
              setDetailId(o.scenario.id);
              setView("detail");
            }}
          >
            자세히 보기
          </button>
        </article>
      ))}
      <button type="button" className="j-ov-add" onClick={() => setView("new")}>
        + 직접 조합 만들기 (전과·두 번째 전공 변경)
      </button>
      <p className="j-caption">
        학점은 내 이수 기록과 공통 과목 자동 배정으로 계산해요. 신청 기간·선발 인원은 학교
        공지(2025-2 ~ 2026-2) 기준이고, 다음 일정이 공지 전이면 작년 같은 학기 날짜를 보여줘요.
      </p>
      <button
        type="button"
        className="j-primary"
        disabled={chosen.length < 2}
        onClick={() => setView("compare")}
      >
        선택한 {chosen.length}개 나란히 비교
      </button>
    </div>
  );
}
