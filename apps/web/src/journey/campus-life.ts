/**
 * The rest of campus sharing: equipment and student-council item loans, study/team recruiting
 * that ends in a room booking, QR attendance rosters for events, and the light timetable used
 * to suggest rooms in free periods. Pure functions; the demo stores the results locally.
 */
import { addDays, campus, toMinutes } from "./campus";
import { todayKst, uid } from "./model";

export type LoanItem = {
  id: string;
  name: string;
  source: "PARK" | "ITROOM" | "COUNCIL";
  category: string;
  qty: number;
  qtyVerified: boolean;
  location: string;
  maxDays: number;
  rule: string;
  onsite?: boolean;
  onePerPerson?: boolean;
  /** Council items: whose dues unlock it ("TOTAL" = 총학생회비, else a 학부/학과). */
  scope?: string;
};
export const loanItems: LoanItem[] = [
  ...campus.equipment.map((e) => ({
    id: e.id,
    name: e.name,
    source: "PARK" as const,
    category: e.category,
    qty: e.qty,
    qtyVerified: e.qtyVerified,
    location: e.location,
    maxDays: e.maxDays,
    rule: e.rule,
    ...("onsite" in e && e.onsite ? { onsite: true } : {}),
  })),
  ...campus.itRoom.items.map((e) => ({
    ...e,
    source: "ITROOM" as const,
    location: `${campus.itRoom.location} ${campus.itRoom.name}`,
  })),
  ...campus.councilItems.items.map((c) => ({
    id: c.id,
    name: c.name,
    source: "COUNCIL" as const,
    category: "학생회 물품",
    qty: c.qty,
    qtyVerified: c.qtyVerified,
    location: "총학생회 학생복지위원회",
    maxDays: c.maxDays,
    rule: `${campus.councilItems.eligibility} · 최대 ${c.maxDays}일`,
    scope: "TOTAL",
  })),
  // Department councils lend their own kits; these entries are demo examples, not school data.
  ...[
    { id: "dept-presenter", name: "무선 프리젠터", scope: "컴퓨터공학부", qty: 5, maxDays: 1 },
    { id: "dept-arduino", name: "아두이노 실습 키트", scope: "컴퓨터공학부", qty: 10, maxDays: 7 },
    { id: "dept-multimeter", name: "디지털 멀티미터", scope: "기계전자공학부", qty: 6, maxDays: 3 },
  ].map((d) => ({
    ...d,
    source: "COUNCIL" as const,
    category: `${d.scope} 학생회 · 데모 물품`,
    qtyVerified: false,
    location: `${d.scope} 학생회실`,
    rule: `${d.scope} 학생회비 납부자 · 최대 ${d.maxDays}일`,
  })),
];

export type Loan = {
  id: string;
  itemId: string;
  itemName: string;
  source: LoanItem["source"];
  qty: number;
  from: string;
  to: string;
  status: "RESERVED" | "PICKED_UP" | "RETURNED" | "CANCELLED";
  bookingId?: string;
  createdAt: string;
  returnedAt?: string;
};
const activeLoan = (l: Loan) => l.status === "RESERVED" || l.status === "PICKED_UP";
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00+09:00`) - Date.parse(`${a}T12:00:00+09:00`)) / 86_400_000);

/** Units left for the whole period (the busiest day counts). */
export function availableQty(item: LoanItem, from: string, to: string, loans: Loan[]) {
  let worst = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const used = loans
      .filter((l) => l.itemId === item.id && activeLoan(l) && l.from <= d && d <= l.to)
      .reduce((n, l) => n + l.qty, 0);
    worst = Math.max(worst, used);
  }
  return Math.max(0, item.qty - worst);
}

export function loanState(l: Loan, today: string) {
  if (!activeLoan(l)) return l.status;
  if (l.status === "PICKED_UP" && l.to < today) return "OVERDUE" as const;
  if (l.status === "PICKED_UP" && l.to === today) return "DUE_TODAY" as const;
  return l.status;
}

export function loanIssues(
  item: LoanItem | undefined,
  req: { from: string; to: string; qty: number },
  loans: Loan[],
  opts: { duesPaid: boolean; now?: number; councilIssue?: string },
) {
  const issues: string[] = [];
  if (!item) return ["빌릴 물품을 골라 주세요."];
  const today = todayKst(new Date(opts.now ?? Date.now()));
  if (!req.from || !req.to || req.to < req.from) issues.push("대여일과 반납일을 확인해 주세요.");
  else {
    if (req.from < today) issues.push("지난 날짜로는 빌릴 수 없어요.");
    if (daysBetween(req.from, req.to) + 1 > item.maxDays)
      issues.push(
        item.maxDays === 1
          ? `${item.name}은(는) 당일 반납이 원칙이에요.`
          : `${item.name}은(는) 최대 ${item.maxDays}일까지 빌릴 수 있어요.`,
      );
    const wd = new Date(`${req.from}T12:00:00+09:00`).getUTCDay();
    if (item.source !== "COUNCIL" && (wd === 0 || wd === 6))
      issues.push(
        `${item.source === "PARK" ? "상상파크 기자재" : "통합기자재실 노트북"}은 평일에만 대여·반납할 수 있어요.`,
      );
    if (availableQty(item, req.from, req.to, loans) < req.qty)
      issues.push(`그 기간에 남은 수량이 ${availableQty(item, req.from, req.to, loans)}개예요.`);
  }
  if (req.qty < 1) issues.push("수량을 1개 이상 골라 주세요.");
  if (item.onePerPerson) {
    if (req.qty > 1) issues.push("한 사람이 1대만 빌릴 수 있어요.");
    else if (loans.some((l) => l.itemId === item.id && activeLoan(l)))
      issues.push("이미 빌린 노트북이 있어요. 1인 1대라 반납 후 다시 빌려 주세요.");
  }
  if (item.source === "COUNCIL" && opts.councilIssue) issues.push(opts.councilIssue);
  else if (item.source === "COUNCIL" && !opts.duesPaid)
    issues.push("학생복지위원회 물품은 학생회비 납부자만 빌릴 수 있어요 (2024.4.1부터).");
  const overdue = loans.filter((l) => loanState(l, today) === "OVERDUE");
  if (overdue.length)
    issues.push(
      `반납하지 않은 물품(${overdue.map((l) => l.itemName).join(", ")})이 있어 새 대여가 막혀요.`,
    );
  return issues;
}

export function newLoan(
  item: LoanItem,
  req: { from: string; to: string; qty: number; bookingId?: string },
  now = Date.now(),
): Loan {
  return {
    id: uid(),
    itemId: item.id,
    itemName: item.name,
    source: item.source,
    qty: req.qty,
    from: req.from,
    to: req.to,
    status: "RESERVED",
    ...(req.bookingId ? { bookingId: req.bookingId } : {}),
    createdAt: new Date(now).toISOString(),
  };
}

export type Meetup = {
  id: string;
  title: string;
  kind: "STUDY" | "TEAM" | "CLUB";
  host: string;
  needed: number;
  members: { name: string; studentId: string }[];
  date: string;
  start: string;
  end: string;
  tags: string[];
  bookingId?: string;
};
export const meetupReady = (m: Meetup) => m.members.length >= m.needed;
export function joinMeetup(m: Meetup, person: { name: string; studentId: string }): Meetup {
  if (m.members.some((x) => x.studentId === person.studentId)) return m;
  return { ...m, members: [...m.members, person] };
}
export function leaveMeetup(m: Meetup, studentId: string): Meetup {
  return { ...m, members: m.members.filter((x) => x.studentId !== studentId) };
}

export type CampusEvent = {
  id: string;
  title: string;
  host: string;
  date: string;
  place: string;
  token: string;
  attendees: { name: string; studentId: string; at: string }[];
  closedAt?: string;
};
export const eventToken = () => uid().replace(/-/g, "").slice(0, 8).toUpperCase();
/** QR check-in: one entry per student, rejected after the organizer closes the roster. */
export function attend(
  ev: CampusEvent,
  person: { name: string; studentId: string },
  token: string,
  now = Date.now(),
): { event: CampusEvent; error?: string } {
  if (ev.closedAt) return { event: ev, error: "출석이 마감된 행사예요." };
  if (token.trim().toUpperCase() !== ev.token)
    return { event: ev, error: "QR 코드가 맞지 않아요." };
  if (!person.name.trim() || !/^\d{7,10}$/.test(person.studentId.trim()))
    return { event: ev, error: "이름과 학번(숫자)을 확인해 주세요." };
  if (ev.attendees.some((a) => a.studentId === person.studentId.trim()))
    return { event: ev, error: "이미 출석한 학번이에요." };
  return {
    event: {
      ...ev,
      attendees: [
        ...ev.attendees,
        {
          name: person.name.trim(),
          studentId: person.studentId.trim(),
          at: new Date(now).toISOString(),
        },
      ],
    },
  };
}
/** Roster for the council's records: time-stamped, de-duplicated, no hand edits. */
export function rosterCsv(ev: CampusEvent) {
  const rows = [
    ["번호", "이름", "학번", "출석 시각"],
    ...ev.attendees.map((a, i) => [
      String(i + 1),
      a.name,
      a.studentId,
      new Date(a.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    ]),
  ];
  return `﻿${rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")}`;
}

export type ClassBlock = {
  id: string;
  day: number;
  start: string;
  end: string;
  title: string;
  /** Building of the class, used to rank rooms nearby. */
  building?: string;
};
/** Free periods of at least `min` minutes between 09:00 and 21:00 on a weekday. */
export function freeGaps(blocks: ClassBlock[], day: number, min = 60) {
  const sorted = blocks.filter((b) => b.day === day).sort((a, b) => a.start.localeCompare(b.start));
  const gaps: { start: string; end: string }[] = [];
  let cursor = "09:00";
  for (const b of sorted) {
    if (toMinutes(b.start) - toMinutes(cursor) >= min) gaps.push({ start: cursor, end: b.start });
    if (b.end > cursor) cursor = b.end;
  }
  if (toMinutes("21:00") - toMinutes(cursor) >= min && sorted.length)
    gaps.push({ start: cursor, end: "21:00" });
  return sorted.length ? gaps : [];
}
/** Next calendar date (today included) that falls on the weekday (1=월 … 5=금). */
export function nextDateFor(day: number, today: string) {
  const cur = new Date(`${today}T12:00:00+09:00`).getUTCDay();
  return addDays(today, (day - cur + 7) % 7);
}

export type CampusState = {
  waitlist: import("./campus").WaitEntry[];
  loans: Loan[];
  meetups: Meetup[];
  events: CampusEvent[];
  timetable: ClassBlock[];
  duesPaid: boolean;
  favorites?: string[];
  groups?: import("./groups").StudyGroup[];
  nightPosts?: import("./NightViews").NightPost[];
  council?: import("./council").CouncilState;
};

/** Demo content so the tabs are not empty: clearly labelled sample posts. */
export function freshCampus(today: string): CampusState {
  // Sample meetups land on weekdays so “공간 잡기” always has open rooms to show.
  const d = (n: number) => {
    let date = addDays(today, n);
    while ([0, 6].includes(new Date(`${date}T12:00:00+09:00`).getUTCDay())) date = addDays(date, 1);
    return date;
  };
  return {
    waitlist: [],
    loans: [],
    duesPaid: true,
    timetable: [
      {
        id: "t1",
        day: 1,
        start: "09:00",
        end: "10:30",
        title: "컴퓨터네트워크",
        building: "공학관",
      },
      {
        id: "t2",
        day: 1,
        start: "15:00",
        end: "16:30",
        title: "웹프레임워크1",
        building: "공학관",
      },
      { id: "t3", day: 2, start: "10:30", end: "12:00", title: "설계패턴", building: "상상관" },
      {
        id: "t4",
        day: 3,
        start: "09:00",
        end: "10:30",
        title: "컴퓨터네트워크",
        building: "공학관",
      },
      {
        id: "t5",
        day: 3,
        start: "13:30",
        end: "15:00",
        title: "고급모바일프로그래밍",
        building: "공학관",
      },
      { id: "t6", day: 4, start: "10:30", end: "12:00", title: "설계패턴", building: "상상관" },
    ],
    meetups: [
      {
        id: "mu1",
        title: "정보보안기사 필기 스터디",
        kind: "STUDY",
        host: "예시 학생 A",
        needed: 4,
        members: [
          { name: "예시 학생 A", studentId: "2312001" },
          { name: "예시 학생 B", studentId: "2412002" },
        ],
        date: d(2),
        start: "18:00",
        end: "20:00",
        tags: ["자격증", "주 1회"],
      },
      {
        id: "mu2",
        title: "캡스톤 중간발표 리허설",
        kind: "TEAM",
        host: "예시 학생 C",
        needed: 3,
        members: [{ name: "예시 학생 C", studentId: "2212003" }],
        date: d(1),
        start: "16:00",
        end: "18:00",
        tags: ["발표 연습", "TV 필요"],
      },
      {
        id: "mu3",
        title: "알고리즘 코딩테스트 모의고사",
        kind: "STUDY",
        host: "예시 학생 D",
        needed: 3,
        members: [
          { name: "예시 학생 D", studentId: "2512004" },
          { name: "예시 학생 E", studentId: "2512005" },
        ],
        date: d(3),
        start: "13:00",
        end: "15:00",
        tags: ["코테", "노트북 지참"],
      },
    ],
    events: [],
  };
}
export { daysBetween };
