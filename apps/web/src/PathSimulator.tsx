import { compareTrackCatalog, formatCredit } from "@hansung/academic-engine";
import type { StudentCourseRecord } from "@hansung/contracts";
import { useId, useMemo, useState } from "react";
import { catalogCourses, catalogTracks, coursesForTrack, primaryMappingForTrack } from "./catalog";
import { normalizedCourseName, publicMicroDegrees } from "./microdegrees";

type Scenario = "FIRST" | "SECOND" | "TRANSFER" | "MINOR" | "MD";
const defaultMd = publicMicroDegrees[0];

export function PathSimulator({
  currentTrack,
  records,
  plannedCodes,
  onPlan,
}: {
  currentTrack: string;
  records: StudentCourseRecord[];
  plannedCodes: string[];
  onPlan: (code: string) => void;
}) {
  const titleId = useId();
  const [scenario, setScenario] = useState<Scenario>("SECOND");
  const [targetTrack, setTargetTrack] = useState("");
  const [targetMd, setTargetMd] = useState(defaultMd.id);
  const completed = records.filter((record) => record.status === "COMPLETED");
  const targetEntries = useMemo(
    () =>
      coursesForTrack(targetTrack).flatMap((course) => {
        const mapping = primaryMappingForTrack(course, targetTrack);
        return mapping
          ? [
              {
                code: course.code,
                name: course.name,
                creditMilli: course.creditMilli,
                category: mapping.category,
                recommendedYear: mapping.recommendedYear,
                semester: mapping.semester,
              },
            ]
          : [];
      }),
    [targetTrack],
  );
  const comparison = compareTrackCatalog(completed, targetEntries);
  const md = publicMicroDegrees.find((item) => item.id === targetMd) ?? defaultMd;
  const mdRows = md.courseNames.map((name) => {
    const course = catalogCourses.find(
      (item) => normalizedCourseName(item.name) === normalizedCourseName(name),
    );
    return {
      name,
      course,
      completed: course ? completed.some((item) => item.courseCode === course.code) : false,
    };
  });
  const plannedCourses = plannedCodes.flatMap((code) => {
    const course = catalogCourses.find((item) => item.code === code);
    return course ? [course] : [];
  });
  const scenarios: Array<{ value: Scenario; label: string }> = [
    { value: "FIRST", label: "1트랙 변경" },
    { value: "SECOND", label: "2트랙 선택" },
    { value: "TRANSFER", label: "전과" },
    { value: "MINOR", label: "부전공" },
    { value: "MD", label: "마이크로디그리" },
  ];
  const scenarioGuidance: Record<Scenario, string> = {
    FIRST:
      "1트랙 변경 가능 범위와 승인 여부는 입학 유형·학년 등 개인 조건 확인이 필요합니다. 아래는 새 트랙 과목표와의 겹침만 보여줍니다.",
    SECOND:
      "2트랙 선택 시 기존 1트랙과의 중복 인정 및 각 트랙 필수 학점은 판정하지 않습니다. 새 트랙의 공개 과목 후보를 살펴보세요.",
    TRANSFER:
      "전과 승인 및 전과 후 기존 과목의 전공 인정은 학사 규정과 소속 학과 확인이 필요합니다. 겹치는 코드만 미리 보여줍니다.",
    MINOR:
      "부전공 신청 자격·이수 학점·상호 인정 규칙은 아직 확보되지 않았습니다. 아래 목록은 부전공 요건표가 아닌 해당 트랙 공개 과목표입니다.",
    MD: "마이크로디그리 이수 판정이나 학점 분류는 개인 신청·공식 인정 규칙 확인이 필요합니다. 공개 공지의 과목명만 대조합니다.",
  };

  return (
    <section className="feature-stack" aria-labelledby={titleId}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">PUBLIC CURRICULUM · PREVIEW</p>
          <h2 id={titleId}>다른 학업 경로와 과목 겹침 비교</h2>
        </div>
      </div>
      <p className="feature-note">
        현재 트랙 {currentTrack || "미설정"}의 이수 기록과 공개 과목표를 비교합니다. 같은 과목코드는
        ‘겹침’으로 표시하지만, 전과·부전공·마이크로디그리 학점 인정이나 졸업 가능 여부는 판정하지
        않습니다.
      </p>
      <fieldset className="scenario-tabs">
        <legend>비교할 학업 경로</legend>
        {scenarios.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={scenario === item.value}
            className={scenario === item.value ? "selected" : ""}
            onClick={() => setScenario(item.value)}
          >
            {item.label}
          </button>
        ))}
      </fieldset>
      <p className="feature-note">{scenarioGuidance[scenario]}</p>
      {scenario === "MD" ? (
        <label className="feature-field">
          공개 자료에서 확인한 과정
          <select value={targetMd} onChange={(event) => setTargetMd(event.target.value)}>
            {publicMicroDegrees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="feature-field">
          비교할 트랙
          <select value={targetTrack} onChange={(event) => setTargetTrack(event.target.value)}>
            <option value="">트랙 선택</option>
            {catalogTracks
              .filter((item) => item.rowCount > 0)
              .map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {scenario === "MD" ? (
        <div className="panel feature-panel">
          <h3>{md.name}</h3>
          <p>
            2026년 공개 공지의 과목명 일부를 대조합니다. 과정 신청, 대체·상호 인정, 개인별 수료
            요건은 별도 확인이 필요합니다.
          </p>
          <ul className="feature-list">
            {mdRows.map((row) => (
              <li key={row.name}>
                <span>
                  <b>{row.name}</b>
                  <small>
                    {row.course
                      ? `공개 목록 코드 ${row.course.code}`
                      : "현재 과목 목록에서 코드 미확인"}
                  </small>
                </span>
                <span>{row.completed ? "이수 기록과 코드 겹침" : "이수 기록에 없음"}</span>
                {row.course && !row.completed ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (row.course) onPlan(row.course.code);
                    }}
                  >
                    {plannedCodes.includes(row.course.code) ? "계획에서 빼기" : "계획에 담기"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <a href={md.sourceUrl} target="_blank" rel="noreferrer">
            2026 마이크로디그리 공지 보기
          </a>
        </div>
      ) : targetTrack ? (
        <div className="panel feature-panel">
          <h3>{targetTrack} 공개 과목표</h3>
          <div className="feature-metrics">
            <span>
              <b>{comparison.matched.length}과목</b> 이수 코드와 겹침
            </span>
            <span>
              <b>{formatCredit(comparison.matchedCreditMilli)}학점</b> 겹친 과목 학점 합계
            </span>
            <span>
              <b>{comparison.candidates.length}과목</b> 탐색 후보
            </span>
          </div>
          <p className="feature-note">
            이 숫자는 졸업까지 부족한 학점이 아닙니다. 입학년도별 요건·트랙 승인·전공 인정 규칙은
            미확보 상태입니다.
          </p>
          <h4>겹치는 이수 과목</h4>
          <ul className="feature-list">
            {comparison.matched.length ? (
              comparison.matched.slice(0, 12).map((item) => (
                <li key={item.code}>
                  <span>
                    <b>{item.name}</b>
                    <small>
                      {item.code} · {item.category}
                    </small>
                  </span>
                  <span>{formatCredit(item.creditMilli)}학점</span>
                </li>
              ))
            ) : (
              <li>아직 겹치는 이수 과목이 없습니다.</li>
            )}
          </ul>
          <h4>다음 학기 탐색 후보</h4>
          <ul className="feature-list">
            {comparison.candidates.slice(0, 12).map((item) => (
              <li key={item.code}>
                <span>
                  <b>{item.name}</b>
                  <small>
                    {item.code} · {item.category} · {item.recommendedYear}학년 {item.semester}학기
                    권장
                  </small>
                </span>
                <button type="button" onClick={() => onPlan(item.code)}>
                  {plannedCodes.includes(item.code) ? "계획에서 빼기" : "계획에 담기"}
                </button>
              </li>
            ))}
          </ul>
          {comparison.candidates.length > 12 ? (
            <p>나머지 {comparison.candidates.length - 12}과목은 과목 탐색에서 확인하세요.</p>
          ) : null}
          {comparison.completedOutsideTarget.length ? (
            <p>
              현재 이수 기록 중 이 트랙 과목표 밖의 코드 {comparison.completedOutsideTarget.length}
              개는 인정 불가로 판정한 것이 아닙니다.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="feature-empty">
          비교할 트랙을 선택하면 이수 코드와 공개 과목표의 겹침을 볼 수 있습니다.
        </p>
      )}
      <section className="panel feature-panel">
        <h3>담아 둔 과목 · 이 세션의 계획</h3>
        <p className="feature-note">
          다른 트랙에서 담은 과목은 현재 트랙의 학기 보드에 표시되지 않을 수 있습니다. 계획은
          새로고침하면 사라집니다.
        </p>
        {plannedCourses.length ? (
          <ul className="feature-list">
            {plannedCourses.map((course) => (
              <li key={course.code}>
                <span>
                  <b>{course.name}</b>
                  <small>
                    {course.code} · {formatCredit(course.creditMilli)}학점
                  </small>
                </span>
                <button type="button" onClick={() => onPlan(course.code)}>
                  계획에서 빼기
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>아직 담은 과목이 없습니다.</p>
        )}
      </section>
    </section>
  );
}
