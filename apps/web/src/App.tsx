import { formatCredit, summarizeCourseRecords } from "@hansung/academic-engine";
import type { CurriculumCategory, StudentCourseRecord } from "@hansung/contracts";
import { useId, useMemo, useState } from "react";
import {
  type CatalogCourse,
  type CourseCategory,
  catalog,
  catalogCategories,
  catalogTracks,
  courseMappingsForTrack,
  coursesForTrack,
  primaryMappingForTrack,
} from "./catalog";
import { PathSimulator } from "./PathSimulator";
import { SpaceAdmin, SpaceWorkflow } from "./SpaceWorkflow";
import type { SpaceRequest } from "./space-demo";

type View = "roadmap" | "explore" | "simulate" | "spaces" | "records" | "admin";
type RecordMode = "DIRECT" | "DEMO" | "";
type StudentProfile = {
  name: string;
  studentId: string;
  currentTrack: string;
  entryYear: string;
  recordMode: RecordMode;
};

const navItems: Array<{ id: View; label: string; caption: string; icon: string }> = [
  { id: "roadmap", label: "내 학업", caption: "이수와 다음 학기", icon: "⌁" },
  { id: "explore", label: "과목 탐색", caption: "과정에서 찾아 담기", icon: "⌕" },
  { id: "simulate", label: "경로 비교", caption: "트랙·전과·MD", icon: "⇄" },
  { id: "spaces", label: "공간 찾기", caption: "조건부터 입력", icon: "⌂" },
  { id: "records", label: "이수 내역", caption: "실제·직접 입력", icon: "✓" },
  { id: "admin", label: "관리자·자료", caption: "신청 점검과 근거", icon: "i" },
];
const categoryOrder: CurriculumCategory[] = [
  "교양필수",
  "선택필수",
  "자율교양",
  "일선",
  "전기",
  "전필",
  "전선",
  "미분류",
];
const demoCompletedCodes = [
  "CTE0002",
  "M020040",
  "M020046",
  "V020001",
  "V020002",
  "V020003",
  "V020004",
  "V020005",
  "V020006",
  "V020007",
  "V020008",
  "V020009",
  "V020010",
  "V020011",
  "V024003",
  "V020012",
  "V020013",
  "V020014",
  "V020015",
  "V021004",
  "V022003",
];

function SourceTag({ children = "공개 교육과정 관찰" }: { children?: string }) {
  return <span className="source-badge">{children}</span>;
}

function sourceRecord(
  course: CatalogCourse,
  track: string,
  status: StudentCourseRecord["status"],
): StudentCourseRecord | null {
  const mapping = primaryMappingForTrack(course, track);
  if (!mapping) return null;
  return {
    id: `${status}-${course.code}`,
    courseCode: course.code,
    name: course.name,
    creditMilli: course.creditMilli,
    category: mapping.category,
    recommendedYear: mapping.recommendedYear,
    semester: mapping.semester,
    term: `${mapping.recommendedYear}-${mapping.semester}`,
    status,
    source: "PUBLIC_CURRICULUM",
  };
}
function demoRecords(track: string): StudentCourseRecord[] {
  const observed = demoCompletedCodes
    .map((code) => catalog.courses.find((course) => course.code === code))
    .flatMap((course) => (course ? [sourceRecord(course, track, "COMPLETED")] : []))
    .filter((record): record is StudentCourseRecord => record !== null);
  const summaries: StudentCourseRecord[] = [
    {
      id: "demo-ge-required",
      name: "교양필수 이수 요약",
      creditMilli: 13_000,
      category: "교양필수",
      term: "DEMO",
      status: "COMPLETED",
      source: "DEMO_SUMMARY",
    },
    {
      id: "demo-ge-choice",
      name: "선택필수교양 이수 요약",
      creditMilli: 15_000,
      category: "선택필수",
      term: "DEMO",
      status: "COMPLETED",
      source: "DEMO_SUMMARY",
    },
    {
      id: "demo-ge-autonomous",
      name: "자율교양 이수 요약",
      creditMilli: 3_000,
      category: "자율교양",
      term: "DEMO",
      status: "COMPLETED",
      source: "DEMO_SUMMARY",
    },
    {
      id: "demo-general",
      name: "일반선택 이수 요약",
      creditMilli: 12_000,
      category: "일선",
      term: "DEMO",
      status: "COMPLETED",
      source: "DEMO_SUMMARY",
    },
  ];
  return [...observed, ...summaries];
}

function Login({ onLogin }: { onLogin: () => void }) {
  const id = useId();
  const password = useId();
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark">메이트</span>
          <div>
            <b>한성 메이트</b>
            <small>학업 · 과정 · 공간</small>
          </div>
        </div>
        <div>
          <p className="eyebrow">DEMO LOGIN</p>
          <h1>로그인</h1>
          <p className="login-copy">DEMO 계정이 미리 입력되어 있습니다.</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLogin();
          }}
        >
          <label htmlFor={id}>
            아이디
            <input id={id} defaultValue="20260001" autoComplete="username" />
          </label>
          <label htmlFor={password}>
            비밀번호
            <input
              id={password}
              type="password"
              defaultValue="hansung"
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="primary-button full-button">
            로그인
          </button>
        </form>
        <p className="login-note">실제 인증이나 개인정보 저장을 수행하지 않는 시연입니다.</p>
      </section>
    </main>
  );
}

function Onboarding({
  profile,
  onChange,
  onComplete,
  onDemo,
}: {
  profile: StudentProfile;
  onChange: (next: StudentProfile) => void;
  onComplete: () => void;
  onDemo: () => void;
}) {
  const nameId = useId();
  const studentId = useId();
  const entryYear = useId();
  const trackId = useId();
  const ready = Boolean(
    profile.name && profile.studentId && profile.currentTrack && profile.entryYear,
  );
  return (
    <section className="onboarding app-setup">
      <div className="setup-header">
        <div>
          <p className="eyebrow">학업 시작</p>
          <h2>내 기준을 먼저 설정하세요</h2>
          <p>입학년도와 트랙은 과목 탐색·학기 보드를 개인화하는 기준입니다.</p>
        </div>
        <SourceTag>규칙 판정 전</SourceTag>
      </div>
      <div className="setup-step">
        <div className="step-title">
          <span>1</span>
          <div>
            <h3>기본 정보</h3>
            <p>DEMO 화면 안에서만 사용합니다.</p>
          </div>
        </div>
        <div className="identity-grid">
          <label htmlFor={nameId}>
            이름
            <input
              id={nameId}
              value={profile.name}
              onChange={(event) => onChange({ ...profile, name: event.target.value })}
              placeholder="이름 입력"
            />
          </label>
          <label htmlFor={studentId}>
            학번
            <input
              id={studentId}
              value={profile.studentId}
              onChange={(event) => onChange({ ...profile, studentId: event.target.value })}
              inputMode="numeric"
              placeholder="예: 20260001"
            />
          </label>
          <label htmlFor={entryYear}>
            입학년도
            <input
              id={entryYear}
              value={profile.entryYear}
              onChange={(event) => onChange({ ...profile, entryYear: event.target.value })}
              inputMode="numeric"
              placeholder="예: 2026"
            />
          </label>
        </div>
      </div>
      <div className="setup-step">
        <div className="step-title">
          <span>2</span>
          <div>
            <h3>현재 트랙</h3>
            <p>39개 트랙을 검색하거나 정확한 이름을 직접 입력할 수 있습니다.</p>
          </div>
        </div>
        <label className="track-combobox" htmlFor={trackId}>
          트랙 검색 또는 직접 입력
          <input
            id={trackId}
            list={`${trackId}-options`}
            value={profile.currentTrack}
            onChange={(event) => onChange({ ...profile, currentTrack: event.target.value })}
            placeholder="예: 웹공학트랙"
          />
          <datalist id={`${trackId}-options`}>
            {catalogTracks.map((track) => (
              <option key={track.name} value={track.name}>
                {track.rowCount ? `공개 과목표 ${track.rowCount}행` : "공개 표 확인 필요"}
              </option>
            ))}
          </datalist>
        </label>
      </div>
      <div className="setup-footer">
        <div>
          <b>이수 내역은 실제 과목을 선택해 추가합니다.</b>
          <p>공식 졸업규칙이 없는 동안에는 분류별 이수현황만 안내합니다.</p>
        </div>
        <div className="setup-actions">
          <button type="button" className="secondary-button" onClick={onDemo}>
            실제 과목 DEMO 보기
          </button>
          <button type="button" className="primary-button" disabled={!ready} onClick={onComplete}>
            학업 설정 저장
          </button>
        </div>
      </div>
    </section>
  );
}

function Roadmap({
  profile,
  records,
  plannedCodes,
  onGo,
  onRemovePlan,
}: {
  profile: StudentProfile;
  records: StudentCourseRecord[];
  plannedCodes: string[];
  onGo: (view: View) => void;
  onRemovePlan: (code: string) => void;
}) {
  const trackCourses = coursesForTrack(profile.currentTrack);
  const planned = plannedCodes.flatMap((code) => {
    const course = catalog.courses.find((item) => item.code === code);
    const record = course ? sourceRecord(course, profile.currentTrack, "PLANNED") : null;
    return record ? [record] : [];
  });
  const summary = summarizeCourseRecords([...records, ...planned]);
  const completedCodes = new Set(
    records
      .filter((record) => record.status === "COMPLETED" && record.courseCode)
      .map((record) => record.courseCode),
  );
  const plannedSet = new Set(plannedCodes);
  const categoryCredit = (category: CurriculumCategory) =>
    summary.categoryCredits.find((item) => item.category === category);
  return (
    <section className="roadmap-view curriculum-roadmap">
      <div className="profile-strip">
        <div>
          <span>
            {profile.recordMode === "DEMO"
              ? "실제 과목코드 + 분류형 DEMO 이수현황"
              : "내 입력 기준"}
          </span>
          <b>
            {profile.currentTrack} · {profile.entryYear} 입학
          </b>
        </div>
        <button type="button" className="text-button" onClick={() => onGo("records")}>
          이수 내역 수정 →
        </button>
      </div>
      <section className="learning-next">
        <div>
          <p className="eyebrow">NEXT ACTION</p>
          <h2>어떤 과목을 다음 학기에 담을까요?</h2>
          <p>공개 교육과정에서 과목을 찾고, 학기 보드에서 이수·계획 상태를 한눈에 확인하세요.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => onGo("explore")}>
          과목 탐색 열기
        </button>
      </section>
      <div className="summary-grid curriculum-summary">
        <article className="total-card">
          <p>현재 이수 학점</p>
          <strong>{formatCredit(summary.completedCreditMilli)}</strong>
          <span> 학점</span>
          <p className="remaining">
            계획 과목{" "}
            <b>
              {planned.length}개 · {formatCredit(summary.plannedCreditMilli)}학점
            </b>
          </p>
        </article>
        <article className="status-card">
          <span className="status-symbol">✓</span>
          <div>
            <p>분류별 현황</p>
            <strong>{summary.categoryCredits.length}개 분류</strong>
            <small>전기·전필·전선과 교양을 분리해 집계합니다.</small>
          </div>
        </article>
        <article className="status-card">
          <span className="status-symbol">?</span>
          <div>
            <p>졸업 판정</p>
            <strong>공식 규칙 확인 필요</strong>
            <small>130학점 단일 기준으로 단정하지 않습니다.</small>
          </div>
        </article>
      </div>
      <section className="panel classification-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CREDIT BREAKDOWN</p>
            <h2>이수분류별 학점</h2>
          </div>
          <SourceTag>
            {profile.recordMode === "DEMO" ? "과목코드 + DEMO 교양 요약" : "내 입력 + 공개 과목표"}
          </SourceTag>
        </div>
        <div className="classification-grid">
          {categoryOrder.map((category) => {
            const credit = categoryCredit(category);
            return (
              <article key={category}>
                <span>{category}</span>
                <b>
                  {formatCredit(credit?.completedCreditMilli ?? 0)}
                  <small>학점</small>
                </b>
                <p>
                  {credit?.plannedCreditMilli
                    ? `계획 +${formatCredit(credit.plannedCreditMilli)}학점`
                    : "계획 없음"}
                </p>
              </article>
            );
          })}
        </div>
        <p className="rule-note">
          교양 최소학점·전공 인정·총 졸업학점은 입학년도와 이수경로별 공식 규칙팩이 확보된 뒤
          판정합니다.
        </p>
      </section>
      <section className="semester-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TRACK CURRICULUM</p>
            <h2>학년·학기별 과정 보드</h2>
          </div>
          <span className="board-legend">
            <i className="done" /> 이수 <i className="planned" /> 계획 <i /> 탐색 가능
          </span>
        </div>
        {!trackCourses.length ? (
          <div className="empty-state">
            <h2>이 트랙의 공개 과목표를 아직 읽지 못했어요</h2>
            <p>다른 트랙을 선택하거나 자료 상태에서 원본 범위를 확인해 주세요.</p>
            <button type="button" className="primary-button" onClick={() => onGo("explore")}>
              전체 과정 탐색
            </button>
          </div>
        ) : (
          <div className="semester-board">
            {[1, 2, 3, 4]
              .flatMap((year) =>
                [1, 2].map((semester) => ({ year: String(year), semester: String(semester) })),
              )
              .map((slot) => {
                const entries = trackCourses.filter((course) =>
                  courseMappingsForTrack(course, profile.currentTrack).some(
                    (mapping) =>
                      mapping.recommendedYear === slot.year && mapping.semester === slot.semester,
                  ),
                );
                const unique = [
                  ...new Map(entries.map((course) => [course.code, course])).values(),
                ];
                const total = unique.reduce((sum, course) => sum + course.creditMilli, 0);
                return (
                  <article className="semester-card" key={`${slot.year}-${slot.semester}`}>
                    <header>
                      <span>
                        {slot.year}학년 {slot.semester}학기
                      </span>
                      <b>{formatCredit(total)}학점</b>
                    </header>
                    <div>
                      {unique.map((course) => (
                        <div
                          className={`semester-course ${completedCodes.has(course.code) ? "completed" : plannedSet.has(course.code) ? "is-planned" : ""}`}
                          key={course.code}
                        >
                          <span>{course.code}</span>
                          <b>{course.name}</b>
                          <small>
                            {primaryMappingForTrack(course, profile.currentTrack)?.category} ·{" "}
                            {formatCredit(course.creditMilli)}학점
                          </small>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
          </div>
        )}
      </section>
      {planned.length ? (
        <section className="panel plan-panel">
          <div>
            <p className="eyebrow">MY PLAN</p>
            <h2>담아둔 과목</h2>
          </div>
          {planned.map((record) => (
            <div className="plan-row" key={record.id}>
              <span>
                {record.courseCode} · {record.category}
              </span>
              <b>{record.name}</b>
              <button
                type="button"
                onClick={() => record.courseCode && onRemovePlan(record.courseCode)}
              >
                계획에서 빼기
              </button>
            </div>
          ))}
        </section>
      ) : null}
    </section>
  );
}

function Explore({
  profile,
  plannedCodes,
  onPlan,
}: {
  profile: StudentProfile;
  plannedCodes: string[];
  onPlan: (code: string) => void;
}) {
  const searchId = useId();
  const trackId = useId();
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState(profile.currentTrack || "ALL");
  const [category, setCategory] = useState<CourseCategory | "ALL">("ALL");
  const [year, setYear] = useState("ALL");
  const results = useMemo(
    () =>
      catalog.courses.filter((course) => {
        const matchesQuery =
          !query || `${course.code} ${course.name}`.toLowerCase().includes(query.toLowerCase());
        const mappings = track === "ALL" ? course.mappings : courseMappingsForTrack(course, track);
        return (
          matchesQuery &&
          mappings.some(
            (mapping) =>
              (category === "ALL" || mapping.category === category) &&
              (year === "ALL" || mapping.recommendedYear === year),
          )
        );
      }),
    [category, query, track, year],
  );
  const shown = results.slice(0, 24);
  return (
    <section className="explore-view curriculum-explore">
      <section className="explore-intro">
        <div>
          <p className="eyebrow">COURSE DISCOVERY</p>
          <h2>과목을 찾아, 내 학기 계획에 담으세요.</h2>
          <p>
            시간표를 그대로 복제하는 화면이 아니라 트랙 이수·과목 분류·다음 학기 계획을 함께
            판단하는 탐색 도구입니다.
          </p>
        </div>
        <div className="catalog-numbers">
          <b>{catalog.summary.uniqueCourseCount}</b>
          <span>공개 과목코드</span>
          <small>{catalog.summary.observedRowCount}개 트랙 편성 행</small>
        </div>
      </section>
      <section className="panel filter-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FILTER</p>
            <h2>조건으로 과목 찾기</h2>
          </div>
          <SourceTag>34개 공개 표 기반</SourceTag>
        </div>
        <div className="course-filters">
          <label htmlFor={searchId}>
            과목코드 또는 과목명
            <input
              id={searchId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: V024004, 웹서버"
            />
          </label>
          <label htmlFor={trackId}>
            트랙
            <select id={trackId} value={track} onChange={(event) => setTrack(event.target.value)}>
              <option value="ALL">전체 트랙</option>
              {catalogTracks.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                  {item.rowCount ? "" : " · 표 확인 필요"}
                </option>
              ))}
            </select>
          </label>
          <label>
            이수분류
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as CourseCategory | "ALL")}
            >
              <option value="ALL">전체 분류</option>
              {catalogCategories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            권장 학년
            <select value={year} onChange={(event) => setYear(event.target.value)}>
              <option value="ALL">전체 학년</option>
              {[1, 2, 3, 4].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="result-count">
          <b>{results.length}개</b> 과목이 조건에 맞습니다. 한 과목이 여러 트랙·학기에 편성된 경우
          각각의 근거를 표시합니다.
        </p>
      </section>
      <section className="course-result-list" aria-live="polite">
        {shown.map((course) => {
          const mappings =
            track === "ALL" ? course.mappings : courseMappingsForTrack(course, track);
          const selected = plannedCodes.includes(course.code);
          return (
            <article className="catalog-course" key={course.code}>
              <div className="course-main">
                <span className="code">
                  {course.code} · {formatCredit(course.creditMilli)}학점
                </span>
                <h3>{course.name}</h3>
                <div className="mapping-tags">
                  {mappings.slice(0, 5).map((mapping) => (
                    <span
                      key={`${mapping.track}-${mapping.recommendedYear}-${mapping.semester}-${mapping.category}`}
                    >
                      {mapping.track} · {mapping.recommendedYear}학년 {mapping.semester}학기 ·{" "}
                      <b>{mapping.category}</b>
                    </span>
                  ))}
                </div>
              </div>
              <div className="course-actions">
                <a href={mappings[0]?.sourceUrl} target="_blank" rel="noreferrer">
                  원본 보기
                </a>
                <button
                  type="button"
                  className={selected ? "secondary-button" : "primary-button"}
                  onClick={() => onPlan(course.code)}
                >
                  {selected ? "계획에서 빼기" : "내 계획에 담기"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
      {results.length > shown.length ? (
        <p className="more-results">
          정확한 검색어나 필터로 결과를 좁혀 보세요. 현재 처음 24개를 표시합니다.
        </p>
      ) : null}
      {!results.length ? (
        <div className="empty-state">
          <h2>조건에 맞는 공개 과목표가 없어요</h2>
          <p>트랙·분류·학년 필터를 하나씩 해제하거나 과목코드로 다시 검색해 보세요.</p>
        </div>
      ) : null}
    </section>
  );
}

function Records({
  profile,
  records,
  onAdd,
  onRemove,
}: {
  profile: StudentProfile;
  records: StudentCourseRecord[];
  onAdd: (record: StudentCourseRecord) => void;
  onRemove: (id: string) => void;
}) {
  const courseId = useId();
  const nameId = useId();
  const creditId = useId();
  const [selectedCode, setSelectedCode] = useState("");
  const [name, setName] = useState("");
  const [credit, setCredit] = useState("3");
  const trackCourses = coursesForTrack(profile.currentTrack);
  const summary = summarizeCourseRecords(records);
  const addCatalogCourse = () => {
    const course = trackCourses.find((item) => item.code === selectedCode);
    const record = course ? sourceRecord(course, profile.currentTrack, "COMPLETED") : null;
    if (record && !records.some((item) => item.courseCode === record.courseCode)) onAdd(record);
  };
  const addManual = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || Number(credit) <= 0) return;
    onAdd({
      id: `manual-${Date.now()}`,
      name: name.trim(),
      creditMilli: Number(credit) * 1000,
      category: "미분류",
      term: "직접 입력",
      status: "COMPLETED",
      source: "MANUAL",
    });
    setName("");
  };
  return (
    <section className="records-view modern-records">
      <div className="records-intro">
        <p className="eyebrow">MY COURSE RECORDS</p>
        <h2>이수한 과목을 분류까지 확인하세요.</h2>
        <p>
          공개 교육과정에 있는 과목은 과목코드·전기/전필/전선·권장 학년을 함께 저장합니다. 교양·인정
          여부는 공식 성적표 또는 규칙 확인 전까지 확정하지 않습니다.
        </p>
      </div>
      {profile.recordMode === "DIRECT" ? (
        <section className="record-entry-grid">
          <div className="panel">
            <p className="eyebrow">FROM CURRICULUM</p>
            <h2>공개 과목표에서 이수 추가</h2>
            <label htmlFor={courseId}>
              과목 선택
              <select
                id={courseId}
                value={selectedCode}
                onChange={(event) => setSelectedCode(event.target.value)}
              >
                <option value="">과목을 선택하세요</option>
                {trackCourses.map((course) => {
                  const mapping = primaryMappingForTrack(course, profile.currentTrack);
                  return (
                    <option key={course.code} value={course.code}>
                      {course.code} · {course.name} · {mapping?.category} ·{" "}
                      {formatCredit(course.creditMilli)}학점
                    </option>
                  );
                })}
              </select>
            </label>
            <button
              type="button"
              className="primary-button"
              disabled={!selectedCode}
              onClick={addCatalogCourse}
            >
              이수 완료로 추가
            </button>
          </div>
          <form className="panel" onSubmit={addManual}>
            <p className="eyebrow">MANUAL ENTRY</p>
            <h2>직접 입력</h2>
            <label htmlFor={nameId}>
              과목명
              <input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="성적표에 있는 과목명"
              />
            </label>
            <label htmlFor={creditId}>
              학점
              <input
                id={creditId}
                type="number"
                min="0.5"
                step="0.5"
                value={credit}
                onChange={(event) => setCredit(event.target.value)}
              />
            </label>
            <button type="submit" className="secondary-button">
              분류 미확인으로 추가
            </button>
          </form>
        </section>
      ) : null}
      <section className="record-summary real-summary">
        <div>
          <span>이수 학점</span>
          <b>{formatCredit(summary.completedCreditMilli)}학점</b>
        </div>
        <div>
          <span>실제 과목코드</span>
          <b>{records.filter((record) => record.courseCode).length}개</b>
        </div>
        <p>
          {profile.recordMode === "DEMO"
            ? "실제 공개 과목코드와 데모 교양 요약을 함께 보여줍니다."
            : "입력된 이수현황이며, 공식 졸업 충족 판정은 아닙니다."}
        </p>
      </section>
      <section className="panel record-table">
        <div className="record-header">
          <span>과목</span>
          <span>분류</span>
          <span>권장 학기</span>
          <span>학점</span>
          <span>출처</span>
        </div>
        {records.map((record) => (
          <article className="record-row detailed" key={record.id}>
            <div>
              <b>
                {record.courseCode ? `${record.courseCode} · ` : ""}
                {record.name}
              </b>
              <small>
                {record.source === "PUBLIC_CURRICULUM"
                  ? "공개 교육과정 편성"
                  : record.source === "DEMO_SUMMARY"
                    ? "DEMO 요약"
                    : "직접 입력"}
              </small>
            </div>
            <span className="category-badge">{record.category}</span>
            <span>
              {record.recommendedYear
                ? `${record.recommendedYear}학년 ${record.semester}학기`
                : "확인 필요"}
            </span>
            <strong>{formatCredit(record.creditMilli)}학점</strong>
            <span>
              {record.source === "PUBLIC_CURRICULUM"
                ? "관찰"
                : record.source === "MANUAL"
                  ? "내 입력"
                  : "DEMO"}
            </span>
            {profile.recordMode === "DIRECT" ? (
              <button
                type="button"
                aria-label={`${record.name} 삭제`}
                onClick={() => onRemove(record.id)}
              >
                삭제
              </button>
            ) : null}
          </article>
        ))}
      </section>
    </section>
  );
}

function Admin({
  requests,
  onUpdate,
}: {
  requests: SpaceRequest[];
  onUpdate: (id: string, patch: Partial<SpaceRequest>) => void;
}) {
  return (
    <div className="feature-stack">
      <SpaceAdmin requests={requests} onUpdate={onUpdate} />
      <section className="content-grid admin-view">
        <article className="panel support-card">
          <span className="support-status good">관찰</span>
          <h2>트랙 목록</h2>
          <strong>39</strong>
          <p>공개 상태를 함께 보관합니다.</p>
        </article>
        <article className="panel support-card">
          <span className="support-status good">관찰</span>
          <h2>트랙 편성 행</h2>
          <strong>880</strong>
          <p>트랙·학년·학기·분류 매핑입니다.</p>
        </article>
        <article className="panel support-card">
          <span className="support-status good">관찰</span>
          <h2>과목코드</h2>
          <strong>478</strong>
          <p>중복 제외 공개 과목코드입니다.</p>
        </article>
        <article className="panel support-card">
          <span className="support-status pending">미확보</span>
          <h2>개인별 졸업규칙</h2>
          <strong>0</strong>
          <p>입학년도별 공식 판정 규칙은 아직 없습니다.</p>
        </article>
      </section>
    </div>
  );
}

export function App() {
  const mainContentId = useId();
  const [view, setView] = useState<View>("roadmap");
  const [loggedIn, setLoggedIn] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [profile, setProfile] = useState<StudentProfile>({
    name: "",
    studentId: "",
    currentTrack: "",
    entryYear: "",
    recordMode: "",
  });
  const [manualRecords, setManualRecords] = useState<StudentCourseRecord[]>([]);
  const [plannedCodes, setPlannedCodes] = useState<string[]>([]);
  const [spaceRequests, setSpaceRequests] = useState<SpaceRequest[]>([]);
  const records = profile.recordMode === "DEMO" ? demoRecords(profile.currentTrack) : manualRecords;
  const headings: Record<View, string> = {
    roadmap: profileReady ? "내 학업" : "학업 시작",
    explore: "과목 탐색",
    simulate: "경로 비교",
    spaces: "공간 찾기",
    records: "이수 내역",
    admin: "관리자·자료 상태",
  };
  const togglePlan = (code: string) =>
    setPlannedCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  const content =
    view === "roadmap" ? (
      !profileReady ? (
        <Onboarding
          profile={profile}
          onChange={(next) => {
            setProfile(next);
            setProfileReady(false);
          }}
          onComplete={() => {
            setProfile((current) => ({ ...current, recordMode: "DIRECT" }));
            setProfileReady(true);
          }}
          onDemo={() => {
            setProfile({
              name: "메이트 데모",
              studentId: "20260001",
              currentTrack: "웹공학트랙",
              entryYear: "2026",
              recordMode: "DEMO",
            });
            setPlannedCodes(["V024004", "V024005"]);
            setProfileReady(true);
          }}
        />
      ) : (
        <Roadmap
          profile={profile}
          records={records}
          plannedCodes={plannedCodes}
          onGo={setView}
          onRemovePlan={togglePlan}
        />
      )
    ) : view === "explore" ? (
      <Explore profile={profile} plannedCodes={plannedCodes} onPlan={togglePlan} />
    ) : view === "simulate" ? (
      <PathSimulator
        currentTrack={profile.currentTrack}
        records={records}
        plannedCodes={plannedCodes}
        onPlan={togglePlan}
      />
    ) : view === "spaces" ? (
      <SpaceWorkflow
        profile={profile}
        requests={spaceRequests}
        onCreate={(request) => setSpaceRequests((current) => [request, ...current])}
      />
    ) : view === "records" ? (
      <Records
        profile={profile}
        records={records}
        onAdd={(record) => setManualRecords((current) => [...current, record])}
        onRemove={(id) =>
          setManualRecords((current) => current.filter((record) => record.id !== id))
        }
      />
    ) : (
      <Admin
        requests={spaceRequests}
        onUpdate={(id, patch) =>
          setSpaceRequests((current) =>
            current.map((request) => (request.id === id ? { ...request, ...patch } : request)),
          )
        }
      />
    );
  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />;
  return (
    <div className="app-shell">
      <a className="skip-link" href={`#${mainContentId}`}>
        본문으로 건너뛰기
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="한성 메이트 홈">
          <span className="brand-mark">메이트</span>
          <span>
            <b>한성 메이트</b>
            <small>학업과 캠퍼스 공간</small>
          </span>
        </a>
        <nav aria-label="주요 메뉴">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "nav-item active" : "nav-item"}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>
                <b>{item.label}</b>
                <small>{item.caption}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="demo-pill">PUBLIC + DEMO</span>
          <p>공개 교육과정, 내 입력, DEMO 요약을 구분해 보여줍니다.</p>
        </div>
      </aside>
      <main className="main-content" id={mainContentId} tabIndex={-1}>
        <header className="topbar">
          <div>
            <p className="eyebrow">HANSUNG IEUM · DEMO</p>
            <h1>{headings[view]}</h1>
          </div>
          <div className="top-actions">
            <span className="sync-state">
              {profileReady ? profile.currentTrack : "학업 설정 전"}
            </span>
            <button type="button" className="avatar" aria-label="DEMO 프로필">
              {profile.name.slice(0, 1) || "가"}
            </button>
          </div>
        </header>
        <section className="notice" aria-label="데모 안내">
          <span aria-hidden="true">i</span>
          <p>
            <b>공개 교육과정 기반 DEMO입니다.</b> 현재는 과목 편성·분류를 안내하며, 실제
            개설·성적표·개인별 졸업 인정은 학교 확인이 필요합니다.
          </p>
          <button type="button" onClick={() => setView("admin")}>
            자료 상태 보기
          </button>
        </section>
        {content}
      </main>
    </div>
  );
}
