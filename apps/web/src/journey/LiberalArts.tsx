import { formatCredit } from "@hansung/academic-engine";
import { cohortSource } from "../catalog";
import { useAcademicData } from "./AcademicData";
import { liberalProgressFor } from "./roadmap-data";

function Mark({ done }: { done: boolean }) {
  return <span className="j-ov-mark" data-done={done} aria-hidden="true" />;
}

/** 학번별 교양 졸업 기준과 내 이수 기록 비교 (학업이수가이드 2026-2 기준). */
export function LiberalArts({ entryYear }: { entryYear: number }) {
  const data = useAcademicData();
  const found = liberalProgressFor(entryYear, data.records);
  if (!found)
    return (
      <section className="j-ov-card" aria-label="교양 졸업 기준">
        <h2 className="j-ov-h2">교양</h2>
        <p>
          {entryYear}학번 교양 기준을 학업이수가이드에서 찾지 못했어요. 학사운영팀에 확인해 주세요.
        </p>
      </section>
    );
  const { rule, progress: p } = found;
  const left = Math.max(0, p.total.target - p.total.earned);
  return (
    <section className="j-ov-card j-stack-sm" aria-label="교양 졸업 기준">
      <div className="j-row j-ov-hero">
        <div>
          <small className="j-ov-muted">교양 · {rule.cohorts} 기준</small>
          <p className="j-ov-left">
            {left === 0 ? (
              <b>기준 학점 충족</b>
            ) : (
              <>
                <b>{formatCredit(left)}학점</b> 남음
              </>
            )}
          </p>
        </div>
        <small>
          {formatCredit(p.total.earned)} / {formatCredit(p.total.target)}
        </small>
      </div>
      <progress
        aria-label="교양 합계"
        value={Math.min(p.total.earned, p.total.target)}
        max={Math.max(p.total.target, 1)}
      />
      <ul className="j-ov-reqs">
        <li>
          <Mark done={p.required.earned >= p.required.target} />
          <span className="j-ov-grow">
            필수 교양 <small>(교필)</small>
            <small className="j-ov-sub">
              {p.required.courses.filter((c) => c.done).length} / {p.required.courses.length}과목
              이수
            </small>
          </span>
          <span className="j-ov-num">
            {formatCredit(p.required.earned)} / {formatCredit(p.required.target)}
          </span>
        </li>
        {p.distribution && (
          <li>
            <Mark done={p.distribution.status === "MET"} />
            <span className="j-ov-grow">
              분야별 교양 <small>(배분이수)</small>
              <small className="j-ov-sub">
                {rule.distribution?.areas.length ?? 5}개 분야 중 {p.distribution.minAreas}개
                분야에서 1과목씩
              </small>
              <span className="j-ov-areas-chips">
                {(rule.distribution?.areas ?? []).map((a) => (
                  <span
                    key={a}
                    className="j-ov-chip"
                    data-kind={p.distribution?.coveredAreas.includes(a) ? "DONE" : "EMPTY"}
                  >
                    {p.distribution?.coveredAreas.includes(a) ? "✓ " : ""}
                    {a.replace(" 상상력", "").replace("적", "")}
                  </span>
                ))}
              </span>
              {p.distribution.unknownAreaCount > 0 && (
                <small className="j-ov-sub">
                  분야를 확인하지 못한 과목 {p.distribution.unknownAreaCount}개
                </small>
              )}
            </span>
            <span className="j-ov-num">
              {formatCredit(p.distribution.earned)} / {formatCredit(p.distribution.target)}
            </span>
          </li>
        )}
        {rule.free && (
          <li>
            <Mark done={p.free.earned >= p.free.target} />
            <span className="j-ov-grow">자유 교양</span>
            <span className="j-ov-num">
              {p.free.earned >= p.free.target
                ? `충족 · ${formatCredit(p.free.earned)}학점`
                : `${formatCredit(p.free.earned)} / ${formatCredit(p.free.target)}`}
            </span>
          </li>
        )}
      </ul>
      <details className="j-basis">
        <summary>근거 · 필수 교양 과목 목록</summary>
        <ul className="j-checklist">
          {p.required.courses.map((c) => (
            <li key={c.name} data-done={c.done}>
              {c.done ? "✓" : "○"} {c.name} {formatCredit(c.creditMilli)}학점
              {c.note ? <small> · {c.note}</small> : null}
            </li>
          ))}
        </ul>
        {rule.free && <p>자유 교양: {rule.free.rule}</p>}
        <p>
          기준: {cohortSource}. 분야는 이번 학기 강의시간표에 있는 과목만 자동으로 알 수 있어요.
        </p>
      </details>
    </section>
  );
}
