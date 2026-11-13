import { auditOfficialMajor, formatCredit } from "@hansung/academic-engine";
import { useState } from "react";
import { findProgram, graduationFor } from "../catalog";
import { majorTargets, type Profile } from "./model";
import { slotWords } from "./roadmap-data";

/** 학과 졸업요건: what to do first, the school wording and sources folded under 근거. */
export function OfficialRequirements({ profile }: { profile: Profile }) {
  const [scopeConfirmed, setScopeConfirmed] = useState(false);
  const goal = majorTargets(profile.track1, profile.track2, profile.entryYear);
  const programs = (
    goal.single
      ? [[slotWords(1, true), profile.track1]]
      : [
          [slotWords(1), profile.track1],
          [slotWords(2), profile.track2],
        ]
  )
    .filter(([, name]) => !!name)
    .map(([slot, name]) => ({ slot: slot as string, name: name as string }));
  const result = auditOfficialMajor({
    entryYear: profile.entryYear,
    pathway: scopeConfirmed ? "FUSION_I" : "UNKNOWN",
    admission: scopeConfirmed ? "FRESHMAN" : "UNKNOWN",
    differentTracks:
      !!profile.track1 &&
      !!profile.track2 &&
      profile.track1 !== profile.track2 &&
      findProgram(profile.track1)?.kind === "TRACK" &&
      findProgram(profile.track2)?.kind === "TRACK",
    hasAdditionalProgram: !!profile.optional,
    evidenceComplete: false,
    records: [],
  });
  return (
    <section className="j-ov-card j-stack-sm" aria-label="학과 졸업요건">
      <div className="j-row">
        <div>
          <small className="j-ov-muted">학과 졸업요건</small>
          <h2 className="j-ov-h2">시험·작품·인증</h2>
        </div>
        <span className="j-ov-pill" data-level="NOTE">
          직접 확인
        </span>
      </div>
      {programs.map(({ slot, name }) => {
        const g = graduationFor(name);
        return (
          <div className="j-ov-req" key={`${slot}-${name}`}>
            <b>
              {name} <small>· {slot}</small>
            </b>
            {g?.found ? (
              <>
                <p>{g.summary}</p>
                {g.options.length > 0 && (
                  <ul className="j-checklist">
                    {g.options.map((o) => (
                      <li key={o}>○ {o}</li>
                    ))}
                  </ul>
                )}
                {(g.cohortRules.length > 0 ||
                  g.substitutes.length > 0 ||
                  g.submission ||
                  g.sources[0] ||
                  g.confidence !== "HIGH") && (
                  <details className="j-basis">
                    <summary>근거 · 학번별 차이·제출 방법</summary>
                    {g.cohortRules.map((r) => (
                      <p key={r.cohorts}>
                        <b>{r.cohorts}</b> · {r.summary}
                      </p>
                    ))}
                    {g.substitutes.length > 0 && <p>대체 인정: {g.substitutes.join(", ")}</p>}
                    {g.submission && <p>제출: {g.submission}</p>}
                    {g.confidence !== "HIGH" && (
                      <p>
                        여러 트랙 공용 공지나 옛 학과명 공지에서 가져왔어요. 학과 사무실에 한 번 더
                        확인해 주세요.
                      </p>
                    )}
                    {g.sources[0] && (
                      <a href={g.sources[0].url} target="_blank" rel="noreferrer">
                        졸업요건 원문{g.sources[0].date ? ` (${g.sources[0].date})` : ""}
                      </a>
                    )}
                  </details>
                )}
              </>
            ) : (
              <p className="j-ov-muted">
                학교 홈페이지에 이 학과의 별도 졸업요건이 공개되지 않았어요. 학과 사무실에 확인해
                주세요.
              </p>
            )}
          </div>
        );
      })}
      <details className="j-basis">
        <summary>학교 기준표로 전공 학점 확인하기 · {goal.label}</summary>
        <p>
          지금 조합은 <b>{goal.label}</b>이에요. {goal.basis}.
        </p>
        <label className="j-check">
          <input
            type="checkbox"
            checked={scopeConfirmed}
            onChange={(e) => setScopeConfirmed(e.target.checked)}
          />
          2017–2026학번 일반 신입학·서로 다른 두 트랙의 융합전공Ⅰ 기준을 확인할게요.
        </label>
        <p>
          전과·편입, 부전공·마이크로디그리 인정, 개인별 예외는 학사운영팀 확인이 필요해 자동
          판정에서 제외해요.
        </p>
        {result.supported && (
          <div className="j-table-scroll">
            <table className="j-compare-table">
              <caption>전공별 최소 학점 · 개인 인정 내역 미연동</caption>
              <thead>
                <tr>
                  <th>전공</th>
                  <th>분류</th>
                  <th>기준</th>
                  <th>내 인정 학점</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={`${row.track}-${row.category}`}>
                    <td>{slotWords(row.track === 2 ? 2 : 1)}</td>
                    <td>{row.category}</td>
                    <td>{formatCredit(row.target)}</td>
                    <td>{formatCredit(row.earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>{result.reason}</p>
        <a href={result.source.sourceUrl} target="_blank" rel="noreferrer">
          학교 원문 확인
        </a>
        <small>
          원문 수정 {result.source.sourceUpdatedAt} · 확인 {result.source.observedAt} · 졸업 전체
          판정 보류
        </small>
      </details>
    </section>
  );
}
