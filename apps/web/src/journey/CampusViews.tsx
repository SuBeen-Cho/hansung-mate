/**
 * Campus-sharing screens for the idea-contest branch: home, talk search, the school's
 * reservation map, check-in, lending, meetups/attendance, the light study tab and the
 * operator view. Rules live in campus.ts / campus-life.ts; these components only render them.
 */
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock,
  DoorOpen,
  ExternalLink,
  MapPin,
  Moon,
  Package,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import qrcode from "qrcode-generator";
import { useMemo, useState } from "react";
import { catalogCourses, isOffered, offeringTerm } from "../catalog";
import type { AcademicData } from "./AcademicData";
import { CouncilAdmin, CouncilStatus, CouncilVerify } from "./CouncilViews";
import {
  addDays,
  amenitiesOf,
  bookingMetrics,
  CHECKIN_GRACE_MIN,
  CLAIM_WINDOW_MIN,
  campus,
  checkIn,
  checkInState,
  earlyReturn,
  joinWaitlist,
  kstTime,
  loungeHeatmap,
  needsCompanion,
  noShowPause,
  offerReleased,
  parseQuery,
  resizeHint,
  sourceTitle,
  sourceUrl,
  suggestSpaces,
  toMinutes,
  type WaitEntry,
} from "./campus";
import {
  attend,
  availableQty,
  type CampusEvent,
  type CampusState,
  type ClassBlock,
  daysBetween,
  eventToken,
  freeGaps,
  joinMeetup,
  type Loan,
  type LoanItem,
  leaveMeetup,
  loanIssues,
  loanItems,
  loanState,
  type Meetup,
  meetupReady,
  newLoan,
  nextDateFor,
  rosterCsv,
} from "./campus-life";
import { type CouncilState, departmentOf, freshCouncil, hasDues } from "./council";
import { MyGroups } from "./GroupViews";
import {
  availableSpaces,
  type Booking,
  demoSpaces,
  type Profile,
  period,
  type SavedPlan,
  todayKst,
  transition,
  uid,
} from "./model";
import { NightGather } from "./NightViews";
import { graduationLeft, upcomingEvents } from "./roadmap-data";
import type { Season } from "./Spaces";
import { StepBox, shiftTime } from "./StepBox";

/** Exam card shows two weeks before the exam window until it ends, or always in exam demo mode. */
const examCard = (s: Season) => s.exam || (s.today <= s.end && daysBetween(s.today, s.start) <= 14);
export type BookPrefill = Partial<
  Pick<
    Booking,
    "date" | "start" | "end" | "count" | "purpose" | "spaceId" | "space" | "kind" | "members"
  >
>;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const dayName = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00+09:00`).getUTCDay()] ?? "";
const shortDate = (date: string) =>
  `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}(${dayName(date)})`;
const roundUp10 = (ms: number) => {
  const t = kstTime(ms);
  const m = Math.ceil(toMinutes(t) / 10) * 10;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const plusMinutes = (t: string, add: number) => {
  const m = Math.min(toMinutes(t) + add, 23 * 60 + 50);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, "0")}초`;
};

/* ───────────────────────── 말로 찾기 ───────────────────────── */

export function TalkSearch({
  bookings,
  onPick,
  compact = false,
}: {
  bookings: Booking[];
  onPick: (prefill: BookPrefill) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");
  const q = useMemo(() => (asked ? parseQuery(asked) : undefined), [asked]);
  const rooms = q ? suggestSpaces(q, bookings).slice(0, 4) : [];
  const examples = [
    "내일 오후 3시부터 2시간 4명 발표 연습, 모니터 필요",
    "금요일 7시 반 셋이 화이트보드",
  ];
  return (
    <section className="j-paper c-talk" aria-label="말로 공간 찾기">
      <div className="c-head">
        <Sparkles size={18} aria-hidden="true" />
        <h3>말로 찾기</h3>
      </div>
      <form
        className="c-talk-form"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(text);
        }}
      >
        <input
          aria-label="찾는 공간을 문장으로 입력"
          placeholder="예: 내일 3시 4명 발표 연습"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="j-primary" aria-label="찾기">
          <Search size={18} />
        </button>
      </form>
      {!compact && !asked && (
        <div className="c-chips">
          {examples.map((ex) => (
            <button
              type="button"
              key={ex}
              className="c-chip"
              onClick={() => {
                setText(ex);
                setAsked(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      {q && (
        <>
          <div className="c-chips">
            {q.understood.length ? (
              q.understood.map((u) => (
                <span className="c-chip c-chip-on" key={u}>
                  {u}
                </span>
              ))
            ) : (
              <span className="j-caption">날짜·시간·인원을 넣어 다시 말해 주세요.</span>
            )}
          </div>
          {!q.date || !q.start ? (
            <p className="j-caption">
              언제인지(예: 내일 3시) 알려 주면 비어 있는 방을 바로 보여 드려요.
            </p>
          ) : rooms.length ? (
            rooms.map((s) => (
              <button
                type="button"
                className="j-space-choice"
                key={s.id}
                onClick={() =>
                  onPick({
                    spaceId: s.id,
                    space: s.name,
                    date: q.date ?? "",
                    start: q.start ?? "",
                    end: q.end ?? "",
                    count: q.count ?? 2,
                    purpose: asked.trim().slice(0, 40),
                  })
                }
              >
                <MapPin />
                <span>
                  <b>{s.name}</b>
                  <small>
                    {shortDate(q.date ?? "")} {q.start}–{q.end} · 최대 {s.capacity}명
                    {amenitiesOf(s.id).length ? ` · ${amenitiesOf(s.id).join("·")}` : ""}
                  </small>
                </span>
                <ChevronRight />
              </button>
            ))
          ) : (
            <p className="j-caption">
              그 조건에 비어 있는 방이 없어요. 시간이나 인원을 바꿔 보세요.
            </p>
          )}
          <p className="j-caption">
            AI가 아니라 정해 둔 규칙으로 문장을 읽어요. 이해한 조건이 틀리면 직접 고쳐 주세요.
          </p>
        </>
      )}
    </section>
  );
}

/* ───────────────────────── 홈 ───────────────────────── */

export function CampusHome({
  profile,
  bookings,
  state,
  onBook,
  onOpenBooking,
  onClaim,
  onGo,
  season,
  onUpdate,
}: {
  profile: Profile;
  bookings: Booking[];
  state: CampusState;
  onBook: (prefill: BookPrefill) => void;
  onOpenBooking: (b: Booking) => void;
  onClaim: (w: WaitEntry) => void;
  onGo: (tab: "spaces" | "lending" | "meetups" | "study") => void;
  season?: Season | undefined;
  onUpdate: (b: Booking) => void;
}) {
  const now = Date.now();
  const today = todayKst();
  const mine = bookings
    .filter((b) => ["APPROVED", "CHECKED_IN", "REVIEW", "CHANGES"].includes(b.stage))
    .filter((b) => period(b)[1] > now)
    .sort(
      (a, b) =>
        Number(b.stage === "CHECKED_IN") - Number(a.stage === "CHECKED_IN") ||
        period(a)[0] - period(b)[0],
    );
  const next = mine[0];
  const offers = state.waitlist.filter(
    (w) => w.status === "OFFERED" && w.studentId === profile.studentId,
  );
  const startNow = roundUp10(now);
  const endNow = plusMinutes(startNow, 60);
  const freeNow =
    startNow < "21:00" ? availableSpaces(1, today, startNow, endNow, bookings, "INSTANT") : [];
  const dueLoans = state.loans.filter((l) =>
    ["OVERDUE", "DUE_TODAY", "RESERVED"].includes(loanState(l, today)),
  );
  const wd = new Date(`${today}T12:00:00+09:00`).getUTCDay();
  const gaps =
    wd >= 1 && wd <= 5 ? freeGaps(state.timetable, wd).filter((g) => g.end > kstTime(now)) : [];
  const gap = gaps[0];
  const events = upcomingEvents(new Date(now), 3);
  const pause = noShowPause(bookings, profile.studentId, now);
  const teamNotice = (state.groups ?? [])
    .flatMap((g) => g.notices.map((n) => ({ ...n, group: g.name })))
    .filter((n) => n.to.includes(profile.studentId) && now - Date.parse(n.at) < 3 * 86_400_000)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return (
    <div className="j-stack c-home">
      <header className="j-ov-head">
        <small>
          {season?.exam
            ? `${shortDate(season.today)} 기준 · 시험기간 체험 · ${profile.name}님`
            : `${shortDate(today)} · ${profile.name}님`}
        </small>
        <h1>오늘 캠퍼스, 어디서 모일까요?</h1>
      </header>
      {offers.map((w) => (
        <section className="j-paper c-offer" key={w.id} aria-live="polite">
          <b>대기하던 자리가 났어요</b>
          <p>
            {w.space} · {shortDate(w.date)} {w.start}–{w.end}
          </p>
          <p className="j-caption">
            {CLAIM_WINDOW_MIN}분 안에 확정하지 않으면 다음 대기자에게 넘어가요.
          </p>
          <button type="button" className="j-primary" onClick={() => onClaim(w)}>
            이 자리 확정하기
          </button>
        </section>
      ))}
      {season && examCard(season) && (
        <button
          type="button"
          className="j-ov-card c-next c-exam-card"
          onClick={() =>
            onBook({
              kind: "EXAM",
              date: season.today >= season.start ? season.today : season.start,
            })
          }
        >
          <Moon size={20} aria-hidden="true" />
          <span className="j-ov-grow">
            <small>
              {season.name} ·{" "}
              {season.today >= season.start
                ? `진행 중 (~${shortDate(season.end)})`
                : `D-${daysBetween(season.today, season.start)}`}
            </small>
            <b>
              {season.today >= season.start
                ? "오늘 밤 야간 상주 신청"
                : "시험기간 야간 상주 미리 보기"}
            </b>
            <small>학술정보관·상상베이스 등 시험기간 밤샘 공부 자리</small>
          </span>
          <ChevronRight size={18} />
        </button>
      )}
      {teamNotice && (
        <button
          type="button"
          className="j-ov-card c-next c-team-notice"
          onClick={() => onGo("meetups")}
        >
          <Bell size={18} aria-hidden="true" />
          <span className="j-ov-grow">
            <small>팀 알림 · {teamNotice.group}</small>
            <b>{teamNotice.text}</b>
          </span>
          <ChevronRight size={18} />
        </button>
      )}
      {pause && (
        <p className="j-warning">
          최근 30일 동안 체크인 없는 예약이 3번 반납돼 {pause}까지 새 예약을 쉬어요.
        </p>
      )}
      {next && (
        <StayCard
          key={`${next.id}-${next.stage}`}
          booking={next}
          onUpdate={onUpdate}
          onOpen={() => onOpenBooking(next)}
        />
      )}
      <TalkSearch bookings={bookings} onPick={onBook} compact />
      <section className="j-paper">
        <div className="c-head">
          <DoorOpen size={18} aria-hidden="true" />
          <h3>
            지금 비어 있는 곳 <small className="j-caption">{startNow}부터 1시간</small>
          </h3>
        </div>
        {freeNow.length ? (
          freeNow.slice(0, 3).map((s) => (
            <button
              type="button"
              className="j-menu-row"
              key={s.id}
              onClick={() =>
                onBook({
                  spaceId: s.id,
                  space: s.name,
                  date: today,
                  start: startNow,
                  end: endNow,
                  count: 2,
                })
              }
            >
              <span>
                <b>{s.name}</b>
                <small>
                  {s.building} · 최대 {s.capacity}명
                </small>
              </span>
              <ChevronRight size={18} />
            </button>
          ))
        ) : (
          <p className="j-caption">
            오늘은 바로 예약 가능한 시간이 끝났어요. 내일 시간을 골라 보세요.
          </p>
        )}
        <button type="button" className="j-link" onClick={() => onGo("spaces")}>
          공간 전체 보기
        </button>
      </section>
      {gap && (
        <button
          type="button"
          className="j-space-choice"
          onClick={() =>
            onBook({
              date: today,
              start: gap.start < kstTime(now) ? startNow : gap.start,
              end: gap.end,
              count: 1,
              purpose: "공강 시간 개인 공부",
            })
          }
        >
          <Clock />
          <span>
            <b>
              오늘 공강 {gap.start < kstTime(now) ? startNow : gap.start}–{gap.end}
            </b>
            <small>내 시간표 기준 · 이 시간에 비는 방 찾기</small>
          </span>
          <ChevronRight />
        </button>
      )}
      {dueLoans.length > 0 && (
        <button type="button" className="j-ov-card c-next" onClick={() => onGo("lending")}>
          <span className="j-ov-grow">
            <small>대여</small>
            <b>
              {dueLoans
                .map((l) =>
                  loanState(l, today) === "OVERDUE"
                    ? `${l.itemName} 반납 지남`
                    : loanState(l, today) === "DUE_TODAY"
                      ? `${l.itemName} 오늘 반납`
                      : `${l.itemName} ${shortDate(l.from)} 수령`,
                )
                .join(" · ")}
            </b>
          </span>
          <ChevronRight size={18} />
        </button>
      )}
      <section className="j-paper">
        <div className="c-head">
          <CalendarDays size={18} aria-hidden="true" />
          <h3>다가오는 학사일정</h3>
        </div>
        {events.map((e) => (
          <p className="c-event-line" key={`${e.name}-${e.start}`}>
            <b>{e.ongoing ? "진행 중" : `D-${e.daysLeft}`}</b>
            <span>
              {e.name}
              <small>
                {shortDate(e.start)}
                {e.end !== e.start ? ` ~ ${shortDate(e.end)}` : ""}
              </small>
            </span>
          </p>
        ))}
      </section>
      <div className="c-quick">
        <button type="button" onClick={() => onGo("lending")}>
          <Package size={20} />
          기자재·물품 빌리기
        </button>
        <button type="button" onClick={() => onGo("meetups")}>
          <Users size={20} />
          스터디·팀원 모으기
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── 홈: 입실·퇴실 ───────────────────────── */

const left = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`;
};
const kindName: Record<Booking["kind"], string> = {
  INSTANT: "공간 예약",
  ROOM: "강의실",
  NIGHT: "야간 잔류",
  EXAM: "시험기간 야간 상주",
};
/** The booking in use or coming up next, with 입실/퇴실 right on the home screen. */
export function StayCard({
  booking: b,
  onUpdate,
  onOpen,
}: {
  booking: Booking;
  onUpdate: (b: Booking) => void;
  onOpen: () => void;
}) {
  const [demoNow, setDemoNow] = useState<number | null>(null);
  const [companion, setCompanion] = useState("");
  const [error, setError] = useState("");
  const now = demoNow ?? Date.now();
  const [start, end] = period(b);
  const instant = b.kind === "INSTANT";
  const ci = instant ? checkInState(b, now) : undefined;
  const canEnter =
    b.stage === "APPROVED" &&
    (instant ? ci?.state === "OPEN" : now >= start - 10 * 60_000 && now < end);
  const waitingStart = b.stage === "APPROVED" && !canEnter && now < start;
  const when = `${shortDate(b.date)} ${b.start}–${b.endDate !== b.date ? "다음 날 " : ""}${b.end}`;
  const enter = () => {
    if (instant) {
      const r = checkIn(b, now, companion);
      if (r.error) setError(r.error);
      else onUpdate(r.booking);
    } else onUpdate(transition(b, "IN", "", Math.max(now, start)));
  };
  const leave = () =>
    onUpdate(
      instant && now < end ? earlyReturn(b, Math.max(now, start)) : transition(b, "OUT", "", now),
    );
  return (
    <section
      className={`j-ov-card c-stay${b.stage === "CHECKED_IN" ? " c-stay-in" : ""}`}
      aria-label="내 입실·퇴실"
    >
      <div className="c-stay-top">
        <span className="j-ov-grow">
          <small>
            {b.stage === "CHECKED_IN" ? "이용 중" : "다음 예약"} · {kindName[b.kind]}
          </small>
          <b>{b.space}</b>
          <small>{when}</small>
        </span>
        <button type="button" className="j-link" onClick={onOpen}>
          자세히
        </button>
      </div>
      {b.stage === "CHECKED_IN" ? (
        <>
          <p className="c-stay-line">
            {b.checkedIn?.length ? `${b.checkedIn.length}명 체크인 · ` : ""}
            {now < end ? `종료까지 ${left(end - now)}` : "종료 시간이 지났어요"}
          </p>
          <button type="button" className="j-primary" onClick={leave}>
            <DoorOpen size={18} aria-hidden="true" />
            퇴실하기
          </button>
          {instant && now < end && (
            <p className="j-caption">일찍 나가면 남은 시간은 다른 학생에게 다시 열려요.</p>
          )}
        </>
      ) : b.stage === "APPROVED" ? (
        <>
          <p className={canEnter ? "c-countdown" : "c-stay-line"}>
            {instant && ci?.state === "OPEN"
              ? `${mmss(ci.releaseAt - now)} 안에 입실하지 않으면 자동 반납돼요.`
              : canEnter
                ? "지금 입실할 수 있어요."
                : waitingStart
                  ? `시작 10분 전(${kstTime(start - 10 * 60_000)})부터 입실할 수 있어요.`
                  : "입실 시간이 지났어요."}
          </p>
          {canEnter && instant && needsCompanion(b) && (
            <input
              aria-label="함께 온 사람 학번"
              inputMode="numeric"
              placeholder="함께 온 사람 학번 (대리 입실 방지)"
              value={companion}
              onChange={(e) => setCompanion(e.target.value)}
            />
          )}
          <button type="button" className="j-primary" disabled={!canEnter} onClick={enter}>
            <DoorOpen size={18} aria-hidden="true" />
            입실하기
          </button>
          {error && <p className="j-error">{error}</p>}
          {waitingStart && (
            <button type="button" className="j-link" onClick={() => setDemoNow(start)}>
              데모: 시작 시각으로 이동
            </button>
          )}
        </>
      ) : (
        <p className="c-stay-line">
          {b.stage === "REVIEW"
            ? "승인을 기다리는 중이에요."
            : "보완 요청이 왔어요. 자세히를 눌러 고쳐 주세요."}
        </p>
      )}
    </section>
  );
}

/* ───────────────────────── 학교 공간 한눈에 ───────────────────────── */

const methodLabel: Record<string, string> = {
  ONLINE: "온라인 예약",
  FORM: "서식 제출",
  E_APPROVAL: "전자결재",
};

export function SpaceDirectory({ today = todayKst() }: { today?: string }) {
  const day = Number(today.slice(8, 10));
  const month = Number(today.slice(5, 7));
  const nextMonth = (month % 12) + 1;
  const gymNote =
    day <= 15
      ? `지금 ${nextMonth}월 체육관 우선 신청 기간이에요 (${month}월 15일까지).`
      : `다음 체육관 우선 신청은 ${nextMonth}월 1~15일 (${(nextMonth % 12) + 1}월 대관분).`;
  return (
    <details className="j-paper c-directory">
      <summary>
        <b>학교 예약 창구 {campus.channels.length}곳 한눈에</b>
        <small className="c-sub">지금은 공간마다 사이트·서식·결재가 따로예요</small>
      </summary>
      <p className="j-warning">{gymNote}</p>
      {campus.channels.map((c) => (
        <div className="c-channel" key={c.id}>
          <span className={`c-method c-method-${c.method.toLowerCase()}`}>
            {methodLabel[c.method] ?? c.method}
          </span>
          <span className="j-ov-grow">
            <b>{c.name}</b>
            <small>{c.covers.join(", ")}</small>
          </span>
          {c.url && (
            <a href={c.url} target="_blank" rel="noreferrer" aria-label={`${c.name} 학교 페이지`}>
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      ))}
      <details className="j-basis">
        <summary>승인·서식이 필요한 공간 규칙</summary>
        {campus.extraSpaces.map((s) => (
          <div key={s.id} className="c-rule">
            <b>{s.name}</b>
            <ul>
              {s.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ))}
      </details>
      <p className="j-caption">
        출처: {["learning", "sports", "halls", "rooms"].map((id) => sourceTitle(id)).join(" · ")} (
        {campus.collectedAt} 확인)
      </p>
    </details>
  );
}

/* ───────────────────────── 대기 ───────────────────────── */

export function WaitlistOffer({
  draft,
  profile,
  bookings,
  waitlist,
  onWaitlist,
}: {
  draft: Booking;
  profile: Profile;
  bookings: Booking[];
  waitlist: WaitEntry[];
  onWaitlist: (list: WaitEntry[], message?: string) => void;
}) {
  const fit = availableSpaces(draft.count, draft.date, draft.start, draft.end, [], "INSTANT");
  const free = new Set(
    availableSpaces(draft.count, draft.date, draft.start, draft.end, bookings, "INSTANT").map(
      (s) => s.id,
    ),
  );
  const full = fit.filter((s) => !free.has(s.id)).slice(0, 3);
  if (!full.length) return null;
  const mine = waitlist.filter(
    (w) => w.studentId === profile.studentId && w.date === draft.date && w.start === draft.start,
  );
  return (
    <section className="j-paper" aria-label="대기 걸기">
      <h3>꽉 찬 방에 대기 걸기</h3>
      <p className="j-caption">
        예약자가 {CHECKIN_GRACE_MIN}분 안에 체크인하지 않으면 자리가 반납되고, 먼저 대기한 순서대로{" "}
        {CLAIM_WINDOW_MIN}분 동안 확정할 기회를 드려요.
      </p>
      {full.map((s) => {
        const entry = mine.find(
          (w) => w.spaceId === s.id && ["WAITING", "OFFERED"].includes(w.status),
        );
        return (
          <div className="c-channel" key={s.id}>
            <span className="j-ov-grow">
              <b>{s.name}</b>
              <small>
                {draft.start}–{draft.end} ·{" "}
                {entry ? (entry.status === "OFFERED" ? "자리 났음" : "대기 중") : "예약 있음"}
              </small>
            </span>
            {entry ? (
              entry.status === "WAITING" && (
                <button
                  type="button"
                  className="j-link"
                  onClick={() => {
                    const r = offerReleased(waitlist, {
                      spaceId: s.id,
                      date: draft.date,
                      start: draft.start,
                      end: draft.end,
                    });
                    onWaitlist(
                      r.list,
                      r.offered
                        ? "데모: 예약자가 체크인하지 않아 자리가 났어요. 홈에서 확정하세요."
                        : undefined,
                    );
                  }}
                >
                  데모: 노쇼 발생
                </button>
              )
            ) : (
              <button
                type="button"
                className="j-secondary c-small-btn"
                onClick={() =>
                  onWaitlist(
                    joinWaitlist(waitlist, {
                      spaceId: s.id,
                      space: s.name,
                      date: draft.date,
                      start: draft.start,
                      end: draft.end,
                      count: draft.count,
                      studentId: profile.studentId,
                    }),
                    `${s.name} 대기에 올렸어요.`,
                  )
                }
              >
                대기
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ───────────────────────── 체크인 ───────────────────────── */

export function CheckInPanel({
  booking,
  bookings,
  onUpdate,
  onRelease,
  onBorrow,
}: {
  booking: Booking;
  bookings: Booking[];
  onUpdate: (b: Booking) => void;
  onRelease?: ((b: Booking, now: number) => string) | undefined;
  onBorrow?: ((b: Booking) => void) | undefined;
}) {
  const [demoNow, setDemoNow] = useState<number | null>(null);
  const [companion, setCompanion] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [present, setPresent] = useState(booking.count);
  const now = demoNow ?? Date.now();
  const st = checkInState(booking, now);
  const [start] = period(booking);
  const hint =
    booking.stage === "CHECKED_IN" ? resizeHint(booking, present, bookings, now) : undefined;
  return (
    <section className="j-paper c-checkin" aria-label="체크인">
      {booking.stage === "APPROVED" && (
        <>
          <h3>체크인</h3>
          <p className={st.state === "OPEN" ? "c-countdown" : "j-caption"}>
            {st.state === "NOT_YET"
              ? `시작 10분 전(${kstTime(st.opensAt)})부터 체크인할 수 있어요.`
              : st.state === "OPEN"
                ? `${mmss(st.releaseAt - now)} 안에 체크인하지 않으면 자동 반납돼요.`
                : "체크인 시간이 지났어요."}
          </p>
          {needsCompanion(booking) && st.state === "OPEN" && (
            <label className="j-field">
              함께 온 사람 학번 (대리 체크인 방지)
              <input
                inputMode="numeric"
                value={companion}
                onChange={(e) => setCompanion(e.target.value)}
                placeholder="동반자가 자기 휴대폰에서 입력"
              />
            </label>
          )}
          {st.state === "OPEN" && (
            <button
              type="button"
              className="j-primary"
              onClick={() => {
                const r = checkIn(booking, now, companion);
                if (r.error) setError(r.error);
                else onUpdate(r.booking);
              }}
            >
              <DoorOpen size={18} />
              체크인
            </button>
          )}
          {st.state === "RELEASED" && onRelease && (
            <button
              type="button"
              className="j-primary"
              onClick={() => setMessage(onRelease(booking, now))}
            >
              자동 반납 처리 보기
            </button>
          )}
          {error && <p className="j-error">{error}</p>}
          <div className="c-demo-time">
            <small>데모 시각</small>
            <button
              type="button"
              className="j-link"
              onClick={() => {
                setError("");
                setDemoNow(start - 5 * 60_000);
              }}
            >
              시작 5분 전
            </button>
            <button
              type="button"
              className="j-link"
              onClick={() => {
                setError("");
                setDemoNow(start + (CHECKIN_GRACE_MIN + 1) * 60_000);
              }}
            >
              체크인 없이 {CHECKIN_GRACE_MIN + 1}분 지남
            </button>
          </div>
          {onBorrow && (
            <button type="button" className="j-secondary" onClick={() => onBorrow(booking)}>
              이 시간에 쓸 기자재 함께 빌리기
            </button>
          )}
        </>
      )}
      {booking.stage === "CHECKED_IN" && (
        <>
          <h3>이용 중</h3>
          <label className="j-field">
            지금 와 있는 인원
            <input
              type="number"
              min={1}
              max={booking.count}
              value={present}
              onChange={(e) => setPresent(Number(e.target.value))}
            />
          </label>
          {hint && (
            <p className="j-warning">
              {present}명이면 {hint.space.name}(최대 {hint.space.capacity}명)이 {hint.from}–
              {hint.to} 비어 있어요. 옮기면 이 방을 더 큰 팀이 쓸 수 있어요.
            </p>
          )}
          <button
            type="button"
            className="j-secondary"
            onClick={() => {
              onUpdate(earlyReturn(booking, Math.max(now, start)));
            }}
          >
            일찍 끝내고 남은 시간 반납
          </button>
          <button type="button" className="j-link" onClick={() => setDemoNow(start + 60 * 60_000)}>
            데모 시각: 시작 1시간 뒤
          </button>
        </>
      )}
      {message && <output className="j-feedback">{message}</output>}
    </section>
  );
}

/* ───────────────────────── 대여 ───────────────────────── */

export function Lending({
  profile,
  state,
  onChange,
  prefill,
  initialSource = "PARK",
}: {
  profile: Profile;
  state: CampusState;
  onChange: (s: CampusState) => void;
  prefill?: { from: string; to: string; bookingId?: string } | undefined;
  initialSource?: "PARK" | "ITROOM" | "COUNCIL";
}) {
  const today = todayKst();
  const [source, setSource] = useState<"PARK" | "ITROOM" | "COUNCIL">(initialSource);
  const [verifying, setVerifying] = useState(false);
  const council = state.council ?? freshCouncil();
  const setCouncil = (c: CouncilState) => onChange({ ...state, council: c });
  const myDept = departmentOf(profile);
  const councilIssue = (i: LoanItem) => {
    if (i.source !== "COUNCIL" || !i.scope) return "";
    if (i.scope !== "TOTAL" && i.scope !== myDept)
      return `${i.scope} 학생회 물품이라 ${i.scope} 학생만 빌릴 수 있어요.`;
    if (!hasDues(council, i.scope))
      return i.scope === "TOTAL"
        ? "총학생회비 납부 인증이 필요해요 (2024.4.1부터 납부자 한정)."
        : `${i.scope} 학생회비 납부 인증이 필요해요.`;
    return "";
  };
  const [itemId, setItemId] = useState("");
  const [from, setFrom] = useState(prefill?.from ?? addDays(today, 1));
  const [to, setTo] = useState(prefill?.to ?? addDays(today, 1));
  const [qty, setQty] = useState(1);
  const [issues, setIssues] = useState<string[]>([]);
  const [done, setDone] = useState("");
  const item = loanItems.find((i) => i.id === itemId);
  const items = loanItems.filter((i) => i.source === source);
  const update = (loan: Loan, patch: Partial<Loan>) =>
    onChange({
      ...state,
      loans: state.loans.map((l) => (l.id === loan.id ? { ...l, ...patch } : l)),
    });
  return (
    <div className="j-stack">
      <p className="j-eyebrow">SHARE</p>
      <h1>필요한 물건, 학교에서 빌려요</h1>
      {prefill?.bookingId && (
        <p className="j-feedback">
          예약한 공간 이용일({shortDate(prefill.from)})에 맞춰 날짜를 넣었어요.
        </p>
      )}
      <div className="j-tabs c-seg">
        {(
          [
            ["PARK", "상상파크"],
            ["ITROOM", "통합기자재실"],
            ["COUNCIL", "학생회 물품"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={source === id}
            onClick={() => {
              setSource(id);
              setItemId("");
              setIssues([]);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="j-caption">
        {source === "PARK"
          ? `창의융합교육지원센터 · 평일 ${campus.equipmentHours.term.join("–")} (방학 ${campus.equipmentHours.vacation.join("–")}) 대여·반납`
          : source === "ITROOM"
            ? `${campus.itRoom.location} ${campus.itRoom.name} · 평일 ${campus.itRoom.hours.term.join("–")} (방학 ${campus.itRoom.hours.vacation.join("–")}) · ${campus.itRoom.eligibility} · ${campus.itRoom.penalty}`
            : `${campus.councilItems.operator} · ${campus.councilItems.eligibility}`}
      </p>
      {source === "COUNCIL" &&
        (verifying ? (
          <CouncilVerify
            profile={profile}
            council={council}
            onChange={setCouncil}
            onDone={() => setVerifying(false)}
          />
        ) : (
          <CouncilStatus profile={profile} council={council} onVerify={() => setVerifying(true)} />
        ))}
      <div className="j-time-pair">
        <label>
          빌리는 날
          <StepBox
            type="date"
            label="빌리는 날"
            value={from}
            onChange={(v) => {
              setFrom(v);
              if (v > to) setTo(v);
            }}
          />
        </label>
        <label>
          반납하는 날
          <StepBox
            type="date"
            label="반납하는 날"
            min={from}
            value={to}
            onChange={(v) => setTo(v)}
          />
        </label>
      </div>
      <div className="c-items">
        {items.map((i) => {
          const left = availableQty(i, from, to < from ? from : to, state.loans);
          return (
            <button
              type="button"
              key={i.id}
              className={`c-item${itemId === i.id ? " c-item-on" : ""}`}
              aria-pressed={itemId === i.id}
              disabled={i.onsite}
              onClick={() => {
                setItemId(i.id);
                setQty(1);
                setIssues([]);
                setDone("");
              }}
            >
              <b>{i.name}</b>
              {i.source === "COUNCIL" && i.scope && (
                <span className={`c-lock${councilIssue(i) ? "" : " c-lock-ok"}`}>
                  {councilIssue(i)
                    ? i.scope !== "TOTAL" && i.scope !== myDept
                      ? "다른 학과 전용"
                      : "인증 필요"
                    : "빌릴 수 있음"}
                </span>
              )}
              <small>
                {i.onsite
                  ? "센터 안에서만 사용"
                  : `남은 ${left}/${i.qty}${i.qtyVerified ? "" : " · 데모 수량"}`}
              </small>
              <small>{i.category}</small>
            </button>
          );
        })}
      </div>
      {item && (
        <section className="j-paper">
          <h3>{item.name}</h3>
          <p className="j-caption">{item.rule}</p>
          <label className="j-field">
            수량
            <input
              type="number"
              min={1}
              max={item.qty}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="j-primary"
            onClick={() => {
              const found = loanIssues(item, { from, to, qty }, state.loans, {
                duesPaid: true,
                councilIssue: councilIssue(item),
              });
              setIssues(found);
              if (found.length) return;
              onChange({
                ...state,
                loans: [
                  newLoan(item, {
                    from,
                    to,
                    qty,
                    ...(prefill?.bookingId ? { bookingId: prefill.bookingId } : {}),
                  }),
                  ...state.loans,
                ],
              });
              setDone(`${item.name} ${qty}개를 ${shortDate(from)}에 받을 수 있게 예약했어요.`);
              setItemId("");
            }}
          >
            대여 예약 · 데모
          </button>
        </section>
      )}
      {issues.map((m) => (
        <p className="j-error" key={m}>
          {m}
        </p>
      ))}
      {done && <output className="j-feedback">{done}</output>}
      <h2>내 대여</h2>
      {state.loans.length ? (
        state.loans.map((l) => {
          const s = loanState(l, today);
          return (
            <section className="j-paper c-loan" key={l.id}>
              <div className="j-row">
                <b className="j-ov-grow">
                  {l.itemName} × {l.qty}
                </b>
                <span className={`c-badge c-badge-${s.toLowerCase()}`}>
                  {
                    {
                      RESERVED: "수령 전",
                      PICKED_UP: "사용 중",
                      RETURNED: "반납 완료",
                      CANCELLED: "취소",
                      OVERDUE: "반납 지남",
                      DUE_TODAY: "오늘 반납",
                    }[s]
                  }
                </span>
              </div>
              <small>
                {shortDate(l.from)} ~ {shortDate(l.to)}
                {l.bookingId ? " · 공간 예약과 연결" : ""}
              </small>
              <div className="j-row">
                {l.status === "RESERVED" && (
                  <>
                    <button
                      type="button"
                      className="j-link"
                      onClick={() => update(l, { status: "PICKED_UP" })}
                    >
                      수령 확인 · 데모
                    </button>
                    <button
                      type="button"
                      className="j-link"
                      onClick={() => update(l, { status: "CANCELLED" })}
                    >
                      취소
                    </button>
                  </>
                )}
                {l.status === "PICKED_UP" && (
                  <button
                    type="button"
                    className="j-link"
                    onClick={() =>
                      update(l, { status: "RETURNED", returnedAt: new Date().toISOString() })
                    }
                  >
                    반납 확인 · 데모
                  </button>
                )}
              </div>
            </section>
          );
        })
      ) : (
        <p className="j-caption">아직 빌린 물품이 없어요.</p>
      )}
      {source === "COUNCIL" && (
        <CouncilAdmin profile={profile} council={council} onChange={setCouncil} />
      )}
      <p className="j-caption">
        수량·규칙 출처: {sourceTitle("parkgear")}, {sourceTitle("itlaptop")},{" "}
        {sourceTitle("news599")}. “데모 수량”은 공개 자료에 없어 임의로 정한 값이에요.
      </p>
    </div>
  );
}

/* ───────────────────────── 모임·행사 ───────────────────────── */

function Qr({ text }: { text: string }) {
  const src = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createDataURL(6, 8);
  }, [text]);
  return <img className="c-qr" src={src} alt="출석 QR 코드" />;
}

export function Meetups({
  profile,
  state,
  onChange,
  onBook,
  bookings,
  onBookGroup,
  onBookNight,
  onOpenBooking,
}: {
  profile: Profile;
  state: CampusState;
  onChange: (s: CampusState) => void;
  onBook: (prefill: BookPrefill, meetupId: string) => void;
  bookings: Booking[];
  onBookGroup: (prefill: BookPrefill, groupId: string) => void;
  onBookNight: (prefill: BookPrefill, postId: string) => void;
  onOpenBooking: (b: Booking) => void;
}) {
  const today = todayKst();
  const me = { name: profile.name, studentId: profile.studentId };
  const [mode, setMode] = useState<"groups" | "meetups" | "night" | "events">("groups");
  const [form, setForm] = useState<
    (Omit<Meetup, "id" | "host" | "members" | "tags"> & { tags: string }) | null
  >(null);
  const [eventForm, setEventForm] = useState<{ title: string; place: string; date: string } | null>(
    null,
  );
  const [openEvent, setOpenEvent] = useState("");
  const [att, setAtt] = useState({ name: "", studentId: "", token: "" });
  const [attMsg, setAttMsg] = useState("");
  const setMeetup = (m: Meetup) =>
    onChange({ ...state, meetups: state.meetups.map((x) => (x.id === m.id ? m : x)) });
  const setEvent = (e: CampusEvent) =>
    onChange({ ...state, events: state.events.map((x) => (x.id === e.id ? e : x)) });
  return (
    <div className="j-stack">
      <p className="j-eyebrow">TOGETHER</p>
      <h1>모이고, 공간까지 한 번에</h1>
      <div className="j-tabs c-seg">
        <button type="button" aria-pressed={mode === "groups"} onClick={() => setMode("groups")}>
          내 팀
        </button>
        <button type="button" aria-pressed={mode === "meetups"} onClick={() => setMode("meetups")}>
          모집
        </button>
        <button type="button" aria-pressed={mode === "night"} onClick={() => setMode("night")}>
          야간잔류
        </button>
        <button type="button" aria-pressed={mode === "events"} onClick={() => setMode("events")}>
          행사 QR
        </button>
      </div>
      {mode === "groups" ? (
        <MyGroups
          profile={profile}
          state={state}
          bookings={bookings}
          onChange={onChange}
          onBook={onBookGroup}
          onOpenBooking={onOpenBooking}
        />
      ) : mode === "night" ? (
        <NightGather
          profile={profile}
          state={state}
          bookings={bookings}
          onChange={onChange}
          onBook={onBookNight}
          onOpenBooking={onOpenBooking}
        />
      ) : mode === "meetups" ? (
        <>
          {!form && (
            <button
              type="button"
              className="j-secondary"
              onClick={() =>
                setForm({
                  title: "",
                  kind: "STUDY",
                  needed: 3,
                  date: addDays(today, 2),
                  start: "18:00",
                  end: "20:00",
                  tags: "",
                })
              }
            >
              모집 글 쓰기
            </button>
          )}
          {form && (
            <section className="j-paper j-fields">
              <label>
                무엇을 하나요
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="예: 토익 스터디"
                />
              </label>
              <label>
                종류
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as Meetup["kind"] })}
                >
                  <option value="STUDY">스터디</option>
                  <option value="TEAM">팀 프로젝트</option>
                  <option value="CLUB">소모임</option>
                </select>
              </label>
              <label>
                모일 인원 (나 포함)
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={form.needed}
                  onChange={(e) => setForm({ ...form, needed: Number(e.target.value) })}
                />
              </label>
              <label>
                날짜
                <StepBox
                  type="date"
                  label="날짜"
                  value={form.date}
                  onChange={(v) => setForm({ ...form, date: v })}
                />
              </label>
              <div className="j-time-pair">
                <label>
                  시작
                  <StepBox
                    type="time"
                    label="시작"
                    value={form.start}
                    onChange={(v) => setForm({ ...form, start: v })}
                    onStep={(d) =>
                      setForm({
                        ...form,
                        start: shiftTime(form.start, d),
                        end: shiftTime(form.end, d) || form.end,
                      })
                    }
                  />
                </label>
                <label>
                  종료
                  <StepBox
                    type="time"
                    label="종료"
                    value={form.end}
                    onChange={(v) => setForm({ ...form, end: v })}
                  />
                </label>
              </div>
              <label>
                태그 (쉼표로 구분)
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="자격증, 주 1회"
                />
              </label>
              <button
                type="button"
                className="j-primary"
                disabled={!form.title.trim() || form.end <= form.start || form.date < today}
                onClick={() => {
                  onChange({
                    ...state,
                    meetups: [
                      {
                        ...form,
                        id: uid(),
                        title: form.title.trim(),
                        host: profile.name,
                        members: [me],
                        tags: form.tags
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      },
                      ...state.meetups,
                    ],
                  });
                  setForm(null);
                }}
              >
                올리기
              </button>
              <button type="button" className="j-link" onClick={() => setForm(null)}>
                취소
              </button>
            </section>
          )}
          {state.meetups.map((m) => {
            const joined = m.members.some((x) => x.studentId === me.studentId);
            const ready = meetupReady(m);
            return (
              <section className="j-paper c-meetup" key={m.id}>
                <div className="j-row">
                  <span className="c-badge">
                    {{ STUDY: "스터디", TEAM: "팀", CLUB: "소모임" }[m.kind]}
                  </span>
                  <b className="j-ov-grow">{m.title}</b>
                  <small>
                    {m.members.length}/{m.needed}명
                  </small>
                </div>
                <small>
                  {shortDate(m.date)} {m.start}–{m.end} · {m.host}
                  {m.tags.length ? ` · ${m.tags.join(" · ")}` : ""}
                </small>
                <div className="c-bar" aria-hidden="true">
                  <span
                    style={{ width: `${Math.min(100, (m.members.length / m.needed) * 100)}%` }}
                  />
                </div>
                <div className="j-row">
                  {joined ? (
                    m.host !== profile.name && (
                      <button
                        type="button"
                        className="j-link"
                        onClick={() => setMeetup(leaveMeetup(m, me.studentId))}
                      >
                        참여 취소
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      className="j-secondary c-small-btn"
                      disabled={ready}
                      onClick={() => setMeetup(joinMeetup(m, me))}
                    >
                      {ready ? "모집 완료" : "참여하기"}
                    </button>
                  )}
                  {joined && ready && !m.bookingId && (
                    <button
                      type="button"
                      className="j-primary c-small-btn"
                      onClick={() =>
                        onBook(
                          {
                            date: m.date,
                            start: m.start,
                            end: m.end,
                            count: m.members.length,
                            purpose: m.title,
                          },
                          m.id,
                        )
                      }
                    >
                      다 모였어요 · 공간 잡기
                    </button>
                  )}
                  {m.bookingId && <small className="c-badge c-badge-returned">공간 예약됨</small>}
                </div>
              </section>
            );
          })}
          <p className="j-caption">“예시 학생” 글은 화면을 보여 주기 위한 데모 글이에요.</p>
        </>
      ) : (
        <>
          <p className="j-caption">
            종이 명단 대신 QR로 출석을 받으면 시각이 남고 같은 학번은 한 번만 기록돼요. 학생회
            감사에서 지적된 명단 양식 오용·수기 명단 문제({sourceTitle("news624").split(" ")[0]}{" "}
            624호)를 줄이려는 기능이에요.
          </p>
          {!eventForm && (
            <button
              type="button"
              className="j-secondary"
              onClick={() => setEventForm({ title: "", place: "", date: today })}
            >
              행사 만들기
            </button>
          )}
          {eventForm && (
            <section className="j-paper j-fields">
              <label>
                행사 이름
                <input
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                />
              </label>
              <label>
                장소
                <input
                  value={eventForm.place}
                  onChange={(e) => setEventForm({ ...eventForm, place: e.target.value })}
                />
              </label>
              <label>
                날짜
                <StepBox
                  type="date"
                  label="날짜"
                  value={eventForm.date}
                  onChange={(v) => setEventForm({ ...eventForm, date: v })}
                />
              </label>
              <button
                type="button"
                className="j-primary"
                disabled={!eventForm.title.trim()}
                onClick={() => {
                  const ev: CampusEvent = {
                    id: uid(),
                    ...eventForm,
                    title: eventForm.title.trim(),
                    host: profile.name,
                    token: eventToken(),
                    attendees: [],
                  };
                  onChange({ ...state, events: [ev, ...state.events] });
                  setOpenEvent(ev.id);
                  setEventForm(null);
                }}
              >
                만들고 QR 띄우기
              </button>
            </section>
          )}
          {state.events.map((ev) => (
            <section className="j-paper c-event" key={ev.id}>
              <button
                type="button"
                className="j-menu-row"
                onClick={() => setOpenEvent(openEvent === ev.id ? "" : ev.id)}
              >
                <span>
                  <b>{ev.title}</b>
                  <small>
                    {shortDate(ev.date)} {ev.place} · 출석 {ev.attendees.length}명
                    {ev.closedAt ? " · 마감" : ""}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
              {openEvent === ev.id && (
                <>
                  {!ev.closedAt && (
                    <>
                      <Qr text={`hansung-mate:attend:${ev.id}:${ev.token}`} />
                      <p className="c-token">
                        출석 코드 <b>{ev.token}</b>
                      </p>
                    </>
                  )}
                  <div className="j-fields">
                    <p className="j-caption">
                      참가자 휴대폰 화면 (데모: QR을 찍으면 코드가 자동으로 들어가요)
                    </p>
                    <label>
                      이름
                      <input
                        value={att.name}
                        onChange={(e) => setAtt({ ...att, name: e.target.value })}
                      />
                    </label>
                    <label>
                      학번
                      <input
                        inputMode="numeric"
                        value={att.studentId}
                        onChange={(e) => setAtt({ ...att, studentId: e.target.value })}
                      />
                    </label>
                    <label>
                      출석 코드
                      <input
                        value={att.token}
                        onChange={(e) => setAtt({ ...att, token: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="j-secondary"
                      onClick={() => {
                        const r = attend(ev, att, att.token);
                        if (r.error) setAttMsg(r.error);
                        else {
                          setEvent(r.event);
                          setAttMsg(`${att.name.trim()}님 출석했어요.`);
                          setAtt({ name: "", studentId: "", token: "" });
                        }
                      }}
                    >
                      출석하기
                    </button>
                    {attMsg && <output className="j-feedback">{attMsg}</output>}
                  </div>
                  <ol className="c-roster">
                    {ev.attendees.map((a) => (
                      <li key={a.studentId}>
                        {a.name} · {a.studentId.slice(0, 4)}*** ·{" "}
                        {new Date(a.at).toLocaleTimeString("ko-KR", {
                          timeZone: "Asia/Seoul",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </li>
                    ))}
                  </ol>
                  <div className="j-row">
                    {!ev.closedAt && (
                      <button
                        type="button"
                        className="j-link"
                        onClick={() => setEvent({ ...ev, closedAt: new Date().toISOString() })}
                      >
                        출석 마감
                      </button>
                    )}
                    <button
                      type="button"
                      className="j-link"
                      disabled={!ev.attendees.length}
                      onClick={() => {
                        const blob = new Blob([rosterCsv(ev)], { type: "text/csv;charset=utf-8" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `${ev.title}-출석명단.csv`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                    >
                      명단 CSV 내려받기
                    </button>
                  </div>
                </>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── 학업 (가벼운 버전) ───────────────────────── */

export function StudyLite({
  profile,
  academic,
  plan,
  state,
  onChange,
  onBook,
}: {
  profile: Profile;
  academic: AcademicData;
  plan: SavedPlan | undefined;
  state: CampusState;
  onChange: (s: CampusState) => void;
  onBook: (prefill: BookPrefill) => void;
}) {
  const today = todayKst();
  const [block, setBlock] = useState<Omit<ClassBlock, "id">>({
    day: 1,
    start: "09:00",
    end: "10:30",
    title: "",
  });
  const [query, setQuery] = useState("");
  let left: number | undefined;
  try {
    left = profile.track1
      ? graduationLeft(profile, academic, profile, plan?.items ?? [])
      : undefined;
  } catch {
    left = undefined;
  }
  const found =
    query.trim().length >= 2
      ? catalogCourses
          .filter(
            (c) => c.name.includes(query.trim()) || c.code.includes(query.trim().toUpperCase()),
          )
          .slice(0, 8)
      : [];
  const events = upcomingEvents(new Date(), 5);
  return (
    <div className="j-stack">
      <p className="j-eyebrow">STUDY</p>
      <h1>이번 학기, 가볍게</h1>
      <section className="j-ov-card c-grad">
        <small>졸업까지</small>
        <p>
          {left === undefined ? (
            "내 정보에서 트랙을 고르면 남은 학점을 보여 드려요."
          ) : (
            <>
              <b>{Math.round(left / 1000)}학점</b> 남았어요
              <small className="c-grad-tracks">
                {[profile.track1, profile.track2].filter(Boolean).join(" + ")}
              </small>
            </>
          )}
        </p>
        <small className="j-caption">
          공식 졸업 판정이 아니에요. 이수 기록은 내 정보에서 고칠 수 있어요.
        </small>
      </section>
      <section className="j-paper">
        <h3>내 시간표와 공강</h3>
        {[1, 2, 3, 4, 5].map((d) => {
          const blocks = state.timetable
            .filter((b) => b.day === d)
            .sort((a, b) => a.start.localeCompare(b.start));
          const gaps = freeGaps(state.timetable, d, 90);
          return (
            <div className="c-day" key={d}>
              <b>{WEEKDAYS[d]}</b>
              <div className="c-day-body">
                <div className="c-day-row">
                  {blocks.map((b) => (
                    <span className="c-class" key={b.id}>
                      {b.start}–{b.end} {b.title}
                      <button
                        type="button"
                        aria-label={`${b.title} 삭제`}
                        onClick={() =>
                          onChange({
                            ...state,
                            timetable: state.timetable.filter((x) => x.id !== b.id),
                          })
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {!blocks.length && <small className="j-caption">수업 없음</small>}
                </div>
                {gaps.length > 0 && (
                  <div className="c-day-row">
                    {gaps.slice(0, 2).map((g) => (
                      <button
                        type="button"
                        className="c-gap"
                        key={g.start}
                        onClick={() =>
                          onBook({
                            date: nextDateFor(d, today),
                            start: g.start,
                            end: g.end > "21:00" ? "21:00" : g.end,
                            count: 1,
                            purpose: "공강 시간 개인 공부",
                          })
                        }
                      >
                        공강 {g.start}–{g.end} · 빈 방
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <details className="j-basis">
          <summary>수업 추가</summary>
          <div className="j-fields">
            <label>
              과목
              <input
                value={block.title}
                onChange={(e) => setBlock({ ...block, title: e.target.value })}
              />
            </label>
            <label>
              요일
              <select
                value={block.day}
                onChange={(e) => setBlock({ ...block, day: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAYS[d]}요일
                  </option>
                ))}
              </select>
            </label>
            <label>
              건물
              <select
                value={block.building ?? ""}
                onChange={(e) => setBlock({ ...block, building: e.target.value })}
              >
                <option value="">모름</option>
                {[...new Set(demoSpaces.map((sp) => sp.building.split(/\s|A동/)[0] ?? ""))]
                  .filter(Boolean)
                  .map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
              </select>
            </label>
            <div className="j-time-pair">
              <label>
                시작
                <StepBox
                  type="time"
                  label="시작"
                  value={block.start}
                  onChange={(v) => setBlock({ ...block, start: v })}
                />
              </label>
              <label>
                종료
                <StepBox
                  type="time"
                  label="종료"
                  value={block.end}
                  onChange={(v) => setBlock({ ...block, end: v })}
                />
              </label>
            </div>
            <button
              type="button"
              className="j-secondary"
              disabled={!block.title.trim() || block.end <= block.start}
              onClick={() => {
                onChange({
                  ...state,
                  timetable: [
                    ...state.timetable,
                    { ...block, title: block.title.trim(), id: uid() },
                  ],
                });
                setBlock({ ...block, title: "" });
              }}
            >
              시간표에 넣기
            </button>
          </div>
        </details>
      </section>
      <section className="j-paper">
        <h3>과목 찾기</h3>
        <input
          className="c-search"
          aria-label="과목 이름 또는 코드"
          placeholder="과목 이름이나 코드 (2자 이상)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {found.map((c) => (
          <div className="c-channel" key={c.code}>
            <span className="j-ov-grow">
              <b>{c.name}</b>
              <small>
                {c.code} · {c.creditMilli / 1000}학점 ·{" "}
                {[...new Set(c.mappings.map((m) => m.track))].slice(0, 2).join(", ")}
              </small>
            </span>
            <span className={`c-badge${isOffered(c.code) ? " c-badge-returned" : ""}`}>
              {isOffered(c.code) ? `${offeringTerm} 개설` : "이번 학기 미개설"}
            </span>
          </div>
        ))}
        {query.trim().length >= 2 && !found.length && (
          <p className="j-caption">찾는 과목이 없어요.</p>
        )}
      </section>
      <section className="j-paper">
        <h3>학사일정</h3>
        {events.map((e) => (
          <p className="c-event-line" key={`${e.name}-${e.start}`}>
            <b>{e.ongoing ? "진행 중" : `D-${e.daysLeft}`}</b>
            <span>
              {e.name}
              <small>
                {shortDate(e.start)}
                {e.end !== e.start ? ` ~ ${shortDate(e.end)}` : ""}
              </small>
            </span>
          </p>
        ))}
      </section>
    </div>
  );
}

/* ───────────────────────── 운영 현황 ───────────────────────── */

export function CampusInsights({ bookings }: { bookings: Booking[] }) {
  const h = loungeHeatmap();
  const m = bookingMetrics(bookings);
  return (
    <details className="j-paper c-insights">
      <summary>
        <b>운영자 보기 · 공간 이용 현황</b>
        <small className="c-sub">학교 공개 예약 달력 분석</small>
      </summary>
      <h3>
        코딩라운지 세미나실 이용률{" "}
        <small className="j-caption">
          {h.month} · 예약 {h.slots}건
        </small>
      </h3>
      <table className="c-heat" aria-label="요일별 시간대 이용률">
        <thead>
          <tr>
            <th scope="col" />
            {h.hours.map((hr) => (
              <th scope="col" key={hr}>
                {hr}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {h.grid.map((row, d) => (
            <tr key={h.weekdays[d]}>
              <th scope="row">{h.weekdays[d]}</th>
              {row.map((v, i) => (
                <td key={h.hours[i]} title={`${h.weekdays[d]} ${h.hours[i]}시 ${v}%`}>
                  <span style={{ opacity: 0.12 + (v / 100) * 0.88 }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        가장 붐비는 때:{" "}
        <b>
          {h.weekdays[h.peak.day]}요일 {h.peak.hour}시
        </b>{" "}
        ({h.peak.value}%). 같은 시간 다른 층·건물의 빈 방을 먼저 보여 주면 몰림을 나눌 수 있어요.
      </p>
      <div className="j-admin-metrics c-metrics">
        <span>
          <b>{m.total}</b>
          <small>지난 바로 예약</small>
        </span>
        <span>
          <b>{m.noShowRate}%</b>
          <small>노쇼 자동 반납</small>
        </span>
        <span>
          <b>{m.recoveredHours}시간</b>
          <small>다시 풀린 시간</small>
        </span>
      </div>
      <p className="j-caption">
        위 숫자는 이 기기 데모 예약 기준이에요. 이용률은 {sourceTitle("learning")}에 공개된
        코딩라운지 예약 달력을 모은 값이에요.
      </p>
      <h3>왜 필요한가요</h3>
      <ul className="c-facts">
        {campus.pressure.map((p) => (
          <li key={p.fact}>
            {p.fact}{" "}
            <a href={sourceUrl(p.source)} target="_blank" rel="noreferrer">
              출처
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

export { demoSpaces };
