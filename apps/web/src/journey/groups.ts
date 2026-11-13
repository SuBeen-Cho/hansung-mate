/**
 * “내 스터디·팀”: a leader lists teammates by 학번, each teammate accepts on their own phone,
 * and once everyone has answered the team books a room together. Booking results are sent
 * to every accepted member as in-app notices. DEMO: acceptance from other phones is simulated.
 */
import type { Booking, Member } from "./model";
import { stageLabel, uid } from "./model";

export type GroupMember = {
  studentId: string;
  name: string;
  status: "LEADER" | "INVITED" | "ACCEPTED" | "DECLINED";
  at?: string;
  /** School mail the member verified before joining (blocks someone typing another's 학번). */
  mail?: string;
};
export type GroupNotice = { at: string; text: string; to: string[] };
export type StudyGroup = {
  id: string;
  name: string;
  kind: "STUDY" | "TEAM";
  members: GroupMember[];
  createdAt: string;
  /** Invitations not answered by then lapse, so a booking is never held up for long. */
  expiresAt: string;
  bookingId?: string;
  notices: GroupNotice[];
  sample?: boolean;
};

export const INVITE_HOURS = 48;
export const isStudentId = (id: string) => /^\d{7,10}$/.test(id.trim());
/** Before someone accepts, only part of the 학번 is shown to the others. */
export const maskId = (id: string) =>
  id.length > 4 ? `${id.slice(0, 4)}${"*".repeat(id.length - 4)}` : id;

export function inviteIssues(
  me: { studentId: string },
  rows: { studentId: string; name: string }[],
  existing: GroupMember[] = [],
) {
  const issues: string[] = [];
  const ids = rows.map((r) => r.studentId.trim()).filter(Boolean);
  if (!ids.length) issues.push("함께할 팀원 학번을 1명 이상 넣어 주세요.");
  for (const id of ids) {
    if (!isStudentId(id)) issues.push(`${id}: 학번은 숫자 7~10자리예요.`);
    if (id === me.studentId.trim()) issues.push("내 학번은 넣지 않아도 돼요.");
  }
  const all = [...existing.map((m) => m.studentId), ...ids];
  if (new Set(all).size !== all.length) issues.push("같은 학번이 두 번 들어갔어요.");
  return [...new Set(issues)];
}

export function createGroup(
  name: string,
  kind: StudyGroup["kind"],
  leader: { studentId: string; name: string },
  rows: { studentId: string; name: string }[],
  now = Date.now(),
): StudyGroup {
  const at = new Date(now).toISOString();
  return {
    id: uid(),
    name: name.trim(),
    kind,
    createdAt: at,
    expiresAt: new Date(now + INVITE_HOURS * 3_600_000).toISOString(),
    members: [
      { studentId: leader.studentId, name: leader.name, status: "LEADER", at },
      ...rows
        .filter((r) => r.studentId.trim())
        .map((r) => ({
          studentId: r.studentId.trim(),
          name: r.name.trim(),
          status: "INVITED" as const,
        })),
    ],
    notices: [],
  };
}

/** Accepting needs a verified school mail; declining does not. */
export function respond(
  g: StudyGroup,
  studentId: string,
  accept: boolean,
  now = Date.now(),
  mail = "",
): StudyGroup {
  if (accept && !mail) return g;
  return {
    ...g,
    members: g.members.map((m) =>
      m.studentId === studentId && m.status === "INVITED"
        ? {
            ...m,
            status: accept ? "ACCEPTED" : "DECLINED",
            at: new Date(now).toISOString(),
            ...(accept ? { mail } : {}),
          }
        : m,
    ),
  };
}

export const joined = (g: StudyGroup) =>
  g.members.filter((m) => m.status === "LEADER" || m.status === "ACCEPTED");
export const waiting = (g: StudyGroup) => g.members.filter((m) => m.status === "INVITED");
export const expired = (g: StudyGroup, now = Date.now()) =>
  waiting(g).length > 0 && now > Date.parse(g.expiresAt);
/** Everyone answered (or the invite window passed) and at least two people are in. */
export const groupReady = (g: StudyGroup, now = Date.now()) =>
  joined(g).length >= 2 && (waiting(g).length === 0 || expired(g, now));

/** Only accepted members go on the booking's user list (and the official form). */
export function bookingMembers(g: StudyGroup, department: string): Member[] {
  return joined(g).map((m) => ({
    id: uid(),
    name: m.name || `팀원 ${m.studentId.slice(-3)}`,
    studentId: m.studentId,
    department,
  }));
}

export function notify(g: StudyGroup, text: string, now = Date.now()): StudyGroup {
  const to = joined(g).map((m) => m.studentId);
  return { ...g, notices: [{ at: new Date(now).toISOString(), text, to }, ...g.notices] };
}

/** What the team hears when the linked booking changes state. */
export function bookingNotice(prev: Booking | undefined, next: Booking) {
  if (prev?.stage === next.stage) return "";
  const where = `${next.space} ${next.date.slice(5).replace("-", ".")} ${next.start}–${next.end}`;
  const kind = next.kind === "ROOM" ? "강의실 신청" : "공간 예약";
  switch (next.stage) {
    case "REVIEW":
      return prev ? "" : `${kind}을 냈어요 · ${where} · 승인을 기다리는 중`;
    case "APPROVED":
      return `${kind}이 ${next.kind === "ROOM" ? "승인됐어요" : "완료됐어요"} · ${where}`;
    case "CHANGES":
      return `${kind}에 보완 요청이 왔어요 · ${next.note || "내용을 확인해 주세요"}`;
    case "REJECTED":
    case "CANCELLED":
    case "NO_SHOW":
      return `${kind} ${stageLabel[next.stage]} · ${where}`;
    default:
      return "";
  }
}

/** One invite from another team so the “받은 초대” flow can be shown in the demo. */
export function sampleInvite(
  me: { studentId: string; name: string },
  now = Date.now(),
): StudyGroup {
  const g = createGroup(
    "캡스톤 디자인 팀 (예시)",
    "TEAM",
    { studentId: "2212003", name: "예시 학생 C" },
    [
      { studentId: me.studentId, name: me.name },
      { studentId: "2312007", name: "예시 학생 G" },
    ],
    now,
  );
  return { ...respond(g, "2312007", true, now, "2312007@hansung.ac.kr"), sample: true };
}

/** Rooms with a school minimum head-count, grouped so the team sees what it can book now. */
export function headcountHint(
  count: number,
  rules: Record<string, { minPeople?: number | null }>,
  names: Record<string, string>,
) {
  const byName = new Map<string, number>();
  for (const [id, rule] of Object.entries(rules)) {
    if (!rule.minPeople) continue;
    const name = (names[id] ?? id).replace(/\s*IB\d+$/, "");
    byName.set(name, rule.minPeople);
  }
  const ok: string[] = [];
  const short: string[] = [];
  for (const [name, min] of [...byName].sort((a, b) => a[1] - b[1]))
    (count >= min ? ok : short).push(count >= min ? name : `${name}은 ${min - count}명 더 필요`);
  return { ok, short };
}
