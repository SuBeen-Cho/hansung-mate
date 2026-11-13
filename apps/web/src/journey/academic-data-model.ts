import { PASSING_GRADES, type PersonalRecord } from "@hansung/academic-engine";
export type AcademicData = {
  records: PersonalRecord[];
  revision: number;
  creditLimit: number;
  primaryPlanId?: string;
  /** `track1|track2|recordId` → program the student chose for a course in both curricula. */
  trackChoices?: Record<string, 1 | 2>;
};
export function validAcademicData(value: unknown): value is AcademicData {
  if (!value || typeof value !== "object") return false;
  const d = value as AcademicData;
  return (
    Number.isInteger(d.revision) &&
    d.revision > 0 &&
    Number.isInteger(d.creditLimit) &&
    d.creditLimit >= 1 &&
    d.creditLimit <= 30 &&
    (d.primaryPlanId === undefined || typeof d.primaryPlanId === "string") &&
    (d.trackChoices === undefined ||
      (typeof d.trackChoices === "object" &&
        d.trackChoices !== null &&
        !Array.isArray(d.trackChoices) &&
        Object.keys(d.trackChoices).length <= 2000 &&
        Object.values(d.trackChoices).every((v) => v === 1 || v === 2))) &&
    Array.isArray(d.records) &&
    d.records.length <= 2000 &&
    d.records.every(
      (r) =>
        r &&
        typeof r.id === "string" &&
        typeof r.name === "string" &&
        (r.courseCode === undefined || typeof r.courseCode === "string") &&
        typeof r.grade === "string" &&
        [...PASSING_GRADES, "F", "NP"].includes(r.grade) &&
        typeof r.term === "string" &&
        /^(?:[1-6]-[12]|DEMO)$/.test(r.term) &&
        ["전기", "전필", "전선", "교양필수", "선택필수", "자율교양", "일선", "미분류"].includes(
          r.category,
        ) &&
        Number.isInteger(r.creditMilli) &&
        r.creditMilli > 0 &&
        r.creditMilli <= 60000 &&
        r.status === "COMPLETED" &&
        ["PUBLIC_CURRICULUM", "DEMO_SUMMARY", "MANUAL"].includes(r.source) &&
        ["DEMO", "MANUAL"].includes(r.origin) &&
        r.recognition === "UNVERIFIED",
    ) &&
    new Set(d.records.map((r) => r.id)).size === d.records.length &&
    new Set(d.records.filter((r) => r.courseCode).map((r) => r.courseCode)).size ===
      d.records.filter((r) => r.courseCode).length
  );
}
