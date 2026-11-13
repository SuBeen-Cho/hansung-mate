/**
 * Campus space rules for the idea-contest edition: check-in and automatic release, waitlists,
 * fair-use limits, room-size nudges, natural-language search and utilization analytics.
 * Pure functions over demo bookings; nothing here talks to a real school system.
 */
import rawCampus from "../../../../data/normalized/campus-resources.json";
import rawSpaces from "../../../../data/normalized/spaces.json";
import {
  availableSpaces,
  type Booking,
  demoSpaces,
  period,
  todayKst,
  transition,
  uid,
} from "./model";

export type CampusData = typeof rawCampus;
export const campus = rawCampus as CampusData;
type SpaceRule = {
  maxHoursPerDay?: number;
  minPeople?: number | null;
  needsAllStudentIds?: boolean;
  lateRule?: string;
  equipmentNote?: string;
  source: string;
};
export const spaceRules = campus.spaceRules as Record<string, SpaceRule>;
export const sourceUrl = (id: string) => campus.sources.find((s) => s.id === id)?.url ?? "";
export const sourceTitle = (id: string) => campus.sources.find((s) => s.id === id)?.title ?? "";

/** Check-in must happen within this many minutes of the start, or the room goes back. */
export const CHECKIN_GRACE_MIN = 15;
/** A waitlisted student has this long to claim a released slot. */
export const CLAIM_WINDOW_MIN = 10;
/** Bookings open this many days ahead (no midnight rush for far dates). */
export const BOOKING_HORIZON_DAYS = 14;
/** Weekly cap of active self-service bookings per student, in hours. */
export const WEEKLY_HOURS_CAP = 9;
/** Automatic releases within 30 days that trigger a 7-day booking pause. */
export const NO_SHOW_STRIKES = 3;

const MIN = 60_000;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const kstTime = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ms);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekStart = (date: string) => {
  const day = new Date(`${date}T12:00:00+09:00`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
};
const ACTIVE = ["REVIEW", "CHANGES", "APPROVED", "CHECKED_IN"];

export type CheckInState =
  | { state: "NOT_YET"; opensAt: number }
  | { state: "OPEN"; releaseAt: number }
  | { state: "IN"; endsAt: number }
  | { state: "RELEASED" }
  | { state: "CLOSED" };

/** Where a self-service booking stands for check-in at `now`. */
export function checkInState(b: Booking, now = Date.now()): CheckInState {
  const [start, end] = period(b);
  if (b.stage === "CHECKED_IN") return { state: "IN", endsAt: end };
  if (b.stage === "NO_SHOW") return { state: "RELEASED" };
  if (b.stage !== "APPROVED") return { state: "CLOSED" };
  if (now < start - 10 * MIN) return { state: "NOT_YET", opensAt: start - 10 * MIN };
  const releaseAt = start + CHECKIN_GRACE_MIN * MIN;
  if (now < Math.min(releaseAt, end)) return { state: "OPEN", releaseAt };
  return { state: "RELEASED" };
}

/** Group bookings need one other member to confirm on their own phone (blocks proxy check-in). */
export const needsCompanion = (b: Booking) => b.kind === "INSTANT" && b.count >= 2;

export function checkIn(
  b: Booking,
  now = Date.now(),
  companionId = "",
): { booking: Booking; error?: string } {
  const state = checkInState(b, now);
  if (state.state !== "OPEN") {
    return {
      booking: b,
      error:
        state.state === "NOT_YET"
          ? "체크인은 시작 10분 전부터 할 수 있어요."
          : "체크인 시간이 지나 예약이 반납됐어요.",
    };
  }
  const id = companionId.trim();
  if (needsCompanion(b)) {
    if (!id) return { booking: b, error: "함께 온 동반자 1명이 자기 휴대폰으로 확인해야 해요." };
    if (id === b.studentId.trim())
      return { booking: b, error: "예약자 본인이 아닌 동반자의 학번이어야 해요." };
    const listed = b.members
      .map((m) => m.studentId.trim())
      .filter((x) => x && x !== b.studentId.trim());
    if (listed.length && !listed.includes(id))
      return { booking: b, error: "예약할 때 적은 이용자 명단에 없는 학번이에요." };
  }
  // The check-in window starts 10 minutes early; the stay itself is recorded from the start.
  const entered = transition(b, "IN", "", Math.max(now, period(b)[0]));
  return {
    booking: {
      ...entered,
      checkedIn: [
        { studentId: b.studentId, at: new Date(now).toISOString() },
        ...(id ? [{ studentId: id, at: new Date(now).toISOString() }] : []),
      ],
    },
  };
}

/** Release every approved booking nobody checked into within the grace period. */
export function autoRelease(bookings: Booking[], now = Date.now()) {
  const released: Booking[] = [];
  const next = bookings.map((b) => {
    if (b.kind !== "INSTANT" || b.stage !== "APPROVED") return b;
    const [start, end] = period(b);
    if (now < start + CHECKIN_GRACE_MIN * MIN) return b;
    const out: Booking = {
      ...b,
      stage: "NO_SHOW",
      autoReleased: true,
      events: [
        ...b.events,
        {
          label: `${CHECKIN_GRACE_MIN}분 안에 체크인이 없어 자동 반납`,
          at: new Date(Math.min(start + CHECKIN_GRACE_MIN * MIN, end)).toISOString(),
        },
      ],
    };
    released.push(out);
    return out;
  });
  return { bookings: next, released };
}

/** Leave early: the rest of the slot goes back to everyone right away. */
export function earlyReturn(b: Booking, now = Date.now()): Booking {
  if (b.stage !== "CHECKED_IN") return b;
  const [, end] = period(b);
  const at = Math.ceil(now / (10 * MIN)) * 10 * MIN;
  const out = transition(b, "OUT", "", now);
  if (at >= end) return out;
  const newEnd = kstTime(at);
  return {
    ...out,
    originalEnd: b.originalEnd ?? b.end,
    end: newEnd > b.start ? newEnd : b.end,
    events: [
      ...out.events.slice(0, -1),
      {
        label: `조기 반납 · ${newEnd} 이후 다른 학생이 쓸 수 있어요`,
        at: new Date(now).toISOString(),
      },
    ],
  };
}

/** Fair-use checks for a self-service booking, on top of the space's own rules. */
export function fairUseIssues(draft: Booking, bookings: Booking[], now = Date.now()): string[] {
  if (draft.kind !== "INSTANT" || !draft.date || !draft.start || !draft.end) return [];
  const issues: string[] = [];
  const today = todayKst(new Date(now));
  if (draft.date > addDays(today, BOOKING_HORIZON_DAYS))
    issues.push(
      `예약은 ${BOOKING_HORIZON_DAYS}일 뒤까지만 열려요. 자정 대기 없이 날짜별로 열어요.`,
    );
  const mine = bookings.filter(
    (b) =>
      b.id !== draft.id &&
      b.kind === "INSTANT" &&
      b.studentId.trim() === draft.studentId.trim() &&
      ACTIVE.includes(b.stage),
  );
  const hours = (b: Booking) => (minutes(b.end) - minutes(b.start)) / 60;
  const rule = spaceRules[draft.spaceId];
  if (rule?.maxHoursPerDay) {
    const used = mine
      .filter((b) => b.spaceId === draft.spaceId && b.date === draft.date)
      .reduce((n, b) => n + hours(b), 0);
    if (used + hours(draft) > rule.maxHoursPerDay)
      issues.push(`이 공간은 하루 최대 ${rule.maxHoursPerDay}시간이에요 (학교 규정).`);
  }
  if (rule?.minPeople && draft.count < rule.minPeople)
    issues.push(`이 공간은 최소 ${rule.minPeople}명부터 예약할 수 있어요 (학교 규정).`);
  const week = weekStart(draft.date);
  const weekly = mine.filter((b) => weekStart(b.date) === week).reduce((n, b) => n + hours(b), 0);
  if (weekly + hours(draft) > WEEKLY_HOURS_CAP)
    issues.push(
      `한 사람이 한 주에 잡을 수 있는 시간은 ${WEEKLY_HOURS_CAP}시간이에요. 지금 ${weekly}시간 예약돼 있어요.`,
    );
  const pause = noShowPause(bookings, draft.studentId, now);
  if (pause)
    issues.push(
      `최근 30일 동안 체크인 없이 반납된 예약이 ${NO_SHOW_STRIKES}번 있어 ${pause}까지 새 예약이 쉬어요.`,
    );
  return issues;
}

/** Date until which a student cannot book after repeated automatic releases, or "". */
export function noShowPause(bookings: Booking[], studentId: string, now = Date.now()) {
  const since = now - 30 * 86_400_000;
  const strikes = bookings
    .filter(
      (b) =>
        b.autoReleased &&
        b.studentId.trim() === studentId.trim() &&
        period(b)[0] >= since &&
        period(b)[0] <= now,
    )
    .map((b) => period(b)[0])
    .sort((a, c) => a - c);
  if (strikes.length < NO_SHOW_STRIKES) return "";
  const until = (strikes.at(-1) ?? now) + 7 * 86_400_000;
  return until > now ? todayKst(new Date(until)) : "";
}

/** Big room, few people: point to a smaller free room for the rest of the slot. */
export function resizeHint(b: Booking, present: number, bookings: Booking[], now = Date.now()) {
  const space = demoSpaces.find((s) => s.id === b.spaceId);
  if (!space || space.capacity < present * 2 || space.capacity < 6) return undefined;
  const from = kstTime(Math.max(now, period(b)[0]));
  if (from >= b.end) return undefined;
  const smaller = availableSpaces(
    present,
    b.date,
    from,
    b.end,
    bookings.filter((x) => x.id !== b.id),
    "INSTANT",
  )
    .filter((s) => s.capacity < space.capacity && s.capacity >= present)
    .sort((x, y) => x.capacity - y.capacity)[0];
  return smaller ? { space: smaller, from, to: b.end } : undefined;
}

export type WaitEntry = {
  id: string;
  spaceId: string;
  space: string;
  date: string;
  start: string;
  end: string;
  count: number;
  studentId: string;
  createdAt: string;
  status: "WAITING" | "OFFERED" | "CLAIMED" | "EXPIRED" | "CANCELLED";
  offeredAt?: string;
};

export function joinWaitlist(
  list: WaitEntry[],
  entry: Omit<WaitEntry, "id" | "createdAt" | "status">,
  now = Date.now(),
) {
  const dup = list.some(
    (w) =>
      ["WAITING", "OFFERED"].includes(w.status) &&
      w.studentId === entry.studentId &&
      w.spaceId === entry.spaceId &&
      w.date === entry.date &&
      w.start === entry.start,
  );
  if (dup) return list;
  return [
    ...list,
    { ...entry, id: uid(), createdAt: new Date(now).toISOString(), status: "WAITING" as const },
  ];
}

/** A released slot goes to the earliest waiting student whose request fits inside it. */
export function offerReleased(
  list: WaitEntry[],
  released: Pick<Booking, "spaceId" | "date" | "start" | "end">,
  now = Date.now(),
) {
  const target = list
    .filter(
      (w) =>
        w.status === "WAITING" &&
        w.spaceId === released.spaceId &&
        w.date === released.date &&
        w.start >= released.start &&
        w.end <= released.end,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!target) return { list, offered: undefined };
  const offered = { ...target, status: "OFFERED" as const, offeredAt: new Date(now).toISOString() };
  return { list: list.map((w) => (w.id === target.id ? offered : w)), offered };
}

export function expireOffers(list: WaitEntry[], now = Date.now()) {
  return list.map((w) =>
    w.status === "OFFERED" && w.offeredAt && now - Date.parse(w.offeredAt) > CLAIM_WINDOW_MIN * MIN
      ? { ...w, status: "EXPIRED" as const }
      : w,
  );
}

const AMENITIES: Record<string, string[]> = {
  "base-ib101": ["화이트보드"],
  "base-ib102": ["화이트보드"],
  "base-ib103": ["화이트보드"],
  "base-ib104": ["화이트보드"],
  "base-seminar": ["TV"],
  "library-group": ["TV", "조용"],
  "parkplus-room": ["화이트보드", "빔프로젝터"],
  "park-cnc": ["공구"],
};
/** What a room offers, from the school's space list and the 2025.1 한성대신문 guide. */
export function amenitiesOf(spaceId: string) {
  const space = demoSpaces.find((s) => s.id === spaceId);
  const fromFeatures = (space?.features ?? []).flatMap((f) =>
    /TV|모니터/.test(f) ? ["TV"] : /빔/.test(f) ? ["빔프로젝터"] : [],
  );
  return [...new Set([...(AMENITIES[spaceId] ?? []), ...fromFeatures])];
}

export type ParsedQuery = {
  date?: string;
  start?: string;
  end?: string;
  count?: number;
  needs: string[];
  understood: string[];
};
const KOREAN_COUNT: Record<string, number> = {
  한: 1,
  혼자: 1,
  두: 2,
  둘이: 2,
  세: 3,
  셋이: 3,
  네: 4,
  넷이: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
};
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * Reads a sentence such as "내일 오후 3시부터 2시간 4명 발표 연습, 모니터 필요" into search
 * conditions. Rule-based on purpose: every part it understood is shown back to the student.
 */
export function parseQuery(text: string, now = Date.now()): ParsedQuery {
  const t = text.replace(/\s+/g, " ").trim();
  const out: ParsedQuery = { needs: [], understood: [] };
  const today = todayKst(new Date(now));
  if (/모레/.test(t)) {
    out.date = addDays(today, 2);
    out.understood.push("모레");
  } else if (/내일/.test(t)) {
    out.date = addDays(today, 1);
    out.understood.push("내일");
  } else if (/오늘|지금|바로/.test(t)) {
    out.date = today;
    out.understood.push("오늘");
  } else {
    const wd = t.match(/(다음 ?주 ?)?([월화수목금토일])요일/);
    if (wd?.[2]) {
      const target = WEEKDAYS.indexOf(wd[2]);
      const cur = new Date(`${today}T12:00:00+09:00`).getUTCDay();
      let diff = (target - cur + 7) % 7 || 7;
      if (wd[1]) diff += diff <= 7 - cur ? 7 : 0;
      out.date = addDays(today, diff);
      out.understood.push(`${wd[1] ? "다음 주 " : ""}${wd[2]}요일`);
    }
    const md = t.match(/(\d{1,2})월 ?(\d{1,2})일/);
    if (md) {
      out.date = `${today.slice(0, 4)}-${md[1]?.padStart(2, "0")}-${md[2]?.padStart(2, "0")}`;
      out.understood.push(`${md[1]}월 ${md[2]}일`);
    }
  }
  const time = t.match(/(오전|오후|저녁|밤)? ?(\d{1,2})시(?: ?(\d{1,2})분| ?반)?/);
  if (time?.[2]) {
    let h = Number(time[2]);
    const pm = time[1] && time[1] !== "오전";
    if (pm && h < 12) h += 12;
    if (!time[1] && h >= 1 && h <= 8) h += 12; // "3시" on campus means 15:00
    const m = time[3] ? Number(time[3]) : /반/.test(time[0]) ? 30 : 0;
    out.start = hhmm(h * 60 + m);
    out.understood.push(`${out.start} 시작`);
  } else if (/지금|바로/.test(t)) {
    const nowMin = minutes(kstTime(now));
    out.start = hhmm(Math.ceil(nowMin / 30) * 30);
    out.understood.push("지금부터");
  }
  const dur = t.match(/(\d+(?:\.5)?) ?시간|(한|두|세) ?시간|(\d{2,3}) ?분 ?(?:동안)?/);
  let length = 120;
  if (dur) {
    length = dur[1]
      ? Number(dur[1]) * 60
      : dur[2]
        ? ({ 한: 1, 두: 2, 세: 3 }[dur[2]] ?? 2) * 60
        : Number(dur[3]);
    out.understood.push(`${length / 60}시간`);
  }
  const until = t.match(/(\d{1,2})시까지/);
  if (out.start) {
    let end = minutes(out.start) + length;
    if (until?.[1]) {
      let h = Number(until[1]);
      if (h <= 8) h += 12;
      end = h * 60;
    }
    out.end = hhmm(Math.min(end, 22 * 60));
  }
  const people = t.match(/(\d{1,2}) ?(?:명|인)/) ?? t.match(/(혼자|둘이|셋이|넷이)/);
  const word = t.match(/(한|두|세|네|다섯|여섯|일곱|여덟) ?명/);
  const count = people?.[1]
    ? Number.isNaN(Number(people[1]))
      ? KOREAN_COUNT[people[1]]
      : Number(people[1])
    : word?.[1]
      ? KOREAN_COUNT[word[1]]
      : undefined;
  if (count) {
    out.count = count;
    out.understood.push(`${count}명`);
  }
  const needs: [RegExp, string][] = [
    [/모니터|티비|TV|화면|발표/i, "TV"],
    [/빔|프로젝터/, "빔프로젝터"],
    [/화이트보드|판서|칠판/, "화이트보드"],
    [/조용|집중/, "조용"],
  ];
  for (const [re, need] of needs)
    if (re.test(t) && !out.needs.includes(need)) {
      out.needs.push(need);
      out.understood.push(need === "TV" ? "화면 필요" : need);
    }
  return out;
}

/** Rooms that are free for the parsed request and have what it needs, best fit first. */
export function suggestSpaces(q: ParsedQuery, bookings: Booking[]) {
  if (!q.date || !q.start || !q.end) return [];
  return availableSpaces(q.count ?? 1, q.date, q.start, q.end, bookings, "INSTANT")
    .filter((s) => q.needs.every((n) => amenitiesOf(s.id).includes(n)))
    .filter(
      (s) => !spaceRules[s.id]?.minPeople || (q.count ?? 1) >= (spaceRules[s.id]?.minPeople ?? 0),
    )
    .sort((a, b) => a.capacity - b.capacity);
}

type Calendar = { month: string; days: Record<string, Record<string, [string, string][]>> };
const loungeCalendar = (rawSpaces as unknown as { codingLoungeCalendar: Calendar })
  .codingLoungeCalendar;

/**
 * Share of coding-lounge rooms booked per weekday × hour, from the school's public October
 * calendar (real observations, not demo data).
 */
export function loungeHeatmap(calendar: Calendar = loungeCalendar) {
  const rooms = 13;
  const hours = Array.from({ length: 12 }, (_, i) => 9 + i);
  const sums = Array.from({ length: 5 }, () => hours.map(() => 0));
  const days = Array.from({ length: 5 }, () => 0);
  for (const [date, roomsBooked] of Object.entries(calendar.days)) {
    const wd = new Date(`${date}T12:00:00+09:00`).getUTCDay();
    if (wd < 1 || wd > 5) continue;
    days[wd - 1] = (days[wd - 1] ?? 0) + 1;
    hours.forEach((h, hi) => {
      const busy = Object.values(roomsBooked).filter((ranges) =>
        ranges.some(([s, e]) => minutes(s) < (h + 1) * 60 && h * 60 < minutes(e)),
      ).length;
      const row = sums[wd - 1];
      if (row) row[hi] = (row[hi] ?? 0) + busy;
    });
  }
  const grid = sums.map((row, d) =>
    row.map((v) => (days[d] ? Math.round((v / (rooms * (days[d] ?? 1))) * 100) : 0)),
  );
  let peak = { day: 0, hour: 9, value: 0 };
  for (const [d, row] of grid.entries())
    for (const [hi, v] of row.entries())
      if (v > peak.value) peak = { day: d, hour: hours[hi] ?? 9, value: v };
  const slots = Object.values(calendar.days).reduce(
    (n, r) => n + Object.values(r).reduce((m, x) => m + x.length, 0),
    0,
  );
  return {
    month: calendar.month,
    hours,
    grid,
    peak,
    slots,
    weekdays: ["월", "화", "수", "목", "금"],
  };
}

/** Self-service booking outcomes: how many were used, released or still open. */
export function bookingMetrics(bookings: Booking[], now = Date.now()) {
  const past = bookings.filter((b) => b.kind === "INSTANT" && period(b)[0] <= now);
  const used = past.filter((b) => ["CHECKED_IN", "CHECKED_OUT"].includes(b.stage)).length;
  const released = past.filter((b) => b.autoReleased).length;
  const early = bookings.filter((b) => b.originalEnd).length;
  const recovered = bookings.reduce(
    (n, b) =>
      n +
      (b.originalEnd ? minutes(b.originalEnd) - minutes(b.end) : 0) +
      (b.autoReleased ? Math.max(0, minutes(b.end) - minutes(b.start) - CHECKIN_GRACE_MIN) : 0),
    0,
  );
  return {
    total: past.length,
    used,
    released,
    early,
    recoveredHours: Math.round((recovered / 60) * 10) / 10,
    noShowRate: past.length ? Math.round((released / past.length) * 100) : 0,
  };
}

export { addDays, kstTime, minutes as toMinutes, hhmm };

export type RankedSpace<S> = { space: S; score: number; reasons: string[] };
/**
 * “내 선호순”: favourites first, then rooms I keep using, rooms next to the class before or
 * after the slot, a size that fits the group, and what the purpose needs. Rule-based and
 * computed on this device only, so every position comes with its reason.
 */
export function rankSpaces<S extends { id: string; building: string; capacity: number }>(
  spaces: S[],
  ctx: {
    draft: Pick<Booking, "date" | "start" | "end" | "count" | "purpose" | "studentId">;
    bookings: Booking[];
    favorites?: string[];
    timetable?: { day: number; start: string; end: string; title: string; building?: string }[];
  },
): RankedSpace<S>[] {
  const { draft } = ctx;
  const day = new Date(`${draft.date}T12:00:00+09:00`).getUTCDay();
  const near = (ctx.timetable ?? [])
    .filter((b) => b.day === day && b.building)
    .map((b) => {
      const before = minutes(draft.start) - minutes(b.end);
      const after = minutes(b.start) - minutes(draft.end);
      if (before >= 0 && before <= 90) return { ...b, when: "앞 수업" };
      if (after >= 0 && after <= 90) return { ...b, when: "다음 수업" };
      return undefined;
    })
    .filter((b) => b !== undefined);
  const used = new Map<string, number>();
  for (const b of ctx.bookings)
    if (b.studentId === draft.studentId && !["CANCELLED", "REJECTED"].includes(b.stage))
      used.set(b.spaceId, (used.get(b.spaceId) ?? 0) + 1);
  const wantsTv = /발표|리허설|프레젠|시연/.test(draft.purpose);
  const wantsBoard = /회의|토론|스터디|브레인|기획/.test(draft.purpose);
  const tightest = Math.min(...spaces.map((s) => s.capacity).filter((c) => c >= draft.count));
  // When most rooms are the same size the tag says nothing, so only the score keeps it.
  const tagFit = spaces.filter((s) => s.capacity === tightest).length <= spaces.length / 2;
  return spaces
    .map((space) => {
      let score = 0;
      const reasons: string[] = [];
      if (ctx.favorites?.includes(space.id)) {
        score += 100;
        reasons.push("★ 즐겨찾기");
      }
      const n = used.get(space.id) ?? 0;
      if (n) {
        score += Math.min(n, 5) * 8;
        reasons.push(`자주 쓰는 곳 · ${n}번`);
      }
      const class_ = near.find((b) => space.building.startsWith(b.building ?? "-"));
      if (class_) {
        score += 20;
        reasons.push(`${class_.when} ${class_.building} 근처`);
      }
      if (space.capacity === tightest && space.capacity <= draft.count * 2) {
        score += 10;
        if (tagFit) reasons.push("인원에 딱 맞음");
      }
      score -= Math.max(0, space.capacity - draft.count) / 4;
      const has = amenitiesOf(space.id);
      if (wantsTv && has.includes("TV")) {
        score += 6;
        reasons.push("화면 있음");
      } else if (wantsBoard && has.includes("화이트보드")) {
        score += 6;
        reasons.push("화이트보드 있음");
      }
      return { space, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.space.capacity - b.space.capacity);
}
