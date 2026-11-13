import {
  createDemoAuditInput,
  DEMO_COURSE_CODE,
  DUAL_RECOGNITION_ASSUMPTION,
} from "@hansung/contracts";
import { describe, expect, it } from "vitest";
import { auditScenario, summarizeCourseRecords } from "./index.js";

const requirement = (result: ReturnType<typeof auditScenario>, key: string) => {
  const found = result.requirements.find((item) => item.requirementKey === key);
  if (!found) throw new Error(`요건 없음: ${key}`);
  return found;
};

describe("DEMO 학사 계산 엔진", () => {
  it("A01: 3학점 과목 추가 시 총 90→93, 남은 학점 40→37", () => {
    const before = auditScenario(createDemoAuditInput());
    const after = auditScenario(createDemoAuditInput({ includeCourse: true }));

    expect(before.recordedTotalCreditMilli).toBe(90_000);
    expect(before.remainingTotalCreditMilli).toBe(40_000);
    expect(after.projectedTotalCreditMilli).toBe(93_000);
    expect(after.remainingTotalCreditMilli).toBe(37_000);
  });

  it("A02: 양쪽 인정 가정에서도 총학점은 한 번만 증가", () => {
    const result = auditScenario(
      createDemoAuditInput({ includeCourse: true, dualRecognition: true }),
    );

    expect(result.projectedTotalCreditMilli).toBe(93_000);
    expect(requirement(result, "web-required").projectedCreditMilli).toBe(12_000);
    expect(requirement(result, "mobile-elective").projectedCreditMilli).toBe(15_000);
    expect(requirement(result, "mobile-elective").assumptionRefs).toContain(
      DUAL_RECOGNITION_ASSUMPTION,
    );
  });

  it("A03: 교차 인정 가정이 꺼지면 모바일 전선은 유지", () => {
    const result = auditScenario(createDemoAuditInput({ includeCourse: true }));
    expect(requirement(result, "mobile-elective").projectedCreditMilli).toBe(12_000);
  });

  it("A04: 같은 계획 과목을 중복 선택해도 한 번만 계산", () => {
    const input = createDemoAuditInput({ includeCourse: true });
    input.selectedPlanCourseCodes = [DEMO_COURSE_CODE, DEMO_COURSE_CODE];
    const result = auditScenario(input);
    expect(result.projectedTotalCreditMilli).toBe(93_000);
    expect(result.selectedCourseCodes).toEqual([DEMO_COURSE_CODE]);
  });

  it("A12: 공식 규칙 누락 시 전체 판정을 INDETERMINATE로 유지", () => {
    const result = auditScenario(createDemoAuditInput({ includeCourse: true }));
    expect(result.assessment).toBe("INDETERMINATE");
    expect(requirement(result, "official-graduation-rules").state).toBe("UNKNOWN");
  });

  it("A15: 입력 순서가 달라도 결과가 동일", () => {
    const input = createDemoAuditInput({ includeCourse: true, dualRecognition: true });
    const reversed = {
      ...input,
      awards: [...input.awards].reverse(),
      requirements: [...input.requirements].reverse(),
    };
    const first = auditScenario(input);
    const second = auditScenario(reversed);
    expect(second.projectedTotalCreditMilli).toBe(first.projectedTotalCreditMilli);
    expect(requirement(second, "web-required")).toEqual(requirement(first, "web-required"));
  });

  it("I01/I17: 계산은 입력 시나리오와 원장을 변경하지 않음", () => {
    const input = createDemoAuditInput({ includeCourse: true, dualRecognition: true });
    const snapshot = structuredClone(input);
    auditScenario(input);
    expect(input).toEqual(snapshot);
  });

  it("I02: 같은 원천의 중복 배정은 원천 학점을 넘지 않음", () => {
    const input = createDemoAuditInput({ includeCourse: true });
    input.awards[0]?.allocations.push({ requirementKey: "web-required", creditMilli: 9_000 });
    input.plannedCourses[0]?.allocations.push({
      requirementKey: "web-required",
      creditMilli: 3_000,
      sourceId: "DUPLICATE-DEMO-SOURCE",
    });

    const result = auditScenario(input);
    expect(requirement(result, "web-required").recordedCreditMilli).toBe(9_000);
    expect(requirement(result, "web-required").projectedCreditMilli).toBe(12_000);
    expect(result.projectedTotalCreditMilli).toBe(93_000);
  });

  it("I02: 음수 배정은 학점을 감소시키지 않음", () => {
    const input = createDemoAuditInput({ includeCourse: true });
    input.plannedCourses[0]?.allocations.push({
      requirementKey: "web-required",
      creditMilli: -3_000,
      sourceId: "INVALID-NEGATIVE-SOURCE",
    });
    const result = auditScenario(input);
    expect(requirement(result, "web-required").projectedCreditMilli).toBe(12_000);
  });

  it("이수/계획 과목을 분류와 권장 학기별로 별도 집계한다", () => {
    const summary = summarizeCourseRecords([
      {
        id: "done-web",
        courseCode: "V024003",
        name: "웹프로그래밍",
        creditMilli: 3_000,
        category: "전필",
        recommendedYear: "2",
        semester: "2",
        term: "2025-2",
        status: "COMPLETED",
        source: "PUBLIC_CURRICULUM",
      },
      {
        id: "plan-web",
        courseCode: "V024004",
        name: "웹서버프로그래밍",
        creditMilli: 3_000,
        category: "전필",
        recommendedYear: "3",
        semester: "1",
        term: "2026-1",
        status: "PLANNED",
        source: "PUBLIC_CURRICULUM",
      },
    ]);

    expect(summary.completedCreditMilli).toBe(3_000);
    expect(summary.plannedCreditMilli).toBe(3_000);
    expect(summary.categoryCredits).toEqual([
      { category: "전필", completedCreditMilli: 3_000, plannedCreditMilli: 3_000 },
    ]);
    expect(summary.termCredits).toContainEqual({
      key: "2-2",
      completedCreditMilli: 3_000,
      plannedCreditMilli: 0,
    });
  });
});

describe("planningProgress", () => {
  it("keeps completed credit unique and never adds an already completed course again", async () => {
    const { planningProgress } = await import("./index.js");
    const base = {
      id: "done",
      courseCode: "C1",
      name: "과목",
      creditMilli: 3000,
      category: "전필" as const,
      status: "COMPLETED" as const,
      source: "MANUAL" as const,
      term: "1-1",
    };
    const rows = planningProgress(
      [base, { ...base, id: "repeat" }, { ...base, id: "plan", status: "PLANNED" }],
      { required: 6000, elective: 0, total: 130000 },
    );
    expect(rows.find((r) => r.key === "total")).toMatchObject({
      completed: 3000,
      planned: 0,
      remaining: 127000,
    });
  });
  it("spills 전필·전기 credits above their minimums into the flexible elective bucket", async () => {
    const { planningProgress } = await import("./index.js");
    const course = (
      id: string,
      category: "전기" | "전필" | "전선",
      status: "COMPLETED" | "PLANNED",
    ) => ({
      id,
      courseCode: id,
      name: id,
      creditMilli: 3000,
      category,
      status,
      source: "MANUAL" as const,
      term: "1-1",
    });
    const records = [
      course("B1", "전기", "COMPLETED"),
      course("B2", "전기", "COMPLETED"),
      course("R1", "전필", "COMPLETED"),
      course("R2", "전필", "COMPLETED"),
      course("R3", "전필", "PLANNED"),
      course("E1", "전선", "COMPLETED"),
    ];
    const targets = { required: 3000, elective: 21000, total: 130000, basic: 3000 };
    const elective = planningProgress(records, targets).find((r) => r.key === "elective");
    // 전선 3 + 전필 overflow 3 (completed) + 전기 overflow 3 (completed) / planned 전필 overflow 3
    expect(elective).toMatchObject({ completed: 9000, planned: 3000, remaining: 9000 });
    const legacy = planningProgress(records, { required: 3000, elective: 21000, total: 130000 });
    expect(legacy.find((r) => r.key === "elective")).toMatchObject({ completed: 3000, planned: 0 });
  });
});
