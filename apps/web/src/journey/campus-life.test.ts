import { describe, expect, it } from "vitest";
import {
  attend,
  availableQty,
  type CampusEvent,
  freeGaps,
  freshCampus,
  joinMeetup,
  loanIssues,
  loanItems,
  loanState,
  meetupReady,
  newLoan,
  nextDateFor,
  rosterCsv,
} from "./campus-life";

const now = Date.parse("2026-11-11T12:00:00+09:00");
const monitor = loanItems.find((i) => i.id === "monitor");
const camera = loanItems.find((i) => i.id === "camera");
const umbrella = loanItems.find((i) => i.id === "umbrella");

describe("기자재·학생회 물품 대여", () => {
  it("실제 목록의 수량과 대여 기간 규칙을 따른다", () => {
    expect(monitor?.qty).toBe(30);
    expect(
      loanIssues(monitor, { from: "2026-11-12", to: "2026-11-18", qty: 1 }, [], {
        duesPaid: true,
        now,
      }),
    ).toEqual([]);
    expect(
      loanIssues(monitor, { from: "2026-11-12", to: "2026-11-19", qty: 1 }, [], {
        duesPaid: true,
        now,
      })[0],
    ).toMatch(/7일/);
    expect(
      loanIssues(camera, { from: "2026-11-12", to: "2026-11-13", qty: 1 }, [], {
        duesPaid: true,
        now,
      })[0],
    ).toMatch(/당일 반납/);
    expect(
      loanIssues(camera, { from: "2026-11-14", to: "2026-11-14", qty: 1 }, [], {
        duesPaid: true,
        now,
      })[0],
    ).toMatch(/평일/);
  });

  it("겹치는 기간의 대여를 빼고 남은 수량을 계산한다", () => {
    if (!camera) throw Error("camera");
    const loans = [newLoan(camera, { from: "2026-11-12", to: "2026-11-12", qty: 8 }, now)];
    expect(availableQty(camera, "2026-11-12", "2026-11-12", loans)).toBe(2);
    expect(availableQty(camera, "2026-11-13", "2026-11-13", loans)).toBe(10);
    expect(
      loanIssues(camera, { from: "2026-11-12", to: "2026-11-12", qty: 3 }, loans, {
        duesPaid: true,
        now,
      })[0],
    ).toMatch(/2개/);
  });

  it("학생회 물품은 회비 납부자만, 연체가 있으면 새 대여를 막는다", () => {
    expect(
      loanIssues(umbrella, { from: "2026-11-12", to: "2026-11-13", qty: 1 }, [], {
        duesPaid: false,
        now,
      })[0],
    ).toMatch(/학생회비/);
    if (!camera) throw Error("camera");
    const late = {
      ...newLoan(camera, { from: "2026-11-09", to: "2026-11-09", qty: 1 }, now),
      status: "PICKED_UP" as const,
    };
    expect(loanState(late, "2026-11-11")).toBe("OVERDUE");
    expect(
      loanIssues(monitor, { from: "2026-11-12", to: "2026-11-12", qty: 1 }, [late], {
        duesPaid: true,
        now,
      }).join(),
    ).toMatch(/반납하지 않은/);
  });
});

describe("모임과 행사 출석", () => {
  it("모집 인원이 차면 공간 예약으로 넘어갈 준비가 된다", () => {
    const m = freshCampus("2026-11-11").meetups[1];
    if (!m) throw Error("meetup");
    expect(meetupReady(m)).toBe(false);
    const joined = joinMeetup(joinMeetup(m, { name: "나", studentId: "2412345" }), {
      name: "친구",
      studentId: "2412346",
    });
    expect(meetupReady(joined)).toBe(true);
    expect(joinMeetup(joined, { name: "나", studentId: "2412345" }).members).toHaveLength(3);
  });

  it("QR 출석은 토큰이 맞아야 하고 같은 학번은 한 번만, 마감 후엔 막는다", () => {
    let ev: CampusEvent = {
      id: "e",
      title: "총학 간담회",
      host: "총학생회",
      date: "2026-11-12",
      place: "미래관 ELC",
      token: "ABCD1234",
      attendees: [],
    };
    expect(attend(ev, { name: "가", studentId: "2412345" }, "XXXX", now).error).toMatch(/QR/);
    ev = attend(ev, { name: "가", studentId: "2412345" }, "abcd1234", now).event;
    expect(attend(ev, { name: "가", studentId: "2412345" }, "ABCD1234", now).error).toMatch(/이미/);
    expect(rosterCsv(ev)).toContain("2412345");
    expect(
      attend({ ...ev, closedAt: "x" }, { name: "나", studentId: "2412346" }, "ABCD1234", now).error,
    ).toMatch(/마감/);
  });
});

describe("시간표 공강", () => {
  it("수업 사이 1시간 이상 빈 시간을 찾고 다음 해당 요일을 계산한다", () => {
    const { timetable } = freshCampus("2026-11-11");
    expect(freeGaps(timetable, 1)).toEqual([
      { start: "10:30", end: "15:00" },
      { start: "16:30", end: "21:00" },
    ]);
    expect(freeGaps(timetable, 5)).toEqual([]);
    expect(nextDateFor(1, "2026-11-11")).toBe("2026-11-16");
    expect(nextDateFor(3, "2026-11-11")).toBe("2026-11-11");
  });
});
