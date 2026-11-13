import { allocateToTracks } from "@hansung/academic-engine";
import type { StudentCourseRecord } from "@hansung/contracts";
import rawCalendar from "../../../../data/normalized/academic-calendar.json";
import rawHolidays from "../../../../data/normalized/holidays.json";
import rawSpaces from "../../../../data/normalized/spaces.json";
import { catalogCourses, coursesForTrack, findProgram, primaryMappingForTrack } from "../catalog";
import { type AcademicData, validAcademicData } from "./academic-data-model";

export type Profile = {
  name: string;
  studentId: string;
  entryYear: number;
  year: number;
  semester?: 1 | 2;
  track1: string;
  track2: string;
  optional: string;
};
export type PlanItem = { code: string; term: string; track: 1 | 2 };
export type SavedPlan = {
  id: string;
  name: string;
  track1: string;
  track2: string;
  optional: string;
  items: PlanItem[];
  createdAt: string;
  updatedAt?: string;
  revision?: number;
  mode: "DEMO";
  recordRevision?: number;
  engineVersion?: string;
  rulePackId?: string;
};
export type Member = {
  id: string;
  name: string;
  studentId: string;
  department: string;
  /** Teammate's own e-signature (PNG data URL) collected on their phone; drawn next to the name. */
  signature?: string;
  signedAt?: string;
};
export type Kind = "INSTANT" | "ROOM" | "NIGHT" | "EXAM";
export type Stage =
  | "REVIEW"
  | "CHANGES"
  | "APPROVED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED"
  | "NO_SHOW";
export type ApplicationRevision = {
  revision: number;
  submittedAt: string;
  documentId: string;
  sha256: string;
  storage: "DEVICE" | "SESSION";
  template: "classroom-v1" | "overnight-v1";
  fields: {
    purpose: string;
    date: string;
    endDate: string;
    start: string;
    end: string;
    count: number;
    space: string;
    members: Member[];
    applicant: string;
    studentId: string;
    department: string;
    phone: string;
    professor: string;
  };
};
export type Booking = {
  id: string;
  mode: "DEMO";
  kind: Kind;
  spaceId: string;
  space: string;
  date: string;
  endDate: string;
  start: string;
  end: string;
  purpose: string;
  count: number;
  applicant: string;
  studentId: string;
  department: string;
  phone: string;
  professor: string;
  members: Member[];
  signature: string;
  stage: Stage;
  revision: number;
  note: string;
  noteField?: "purpose" | "members" | "phone" | "schedule";
  events: { label: string; at: string }[];
  reminder: boolean;
  revisions?: ApplicationRevision[];
  /** Who confirmed being in the room (예약자 + 동반자 1명). */
  checkedIn?: { studentId: string; at: string }[];
  /** Released because nobody checked in within the grace period. */
  autoReleased?: boolean;
  /** End time before an early return gave the rest of the slot back. */
  originalEnd?: string;
};
export type DemoState = {
  version: 3;
  profile: Profile;
  plans: SavedPlan[];
  bookings: Booking[];
  academic?: AcademicData;
  /** Idea-contest edition: waitlist, loans, meetups, events, timetable. */
  campus?: import("./campus-life").CampusState;
  /** Demo scenario picked in the header: everyday campus or exam season. */
  season?: "NORMAL" | "EXAM";
};
export const STORAGE_KEY = "hansung-ieum-journey-demo-v3";
export const initialProfile: Profile = {
  name: "메이트 학생",
  studentId: "DEMO0001",
  entryYear: 2024,
  year: 3,
  track1: "웹공학트랙",
  track2: "모바일소프트웨어트랙",
  optional: "",
};
export const freshState = (): DemoState => ({
  version: 3,
  profile: { ...initialProfile },
  plans: [],
  bookings: [],
});
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const stageLabel: Record<Stage, string> = {
  REVIEW: "승인 대기",
  CHANGES: "보완 요청",
  APPROVED: "예약 완료",
  CHECKED_IN: "이용 중",
  CHECKED_OUT: "퇴실 완료",
  CANCELLED: "취소 완료",
  REJECTED: "신청 반려",
  EXPIRED: "신청 기한 만료",
  NO_SHOW: "미입실 종료",
};
export const kindLabel: Record<Kind, string> = {
  INSTANT: "바로 예약",
  ROOM: "강의실 신청",
  NIGHT: "평소 야간 잔류",
  EXAM: "시험기간 야간 상주",
};
export const DEMO_TARGET = { required: 12_000, elective: 60_000, total: 130_000, perTrack: 36_000 };
export type MajorTargets = {
  basic: number;
  required: number;
  elective: number;
  total: number;
  perTrack: number;
  single: boolean;
  pathway: "FUSION_I" | "DEEP_GENERAL" | "DEEP_CREATIVE";
  label: string;
  basis: string;
};
/**
 * Minimum major credits from the school's 17학번+ table (hansung/6218):
 * two different programs → 융합전공Ⅰ 39 each (전기3·전필15·전선21);
 * the same department in both slots → 심화전공 78 (전필15·전선60, 창의융합대학 학과 전필21·전선54).
 * Total graduation credits stay a planning target until the student's cohort rule is confirmed.
 */
export function majorTargets(track1: string, track2: string, entryYear?: number): MajorTargets {
  // 졸업 이수학점: 16학번 이후 130, 15학번 이전 140 (hansung/6234).
  const total = entryYear !== undefined && entryYear <= 2015 ? 140_000 : 130_000;
  const p1 = findProgram(track1);
  const single = !!track1 && track1 === track2;
  if (single) {
    const creative = p1?.requirementProfile === "CREATIVE_DEPARTMENT";
    return {
      basic: 3_000,
      required: creative ? 21_000 : 15_000,
      elective: creative ? 54_000 : 60_000,
      total,
      perTrack: 78_000,
      single: true,
      pathway: creative ? "DEEP_CREATIVE" : "DEEP_GENERAL",
      label: creative ? "심화전공 · 창의융합대학 학과" : "심화전공",
      basis: creative
        ? "전기 3 · 전필 21 · 전선 54 = 78학점"
        : "전기 3 · 전필 15 · 전선 60 = 78학점",
    };
  }
  return {
    basic: 6_000,
    required: 30_000,
    elective: 42_000,
    total,
    perTrack: 39_000,
    single: false,
    pathway: "FUSION_I",
    label: "융합전공Ⅰ",
    basis: "트랙·학과마다 전기 3 · 전필 15 · 전선 21 = 39학점",
  };
}
export const terms = ["3-1", "3-2", "4-1", "4-2"];
/**
 * Demo transcript for a 24학번 student in two tracks of the same 학부: 1학년 courses come from the
 * 학부 common basics, and from 2학년 the student alternates between the two tracks' recommended
 * courses, as most students balance both programs. Terms follow each course's recommended term.
 */
const DEMO_TERMS: [string, number][] = [
  ["1-1", 3],
  ["1-2", 2],
  ["2-1", 4],
  ["2-2", 3],
  ["3-1", 4],
];
function pickDemoCourses() {
  const tracks = [initialProfile.track1, initialProfile.track2];
  const used = new Set<string>();
  const picked: { code: string; term: string }[] = [];
  let turn = 0;
  for (const [term, count] of DEMO_TERMS) {
    const [year, semester] = term.split("-");
    const candidates = (track: string) =>
      coursesForTrack(track).filter(
        (c) =>
          c.creditMilli === 3000 &&
          !used.has(c.code) &&
          c.mappings.some(
            (m) =>
              m.track === track &&
              m.recommendedYear === year &&
              (m.semester === semester || m.semester === "1·2"),
          ),
      );
    for (let k = 0; k < count; k++) {
      const first = tracks[turn % 2] ?? "";
      const second = tracks[(turn + 1) % 2] ?? "";
      turn++;
      const course = candidates(first)[0] ?? candidates(second)[0];
      if (!course) continue;
      used.add(course.code);
      picked.push({ code: course.code, term });
    }
  }
  return picked;
}
export const demoRecords: (StudentCourseRecord & { grade: string })[] = pickDemoCourses().map(
  ({ code, term }, i) => {
    const c = catalogCourses.find((x) => x.code === code);
    const m =
      (c && primaryMappingForTrack(c, initialProfile.track1)) ??
      (c && primaryMappingForTrack(c, initialProfile.track2));
    return {
      id: `demo-${code}`,
      courseCode: code,
      name: c?.name ?? code,
      creditMilli: c?.creditMilli ?? 3000,
      category: m?.category ?? "미분류",
      status: "COMPLETED",
      source: "PUBLIC_CURRICULUM",
      term,
      grade: ["A+ · 4.5", "A0 · 4.0", "B+ · 3.5", "P"][i % 4] ?? "성적 미확인",
    };
  },
);
export const demoOtherCredits: StudentCourseRecord[] = [
  {
    id: "demo-ge",
    name: "교양 이수 요약",
    creditMilli: 30_000,
    category: "자율교양",
    status: "COMPLETED",
    source: "DEMO_SUMMARY",
    term: "DEMO",
  },
  {
    id: "demo-free",
    name: "일반선택 이수 요약",
    creditMilli: 6_000,
    category: "일선",
    status: "COMPLETED",
    source: "DEMO_SUMMARY",
    term: "DEMO",
  },
];
type SpaceRecord = {
  id: string;
  name: string;
  building: string;
  group: string;
  kind: "INSTANT" | "ROOM";
  capacityMin: number | null;
  capacityMax: number;
  capacityVerified: boolean;
  open: string;
  close: string;
  hoursVerified: boolean;
  booking: string;
  features: string[];
  sourceUrl: string;
  notes: string;
  closedWeekends?: boolean;
  closedHolidays?: boolean;
  vacationOpen?: string;
  vacationClose?: string;
};
type SpaceData = {
  spaces: SpaceRecord[];
  examSpaces: {
    id: string;
    name: string;
    building: string;
    capacity: number | null;
    observed: string;
    verified: boolean;
    sourceUrl: string;
  }[];
  nightStay: {
    minMembers: number;
    unit: string;
    submitBefore: string;
    office: string;
    sourceUrl: string;
  };
  codingLoungeCalendar: { month: string; days: Record<string, Record<string, [string, string][]>> };
};
const spaceData = rawSpaces as unknown as SpaceData;
type Span = { name?: string; start: string; end: string };
export const academicCalendar = rawCalendar as {
  source: string;
  terms: (Span & { term: string })[];
  vacations: Span[];
  exams: Span[];
  closures: { date: string; name: string }[];
  events: (Span & { name: string; type: string; term: string })[];
};
const publicHolidays = new Set([
  ...(rawHolidays as { holidays: { date: string }[] }).holidays.map((h) => h.date),
  ...academicCalendar.closures.map((c) => c.date),
]);
const within = (date: string, s: Span) => date >= s.start && date <= s.end;
export const isVacation = (date: string) => academicCalendar.vacations.some((v) => within(date, v));
/** Exam period that contains the date, or starts within a week after it (library extension). */
export function examWindowFor(date: string) {
  return academicCalendar.exams.find((e) => {
    const start = new Date(`${e.start}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 7);
    return date >= start.toISOString().slice(0, 10) && date <= e.end;
  });
}
/** Public 2026-10-26 room list. Capacity/hour gaps are flagged instead of invented as facts. */
export const demoSpaces = spaceData.spaces.map((s) => ({
  ...s,
  capacity: s.capacityMax,
  from: s.open,
  to: s.close,
}));
export type DemoSpace = (typeof demoSpaces)[number];
export const maxInstantCapacity = Math.max(
  ...demoSpaces.filter((s) => s.kind === "INSTANT").map((s) => s.capacity),
);
export const spaceGroups = [...new Set(demoSpaces.map((s) => s.group))];
export const nightStayRules = spaceData.nightStay;
export const examSpaceInfo = spaceData.examSpaces;
export const examSpaces = spaceData.examSpaces.map((s) => s.name);
const calendarDays = spaceData.codingLoungeCalendar.days;
/**
 * Coding-lounge occupancy observed on the public October 2026 calendar. Other dates reuse the
 * busiest observed day with the same weekday so the demo shows a realistic, repeatable pattern.
 */
export function observedOccupancy(spaceId: string, date: string): [string, string][] {
  const room = spaceId.match(/^coding-(\d{3})$/)?.[1];
  if (!room) return [];
  const exact = calendarDays[date];
  if (exact) return exact[room] ?? [];
  const weekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();
  const sameDay = Object.keys(calendarDays)
    .filter((d) => new Date(`${d}T12:00:00+09:00`).getUTCDay() === weekday)
    .sort(
      (a, b) =>
        Object.keys(calendarDays[b] ?? {}).length - Object.keys(calendarDays[a] ?? {}).length,
    )[0];
  return sameDay ? (calendarDays[sameDay]?.[room] ?? []) : [];
}
export const observedCalendarMonth = spaceData.codingLoungeCalendar.month;
/** Operating hours on a date: vacation hours apply where the school publishes them. */
export function hoursFor(
  space: Pick<SpaceRecord, "open" | "close" | "vacationOpen" | "vacationClose">,
  date: string,
) {
  return space.vacationOpen && space.vacationClose && isVacation(date)
    ? { from: space.vacationOpen, to: space.vacationClose, vacation: true }
    : { from: space.open, to: space.close, vacation: false };
}
const kstWeekday = (date: string) => new Date(`${date}T12:00:00+09:00`).getUTCDay();
/** Days a space publishes as closed (weekends and public holidays where the school says so). */
export function closedReason(
  space: Pick<SpaceRecord, "closedWeekends" | "closedHolidays">,
  date: string,
) {
  if (space.closedWeekends && [0, 6].includes(kstWeekday(date))) return "주말에는 운영하지 않아요.";
  if (space.closedHolidays && publicHolidays.has(date)) return "공휴일에는 운영하지 않아요.";
  return "";
}
/** Overnight-stay paperwork must reach the welfare team a day ahead; same day only before noon. */
export function nightDeadlineError(date: string, now = Date.now()) {
  const today = todayKst(new Date(now));
  if (!date || date > today) return "";
  if (date < today) return "지난 날짜의 야간 잔류는 신청할 수 없어요.";
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(now)),
  );
  return hour >= 12 ? "야간 잔류 신청서는 하루 전까지, 당일은 낮 12시 전까지 제출해야 해요." : "";
}
export function period(b: Pick<Booking, "date" | "endDate" | "start" | "end">): [number, number] {
  return [
    Date.parse(`${b.date}T${b.start}:00+09:00`),
    Date.parse(`${b.endDate}T${b.end}:00+09:00`),
  ];
}
export function overlap(
  a: Pick<Booking, "date" | "endDate" | "start" | "end">,
  b: Pick<Booking, "date" | "endDate" | "start" | "end">,
): boolean {
  const [as, ae] = period(a);
  const [bs, be] = period(b);
  return as < be && bs < ae;
}
export function availableSpaces(
  count: number,
  date: string,
  start: string,
  end: string,
  bookings: Booking[],
  kind: "INSTANT" | "ROOM",
) {
  return demoSpaces.filter(
    (s) =>
      s.kind === kind &&
      s.capacity >= count &&
      hoursFor(s, date).from <= start &&
      hoursFor(s, date).to >= end &&
      !closedReason(s, date) &&
      !observedOccupancy(s.id, date).some(([os, oe]) => os < end && start < oe) &&
      !bookings.some(
        (b) =>
          b.spaceId === s.id &&
          !["CANCELLED", "CHECKED_OUT", "REJECTED", "EXPIRED", "NO_SHOW"].includes(b.stage) &&
          overlap({ date, endDate: date, start, end }, b),
      ),
  );
}
export function validateSearch(
  b: Pick<Booking, "date" | "endDate" | "start" | "end" | "count" | "purpose">,
  now = Date.now(),
  allowStarted = false,
): string[] {
  const errors: string[] = [];
  if (!b.date) errors.push("시작 날짜를 선택해 주세요.");
  if (!b.endDate) errors.push("종료 날짜를 선택해 주세요.");
  if (!b.start) errors.push("시작 시간을 선택해 주세요.");
  if (!b.end) errors.push("종료 시간을 선택해 주세요.");
  const [start, end] = period(b);
  if (
    b.date &&
    b.endDate &&
    b.start &&
    b.end &&
    (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
  )
    errors.push("종료 일시가 시작 일시보다 늦어야 해요.");
  if (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    (allowStarted ? end <= now : start < now)
  )
    errors.push(
      allowStarted ? "이미 종료된 이용 시간이에요." : "현재보다 이후인 시작 일시를 선택해 주세요.",
    );
  if (!b.purpose.trim()) errors.push("사용 목적을 입력해 주세요.");
  if (!Number.isInteger(b.count) || b.count < 1)
    errors.push("인원은 1명 이상의 정수로 입력해 주세요.");
  return errors;
}
/** Participant 1 is the applicant: keep both editable views of the same person in sync. */
export function patchBooking(b: Booking, patch: Partial<Booking>): Booking {
  const next = { ...b, ...patch, signature: "" };
  if (next.kind === "NIGHT" && next.members[0]) {
    if (patch.members) {
      const first = next.members[0];
      next.applicant = first.name;
      next.studentId = first.studentId;
      next.department = first.department;
    } else if (
      patch.applicant !== undefined ||
      patch.studentId !== undefined ||
      patch.department !== undefined
    ) {
      next.members = next.members.map((m, i) =>
        i === 0
          ? { ...m, name: next.applicant, studentId: next.studentId, department: next.department }
          : m,
      );
    }
  }
  return next;
}
/** Fill only empty demo fields, preserving names/IDs the student already entered. */
export function fillDemoMembers(b: Booking): Member[] {
  const members = b.members.map((m) => ({ ...m }));
  while (members.length < 5) members.push({ id: uid(), name: "", studentId: "", department: "" });
  const used = new Set(members.map((m) => m.studentId.trim()).filter(Boolean));
  let candidate = 2;
  return members.map((m, index) => {
    let studentId = m.studentId;
    if (!studentId.trim()) {
      while (used.has(`DEMO${String(candidate).padStart(4, "0")}`)) candidate++;
      studentId = `DEMO${String(candidate++).padStart(4, "0")}`;
      used.add(studentId);
    }
    return {
      ...m,
      studentId,
      name: m.name.trim() ? m.name : `데모학생${index + 1}`,
      department: m.department.trim() ? m.department : b.department,
    };
  });
}
export function validateBooking(b: Booking, now = Date.now()): string[] {
  const errors = validateSearch(b, now, b.kind === "EXAM");
  if (b.kind === "EXAM" && now < period(b)[0])
    errors.push("야간 상주 시작 시간 이후 입실할 수 있어요.");
  const [start, end] = period(b);
  if (!b.applicant.trim()) errors.push("신청인 이름을 입력해 주세요.");
  if (!b.studentId.trim()) errors.push("신청인 학번을 입력해 주세요.");
  if (!b.space.trim() || !b.spaceId) errors.push("이용할 장소를 선택해 주세요.");
  if (
    (b.spaceId === "classroom" || b.spaceId === "classroom-night") &&
    !/^(미래관|우촌관|탐구관|진리관) [A-Z]?\d{2,4}호$/.test(b.space)
  )
    errors.push("강의실 장소의 건물과 호실을 골라 주세요. (예: 미래관 304호)");
  const space = demoSpaces.find((s) => s.id === b.spaceId);
  const capacity = space?.capacity;
  if (capacity && b.count > capacity) errors.push(`이 공간은 ${capacity}명까지 이용할 수 있어요.`);
  if (space && ["INSTANT", "ROOM"].includes(b.kind) && b.date && b.start && b.end) {
    if (b.endDate !== b.date) errors.push("이 공간은 하루 안에서만 예약할 수 있어요.");
    const hours = hoursFor(space, b.date);
    if (b.start < hours.from || b.end > hours.to)
      errors.push(
        `이 공간의 ${hours.vacation ? "방학 중 " : ""}운영 시간은 ${hours.from}~${hours.to}이에요.`,
      );
    const closed = closedReason(space, b.date);
    if (closed) errors.push(closed);
    if (observedOccupancy(space.id, b.date).some(([os, oe]) => os < b.end && b.start < oe))
      errors.push("학교 공개 예약 달력에서 이미 사용 중인 시간이에요. 다른 시간을 골라 주세요.");
  }
  if (["ROOM", "NIGHT"].includes(b.kind)) {
    if (!b.department.trim()) errors.push("신청인 소속을 입력해 주세요.");
    if (!b.phone.trim()) errors.push("연락처를 입력해 주세요.");
  }
  if (b.kind === "NIGHT") {
    if (b.members.length < 5) errors.push("평소 야간 잔류는 신청인 포함 5명 이상 입력해 주세요.");
    if (b.members.length > 10)
      errors.push("이 데모 양식은 10명까지 입력할 수 있어요. 초과 명단은 별지 지원이 필요해요.");
    if (b.count !== b.members.length) errors.push("이용 인원과 명단 인원이 일치해야 해요.");
    if (b.members.some((m) => !m.name.trim() || !m.studentId.trim() || !m.department.trim()))
      errors.push("모든 참여자의 이름·학번·소속을 입력해 주세요.");
    if (new Set(b.members.map((m) => m.studentId.trim())).size !== b.members.length)
      errors.push("명단에 같은 학번을 두 번 입력할 수 없어요.");
    if (
      !b.members.some(
        (m) => m.studentId.trim() === b.studentId.trim() && m.name.trim() === b.applicant.trim(),
      )
    )
      errors.push("신청인을 잔류자 명단에 포함해 주세요.");
    if (end - start > 7 * 86400000) errors.push("야간 잔류는 1주일 이내로 신청해 주세요.");
    const deadline = nightDeadlineError(b.date, now);
    if (deadline && b.stage !== "CHANGES" && !b.revisions?.length) errors.push(deadline);
  }
  return errors;
}
export function transition(
  b: Booking,
  action:
    | "APPROVE"
    | "CHANGES"
    | "RESUBMIT"
    | "IN"
    | "OUT"
    | "CANCEL"
    | "REMIND"
    | "REJECT"
    | "EXPIRE"
    | "NO_SHOW",
  note = "",
  now = Date.now(),
): Booking {
  let stage = b.stage;
  let label = "";
  if (action === "APPROVE" && b.stage === "REVIEW" && now < period(b)[0]) {
    stage = "APPROVED";
    label = "관리자 승인 완료";
  } else if (action === "REJECT" && ["REVIEW", "CHANGES"].includes(b.stage) && note.trim()) {
    stage = "REJECTED";
    label = "관리자 반려";
  } else if (
    action === "EXPIRE" &&
    ["REVIEW", "CHANGES"].includes(b.stage) &&
    now >= period(b)[0]
  ) {
    stage = "EXPIRED";
    label = "승인 기한 만료 · 데모 정책";
  } else if (action === "NO_SHOW" && b.stage === "APPROVED" && now >= period(b)[1]) {
    stage = "NO_SHOW";
    label = "미입실 종료 · 데모 정책";
  } else if (action === "CHANGES" && b.stage === "REVIEW" && note.trim()) {
    stage = "CHANGES";
    label = "관리자 보완 요청";
  } else if (action === "RESUBMIT" && b.stage === "CHANGES") {
    stage = "REVIEW";
    label = "보완 후 다시 제출";
  } else if (
    action === "IN" &&
    b.stage === "APPROVED" &&
    now >= period(b)[0] &&
    now < period(b)[1]
  ) {
    stage = "CHECKED_IN";
    label = "입실 확인";
  } else if (action === "OUT" && b.stage === "CHECKED_IN") {
    stage = "CHECKED_OUT";
    label = "퇴실 확인";
  } else if (action === "CANCEL" && ["REVIEW", "CHANGES", "APPROVED"].includes(b.stage)) {
    stage = "CANCELLED";
    label = "신청 취소";
  } else if (action === "REMIND" && b.stage === "CHECKED_IN" && !b.reminder) {
    label = "종료 10분 전 알림 시연";
  } else return b;
  return {
    ...b,
    stage,
    note: ["CHANGES", "REJECT"].includes(action) ? note.trim() : b.note,
    revision: action === "RESUBMIT" ? b.revision + 1 : b.revision,
    reminder: b.reminder || action === "REMIND",
    events: [...b.events, { label, at: new Date(now).toISOString() }],
  };
}
/** Space ids/names used before the 2026-10-26 school data replaced the demo rooms. */
const LEGACY_SPACE_IDS: Record<string, string> = {
  "coding-demo-a": "coding-101",
  "park-demo-b": "parkplus-room",
  "base-demo-c": "base-seminar",
  "class-demo": "classroom",
};
const LEGACY_EXAM_NAMES: Record<string, string> = {
  "집중 열람실": "집중열람실",
  "창의 열람실": "창의열람실",
  상상베이스: "상상베이스 자유이용공간",
};
/**
 * Moves a booking saved under the old demo catalog onto the current one. Submitted requests keep
 * the place name printed on their signed form; only unsent drafts take the new display name.
 */
export function migrateBooking(b: Booking, submitted = true): Booking {
  if (b.kind === "EXAM") {
    const name = LEGACY_EXAM_NAMES[b.space];
    if (!name) return b;
    return { ...b, spaceId: `night-${name}`, space: submitted ? b.space : name };
  }
  const id = LEGACY_SPACE_IDS[b.spaceId];
  if (!id) return b;
  const next = demoSpaces.find((s) => s.id === id);
  return { ...b, spaceId: id, space: submitted || !next ? b.space : next.name };
}
export function migrateDemoState(s: DemoState): DemoState {
  return { ...s, bookings: s.bookings.map((b) => migrateBooking(b)) };
}
export function readDemo(): DemoState {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      s?.version === 3 &&
      s.profile &&
      Array.isArray(s.plans) &&
      Array.isArray(s.bookings) &&
      (s.academic === undefined || validAcademicData(s.academic))
    )
      return migrateDemoState(s);
  } catch {
    /* unavailable or corrupt local state */
  }
  return freshState();
}
export function nextDate(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function demoPlanRecords(
  items: PlanItem[],
  track1: string,
  track2: string,
): StudentCourseRecord[] {
  return items.flatMap((item) => {
    const c = catalogCourses.find((c) => c.code === item.code);
    const m = c && primaryMappingForTrack(c, item.track === 1 ? track1 : track2);
    return c && m
      ? [
          {
            id: `plan-${c.code}`,
            courseCode: c.code,
            name: c.name,
            creditMilli: c.creditMilli,
            category: m.category,
            status: "PLANNED" as const,
            source: "PUBLIC_CURRICULUM" as const,
            term: item.term,
          },
        ]
      : [];
  });
}

/**
 * Completed courses split between the two programs with the engine's balanced rule: a course in
 * both curricula counts once, in the program that still needs it; the 전기/전필/전선 label is the
 * assigned program's. Unmatched courses stay 미분류 (recognition unknown).
 */
/** Choices are stored per program pair so a scenario with other programs starts from the auto rule. */
export const trackChoiceKey = (track1: string, track2: string, recordId: string) =>
  `${track1}|${track2}|${recordId}`;
export function choicesFor(
  choices: Record<string, 1 | 2> | undefined,
  track1: string,
  track2: string,
): Record<string, 1 | 2> {
  const prefix = `${track1}|${track2}|`;
  return Object.fromEntries(
    Object.entries(choices ?? {})
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length), v]),
  );
}
export function demoAllocatedRecords<R extends StudentCourseRecord>(
  track1: string,
  track2: string,
  records: R[],
  choices: Record<string, 1 | 2> = {},
) {
  const goal = majorTargets(track1, track2);
  const tracks = [track1, track2];
  return allocateToTracks(
    records,
    (code, slot) => {
      const c = catalogCourses.find((x) => x.code === code);
      const track = tracks[slot - 1];
      return c && track ? primaryMappingForTrack(c, track)?.category : undefined;
    },
    goal.single
      ? { basic: goal.basic, required: goal.required, perTrack: goal.perTrack }
      : { basic: goal.basic / 2, required: goal.required / 2, perTrack: goal.perTrack },
    goal.single,
    (r) => choices[r.id],
  );
}

export function todayKst(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function profileTerm(profile: Profile, now = new Date()) {
  const month = Number(todayKst(now).slice(5, 7));
  return `${profile.year}-${profile.semester ?? (month >= 8 || month <= 2 ? 2 : 1)}`;
}
export function upsertPlan(plans: SavedPlan[], plan: SavedPlan) {
  return [plan, ...plans.filter((p) => p.id !== plan.id)];
}

/** Same duration, nearby times; each suggestion is checked against all local demo bookings. */
export function alternativeTimes(booking: Booking, bookings: Booking[]) {
  const minutes = (time: string) => Number(time.split(":")[0]) * 60 + Number(time.split(":")[1]);
  const start = minutes(booking.start),
    duration = minutes(booking.end) - start;
  if (!Number.isFinite(start) || duration <= 0 || booking.date !== booking.endDate) return [];
  const fmt = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  return [30, -30, 60, -60, 120, -120]
    .flatMap((offset) => {
      const from = start + offset,
        to = from + duration;
      if (from < 9 * 60 || to > 22 * 60) return [];
      const spaces = availableSpaces(
        booking.count,
        booking.date,
        fmt(from),
        fmt(to),
        bookings.filter((b) => b.id !== booking.id),
        booking.kind === "ROOM" ? "ROOM" : "INSTANT",
      );
      return spaces.length ? [{ start: fmt(from), end: fmt(to), count: spaces.length }] : [];
    })
    .slice(0, 3);
}

export type ChangeKind = "NONE" | "TRACK_CHANGE" | "TRANSFER" | "FIRST_SELECT";
/**
 * Distinguishes a track change from a transfer between admission units (전부(과)).
 * Moving the 1st slot to another 학부/학과 is a 전과: the school reclassifies the previous major's
 * grades as 일반선택 (2026-2 전부(과) 합격 안내). Changing only tracks inside the same unit, or the
 * 2nd slot, is a 트랙 변경.
 */
export function classifyChange(before: string[], after: string[]): ChangeKind {
  const [b1 = "", b2 = ""] = before;
  const [a1 = "", a2 = ""] = after;
  if (!b1 && !b2) return "FIRST_SELECT";
  if (b1 === a1 && b2 === a2) return "NONE";
  const unitBefore = findProgram(b1)?.unit;
  const unitAfter = findProgram(a1)?.unit;
  if (b1 !== a1 && unitBefore && unitAfter && unitBefore !== unitAfter) return "TRANSFER";
  return "TRACK_CHANGE";
}

const INACTIVE: Stage[] = ["CANCELLED", "CHECKED_OUT", "REJECTED", "EXPIRED", "NO_SHOW"];
/** The same student cannot hold two room bookings that overlap in time, even in different rooms. */
export function ownOverlap(draft: Booking, bookings: Booking[]): Booking | undefined {
  if (!["INSTANT", "ROOM"].includes(draft.kind)) return undefined;
  return bookings.find(
    (b) =>
      b.id !== draft.id &&
      ["INSTANT", "ROOM"].includes(b.kind) &&
      !INACTIVE.includes(b.stage) &&
      b.studentId.trim() === draft.studentId.trim() &&
      overlap(draft, b),
  );
}
