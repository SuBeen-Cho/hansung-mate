import { describe, expect, it } from "vitest";
import {
  bookingMembers,
  bookingNotice,
  createGroup,
  groupReady,
  headcountHint,
  INVITE_HOURS,
  inviteIssues,
  maskId,
  notify,
  respond,
} from "./groups";
import type { Booking } from "./model";

const me = { studentId: "2412345", name: "나" };
const now = Date.parse("2026-11-12T12:00:00+09:00");

describe("내 스터디·팀", () => {
  it("학번 형식·중복·내 학번을 막는다", () => {
    expect(inviteIssues(me, [{ studentId: "12", name: "" }])[0]).toMatch(/7~10자리/);
    expect(inviteIssues(me, [{ studentId: "2412345", name: "" }])).toContain(
      "내 학번은 넣지 않아도 돼요.",
    );
    expect(
      inviteIssues(me, [
        { studentId: "2412001", name: "" },
        { studentId: "2412001", name: "" },
      ]),
    ).toContain("같은 학번이 두 번 들어갔어요.");
  });

  it("모두 답해야 공간을 잡고, 거절한 사람은 명단에서 빠진다", () => {
    let g = createGroup(
      "스터디",
      "STUDY",
      me,
      [
        { studentId: "2412001", name: "가" },
        { studentId: "2412002", name: "나나" },
      ],
      now,
    );
    expect(groupReady(g, now)).toBe(false);
    g = respond(g, "2412001", true, now, "2412001@hansung.ac.kr");
    expect(groupReady(g, now)).toBe(false);
    g = respond(g, "2412002", false, now);
    expect(groupReady(g, now)).toBe(true);
    expect(bookingMembers(g, "컴퓨터공학부").map((m) => m.studentId)).toEqual([
      "2412345",
      "2412001",
    ]);
    expect(maskId("2412002")).toBe("2412***");
  });

  it("초대 시간이 지나면 답한 사람만으로 진행할 수 있다", () => {
    const g = respond(
      createGroup(
        "팀",
        "TEAM",
        me,
        [
          { studentId: "2412001", name: "" },
          { studentId: "2412002", name: "" },
        ],
        now,
      ),
      "2412001",
      true,
      now,
      "2412001@hansung.ac.kr",
    );
    expect(groupReady(g, now)).toBe(false);
    expect(groupReady(g, now + (INVITE_HOURS + 1) * 3_600_000)).toBe(true);
  });

  it("예약 상태가 바뀌면 승인한 팀원 모두에게 알린다", () => {
    const g = respond(
      createGroup("팀", "TEAM", me, [{ studentId: "2412001", name: "" }], now),
      "2412001",
      true,
      now,
      "2412001@hansung.ac.kr",
    );
    const b = {
      kind: "ROOM",
      space: "미래관 304호",
      date: "2026-11-13",
      start: "17:00",
      end: "19:00",
      stage: "REVIEW",
      note: "",
    } as Booking;
    expect(bookingNotice(undefined, b)).toMatch(/강의실 신청을 냈어요/);
    const approved = { ...b, stage: "APPROVED" } as Booking;
    const text = bookingNotice(b, approved);
    expect(text).toBe("강의실 신청이 승인됐어요 · 미래관 304호 11.13 17:00–19:00");
    expect(bookingNotice(approved, approved)).toBe("");
    expect(notify(g, text, now).notices[0]?.to).toEqual(["2412345", "2412001"]);
  });
  it("학교 메일 인증 없이는 승인되지 않는다", () => {
    const g = createGroup("팀", "TEAM", me, [{ studentId: "2412001", name: "" }], now);
    expect(respond(g, "2412001", true, now).members[1]?.status).toBe("INVITED");
    expect(respond(g, "2412001", true, now, "2412001@hansung.ac.kr").members[1]).toMatchObject({
      status: "ACCEPTED",
      mail: "2412001@hansung.ac.kr",
    });
    expect(respond(g, "2412001", false, now).members[1]?.status).toBe("DECLINED");
  });

  it("승인 인원으로 갈 수 있는 방과 더 필요한 인원을 알려 준다", () => {
    const rules = {
      "base-ib101": { minPeople: 3 },
      "base-seminar": { minPeople: 6 },
      x: { minPeople: null },
    };
    const names = {
      "base-ib101": "상상베이스 그룹스터디룸 IB101",
      "base-seminar": "상상베이스 세미나실",
    };
    expect(headcountHint(2, rules, names)).toEqual({
      ok: [],
      short: ["상상베이스 그룹스터디룸은 1명 더 필요", "상상베이스 세미나실은 4명 더 필요"],
    });
    expect(headcountHint(3, rules, names).ok).toEqual(["상상베이스 그룹스터디룸"]);
  });
});
