import { describe, expect, it } from "vitest";
import { coursesForTrack } from "../catalog";
import { defaultAcademicData } from "./AcademicData";
import { validAcademicData } from "./academic-data-model";
import { initialProfile, type SavedPlan } from "./model";
import {
  areaProgress,
  collectChecks,
  isTrackSystem,
  roadmapPlan,
  roadmapTerms,
  scenarioOutcome,
  stageOf,
  suggestedScenarios,
  upcomingEvents,
} from "./roadmap-data";

const now = new Date("2026-10-26T09:00:00+09:00");
const profile = { ...initialProfile, semester: 2 as const };
const future = coursesForTrack(profile.track2).slice(-7);
const plan: SavedPlan = {
  id: "p1",
  name: "테스트 로드맵",
  track1: profile.track1,
  track2: profile.track2,
  optional: "",
  createdAt: "2026-10-01T00:00:00Z",
  mode: "DEMO",
  items: future.map((c) => ({ code: c.code, term: "4-1", track: 2 as const })),
};

describe("로드맵 개요", () => {
  it("이수 학기·지금 학기·계획 학기를 순서대로 나누고 상한 초과를 표시한다", () => {
    const { terms, summaryMilli } = roadmapTerms(profile, defaultAcademicData, plan.items, now);
    expect(summaryMilli).toBeGreaterThan(0);
    expect(terms.map((t) => t.term)).toEqual([...terms.map((t) => t.term)].sort());
    expect(terms.find((t) => t.term === "3-2")?.status).toBe("NOW");
    expect(terms.filter((t) => t.status === "DONE").every((t) => t.term < "3-2")).toBe(true);
    const fourOne = terms.find((t) => t.term === "4-1");
    expect(fourOne?.status).toBe("PLAN");
    expect(fourOne?.creditMilli).toBe(future.reduce((n, c) => n + c.creditMilli, 0));
    expect(fourOne?.overLimit).toBe((fourOne?.creditMilli ?? 0) > 18_000);
    expect(terms.some((t) => t.term === "4-2")).toBe(true);
  });

  it("상한 초과 계획은 막힘, 미확인 항목은 확인할 것에 넣지 않는다", () => {
    const checks = collectChecks(profile, defaultAcademicData, plan, now);
    const over = checks.find((c) => c.id.startsWith("plan-PERSONAL_LIMIT"));
    expect(over?.level).toBe("BLOCK");
    expect(over?.target).toBe("roadmap");
    expect(checks.some((c) => c.id.includes("OFFERING"))).toBe(false);
    expect(checks[0]?.level).toBe("BLOCK");
  });

  it("두 번째 전공으로 막힌 조합과 학번 불일치를 각각 막힘·참고로 모은다", () => {
    const checks = collectChecks(
      { ...profile, track1: "SW융합학과", track2: "융합보안학과", studentId: "2312345" },
      defaultAcademicData,
      undefined,
      now,
    );
    expect(checks.find((c) => c.id === "pairing")?.level).toBe("BLOCK");
    expect(checks.find((c) => c.id === "student-id")?.level).toBe("NOTE");
  });

  it("대표 로드맵이 없으면 가장 최근 로드맵을 쓴다", () => {
    const other = { ...plan, id: "p2" };
    expect(roadmapPlan([other, plan], "p1")?.id).toBe("p1");
    expect(roadmapPlan([other, plan], "")?.id).toBe("p2");
    expect(roadmapPlan([], "")).toBeUndefined();
  });

  it("영역별 진행은 전공 두 칸과 교양, 총 학점 목표를 함께 준다", () => {
    const { areas, total } = areaProgress(profile, defaultAcademicData, plan.items);
    expect(areas.map((a) => a.key)).toEqual(["major1", "major2", "liberal"]);
    expect(total.targetMilli).toBe(130_000);
    expect(total.plannedMilli).toBeGreaterThan(0);
  });

  it("다가오는 학사일정은 끝나지 않은 일정만 시작일 순으로 준다", () => {
    const events = upcomingEvents(now, 3);
    expect(events.length).toBe(3);
    expect(events.every((e) => e.end >= "2026-10-26")).toBe(true);
    expect(events.map((e) => e.start)).toEqual([...events.map((e) => e.start)].sort());
  });

  it("같은 학부 두 트랙의 데모 기록은 두 전공에 고르게 나뉘고 학년 단계로 묶인다", () => {
    const { areas } = areaProgress(profile, defaultAcademicData, []);
    const [m1, m2] = areas;
    expect(Math.abs((m1?.completedMilli ?? 0) - (m2?.completedMilli ?? 0))).toBeLessThanOrEqual(
      6000,
    );
    expect(isTrackSystem(profile)).toBe(true);
    expect([stageOf("1-2"), stageOf("2-1"), stageOf("3-2"), stageOf("4-1")]).toEqual([1, 2, 2, 3]);
    const { terms } = roadmapTerms(profile, defaultAcademicData, [], now);
    expect(terms.flatMap((t) => t.courses).some((c) => c.shared)).toBe(true);
  });

  it("직접 고른 배정은 그 전공 조합에서만 적용되고 저장 형식 검사를 통과한다", () => {
    const shared = roadmapTerms(profile, defaultAcademicData, [], now)
      .terms.flatMap((t) => t.courses)
      .find((c) => c.shared && c.kind === "MAJOR1");
    if (!shared?.recordId) throw Error("no shared record");
    const data = {
      ...defaultAcademicData,
      trackChoices: { [`${profile.track1}|${profile.track2}|${shared.recordId}`]: 2 as const },
    };
    expect(validAcademicData(data)).toBe(true);
    expect(validAcademicData({ ...data, trackChoices: { x: 3 } })).toBe(false);
    const moved = roadmapTerms(profile, data, [], now)
      .terms.flatMap((t) => t.courses)
      .find((c) => c.recordId === shared.recordId);
    expect(moved).toMatchObject({ kind: "MAJOR2", chosen: true });
    const other = { ...profile, track2: "빅데이터트랙" };
    expect(
      roadmapTerms(other, data, [], now)
        .terms.flatMap((t) => t.courses)
        .find((c) => c.recordId === shared.recordId)?.chosen,
    ).toBe(false);
  });

  it("전과 시나리오는 이전 주 전공 학점을 인정 신청·일반선택으로 나누고 다음 신청 기간과 지난 선발을 붙인다", () => {
    const o = scenarioOutcome(
      profile,
      defaultAcademicData,
      { id: "t", name: "전과", track1: "융합보안학과", track2: profile.track2 },
      [],
      now,
    );
    expect(o.kind).toBe("TRANSFER");
    expect(o.keptMilli + o.recognizableMilli + o.lostMilli).toBe(
      areaProgress(profile, defaultAcademicData, [])
        .areas.filter((a) => a.key.startsWith("major"))
        .reduce((n, a) => n + a.completedMilli, 0),
    );
    expect(o.apply).toMatchObject({
      type: "GENERAL_TRANSFER",
      start: "2026-11-02",
      lastYear: false,
    });
    expect(o.past[0]).toMatchObject({ term: "2026-2", total: 4, accepted: 2 });
    const first = suggestedScenarios(profile, [])[0];
    if (!first) throw Error("no keep scenario");
    const keep = scenarioOutcome(profile, defaultAcademicData, first, [], now);
    expect(keep.kind).toBe("NONE");
    expect(o.leftMilli).toBeGreaterThan(keep.leftMilli);
  });

  it("트랙 변경은 다음 일정이 없으면 작년 같은 학기 날짜를 보여 준다", () => {
    const track = suggestedScenarios(profile, []).find((s) => s.id === "track-change");
    if (!track) throw Error("no sibling track");
    const o = scenarioOutcome(profile, defaultAcademicData, track, [], now);
    expect(o.kind).toBe("TRACK_CHANGE");
    expect(o.apply).toMatchObject({ type: "TRACK_CHANGE", start: "2026-01-19", lastYear: true });
  });

  it("시나리오로 저장한 로드맵은 대표로 고르기 전에는 로드맵에 쓰지 않는다", () => {
    const scenarioPlan = { ...plan, id: "s", track1: "융합보안학과" };
    expect(roadmapPlan([scenarioPlan, plan], "", profile)?.id).toBe("p1");
    expect(roadmapPlan([scenarioPlan], "", profile)).toBeUndefined();
    expect(roadmapPlan([scenarioPlan], "s", profile)?.id).toBe("s");
  });
});
