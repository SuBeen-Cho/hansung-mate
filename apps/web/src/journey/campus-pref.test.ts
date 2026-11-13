import { describe, expect, it } from "vitest";
import { rankSpaces } from "./campus";
import {
  buildRoster,
  currentTerm,
  departmentOf,
  freshCouncil,
  hasDues,
  issueCode,
  sampleIds,
  verifyDues,
} from "./council";
import { type Booking, demoSpaces, initialProfile } from "./model";

const draft = {
  date: "2026-11-16", // Monday
  start: "10:30",
  end: "12:30",
  count: 4,
  purpose: "팀 회의",
  studentId: "2412345",
};

describe("내 선호순", () => {
  it("즐겨찾기 → 자주 쓴 곳 → 수업 건물 근처 순으로 이유와 함께 정렬한다", () => {
    const spaces = demoSpaces.filter((s) => s.capacity >= 4).slice(0, 8);
    const fav = spaces[3]?.id ?? "";
    const often = spaces[5]?.id ?? "";
    const past = [1, 2].map(
      (i) =>
        ({ id: `p${i}`, spaceId: often, studentId: "2412345", stage: "CHECKED_OUT" }) as Booking,
    );
    const ranked = rankSpaces(spaces, {
      draft,
      bookings: past,
      favorites: [fav],
      timetable: [{ day: 1, start: "09:00", end: "10:30", title: "네트워크", building: "공학관" }],
    });
    expect(ranked[0]?.space.id).toBe(fav);
    expect(ranked[0]?.reasons).toContain("★ 즐겨찾기");
    expect(ranked.find((r) => r.space.id === often)?.reasons).toContain("자주 쓰는 곳 · 2번");
    const near = ranked.find((r) => r.space.building.startsWith("공학관"));
    if (near) expect(near.reasons).toContain("앞 수업 공학관 근처");
  });
});

describe("학생회비 인증", () => {
  const profile = { ...initialProfile, studentId: "2412345" };
  const now = new Date("2026-11-12T03:00:00Z");
  const mailed = () => ({
    ...freshCouncil(),
    verify: { email: { address: "2412345@hansung.ac.kr", at: now.toISOString() }, dues: [] },
  });

  it("학교 메일 인증 없이는 명단 확인을 하지 않는다", async () => {
    const r = await verifyDues(freshCouncil(), profile, "TOTAL", { now });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/학교 메일/);
  });

  it("해시 명단에 있으면 이번 학기만 인증되고, 없으면 거절한다", async () => {
    const term = currentTerm(now);
    expect(term).toBe("2026-2");
    const roster = await buildRoster(sampleIds("2412345", true), term, "TOTAL");
    expect(roster.hashes.join()).not.toContain("2412345");
    const ok = await verifyDues({ ...mailed(), rosters: [roster] }, profile, "TOTAL", { now });
    expect(ok.ok).toBe(true);
    expect(hasDues(ok.state, "TOTAL", now)).toBe(true);
    expect(hasDues(ok.state, "TOTAL", new Date("2027-03-02T03:00:00Z"))).toBe(false);
    const absent = await buildRoster(sampleIds("2412345", false), term, "TOTAL");
    const no = await verifyDues({ ...mailed(), rosters: [absent] }, profile, "TOTAL", { now });
    expect(no.ok).toBe(false);
  });

  it("학과 회비는 같은 학과만, 학생회 코드는 한 사람만 쓸 수 있다", async () => {
    const dept = departmentOf(profile);
    expect(dept).toBe("컴퓨터공학부");
    expect((await verifyDues(mailed(), profile, "기계전자공학부", { now })).message).toMatch(
      /기계전자공학부 학생만/,
    );
    const { plain, code } = await issueCode(dept);
    const first = await verifyDues({ ...mailed(), codes: [code] }, profile, dept, {
      code: plain,
      now,
    });
    expect(first.ok).toBe(true);
    const other = { ...profile, studentId: "2499999" };
    const reuse = await verifyDues({ ...first.state, verify: mailed().verify }, other, dept, {
      code: plain,
      now,
    });
    expect(reuse.message).toMatch(/이미 다른 학생/);
  });
});
