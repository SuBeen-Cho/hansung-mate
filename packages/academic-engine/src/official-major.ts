/** A deliberately bounded reference rule, not a full graduation audit. */
export const HANSUNG_FUSION_I_2026 = {
  id: "hsu-major-fusion-i-2017plus-observed-2026-09-28-v1",
  sourceUrl: "https://www.hansung.ac.kr/hansung/6218/subview.do",
  observedAt: "2026-09-28",
  sourceUpdatedAt: "2026-06-18",
  categories: { 전기: 3000, 전필: 15000, 전선: 21000 },
  perTrack: 39000,
  majorTotal: 78000,
} as const;
export type MajorEvidence = {
  courseCode: string;
  creditMilli: number;
  track: 1 | 2;
  category: "전기" | "전필" | "전선";
  recognition: "VERIFIED" | "UNVERIFIED";
};
export function auditOfficialMajor(input: {
  entryYear: number;
  pathway: "FUSION_I" | "OTHER" | "UNKNOWN";
  admission: "FRESHMAN" | "TRANSFER" | "UNKNOWN";
  differentTracks: boolean;
  hasAdditionalProgram: boolean;
  evidenceComplete: boolean;
  records: MajorEvidence[];
}) {
  const supported =
    Number.isInteger(input.entryYear) &&
    input.entryYear >= 2017 &&
    input.entryYear <= 2026 &&
    input.pathway === "FUSION_I" &&
    input.admission === "FRESHMAN" &&
    input.differentTracks &&
    !input.hasAdditionalProgram;
  const seen = new Set<string>();
  const invalid = input.records.some((r) => {
    const duplicate = seen.has(r.courseCode);
    seen.add(r.courseCode);
    return (
      duplicate ||
      !r.courseCode ||
      ![1, 2].includes(r.track) ||
      !Object.hasOwn(HANSUNG_FUSION_I_2026.categories, r.category) ||
      !Number.isInteger(r.creditMilli) ||
      r.creditMilli <= 0
    );
  });
  const known =
    supported &&
    input.evidenceComplete &&
    !invalid &&
    input.records.every((r) => r.recognition === "VERIFIED");
  const rows = ([1, 2] as const).flatMap((track) =>
    (Object.entries(HANSUNG_FUSION_I_2026.categories) as [MajorEvidence["category"], number][]).map(
      ([category, target]) => {
        const earned = known
          ? input.records
              .filter((r) => r.track === track && r.category === category)
              .reduce((sum, r) => sum + r.creditMilli, 0)
          : null;
        return {
          track,
          category,
          target: supported ? target : null,
          earned,
          remaining: earned === null ? null : Math.max(0, target - earned),
          status: earned === null ? "UNKNOWN" : earned >= target ? "MET" : "NOT_MET",
        };
      },
    ),
  );
  return {
    source: HANSUNG_FUSION_I_2026,
    supported,
    rows,
    status: "INDETERMINATE" as const,
    reason: !supported
      ? "지원 범위 밖의 입학·이수 과정입니다."
      : invalid
        ? "과목코드 중복 또는 잘못된 인정 기록이 있습니다."
        : !known
          ? "개인별 공식 인정 기록이 확인되지 않았습니다."
          : "전공 학점만 계산했습니다. 교양·인증·비교과를 포함한 졸업 판정은 별도 확인이 필요합니다.",
  };
}
