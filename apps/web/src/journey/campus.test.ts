import { describe, expect, it } from "vitest";
import {
  autoRelease,
  bookingMetrics,
  checkIn,
  checkInState,
  earlyReturn,
  expireOffers,
  fairUseIssues,
  joinWaitlist,
  loungeHeatmap,
  noShowPause,
  offerReleased,
  parseQuery,
  resizeHint,
  suggestSpaces,
} from "./campus";
import type { Booking } from "./model";

const at = (iso: string) => Date.parse(`${iso}+09:00`);
const booking = (patch: Partial<Booking> = {}): Booking => ({
  id: patch.id ?? "b1",
  mode: "DEMO",
  kind: "INSTANT",
  spaceId: "base-ib101",
  space: "상상베이스 그룹스터디룸 IB101",
  date: "2026-11-12",
  endDate: "2026-11-12",
  start: "14:00",
  end: "16:00",
  purpose: "팀 회의",
  count: 4,
  applicant: "메이트 학생",
  studentId: "2412345",
  department: "웹공학트랙",
  phone: "",
  professor: "",
  members: [
    { id: "m1", name: "메이트 학생", studentId: "2412345", department: "웹공학트랙" },
    { id: "m2", name: "동반 학생", studentId: "2412346", department: "웹공학트랙" },
  ],
  signature: "",
  stage: "APPROVED",
  revision: 1,
  note: "",
  events: [],
  reminder: false,
  ...patch,
});

describe("체크인과 자동 반납", () => {
  it("시작 10분 전부터 15분 뒤까지만 체크인 창이 열린다", () => {
    const b = booking();
    expect(checkInState(b, at("2026-11-12T13:40:00")).state).toBe("NOT_YET");
    expect(checkInState(b, at("2026-11-12T13:55:00")).state).toBe("OPEN");
    expect(checkInState(b, at("2026-11-12T14:14:00")).state).toBe("OPEN");
    expect(checkInState(b, at("2026-11-12T14:16:00")).state).toBe("RELEASED");
  });

  it("단체 예약은 명단에 있는 동반자가 따로 확인해야 체크인된다", () => {
    const b = booking();
    const now = at("2026-11-12T14:05:00");
    expect(checkIn(b, now).error).toMatch(/동반/);
    expect(checkIn(b, now, "2412345").error).toMatch(/본인이 아닌/);
    expect(checkIn(b, now, "9999999").error).toMatch(/명단에 없는/);
    const ok = checkIn(b, now, "2412346");
    expect(ok.error).toBeUndefined();
    expect(ok.booking.stage).toBe("CHECKED_IN");
    expect(ok.booking.checkedIn?.map((c) => c.studentId)).toEqual(["2412345", "2412346"]);
  });

  it("15분 안에 체크인이 없으면 반납되고 대기 1순위에게 자리가 넘어간다", () => {
    const b = booking();
    const { bookings, released } = autoRelease([b], at("2026-11-12T14:16:00"));
    expect(bookings[0]).toMatchObject({ stage: "NO_SHOW", autoReleased: true });
    expect(released).toHaveLength(1);
    let list = joinWaitlist(
      [],
      {
        spaceId: b.spaceId,
        space: b.space,
        date: b.date,
        start: "14:30",
        end: "16:00",
        count: 3,
        studentId: "A",
      },
      at("2026-11-12T10:00:00"),
    );
    list = joinWaitlist(
      list,
      {
        spaceId: b.spaceId,
        space: b.space,
        date: b.date,
        start: "15:00",
        end: "16:00",
        count: 3,
        studentId: "B",
      },
      at("2026-11-12T11:00:00"),
    );
    const offer = offerReleased(list, b, at("2026-11-12T14:16:00"));
    expect(offer.offered?.studentId).toBe("A");
    expect(
      expireOffers(offer.list, at("2026-11-12T14:27:00")).find((w) => w.studentId === "A")?.status,
    ).toBe("EXPIRED");
  });

  it("일찍 끝내면 남은 시간이 10분 단위로 반납된다", () => {
    const inRoom = checkIn(booking(), at("2026-11-12T14:00:00"), "2412346").booking;
    const out = earlyReturn(inRoom, at("2026-11-12T15:02:00"));
    expect(out).toMatchObject({ stage: "CHECKED_OUT", end: "15:10", originalEnd: "16:00" });
    expect(bookingMetrics([out], at("2026-11-12T17:00:00")).recoveredHours).toBeCloseTo(0.8, 1);
  });
});

describe("공정 이용 규칙", () => {
  const now = at("2026-11-11T12:00:00");
  it("학교 규정(하루 3시간·최소 인원)과 2주 예약 범위를 확인한다", () => {
    expect(fairUseIssues(booking({ stage: "REVIEW", end: "17:30" }), [], now)).toEqual([
      expect.stringMatching(/하루 최대 3시간/),
    ]);
    expect(fairUseIssues(booking({ count: 2 }), [], now)[0]).toMatch(/최소 3명/);
    expect(
      fairUseIssues(booking({ date: "2026-12-01", endDate: "2026-12-01" }), [], now)[0],
    ).toMatch(/14일 뒤까지만/);
  });

  it("한 주 9시간을 넘기면 막는다", () => {
    const week = ["2026-11-09", "2026-11-10", "2026-11-11"].map((d, i) =>
      booking({
        id: `w${i}`,
        spaceId: "coding-101",
        date: d,
        endDate: d,
        start: "09:00",
        end: "12:00",
      }),
    );
    const issues = fairUseIssues(
      booking({ id: "new", spaceId: "coding-102", date: "2026-11-13", endDate: "2026-11-13" }),
      week,
      now,
    );
    expect(issues.join()).toMatch(/9시간/);
  });

  it("30일 안에 자동 반납 3번이면 7일 동안 예약을 쉰다", () => {
    const strikes = ["2026-11-02", "2026-11-05", "2026-11-09"].map((d, i) =>
      booking({ id: `s${i}`, date: d, endDate: d, stage: "NO_SHOW", autoReleased: true }),
    );
    expect(noShowPause(strikes, "2412345", now)).toBe("2026-11-16");
    expect(noShowPause(strikes.slice(1), "2412345", now)).toBe("");
  });
});

describe("말로 찾기와 방 크기 맞추기", () => {
  const now = at("2026-11-11T12:00:00");
  it("문장에서 날짜·시간·인원·필요한 것을 읽는다", () => {
    const q = parseQuery("내일 오후 3시부터 2시간 4명 발표 연습, 모니터 필요", now);
    expect(q).toMatchObject({ date: "2026-11-12", start: "15:00", end: "17:00", count: 4 });
    expect(q.needs).toContain("TV");
    const r = parseQuery("금요일 7시 반 셋이 화이트보드", now);
    expect(r).toMatchObject({
      date: "2026-11-13",
      start: "19:30",
      count: 3,
      needs: ["화이트보드"],
    });
  });

  it("조건에 맞고 필요한 게 있는 방을 작은 방부터 추천한다", () => {
    const q = parseQuery("내일 오후 3시부터 2시간 4명 화이트보드", now);
    const rooms = suggestSpaces(q, []);
    expect(rooms.length).toBeGreaterThan(0);
    expect(rooms.every((s) => s.id.startsWith("base-ib") || s.id === "parkplus-room")).toBe(true);
  });

  it("큰 방에 적게 오면 비어 있는 작은 방을 권한다", () => {
    const big = booking({
      spaceId: "base-seminar",
      space: "상상베이스 세미나실",
      count: 6,
      stage: "CHECKED_IN",
    });
    const hint = resizeHint(big, 2, [], at("2026-11-12T14:20:00"));
    expect(hint?.space.capacity).toBeLessThan(16);
    expect(hint?.from).toBe("14:20");
  });
});

describe("이용률 분석", () => {
  it("코딩라운지 공개 달력으로 요일×시간 이용률과 가장 붐비는 시간을 낸다", () => {
    const h = loungeHeatmap();
    expect(h.slots).toBeGreaterThan(300);
    expect(h.grid).toHaveLength(5);
    expect(h.peak.value).toBeGreaterThan(0);
    expect(h.grid.flat().every((v) => v >= 0 && v <= 100)).toBe(true);
  });
});
