import { formatCredit, summarizeCourseRecords } from "@hansung/academic-engine";
import { useState } from "react";
import { catalogCourses, primaryMappingForTrack } from "../catalog";
import { ChoiceField } from "./ChoiceField";
import { demoPlanRecords, type PlanItem, type Profile, profileTerm, type SavedPlan } from "./model";

export const planningTerms = [1, 2, 3, 4, 5, 6].flatMap((year) =>
  [1, 2].map((semester) => `${year}-${semester}`),
);
export const termLabel = (term: string) =>
  `${term.split("-")[0]}학년 ${term.split("-")[1]}학기${Number(term.split("-")[0]) > 4 ? " · 추가 학기" : ""}`;
export function SemesterBoard({
  items,
  track1,
  track2,
  profile,
  onChange,
}: {
  items: PlanItem[];
  track1: string;
  track2: string;
  profile: Profile;
  onChange: (items: PlanItem[]) => void;
}) {
  const [extra, setExtra] = useState(4);
  const current = profileTerm(profile);
  const terms = planningTerms.filter(
    (term) =>
      (term >= current && Number(term.split("-")[0]) <= extra) ||
      items.some((item) => item.term === term),
  );
  return (
    <section className="j-stack" aria-label="학기별 계획">
      <div>
        <h2>졸업까지 한 학기씩</h2>
        <p className="j-caption">
          권장 학년과 관계없이 수강할 학기로 옮길 수 있어요. 학기별 개설·선수과목·수강 상한은 학교
          확인이 필요해요.
        </p>
      </div>
      {terms.map((term) => {
        const rows = items.filter((item) => item.term === term);
        const summary = summarizeCourseRecords(demoPlanRecords(rows, track1, track2));
        return (
          <section className="j-semester" key={term} aria-label={termLabel(term)}>
            <div className="j-row">
              <h3>{termLabel(term)}</h3>
              <b>{formatCredit(summary.plannedCreditMilli)}학점</b>
            </div>
            <p className="j-caption">
              {rows.length}과목
              {summary.categoryCredits
                .map((row) => ` · ${row.category} ${formatCredit(row.plannedCreditMilli)}학점`)
                .join("")}
            </p>
            {rows.map((item) => {
              const course = catalogCourses.find((c) => c.code === item.code);
              return (
                <div className="j-plan-item" key={item.code}>
                  <b>{course?.name ?? item.code}</b>
                  <small>
                    {item.track}트랙 ·{" "}
                    {course
                      ? primaryMappingForTrack(course, item.track === 1 ? track1 : track2)?.category
                      : "분류 미확인"}{" "}
                    · {formatCredit(course?.creditMilli ?? 0)}학점
                  </small>
                  <ChoiceField
                    label={`${course?.name ?? item.code} 이동할 학기`}
                    value={item.term}
                    options={planningTerms.map((value) => ({ value, label: termLabel(value) }))}
                    onChange={(value) =>
                      onChange(items.map((i) => (i.code === item.code ? { ...i, term: value } : i)))
                    }
                  />
                  <button
                    type="button"
                    className="j-link"
                    onClick={() => onChange(items.filter((i) => i.code !== item.code))}
                  >
                    {course?.name ?? item.code} 계획에서 빼기
                  </button>
                </div>
              );
            })}
            {!rows.length && <p className="j-caption">아직 담은 과목이 없어요.</p>}
          </section>
        );
      })}
      {extra < 6 && (
        <button type="button" className="j-secondary" onClick={() => setExtra((n) => n + 1)}>
          추가 학년 펼치기
        </button>
      )}
    </section>
  );
}
export function PlanComparison({ plans }: { plans: SavedPlan[] }) {
  const [left, setLeft] = useState(plans[0]?.id ?? "");
  const [right, setRight] = useState(plans[1]?.id ?? "");
  const a = plans.find((p) => p.id === left),
    b = plans.find((p) => p.id === right);
  if (plans.length < 2)
    return (
      <p className="j-caption">계획을 복사해 다른 선택을 저장하면 두 계획을 비교할 수 있어요.</p>
    );
  const options = plans.map((p) => ({ value: p.id, label: p.name }));
  return (
    <details className="j-paper">
      <summary>저장한 계획 두 개 비교하기</summary>
      <div className="j-stack">
        <ChoiceField label="기준 계획" value={left} options={options} onChange={setLeft} />
        <ChoiceField label="비교 계획" value={right} options={options} onChange={setRight} />
        {a && b && a.id !== b.id ? (
          <>
            <div className="j-table-scroll">
              <table className="j-compare-table">
                <caption>계획 비교 · 가상 학적 기준</caption>
                <thead>
                  <tr>
                    <th>비교 항목</th>
                    <th>{a.name}</th>
                    <th>{b.name}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>1트랙</th>
                    <td>{a.track1}</td>
                    <td>{b.track1}</td>
                  </tr>
                  <tr>
                    <th>2트랙</th>
                    <td>{a.track2}</td>
                    <td>{b.track2}</td>
                  </tr>
                  <tr>
                    <th>계획 학점</th>
                    {[a, b].map((p) => (
                      <td key={p.id}>
                        {formatCredit(
                          summarizeCourseRecords(demoPlanRecords(p.items, p.track1, p.track2))
                            .plannedCreditMilli,
                        )}
                        학점
                      </td>
                    ))}
                  </tr>
                  {planningTerms
                    .filter((term) => [...a.items, ...b.items].some((i) => i.term === term))
                    .map((term) => (
                      <tr key={term}>
                        <th>{termLabel(term)}</th>
                        {[a, b].map((p) => (
                          <td key={p.id}>
                            {formatCredit(
                              summarizeCourseRecords(
                                demoPlanRecords(
                                  p.items.filter((i) => i.term === term),
                                  p.track1,
                                  p.track2,
                                ),
                              ).plannedCreditMilli,
                            )}
                            학점
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p>
              비교 계획에만 담긴 과목:{" "}
              {b.items
                .filter((i) => !a.items.some((x) => x.code === i.code))
                .map((i) => catalogCourses.find((c) => c.code === i.code)?.name ?? i.code)
                .join(", ") || "없음"}
            </p>
            <p>
              기준 계획에만 담긴 과목:{" "}
              {a.items
                .filter((i) => !b.items.some((x) => x.code === i.code))
                .map((i) => catalogCourses.find((c) => c.code === i.code)?.name ?? i.code)
                .join(", ") || "없음"}
            </p>
          </>
        ) : (
          <p>서로 다른 계획을 선택해 주세요.</p>
        )}
      </div>
    </details>
  );
}
