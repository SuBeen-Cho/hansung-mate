import { describe, expect, it } from "vitest";
import { allocateToTracks } from "./track-allocation.js";

const targets = { basic: 3000, required: 15000, perTrack: 39000 };
const rec = (id: string, term: string) => ({
  id,
  courseCode: id,
  creditMilli: 3000,
  term,
  category: "미분류",
});
const catalog: Record<string, [string | undefined, string | undefined]> = {
  BASIC: ["전기", "전기"],
  ONLY1: ["전필", undefined],
  ONLY2: [undefined, "전선"],
  S1: ["전선", "전선"],
  S2: ["전선", "전선"],
  S3: ["전선", "전필"],
};
const lookup = (code: string, slot: 1 | 2) => catalog[code]?.[slot - 1];

describe("두 전공 균형 배정", () => {
  it("한쪽 과목표에만 있으면 그 전공, 양쪽에 있으면 덜 찬 쪽에 한 번만 넣는다", () => {
    const out = allocateToTracks(
      [rec("ONLY1", "2-1"), rec("S1", "2-1"), rec("S2", "2-2"), rec("ONLY2", "2-2")],
      lookup,
      targets,
    );
    expect(out.map((r) => r.assignedTrack)).toEqual([1, 2, 1, 2]);
    expect(out[1]?.shared).toBe(true);
    expect(out.reduce((n, r) => n + r.creditMilli, 0)).toBe(12000);
  });
  it("공통 기초(전기)는 두 전공의 기초 학점을 차례로 채운다", () => {
    const out = allocateToTracks(
      [rec("BASIC", "1-1"), { ...rec("BASIC", "1-2"), id: "B2" }],
      lookup,
      targets,
    );
    expect(out.map((r) => r.assignedTrack)).toEqual([1, 2]);
    expect(out.every((r) => r.category === "전기")).toBe(true);
  });
  it("배정된 전공의 구분을 쓰고, 필수가 남은 전공을 먼저 채운다", () => {
    const out = allocateToTracks([rec("S3", "3-1")], lookup, targets);
    expect(out[0]).toMatchObject({ assignedTrack: 2, category: "전필" });
  });
  it("단일 전공이면 모두 1번에, 어느 과목표에도 없으면 미분류로 둔다", () => {
    const out = allocateToTracks([rec("S1", "2-1"), rec("X", "2-1")], lookup, targets, true);
    expect(out.map((r) => r.assignedTrack)).toEqual([1, null]);
    expect(out[1]?.category).toBe("미분류");
  });
  it("학기 순서로 채워도 결과는 입력 순서대로 돌려준다", () => {
    const out = allocateToTracks([rec("S2", "3-1"), rec("S1", "1-1")], lookup, targets);
    expect(out.map((r) => r.id)).toEqual(["S2", "S1"]);
    expect(out[1]?.assignedTrack).toBe(1);
    expect(out[0]?.assignedTrack).toBe(2);
  });
  it("학생이 고른 전공이 자동 배정보다 우선하고, 그 전공 과목표에 없으면 무시한다", () => {
    const out = allocateToTracks(
      [rec("S1", "2-1"), rec("ONLY1", "2-1")],
      lookup,
      targets,
      false,
      () => 2,
    );
    expect(out[0]).toMatchObject({ assignedTrack: 2, chosen: true });
    expect(out[1]).toMatchObject({ assignedTrack: 1, chosen: false });
  });
  it("직접 고른 과목만 옮기고 나머지 자동 배정은 그대로 둔다", () => {
    const records = [rec("S1", "2-1"), rec("S2", "2-2")];
    const auto = allocateToTracks(records, lookup, targets);
    const moved = allocateToTracks(records, lookup, targets, false, (r) =>
      r.id === "S1" ? 2 : undefined,
    );
    expect(auto.map((r) => r.assignedTrack)).toEqual([1, 2]);
    expect(moved.map((r) => r.assignedTrack)).toEqual([2, 2]);
  });
});
