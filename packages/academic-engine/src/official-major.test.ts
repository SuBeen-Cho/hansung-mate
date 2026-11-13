import { describe, expect, it } from "vitest";
import { auditOfficialMajor, type MajorEvidence } from "./official-major.js";

const input = {
  entryYear: 2024,
  pathway: "FUSION_I" as const,
  admission: "FRESHMAN" as const,
  differentTracks: true,
  hasAdditionalProgram: false,
  evidenceComplete: true,
  records: [
    {
      courseCode: "DEMO-A",
      creditMilli: 3000,
      track: 1,
      category: "전기",
      recognition: "VERIFIED",
    },
  ] as MajorEvidence[],
};
describe("범위가 제한된 공식 전공 기준", () => {
  it("전공기초를 별도 계산하고 졸업 전체는 판정하지 않는다", () => {
    const result = auditOfficialMajor(input);
    expect(result.rows[0]).toMatchObject({
      target: 3000,
      earned: 3000,
      remaining: 0,
      status: "MET",
    });
    expect(result.rows[1]).toMatchObject({ target: 15000, remaining: 15000 });
    expect(result.status).toBe("INDETERMINATE");
  });
  it("이중 배정·음수·확인되지 않은 기록을 0으로 바꾸지 않는다", () => {
    for (const records of [
      [...input.records, ...input.records],
      [{ ...(input.records[0] as MajorEvidence), creditMilli: -1 }],
      [{ ...(input.records[0] as MajorEvidence), recognition: "UNVERIFIED" as const }],
    ])
      expect(auditOfficialMajor({ ...input, records }).rows[0]?.earned).toBeNull();
  });
  it("편입·학과 단일과정·추가과정·미래학번·미확인 전과는 범위 밖이다", () => {
    for (const patch of [
      { admission: "TRANSFER" as const },
      { pathway: "OTHER" as const },
      { differentTracks: false },
      { hasAdditionalProgram: true },
      { entryYear: 2027 },
      { admission: "UNKNOWN" as const },
    ])
      expect(auditOfficialMajor({ ...input, ...patch }).supported).toBe(false);
  });
});
