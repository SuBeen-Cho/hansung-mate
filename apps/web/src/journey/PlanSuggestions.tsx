import { formatCredit, proposePlans } from "@hansung/academic-engine";
import { useState } from "react";
import { catalogCourses } from "../catalog";
import { useAcademicData } from "./AcademicData";
import { type PlanItem, type Profile, profileTerm } from "./model";
import { planningTerms, termLabel } from "./SemesterBoard";
export function PlanSuggestions({
  items,
  tracks,
  profile,
  term,
  onApply,
}: {
  items: PlanItem[];
  tracks: string[];
  profile: Profile;
  term: string;
  onApply: (items: PlanItem[]) => void;
}) {
  const data = useAcademicData();
  const [preference, setPreference] = useState("이번 학기는 부담을 줄이고 싶어요");
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState("BALANCED");
  const [count, setCount] = useState(2);
  const proposals = proposePlans({
    items,
    tracks,
    records: data.records,
    catalog: catalogCourses,
    currentTerm: profileTerm(profile),
    creditLimitMilli: data.creditLimit * 1000,
    startTerm: term,
    terms: planningTerms,
    preference,
    count,
  });
  const proposal = proposals.find((p) => p.strategy === selected) ?? proposals[0];
  return (
    <section className="j-paper j-stack" aria-label="계획 추천 데모">
      <h3>내 상황에 맞는 세 가지 방향</h3>
      <p className="j-caption">
        AI 제안 파이프라인 데모 · 현재는 규칙 기반 추천이에요. 이수 기록과 공개 과목표에서 후보를
        고르고 계산 엔진으로 검사해요.
      </p>
      <label className="j-field">
        계획할 때 바라는 점
        <textarea
          value={preference}
          maxLength={300}
          onChange={(e) => {
            setPreference(e.target.value);
            setReady(false);
          }}
          placeholder="예: 데이터 관련 과목이 좋아요"
        />
      </label>
      <label className="j-field">
        이번에 제안받을 과목 수
        <select
          value={count}
          onChange={(e) => {
            setCount(Number(e.target.value));
            setReady(false);
          }}
        >
          {[2, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n}과목
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="j-secondary" onClick={() => setReady(true)}>
        추천 흐름 체험
      </button>
      {ready && proposal && (
        <>
          <div className="j-proposals">
            {proposals.map((p) => (
              <button
                type="button"
                key={p.strategy}
                className={`j-choice ${selected === p.strategy ? "selected" : ""}`}
                aria-pressed={selected === p.strategy}
                onClick={() => setSelected(p.strategy)}
              >
                <b>{p.title}</b>
                <small>
                  {p.additions.length}과목 ·{" "}
                  {p.audit.status === "INVALID" ? "계획 수정 필요" : "개설·인정 확인 필요"}
                </small>
              </button>
            ))}
          </div>
          <h4>{proposal.title}</h4>
          {proposal.additions.map((item) => {
            const c = catalogCourses.find((c) => c.code === item.code);
            const reason = proposal.reasons.find((r) => r.code === item.code);
            return (
              <section className="j-plan-item" key={item.code}>
                <b>
                  {c?.name} · {formatCredit(c?.creditMilli ?? null)}학점
                </b>
                <p>
                  {item.track}트랙 · {termLabel(item.term)}
                </p>
                <p className="j-caption">{reason?.text}</p>
                <a href={reason?.sourceUrl} target="_blank" rel="noreferrer">
                  추천 근거: 공개 과목표
                </a>
              </section>
            );
          })}
          {!proposal.additions.length && (
            <p>
              남은 학기와 학점 상한 안에 넣을 후보가 없어요. 담은 과목이나 목표 상한을 확인해
              주세요.
            </p>
          )}
          <p className="j-caption">
            실제 개설·선수과목·학교 인정은 미확인입니다. 관심 추천은 과목명 일치 기준이며 난이도나
            취업 전망을 추정하지 않아요.
          </p>
          {proposal.audit.status === "INVALID" && (
            <p role="alert" className="j-error">
              기존 계획의 중복·이수·트랙 배정 오류를 먼저 수정해 주세요.
            </p>
          )}
          <button
            type="button"
            className="j-primary"
            disabled={!proposal.additions.length || proposal.audit.status === "INVALID"}
            onClick={() => {
              onApply(proposal.additions);
              setReady(false);
            }}
          >
            추천 과목을 계획에 담기
          </button>
        </>
      )}
    </section>
  );
}
