/**
 * Student-council eligibility for item lending: school-mail check + dues roster match.
 * The roster is stored only as salted SHA-256 hashes of student IDs, so the app never keeps
 * the council's raw list. Everything here is a DEMO: no real mail is sent and no school
 * system is queried.
 */
import { findProgram } from "../catalog";
import type { Profile } from "./model";
import { uid } from "./model";

export type DuesScope = "TOTAL" | string; // "TOTAL" = 총학생회비, otherwise a 학부/학과 name
export type CouncilRoster = {
  term: string;
  scope: DuesScope;
  hashes: string[];
  uploadedAt: string;
  sample: boolean;
};
export type CouncilCode = { hash: string; scope: DuesScope; usedBy?: string; issuedAt: string };
export type Verification = {
  email?: { address: string; at: string };
  dues: { scope: DuesScope; term: string; method: "LIST" | "CODE"; at: string }[];
};
export type CouncilState = {
  rosters: CouncilRoster[];
  codes: CouncilCode[];
  verify: Verification;
  log: { at: string; text: string }[];
};
export const freshCouncil = (): CouncilState => ({
  rosters: [],
  codes: [],
  verify: { dues: [] },
  log: [],
});

/** Dues are paid per semester; a check stays valid until the term changes. */
export function currentTerm(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  if (m <= 2) return `${y - 1}-2`;
  return m <= 8 ? `${y}-1` : `${y}-2`;
}
export const termEnd = (term: string) =>
  term.endsWith("-1") ? `${term.slice(0, 4)}.8.31` : `${Number(term.slice(0, 4)) + 1}.2.28`;

/** 학부/학과 the student belongs to, from the first track's school listing. */
export function departmentOf(profile: Pick<Profile, "track1">) {
  const p = findProgram(profile.track1);
  return p?.unit ?? p?.college ?? "";
}
export const scopeLabel = (scope: DuesScope) =>
  scope === "TOTAL" ? "총학생회비" : `${scope} 학생회비`;

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Salted per term and scope so a hash list from one roster cannot be replayed on another. */
export const hashId = (studentId: string, term: string, scope: DuesScope) =>
  sha256(`hansung-mate:${term}:${scope}:${studentId.trim().toUpperCase()}`);

/** Reads 학번 from a council CSV (any column holding 7–10 digits, or DEMO ids). */
export function idsFromCsv(text: string) {
  const ids = text.match(/\b(\d{7,10}|DEMO\d{4})\b/g) ?? [];
  return [...new Set(ids)];
}
export async function buildRoster(
  ids: string[],
  term: string,
  scope: DuesScope,
  sample = false,
): Promise<CouncilRoster> {
  return {
    term,
    scope,
    hashes: await Promise.all(ids.map((id) => hashId(id, term, scope))),
    uploadedAt: new Date().toISOString(),
    sample,
  };
}
/** Demo roster of plausible 학번; `includeMe` decides whether the demo student is on it. */
export function sampleIds(myId: string, includeMe: boolean, size = 312) {
  const ids: string[] = [];
  for (let i = 0; i < size; i++) {
    const year = 20 + (i % 7);
    ids.push(`${year}${String(10_000 + ((i * 7919) % 89_999)).padStart(5, "0")}`);
  }
  return includeMe ? [...ids.slice(0, size - 1), myId] : ids;
}

export function newOtp() {
  return String(100_000 + Math.floor(Math.random() * 900_000));
}
export const OTP_MINUTES = 5;
export const isSchoolMail = (address: string) =>
  /^[^\s@]+@(hansung\.ac\.kr|sangsang\.hansung\.ac\.kr)$/i.test(address.trim());

export async function issueCode(scope: DuesScope) {
  const plain = `HSM-${uid().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  return {
    plain,
    code: { hash: await sha256(`code:${plain}`), scope, issuedAt: new Date().toISOString() },
  };
}

/** Checks the roster (or a one-time code) and returns the updated state plus a message. */
export async function verifyDues(
  state: CouncilState,
  profile: Profile,
  scope: DuesScope,
  opts: { code?: string; now?: Date } = {},
): Promise<{ state: CouncilState; ok: boolean; message: string }> {
  const now = opts.now ?? new Date();
  const term = currentTerm(now);
  const at = now.toISOString();
  const add = (method: "LIST" | "CODE", s: CouncilState): CouncilState => ({
    ...s,
    verify: {
      ...s.verify,
      dues: [
        ...s.verify.dues.filter((d) => !(d.scope === scope && d.term === term)),
        { scope, term, method, at },
      ],
    },
    log: [
      {
        at,
        text: `${profile.studentId} ${scopeLabel(scope)} 확인 (${method === "LIST" ? "명단" : "코드"})`,
      },
      ...s.log,
    ],
  });
  if (!state.verify.email) return { state, ok: false, message: "먼저 학교 메일 인증을 해 주세요." };
  if (scope !== "TOTAL" && departmentOf(profile) !== scope)
    return { state, ok: false, message: `${scope} 학생만 인증할 수 있어요.` };
  if (opts.code) {
    const hash = await sha256(`code:${opts.code.trim().toUpperCase()}`);
    const found = state.codes.find((c) => c.hash === hash && c.scope === scope);
    if (!found) return { state, ok: false, message: "학생회가 발급한 코드가 아니에요." };
    if (found.usedBy && found.usedBy !== profile.studentId)
      return { state, ok: false, message: "이미 다른 학생이 쓴 코드예요." };
    const used = {
      ...state,
      codes: state.codes.map((c) => (c === found ? { ...c, usedBy: profile.studentId } : c)),
    };
    return {
      state: add("CODE", used),
      ok: true,
      message: `${scopeLabel(scope)} 납부가 확인됐어요.`,
    };
  }
  const roster = state.rosters.find((r) => r.term === term && r.scope === scope);
  if (!roster)
    return { state, ok: false, message: "학생회가 아직 이번 학기 납부자 명단을 올리지 않았어요." };
  const mine = await hashId(profile.studentId, term, scope);
  if (!roster.hashes.includes(mine))
    return {
      state: {
        ...state,
        log: [{ at, text: `${profile.studentId} ${scopeLabel(scope)} 명단에 없음` }, ...state.log],
      },
      ok: false,
      message:
        "납부자 명단에서 학번을 찾지 못했어요. 학생회에 문의하거나 발급받은 코드를 입력해 주세요.",
    };
  return {
    state: add("LIST", state),
    ok: true,
    message: `${scopeLabel(scope)} 납부가 확인됐어요.`,
  };
}

export function hasDues(state: CouncilState | undefined, scope: DuesScope, now = new Date()) {
  const term = currentTerm(now);
  return !!state?.verify.dues.some((d) => d.scope === scope && d.term === term);
}
