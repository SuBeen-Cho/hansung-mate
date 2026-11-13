import { describe, expect, it } from "vitest";
import { liberalArtsProgress, type LiberalRule, liberalRuleFor } from "./liberal-arts";

const rules: LiberalRule[] = [
  {
    cohorts: "24학번 이후",
    fromYear: 2024,
    toYear: null,
    totalMilli: 31000,
    required: {
      creditMilli: 13000,
      courses: [
        { name: "사고와 표현", creditMilli: 3000 },
        { name: "AI와 SW 기초", creditMilli: 3000 },
      ],
    },
    distribution: { creditMilli: 15000, minAreas: 4, areas: ["A", "B", "C", "D", "E"], rule: "" },
    free: { creditMilli: 3000, rule: "" },
  },
  {
    cohorts: "16학번",
    fromYear: 2016,
    toYear: 2016,
    totalMilli: 24000,
    required: { creditMilli: 12000, courses: [] },
    distribution: null,
    free: { creditMilli: 12000, rule: "" },
  },
];

describe("학번별 교양 이수", () => {
  it("입학년도로 규칙을 고른다", () => {
    expect(liberalRuleFor(rules, 2025)?.cohorts).toBe("24학번 이후");
    expect(liberalRuleFor(rules, 2016)?.cohorts).toBe("16학번");
    expect(liberalRuleFor(rules, 2018)).toBeUndefined();
  });
  it("필수 과목은 이름으로, 배분 영역은 알려진 것만 세고 모르면 UNKNOWN으로 둔다", () => {
    const rule = rules[0] as LiberalRule;
    const p = liberalArtsProgress(rule, [
      { name: "사고와 표현", creditMilli: 3000, category: "교양필수" },
      { name: "철학 입문", creditMilli: 3000, category: "선택필수", area: "A" },
      { name: "경제 이야기", creditMilli: 3000, category: "선택필수", area: "B" },
      { name: "모르는 과목", creditMilli: 3000, category: "선택필수" },
      { name: "모르는 과목2", creditMilli: 3000, category: "선택필수" },
    ]);
    expect(p.required.missing).toEqual(["AI와 SW 기초"]);
    expect(p.distribution).toMatchObject({
      earned: 12000,
      coveredAreas: ["A", "B"],
      status: "UNKNOWN",
    });
    expect(p.total).toMatchObject({ earned: 15000, remaining: 16000 });
    const short = liberalArtsProgress(rule, [
      { name: "x", creditMilli: 3000, category: "선택필수", area: "A" },
    ]);
    expect(short.distribution?.status).toBe("SHORT");
  });
});
