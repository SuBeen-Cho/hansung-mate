import { describe, expect, it } from "vitest";
import {
  allocationPreview,
  auditPlan,
  earnedRecords,
  type PersonalRecord,
  proposePlans,
  recordErrors,
} from "./planning-audit";

const course = {
  code: "A",
  name: "기초",
  creditMilli: 3000,
  mappings: [
    {
      track: "트랙A",
      category: "전필",
      sourceUrl: "https://www.hansung.ac.kr",
      recommendedYear: "1",
      semester: "1",
    },
  ],
};
const record: PersonalRecord = {
  id: "r1",
  courseCode: "A",
  name: "기초",
  creditMilli: 3000,
  category: "전필",
  term: "2-2",
  grade: "P",
  source: "MANUAL",
  origin: "MANUAL",
  status: "COMPLETED",
  recognition: "UNVERIFIED",
};
const input = {
  items: [{ code: "A", term: "3-2", track: 1 as const }],
  records: [] as PersonalRecord[],
  catalog: [course],
  tracks: ["트랙A", "트랙B"],
  currentTerm: "3-1",
  creditLimitMilli: 18000,
};
describe("개인 기록 기반 계획 검사", () => {
  it("이수·중복은 다시 학점으로 더하지 않고 F는 취득에서 제외한다", () => {
    expect(earnedRecords([{ ...record, grade: "F" }])).toEqual([]);
    const result = auditPlan({
      ...input,
      records: [record],
      items: [...input.items, ...input.items],
    });
    expect(result.terms).toEqual([]);
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["DUPLICATE", "COMPLETED"]),
    );
  });
  it("C+ 이하로 이수한 과목은 재수강 경고로 계획하되 학기당 3학점 한도를 넘으면 막는다", () => {
    const low = { ...record, grade: "C+ · 2.5" };
    const retake = auditPlan({ ...input, records: [low] });
    expect(retake.issues.find((i) => i.code === "RETAKE")?.level).toBe("WARNING");
    expect(retake.issues.some((i) => i.code === "COMPLETED")).toBe(false);
    expect(retake.terms[0]?.creditMilli).toBe(3000);
    const b = { ...course, code: "B", name: "응용" };
    const twice = auditPlan({
      ...input,
      catalog: [course, b],
      records: [low, { ...low, id: "r2", courseCode: "B", name: "응용" }],
      items: [
        { code: "A", term: "3-2", track: 1 },
        { code: "B", term: "3-2", track: 1 },
      ],
    });
    expect(twice.issues.some((i) => i.code === "RETAKE_LIMIT")).toBe(true);
    expect(
      auditPlan({ ...input, records: [{ ...record, grade: "B0 · 3.0" }] }).issues.some(
        (i) => i.code === "COMPLETED",
      ),
    ).toBe(true);
  });
  it("권장 1학년 과목도 나중 학기에 계획할 수 있지만 개설·선수·인정은 미확인이다", () => {
    const result = auditPlan(input);
    expect(result.status).toBe("INDETERMINATE");
    expect(result.terms[0]?.creditMilli).toBe(3000);
    expect(result.issues.filter((i) => i.level === "ERROR")).toEqual([]);
    expect(result.issues.map((i) => i.code)).toEqual(["OFFERING", "PREREQUISITE", "RECOGNITION"]);
  });
  it("개인 상한·과거 학기·잘못된 학기를 구별한다", () => {
    expect(
      auditPlan({ ...input, creditLimitMilli: 2000 }).issues.some(
        (i) => i.code === "PERSONAL_LIMIT",
      ),
    ).toBe(true);
    expect(
      auditPlan({ ...input, items: [{ code: "A", term: "1-1", track: 1 }] }).issues.some(
        (i) => i.code === "PAST_TERM",
      ),
    ).toBe(true);
    expect(auditPlan({ ...input, items: [{ code: "A", term: "9-3", track: 1 }] }).status).toBe(
      "INVALID",
    );
    expect(auditPlan({ ...input, tracks: ["다른 트랙"] }).status).toBe("INVALID");
  });
  it("과목표 분류는 개인 공식 인정으로 승격하지 않고 원본을 보존한다", () => {
    const rows = allocationPreview([record], [course], ["트랙A"], ["트랙B"]);
    expect(rows[0]?.recognition).toBe("UNKNOWN");
    expect(rows[0]?.after).toEqual([]);
    expect(record.term).toBe("2-2");
    expect(recordErrors({ ...record, id: "other" }, [record]).join(" ")).toContain("같은 과목코드");
  });
});

describe("검사된 세 가지 제안", () => {
  it("기이수와 기존 계획을 제외하고 학기 상한 안에서만 제안한다", () => {
    const catalog = [
      course,
      ...["B", "C", "D"].map((code) => ({ ...course, code, name: `${code} 데이터` })),
    ];
    const proposals = proposePlans({
      ...input,
      items: [{ code: "B", term: "3-1", track: 1 }],
      records: [record],
      catalog,
      startTerm: "3-1",
      terms: ["3-1", "3-2"],
      creditLimitMilli: 3000,
      preference: "데이터",
      count: 4,
    });
    expect(proposals).toHaveLength(3);
    for (const p of proposals) {
      expect(p.additions).toHaveLength(1);
      expect(p.additions[0]?.term).toBe("3-2");
      expect(["A", "B"]).not.toContain(p.additions[0]?.code);
      expect(p.audit.status).toBe("INDETERMINATE");
      expect(p.reasons[0]?.sourceUrl).toContain("hansung.ac.kr");
    }
  });
});
