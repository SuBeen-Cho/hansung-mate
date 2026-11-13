import { liberalRuleFor, proposePlans } from "@hansung/academic-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  catalogCourses,
  catalogTracks,
  coursesForTrack,
  findProgram,
  graduationFor,
  isOffered,
  liberalRules,
  pairingError,
} from "../catalog";
import { termGroups } from "./Academic";
import {
  availableSpaces,
  type Booking,
  classifyChange,
  closedReason,
  demoSpaces,
  examWindowFor,
  fillDemoMembers,
  hoursFor,
  initialProfile,
  isVacation,
  majorTargets,
  migrateBooking,
  migrateDemoState,
  nightDeadlineError,
  observedOccupancy,
  ownOverlap,
  patchBooking,
  transition,
  validateBooking,
  validateSearch,
} from "./model";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime("2026-09-28T00:00:00Z");
});
afterEach(() => vi.useRealTimers());
const request: Booking = {
  id: "DEMO-test",
  mode: "DEMO",
  kind: "NIGHT",
  spaceId: "base-ib101",
  space: "데모",
  date: "2026-10-07",
  endDate: "2026-10-08",
  start: "22:00",
  end: "08:00",
  purpose: "설계 회의",
  count: 5,
  applicant: "학생1",
  studentId: "D1",
  department: "웹공학트랙",
  phone: "010-0000-0000",
  professor: "",
  members: [1, 2, 3, 4, 5].map((n) => ({
    id: String(n),
    name: `학생${n}`,
    studentId: `D${n}`,
    department: "웹공학트랙",
  })),
  signature: "",
  stage: "REVIEW",
  revision: 1,
  note: "",
  events: [],
  reminder: false,
};
describe("데모 예약의 상태와 충돌", () => {
  it("중복 학번·부족한 인원·역전된 기간을 거부한다", () => {
    expect(validateBooking(request)).toEqual([]);
    expect(
      validateBooking({
        ...request,
        members: [
          ...request.members.slice(0, 4),
          { id: "duplicate", name: "학생1", studentId: "D1", department: "웹공학트랙" },
        ],
      }).join(" "),
    ).toContain("같은 학번");
    expect(
      validateBooking({ ...request, count: 1, members: request.members.slice(0, 1) }).join(" "),
    ).toContain("5명");
    expect(
      validateBooking({ ...request, endDate: request.date, end: "21:00" }).join(" "),
    ).toContain("종료");
  });
  it("다른 날짜는 허용하고 겹치는 시간과 승인 전 입실을 막는다", () => {
    const b = {
      ...request,
      kind: "INSTANT" as const,
      stage: "APPROVED" as const,
      endDate: request.date,
      start: "17:00",
      end: "19:00",
    };
    expect(
      availableSpaces(5, b.date, "18:00", "20:00", [b], "INSTANT").some((s) => s.id === b.spaceId),
    ).toBe(false);
    expect(
      availableSpaces(5, "2026-10-08", "18:00", "20:00", [b], "INSTANT").some(
        (s) => s.id === b.spaceId,
      ),
    ).toBe(true);
    expect(transition(request, "IN")).toBe(request);
  });
  it("보완 후 재제출과 입퇴실이 유효한 순서로만 진행된다", () => {
    const changed = transition(request, "CHANGES", "목적 보완");
    const submitted = transition(changed, "RESUBMIT");
    expect(submitted.revision).toBe(2);
    expect(submitted.stage).toBe("REVIEW");
    const approved = transition(submitted, "APPROVE");
    const inside = transition(approved, "IN", "", Date.parse("2026-10-07T22:00:00+09:00"));
    expect(transition(inside, "OUT").stage).toBe("CHECKED_OUT");
    expect(transition(approved, "RESUBMIT")).toBe(approved);
  });
});

describe("입력한 데모 정보의 검증과 동기화", () => {
  it("목적이 입력되었으면 다른 빈 항목만 정확하게 안내한다", () => {
    expect(validateBooking({ ...request, space: "", spaceId: "" })).toEqual([
      "이용할 장소를 선택해 주세요.",
    ]);
    expect(validateBooking({ ...request, applicant: "", studentId: "" }).join(" ")).not.toContain(
      "사용 목적",
    );
    expect(validateSearch({ ...request, start: "" })).toEqual(["시작 시간을 선택해 주세요."]);
    expect(validateSearch({ ...request, purpose: "   " })).toEqual(["사용 목적을 입력해 주세요."]);
  });
  it("신청인과 명단 첫 행을 양방향으로 갱신하고 서명을 무효화한다", () => {
    const edited = patchBooking(
      { ...request, signature: "old" },
      { applicant: "수정 학생", studentId: "NEW-ID", department: "영미문화트랙" },
    );
    expect(edited.members[0]).toMatchObject({
      name: "수정 학생",
      studentId: "NEW-ID",
      department: "영미문화트랙",
    });
    expect(edited.signature).toBe("");
    expect(validateBooking(edited)).toEqual([]);
    const fromMember = patchBooking(edited, {
      members: edited.members.map((m, i) => (i === 0 ? { ...m, name: "명단 수정" } : m)),
    });
    expect(fromMember.applicant).toBe("명단 수정");
    expect(validateBooking(fromMember)).toEqual([]);
  });
  it("데모 인원 채우기는 입력값을 보존하고 새 학번의 충돌을 피한다", () => {
    const booking = patchBooking(request, { applicant: "직접 입력", studentId: "DEMO0002" });
    const members = fillDemoMembers({
      ...booking,
      members: [
        ...booking.members.slice(0, 1),
        { id: "manual", name: "친구", studentId: "CUSTOM", department: "개별 소속" },
      ],
    });
    expect(members).toHaveLength(5);
    expect(members[0]?.name).toBe("직접 입력");
    expect(members[1]).toMatchObject({
      name: "친구",
      studentId: "CUSTOM",
      department: "개별 소속",
    });
    expect(new Set(members.map((m) => m.studentId)).size).toBe(5);
  });
});

it("과거 예약과 예약 시간 밖의 입실을 막는다", () => {
  expect(
    validateSearch({ ...request, date: "2020-01-01", endDate: "2020-01-02" }).join(" "),
  ).toContain("현재보다 이후");
  const approved = { ...request, stage: "APPROVED" as const };
  expect(transition(approved, "IN", "", Date.parse("2026-10-07T21:59:00+09:00"))).toBe(approved);
  expect(transition(approved, "IN", "", Date.parse("2026-10-08T08:00:00+09:00"))).toBe(approved);
});

it("반려 사유·만료·미입실을 조건에 맞게 처리하고 종료된 예약은 공간을 막지 않는다", () => {
  const rejected = transition(request, "REJECT", "장소 사용 목적 불일치");
  expect(rejected.stage).toBe("REJECTED");
  expect(rejected.note).toContain("불일치");
  expect(transition(request, "REJECT", " ")).toBe(request);
  expect(transition(request, "EXPIRE")).toBe(request);
  expect(transition(request, "EXPIRE", "", Date.parse("2026-10-07T22:00:00+09:00")).stage).toBe(
    "EXPIRED",
  );
  const approved = { ...request, stage: "APPROVED" as const };
  expect(transition(approved, "NO_SHOW", "", Date.parse("2026-10-08T08:00:00+09:00")).stage).toBe(
    "NO_SHOW",
  );
  expect(
    availableSpaces(
      5,
      request.date,
      "17:00",
      "19:00",
      [{ ...rejected, start: "17:00", end: "19:00", endDate: request.date }],
      "INSTANT",
    ).some((s) => s.id === request.spaceId),
  ).toBe(true);
});

describe("공개 예약 달력 반영", () => {
  it("코딩라운지 공개 예약 시간과 겹치면 빈 공간에서 제외하고 같은 요일 패턴을 재사용한다", () => {
    expect(observedOccupancy("coding-101", "2026-10-01")).toContainEqual(["09:00", "11:00"]);
    expect(
      availableSpaces(2, "2026-10-01", "09:30", "10:30", [], "INSTANT").some(
        (s) => s.id === "coding-101",
      ),
    ).toBe(false);
    expect(
      availableSpaces(2, "2026-10-01", "11:00", "12:00", [], "INSTANT").some(
        (s) => s.id === "coding-101",
      ),
    ).toBe(true);
    // 2026-11-05 is a Thursday like 2026-10-01: the observed weekday pattern applies.
    expect(observedOccupancy("coding-101", "2026-11-05").length).toBeGreaterThan(0);
    expect(observedOccupancy("base-ib101", "2026-10-01")).toEqual([]);
  });
});

describe("예전 저장 데이터 호환", () => {
  it("예전 데모 공간 ID를 새 공간으로 옮기되 제출된 신청서의 장소명은 그대로 둔다", () => {
    const old = {
      ...request,
      kind: "INSTANT" as const,
      spaceId: "coding-demo-a",
      space: "코딩라운지 · 데모 A실",
    };
    const moved = migrateBooking(old);
    expect(moved.spaceId).toBe("coding-101");
    expect(moved.space).toBe("코딩라운지 · 데모 A실");
    expect(migrateBooking(old, false).space).toBe("코딩라운지 세미나실 101호");
    const exam = {
      ...request,
      kind: "EXAM" as const,
      spaceId: "night-집중 열람실",
      space: "집중 열람실",
    };
    expect(migrateBooking(exam, false)).toMatchObject({
      spaceId: "night-집중열람실",
      space: "집중열람실",
    });
    const state = migrateDemoState({
      version: 3,
      profile: { ...initialProfile },
      plans: [],
      bookings: [old],
    });
    expect(state.bookings[0]?.spaceId).toBe("coding-101");
    expect(migrateBooking({ ...old, spaceId: "base-ib101" })).toEqual({
      ...old,
      spaceId: "base-ib101",
    });
  });
});

describe("공간 운영 규칙", () => {
  const parkPlus = demoSpaces.find((s) => s.id === "parkplus-room");
  it("상상파크플러스는 주말에 빈 공간으로 보이지 않고 예약도 막는다", () => {
    expect(parkPlus && closedReason(parkPlus, "2026-10-31")).toContain("주말");
    expect(parkPlus && closedReason(parkPlus, "2026-10-30")).toBe("");
    // 2026-12-25 (Fri) and 2026-10-09 한글날 (Fri) are public holidays.
    expect(parkPlus && closedReason(parkPlus, "2026-12-25")).toContain("공휴일");
    expect(parkPlus && closedReason(parkPlus, "2026-10-09")).toContain("공휴일");
    expect(
      availableSpaces(4, "2026-10-31", "10:00", "11:00", [], "INSTANT").some(
        (s) => s.id === "parkplus-room",
      ),
    ).toBe(false);
    const b = {
      ...request,
      kind: "INSTANT" as const,
      spaceId: "parkplus-room",
      space: "상상파크플러스 소모임실",
      count: 4,
      members: [],
      date: "2031-11-01",
      endDate: "2031-11-01",
      start: "10:00",
      end: "11:00",
    };
    expect(validateBooking(b, Date.parse("2031-10-01T09:00:00+09:00")).join(" ")).toContain("주말");
  });
  it("선택한 공간의 운영 시간·하루 단위·공개 예약 시간을 제출 때 다시 확인한다", () => {
    const now = Date.parse("2026-09-01T09:00:00+09:00");
    const base = {
      ...request,
      kind: "INSTANT" as const,
      spaceId: "coding-101",
      space: "코딩라운지 세미나실 101호",
      count: 2,
      members: [],
      date: "2026-10-01",
      endDate: "2026-10-01",
    };
    expect(validateBooking({ ...base, start: "20:00", end: "22:00" }, now).join(" ")).toContain(
      "운영 시간",
    );
    expect(validateBooking({ ...base, start: "09:30", end: "10:30" }, now).join(" ")).toContain(
      "공개 예약",
    );
    expect(validateBooking({ ...base, start: "11:00", end: "12:00" }, now)).toEqual([]);
    expect(
      validateBooking({ ...base, start: "11:00", end: "12:00", endDate: "2026-10-02" }, now).join(
        " ",
      ),
    ).toContain("하루 안");
  });
  it("야간 잔류는 하루 전, 당일은 낮 12시 전까지만 제출할 수 있다", () => {
    expect(nightDeadlineError("2026-10-08", Date.parse("2026-10-07T20:00:00+09:00"))).toBe("");
    expect(nightDeadlineError("2026-10-07", Date.parse("2026-10-07T11:59:00+09:00"))).toBe("");
    expect(nightDeadlineError("2026-10-07", Date.parse("2026-10-07T12:00:00+09:00"))).toContain(
      "12시",
    );
    expect(nightDeadlineError("2026-10-06", Date.parse("2026-10-07T09:00:00+09:00"))).toContain(
      "지난",
    );
  });
});

describe("학교 최소 이수학점 기준", () => {
  it("서로 다른 두 트랙은 융합전공Ⅰ 39+39, 같은 학과 두 슬롯은 심화 78로 계산한다", () => {
    expect(majorTargets("웹공학트랙", "모바일소프트웨어트랙")).toMatchObject({
      pathway: "FUSION_I",
      perTrack: 39_000,
      required: 30_000,
      elective: 42_000,
      total: 130_000,
    });
    expect(majorTargets("융합보안학과", "융합보안학과")).toMatchObject({
      pathway: "DEEP_CREATIVE",
      single: true,
      required: 21_000,
      elective: 54_000,
    });
    expect(majorTargets("뷰티디자인매니지먼트학과", "뷰티디자인매니지먼트학과")).toMatchObject({
      pathway: "DEEP_GENERAL",
      required: 15_000,
      elective: 60_000,
    });
  });
  it("15학번 이전은 졸업 140학점, 16학번부터 130학점", () => {
    expect(majorTargets("웹공학트랙", "빅데이터트랙", 2015).total).toBe(140_000);
    expect(majorTargets("웹공학트랙", "빅데이터트랙", 2016).total).toBe(130_000);
  });
});

describe("트랙 변경과 전과 구분", () => {
  it("1트랙이 다른 학부로 가면 전과, 같은 학부 안이나 2트랙만 바꾸면 트랙 변경", () => {
    expect(
      classifyChange(["웹공학트랙", "빅데이터트랙"], ["모바일소프트웨어트랙", "빅데이터트랙"]),
    ).toBe("TRACK_CHANGE");
    expect(classifyChange(["웹공학트랙", "빅데이터트랙"], ["웹공학트랙", "융합보안학과"])).toBe(
      "TRACK_CHANGE",
    );
    expect(classifyChange(["웹공학트랙", "빅데이터트랙"], ["기업경영트랙", "빅데이터트랙"])).toBe(
      "TRANSFER",
    );
    expect(classifyChange(["", ""], ["웹공학트랙", "빅데이터트랙"])).toBe("FIRST_SELECT");
    expect(classifyChange(["웹공학트랙", "빅데이터트랙"], ["웹공학트랙", "빅데이터트랙"])).toBe(
      "NONE",
    );
  });
});

describe("학교 데이터 무결성", () => {
  it("과목표가 있는 모든 프로그램의 과목이 권장 학기 그룹 어딘가에 보인다", () => {
    for (const p of catalogTracks.filter((t) => t.courseCount > 0)) {
      const list = coursesForTrack(p.name);
      const grouped = termGroups(list, p.name).reduce((n, g) => n + g.rows.length, 0);
      expect(grouped, p.name).toBe(list.length);
    }
    const startup = termGroups(coursesForTrack("창업트랙"), "창업트랙").map((g) => g.title);
    expect(startup).toContain("4학년 학기 미정");
    expect(startup.some((t) => t.includes("계절학기"))).toBe(true);
  });
  it("모든 프로그램이 대학 소속과 슬롯 허용값을 가진다", () => {
    for (const p of catalogTracks) {
      expect(typeof p.firstSlotAllowed, p.name).toBe("boolean");
      expect(typeof p.secondSlotAllowed, p.name).toBe("boolean");
    }
    expect(findProgram("창업트랙")?.firstSlotAllowed).toBe(false);
    expect(findProgram("융합보안학과")?.requirementProfile).toBe("CREATIVE_DEPARTMENT");
  });
});

describe("한 사람 동시 예약", () => {
  it("같은 학생이 다른 공간을 같은 시간에 잡으면 막고, 취소된 예약은 무시한다", () => {
    const a = {
      ...request,
      id: "a",
      kind: "INSTANT" as const,
      stage: "APPROVED" as const,
      spaceId: "base-ib101",
      endDate: request.date,
      start: "10:00",
      end: "12:00",
    };
    const b = { ...a, id: "b", spaceId: "base-ib102", start: "11:00", end: "13:00" };
    expect(ownOverlap(b, [a])?.id).toBe("a");
    expect(ownOverlap({ ...b, start: "12:00" }, [a])).toBeUndefined();
    expect(ownOverlap(b, [{ ...a, stage: "CANCELLED" as const }])).toBeUndefined();
    expect(ownOverlap({ ...b, studentId: "OTHER" }, [a])).toBeUndefined();
  });
});

describe("학사일정 반영", () => {
  it("방학 중에는 공개된 방학 운영시간으로 검색·검증한다", () => {
    const coding = demoSpaces.find((s) => s.id === "coding-110");
    expect(coding && hoursFor(coding, "2026-07-15")).toMatchObject({
      from: "10:00",
      to: "16:00",
      vacation: true,
    });
    expect(coding && hoursFor(coding, "2026-10-28")).toMatchObject({ from: "09:00", to: "21:00" });
    expect(
      availableSpaces(2, "2026-07-15", "17:00", "18:00", [], "INSTANT").some(
        (s) => s.id === "coding-110",
      ),
    ).toBe(false);
  });
  it("시험기간은 학사일정 기준(시작 1주 전부터)으로 판단한다", () => {
    expect(examWindowFor("2026-12-10")?.name).toContain("기말");
    expect(examWindowFor("2026-11-30")?.name).toContain("기말");
    expect(examWindowFor("2026-11-10")).toBeUndefined();
    expect(isVacation("2026-12-22")).toBe(true);
  });
});

describe("2트랙 조합 제한", () => {
  it("글로벌인재대학 학과는 학교가 정한 모트랙을 2트랙으로 고를 수 없다", () => {
    expect(pairingError("SW융합학과", "융합보안학과")).toContain("선택할 수 없어요");
    expect(pairingError("SW융합학과", "웹공학트랙")).toBe("");
    expect(pairingError("웹공학트랙", "융합보안학과")).toBe("");
  });
});

describe("모든 프로그램 계획 기능", () => {
  it("과목표가 있는 모든 프로그램 조합에서 추천·계획 검사가 오류 없이 동작한다", () => {
    const programs = catalogTracks.filter((t) => t.courseCount > 0);
    for (const p of programs) {
      const tracks = [p.name, programs[0]?.name ?? p.name];
      const proposals = proposePlans({
        items: [],
        tracks,
        records: [],
        catalog: catalogCourses,
        currentTerm: "2-1",
        creditLimitMilli: 18_000,
        startTerm: "2-1",
        terms: ["2-1", "2-2", "3-1", "3-2", "4-1", "4-2"],
        preference: "",
        count: 6,
      });
      for (const plan of proposals) {
        expect(
          plan.audit.issues.filter((i) => i.level === "ERROR"),
          `${p.name} ${plan.strategy}`,
        ).toEqual([]);
        expect(plan.audit.status, p.name).not.toBe("INVALID");
      }
    }
  });
});

describe("학업이수가이드·강의시간표·학과 졸업요건 데이터", () => {
  it("입학년도별 교양 기준을 가이드대로 고른다", () => {
    expect(liberalRuleFor(liberalRules, 2025)?.totalMilli).toBe(31_000);
    expect(liberalRuleFor(liberalRules, 2021)?.totalMilli).toBe(28_000);
    expect(liberalRuleFor(liberalRules, 2017)?.required.creditMilli).toBe(16_000);
    expect(liberalRuleFor(liberalRules, 2016)?.totalMilli).toBe(24_000);
    expect(liberalRuleFor(liberalRules, 2012)?.totalMilli).toBe(22_000);
  });
  it("2026-2 강의시간표의 개설 여부와 교양 배분 영역을 안다", () => {
    expect(isOffered("Y040001")).toBe(true);
    expect(isOffered("ZZZ9999")).toBe(false);
    expect(isOffered("GEN0925")).toBe(true);
  });
  it("공개된 학과 졸업요건을 찾고, 없으면 found=false로 둔다", () => {
    expect(graduationFor("융합보안학과")?.found).toBe(true);
    expect(graduationFor("패션디자인트랙")?.kinds).toContain("PORTFOLIO");
    expect(graduationFor("시스템반도체트랙")?.found).toBe(true);
    expect(graduationFor("시각디자인트랙")?.found).toBe(false);
  });
});
