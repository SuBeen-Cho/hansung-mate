import type { StudentCourseRecord } from "@hansung/contracts";
import { describe, expect, it } from "vitest";
import { compareTrackCatalog } from "./track-comparison.js";

const completed: StudentCourseRecord[] = [
  {
    id: "first",
    courseCode: "V020002",
    name: "자료구조",
    creditMilli: 3_000,
    category: "전선",
    term: "2025-1",
    status: "COMPLETED",
    source: "PUBLIC_CURRICULUM",
  },
  {
    id: "repeat",
    courseCode: "V020002",
    name: "자료구조",
    creditMilli: 3_000,
    category: "전선",
    term: "2025-2",
    status: "COMPLETED",
    source: "MANUAL",
  },
  {
    id: "summary",
    name: "교양 요약",
    creditMilli: 13_000,
    category: "교양필수",
    term: "DEMO",
    status: "COMPLETED",
    source: "DEMO_SUMMARY",
  },
  {
    id: "other",
    courseCode: "V024009",
    name: "클라우드 컴퓨팅",
    creditMilli: 3_000,
    category: "전필",
    term: "2026-1",
    status: "COMPLETED",
    source: "PUBLIC_CURRICULUM",
  },
];

describe("트랙 공개 과목표 비교", () => {
  it("같은 과목코드는 한 번만 겹침으로 세고 미코드 요약은 제외한다", () => {
    const result = compareTrackCatalog(completed, [
      {
        code: "V020002",
        name: "자료구조",
        creditMilli: 3_000,
        category: "전선",
        recommendedYear: "2",
        semester: "1",
      },
      {
        code: "V020014",
        name: "운영체제",
        creditMilli: 3_000,
        category: "전선",
        recommendedYear: "3",
        semester: "1",
      },
    ]);
    expect(result.matched.map((course) => course.code)).toEqual(["V020002"]);
    expect(result.matchedCreditMilli).toBe(3_000);
    expect(result.candidates.map((course) => course.code)).toEqual(["V020014"]);
    expect(result.completedOutsideTarget).toEqual(["V024009"]);
  });
});
