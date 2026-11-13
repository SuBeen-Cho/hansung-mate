import { allocationPreview, auditPlan, formatCredit } from "@hansung/academic-engine";
import { catalogCourses, findProgram } from "../catalog";
import { useAcademicData } from "./AcademicData";
import { classifyChange, type PlanItem, type Profile, profileTerm } from "./model";
export function PlanReview({
  items,
  tracks,
  profile,
}: {
  items: PlanItem[];
  tracks: string[];
  profile: Profile;
}) {
  const data = useAcademicData();
  const audit = auditPlan({
    items,
    tracks,
    records: data.records,
    catalog: catalogCourses,
    currentTerm: profileTerm(profile),
    creditLimitMilli: data.creditLimit * 1000,
  });
  return (
    <section className="j-paper" aria-label="계획 검사">
      <h3>계획 검사</h3>
      <p>
        {audit.issues.some((i) => i.level === "ERROR")
          ? "수정할 항목이 있어요"
          : "입력 구조 확인 · 개설과 인정은 확인이 필요해요"}
      </p>
      <p className="j-caption">
        내 학기 상한 {data.creditLimit}학점 · 학교 범위 6~18학점(직전학기 4.0 이상·F 없음 시 21학점)
      </p>
      {(data.creditLimit > 21 || data.creditLimit < 6) && (
        <p className="j-warning">
          설정한 상한 {data.creditLimit}학점은 학교 수강신청 범위를 벗어나요. 내 정보 › 졸업
          요건에서 6~21학점 사이로 바꿔 주세요.
        </p>
      )}
      <ul className="j-audit-list">
        {audit.issues.map((i, n) => (
          <li key={`${i.code}-${n}`} data-level={i.level}>
            <b>{i.level === "ERROR" ? "수정" : i.level === "WARNING" ? "주의" : "미확인"}</b>{" "}
            {i.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
export function TrackAllocationPreview({ before, after }: { before: string[]; after: string[] }) {
  const data = useAcademicData();
  const rows = allocationPreview(data.records, catalogCourses, before, after);
  const label = (m: (typeof rows)[number]["after"]) =>
    m.map((r) => `${r.slot}트랙 ${r.category}`).join(" / ") || "과목표 일치 없음";
  const change = classifyChange(before, after);
  return (
    <details className="j-paper">
      <summary>과목별 변경 전·후 분류 보기 · {rows.length}과목</summary>
      {change === "TRANSFER" && (
        <p className="j-warning">
          1트랙이 다른 학부·학과({findProgram(before[0] ?? "")?.unit} →{" "}
          {findProgram(after[0] ?? "")?.unit})로 바뀌어 트랙 변경이 아닌 일반 전부(과) 절차예요.
          학교 안내에 따르면 합격 후 이전 전공 성적은 일반선택으로 바뀌어요.
        </p>
      )}
      {change === "TRACK_CHANGE" && (
        <p className="j-caption">
          같은 학부 안의 트랙 변경이에요. 이미 들은 학점인정 과목은 별도 전공 인정 신청이 필요할 수
          있어요.
        </p>
      )}
      <p className="j-caption">
        공개 과목표 일치만 비교해요. 두 트랙에 모두 있더라도 중복 인정하지 않으며, 개인 전공 인정
        학점은 미확인입니다.
      </p>
      {rows.map((r) => (
        <section className="j-plan-item" key={r.id}>
          <b>
            {r.name} · {formatCredit(r.creditMilli)}학점
          </b>
          <p>
            {label(r.before)} → {label(r.after)}
          </p>
          <small>학교 인정: 미확인</small>
          {r.after[0] && (
            <a href={r.after[0].sourceUrl} target="_blank" rel="noreferrer">
              과목표 근거
            </a>
          )}
        </section>
      ))}
    </details>
  );
}
