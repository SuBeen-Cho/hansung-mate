import {
  ArrowLeft,
  Check,
  ChevronRight,
  DoorOpen,
  FileText,
  MapPin,
  Moon,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type BookPrefill,
  CampusInsights,
  CheckInPanel,
  SpaceDirectory,
  TalkSearch,
  WaitlistOffer,
} from "./CampusViews";
import { ChoiceField } from "./ChoiceField";
import { ConfirmDialog } from "./ConfirmDialog";
import { addDays, BOOKING_HORIZON_DAYS, fairUseIssues, rankSpaces, type WaitEntry } from "./campus";
import type { ClassBlock } from "./campus-life";
import { submitCloudApplication } from "./cloud";
import { archiveDocument, documentHash, readDocument } from "./documents";
import { readDraft, SPACE_DRAFT_KEY, useDraftStorage } from "./drafts";
import { MonthCalendar } from "./MonthCalendar";
import {
  academicCalendar,
  alternativeTimes,
  availableSpaces,
  type Booking,
  examSpaceInfo,
  examWindowFor,
  fillDemoMembers,
  type Kind,
  kindLabel,
  type Member,
  maxInstantCapacity,
  migrateBooking,
  nextDate,
  nightStayRules,
  observedCalendarMonth,
  ownOverlap,
  type Profile,
  patchBooking,
  period,
  stageLabel,
  todayKst,
  transition,
  uid,
  validateBooking,
  validateSearch,
} from "./model";
import { CLASSROOM_NIGHT_ID } from "./NightViews";
import { PdfPreview } from "./PdfPreview";
import { StepBox, shiftTime } from "./StepBox";
import { exportSignature } from "./signature";

const createApplicationPdf = (booking: Booking) =>
  import("./pdf").then((module) => module.createApplicationPdf(booking));
const downloadPdf = async (bytes: Uint8Array, name: string) =>
  (await import("./pdf")).downloadPdf(bytes, name);

function Signature({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const down = useRef(false);
  const [typed, setTyped] = useState("");
  function point(event: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) * 600) / rect.width,
      ((event.clientY - rect.top) * 180) / rect.height,
    ];
  }
  return (
    <section className="j-sign">
      <h3>신청인 서명</h3>
      <p className="j-caption">
        손가락으로 서명하거나, 키보드 입력으로 데모 서명을 만들 수 있어요.
      </p>
      <canvas
        ref={ref}
        width={600}
        height={180}
        aria-label="서명 그리기 영역"
        onPointerDown={(e) => {
          const ctx = ref.current?.getContext("2d");
          if (!ctx) return;
          down.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const [x, y] = point(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.strokeStyle = "#191f28";
          ctx.lineWidth = 7;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
        }}
        onPointerMove={(e) => {
          if (!down.current) return;
          const ctx = ref.current?.getContext("2d");
          const [x, y] = point(e);
          ctx?.lineTo(x, y);
          ctx?.stroke();
        }}
        onPointerUp={() => {
          if (!down.current) return;
          down.current = false;
          if (ref.current) onChange(exportSignature(ref.current));
        }}
        onPointerCancel={() => {
          down.current = false;
        }}
      />
      <label className="j-field">
        서명 이름 입력
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} />
      </label>
      <div className="j-row j-wrap">
        <button
          className="j-secondary"
          type="button"
          disabled={typed.trim() !== name.trim()}
          onClick={() => {
            const c = ref.current;
            const ctx = c?.getContext("2d");
            if (!c || !ctx) return;
            ctx.clearRect(0, 0, 600, 180);
            ctx.font = '700 52px "Noto Sans KR", sans-serif';
            ctx.fillStyle = "#191f28";
            ctx.fillText(typed.trim(), 28, 108, 544);
            onChange(exportSignature(c));
          }}
        >
          입력한 이름으로 데모 서명
        </button>
        <button
          className="j-link"
          type="button"
          onClick={() => {
            ref.current?.getContext("2d")?.clearRect(0, 0, 600, 180);
            onChange("");
          }}
        >
          지우기
        </button>
      </div>
      {value && (
        <p className="j-caption">서명이 입력됐어요. 실제 학교의 전자서명 인증과는 별개입니다.</p>
      )}
    </section>
  );
}
function BookingSchedule({
  booking,
}: {
  booking: Pick<Booking, "date" | "endDate" | "start" | "end" | "count">;
}) {
  const [start, end] = period(booking);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const dateLabel = (value: number) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(value);
  const minutes = (end - start) / 60000;
  const duration =
    `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}시간` : ""}${minutes % 60 ? ` ${minutes % 60}분` : ""}`.trim();
  const overnight = booking.date !== booking.endDate;
  return (
    <section className="j-schedule" aria-label="예약 일정 요약">
      <p className="j-schedule-date">{dateLabel(start)}</p>
      <div className="j-schedule-time">
        <time dateTime={`${booking.date}T${booking.start}+09:00`}>{booking.start}</time>
        <span aria-hidden="true">—</span>
        <div>
          {overnight && (
            <small>{booking.endDate === nextDate(booking.date) ? "다음 날" : dateLabel(end)}</small>
          )}
          <time dateTime={`${booking.endDate}T${booking.end}+09:00`}>{booking.end}</time>
        </div>
      </div>
      <p className="j-schedule-meta">
        총 {duration} · {booking.count}명 이용 <span>한국 시간</span>
      </p>
    </section>
  );
}
export function BookingDetail({
  booking,
  onUpdate,
  onEdit,
  onRebook,
  bookings = [],
  onRelease,
  onBorrow,
}: {
  booking: Booking;
  onUpdate: (b: Booking) => void;
  onEdit: (b: Booking) => void;
  onRebook: (b: Booking) => void;
  bookings?: Booking[];
  onRelease?: ((b: Booking, now: number) => string) | undefined;
  onBorrow?: ((b: Booking) => void) | undefined;
}) {
  const [admin, setAdmin] = useState(false);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [demoNow, setDemoNow] = useState<number | null>(null);
  const now = demoNow ?? Date.now();
  const canEnter = now >= period(booking)[0] && now < period(booking)[1];
  const [noteField, setNoteField] = useState<NonNullable<Booking["noteField"]>>("purpose");
  const [note, setNote] = useState("사용 목적을 조금 더 자세히 적어 주세요.");
  const [pdfError, setPdfError] = useState("");
  const [busy, setBusy] = useState(false);
  async function download(revision = booking.revisions?.at(-1)) {
    setBusy(true);
    setPdfError("");
    try {
      if (revision) {
        const saved = await readDocument(revision.documentId);
        if (!saved)
          throw new Error(
            "이 기기에 해당 버전의 PDF가 없어요. 계정 백업에서 문서를 복원하거나 원래 기기에서 다운로드해 주세요.",
          );
        if ((await documentHash(saved.bytes)) !== revision.sha256)
          throw new Error("문서 무결성을 확인하지 못했어요.");
        await downloadPdf(saved.bytes, `${booking.id}-r${revision.revision}.pdf`);
      } else {
        const pdf = await createApplicationPdf(booking);
        await downloadPdf(pdf, `${booking.id}-regenerated-r${booking.revision}.pdf`);
      }
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "PDF를 생성하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="j-stack">
      <div className="j-complete">
        <Check size={32} />
        <h1>{stageLabel[booking.stage]}</h1>
        <span className="j-tag">데모 · 실제 학교 예약 아님</span>
      </div>
      <section className="j-ticket">
        <p className="j-eyebrow">{kindLabel[booking.kind]}</p>
        <h2>{booking.space}</h2>
        <BookingSchedule booking={booking} />
        <div className="j-row">
          <span>
            {booking.count}명 · {booking.applicant}
          </span>
          <b>수정 {booking.revision}차</b>
        </div>
        <p>{booking.purpose}</p>
        <small>{booking.id.slice(0, 23)}</small>
      </section>
      {booking.stage === "CHANGES" && (
        <section className="j-paper">
          <h3>보완할 내용</h3>
          <p>{booking.note}</p>
          <button type="button" className="j-primary" onClick={() => onEdit(booking)}>
            내용 수정하고 다시 제출
          </button>
        </section>
      )}
      {booking.stage === "REVIEW" && (
        <>
          <p>담당자가 신청 내용을 확인하고 있어요.</p>
          <button className="j-secondary" type="button" onClick={() => setAdmin(!admin)}>
            관리자 처리 체험
          </button>
          {admin && (
            <section className="j-paper">
              <h3>관리자 화면 · 데모</h3>
              <ChoiceField
                label="보완할 항목"
                value={noteField}
                onChange={(v) => setNoteField(v as NonNullable<Booking["noteField"]>)}
                options={[
                  { value: "purpose", label: "사용 목적" },
                  { value: "members", label: "참여자 명단" },
                  { value: "phone", label: "연락처" },
                  { value: "schedule", label: "이용 일정" },
                ]}
              />
              <label className="j-field">
                보완 요청 내용
                <textarea value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="j-row j-wrap">
                <button
                  className="j-secondary"
                  type="button"
                  disabled={!note.trim()}
                  onClick={() => onUpdate({ ...transition(booking, "CHANGES", note), noteField })}
                >
                  보완 요청 보내기
                </button>
                <button
                  className="j-primary"
                  type="button"
                  onClick={() => onUpdate(transition(booking, "APPROVE"))}
                >
                  승인하기
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {booking.kind === "INSTANT" && ["APPROVED", "CHECKED_IN"].includes(booking.stage) && (
        <CheckInPanel
          booking={booking}
          bookings={bookings}
          onUpdate={onUpdate}
          onRelease={onRelease}
          onBorrow={onBorrow}
        />
      )}
      {booking.stage === "APPROVED" && booking.kind !== "INSTANT" && (
        <section className="j-paper">
          <p className="j-caption">
            {demoNow
              ? "데모 시각: 예약 시작 시각으로 이동했어요."
              : "입실은 예약 시작부터 종료 전까지 가능해요."}
          </p>
          {!canEnter && (
            <button
              type="button"
              className="j-secondary"
              onClick={() => setDemoNow(period(booking)[0])}
            >
              예약 시작 시간으로 데모 시각 이동
            </button>
          )}
        </section>
      )}
      {booking.stage === "APPROVED" && booking.kind !== "INSTANT" && (
        <button
          className="j-primary"
          type="button"
          disabled={!canEnter}
          onClick={() => onUpdate(transition(booking, "IN", "", now))}
        >
          <DoorOpen size={18} />
          입실 확인 · 데모
        </button>
      )}
      {booking.stage === "CHECKED_IN" && (
        <>
          <button
            className="j-secondary"
            type="button"
            disabled={booking.reminder}
            onClick={() => onUpdate(transition(booking, "REMIND"))}
          >
            종료 10분 전 알림 체험
          </button>
          {booking.reminder && (
            <output className="j-feedback">
              곧 이용 시간이 끝나요. 정리 후 퇴실을 확인해 주세요. <small>앱 내 알림 시연</small>
            </output>
          )}
          <button
            className="j-primary"
            type="button"
            onClick={() => onUpdate(transition(booking, "OUT"))}
          >
            퇴실 확인
          </button>
        </>
      )}
      {["REVIEW", "APPROVED"].includes(booking.stage) && (
        <button type="button" className="j-secondary" onClick={() => onEdit(booking)}>
          예약 내용 변경하기
        </button>
      )}
      <button type="button" className="j-secondary" onClick={() => onRebook(booking)}>
        같은 내용으로 새 예약
      </button>
      {["ROOM", "NIGHT"].includes(booking.kind) && (
        <button className="j-secondary" type="button" disabled={busy} onClick={() => download()}>
          <FileText size={18} />
          {busy ? "PDF 준비 중…" : "내 신청서 PDF 다운로드"}
        </button>
      )}
      {["ROOM", "NIGHT"].includes(booking.kind) && !booking.revisions?.length && (
        <p className="j-caption">
          이전 데모의 문서는 당시 PDF가 보관되지 않아 현재 내용으로 재생성됩니다.
        </p>
      )}
      {!!booking.revisions?.length && (
        <details className="j-paper">
          <summary>제출한 문서 버전 · {booking.revisions.length}개</summary>
          {booking.revisions.map((revision, index) => {
            const previous = booking.revisions?.[index - 1];
            return (
              <section className="j-plan-item" key={revision.documentId}>
                <b>{revision.revision}차 제출</b>
                <small>
                  {new Date(revision.submittedAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                </small>
                <p>
                  {revision.fields.date} {revision.fields.start}–{revision.fields.end} ·{" "}
                  {revision.fields.count}명
                </p>
                {previous && (
                  <p className="j-caption">
                    변경 항목:{" "}
                    {(
                      [
                        "purpose",
                        "date",
                        "endDate",
                        "start",
                        "end",
                        "count",
                        "space",
                        "members",
                        "applicant",
                        "studentId",
                        "department",
                        "phone",
                        "professor",
                      ] as const
                    )
                      .filter(
                        (key) =>
                          JSON.stringify(previous.fields[key]) !==
                          JSON.stringify(revision.fields[key]),
                      )
                      .map(
                        (key) =>
                          ({
                            purpose: "사용 목적",
                            date: "시작 날짜",
                            endDate: "종료 날짜",
                            start: "시작 시간",
                            end: "종료 시간",
                            count: "인원",
                            space: "장소",
                            members: "명단",
                            applicant: "신청인",
                            studentId: "학번",
                            department: "소속",
                            phone: "연락처",
                            professor: "지도교수",
                          })[key],
                      )
                      .join(", ") || "입력 항목 동일 · 재서명"}
                  </p>
                )}
                {revision.storage === "SESSION" && (
                  <p className="j-error">
                    이 PDF는 현재 창에만 보관돼요. 창을 닫기 전에 다운로드해 주세요.
                  </p>
                )}
                <button
                  className="j-link"
                  type="button"
                  disabled={busy}
                  onClick={() => download(revision)}
                >
                  {revision.revision}차 원본 PDF 다운로드
                </button>
                <small className="j-caption">SHA-256 {revision.sha256.slice(0, 12)}…</small>
              </section>
            );
          })}
        </details>
      )}
      {pdfError && (
        <p role="alert" className="j-error">
          {pdfError}
        </p>
      )}
      <details open>
        <summary>신청 처리 기록</summary>
        <ol className="j-events">
          {booking.events.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <b>{e.label}</b>
              <small>{new Date(e.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</small>
            </li>
          ))}
        </ol>
      </details>
      {["REVIEW", "CHANGES", "APPROVED"].includes(booking.stage) && (
        <button className="j-link" type="button" onClick={() => setCancelAsk(true)}>
          이 데모 신청 취소
        </button>
      )}
      {cancelAsk && (
        <ConfirmDialog
          title="이 신청을 취소할까요?"
          confirmLabel="신청 취소 확정"
          onCancel={() => setCancelAsk(false)}
          onConfirm={() => {
            onUpdate(transition(booking, "CANCEL"));
            setCancelAsk(false);
          }}
        >
          <p>
            {booking.space} · {booking.date} {booking.start}–{booking.end}
          </p>
          <p>처리 기록과 제출한 PDF는 보관돼요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
const CLASSROOM_BUILDINGS = ["미래관", "우촌관", "탐구관", "진리관"];
/** The school lists free classrooms per building; the form needs one building + room. */
function ClassroomPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (space: string) => void;
}) {
  const m = value.match(/^(미래관|우촌관|탐구관|진리관) ([A-Z]?\d{2,4})호$/);
  const [building, setBuilding] = useState(m?.[1] ?? "");
  const [room, setRoom] = useState(m?.[2] ?? "");
  const update = (b: string, r: string) => {
    setBuilding(b);
    setRoom(r);
    const clean = r.trim().toUpperCase().replace(/호$/, "");
    onChange(b && /^[A-Z]?\d{2,4}$/.test(clean) ? `${b} ${clean}호` : "강의실");
  };
  return (
    <div className="j-time-pair c-classroom">
      <label>
        강의실 건물
        <select value={building} onChange={(e) => update(e.target.value, room)}>
          <option value="">건물 선택</option>
          {CLASSROOM_BUILDINGS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label>
        호실
        <input
          inputMode="text"
          placeholder="예: 304"
          maxLength={6}
          value={room}
          onChange={(e) => update(building, e.target.value)}
        />
      </label>
    </div>
  );
}
function blankBooking(profile: Profile, kind: Kind): Booking {
  const today = todayKst();
  const time = ["NIGHT", "EXAM"].includes(kind) ? "22:00" : "17:00";
  const date = Date.parse(`${today}T${time}:00+09:00`) <= Date.now() ? nextDate(today) : today;
  return {
    id: `DEMO-${uid()}`,
    mode: "DEMO",
    kind,
    spaceId: "",
    space: "",
    date,
    endDate: kind === "NIGHT" || kind === "EXAM" ? nextDate(date) : date,
    start: kind === "NIGHT" || kind === "EXAM" ? "22:00" : "17:00",
    end: kind === "NIGHT" || kind === "EXAM" ? "08:00" : "19:00",
    purpose: "팀 프로젝트 준비",
    count: kind === "NIGHT" || kind === "EXAM" ? 1 : 5,
    applicant: profile.name,
    studentId: profile.studentId,
    department: profile.track1,
    phone: "010-0000-0000",
    professor: "",
    members: [
      { id: uid(), name: profile.name, studentId: profile.studentId, department: profile.track1 },
    ],
    signature: "",
    stage: "REVIEW",
    revision: 1,
    note: "",
    events: [],
    reminder: false,
  };
}
function fromPrefill(profile: Profile, p: BookPrefill) {
  const overnight = p.kind === "NIGHT" || p.kind === "EXAM";
  return patchBooking(blankBooking(profile, p.kind ?? "INSTANT"), {
    ...p,
    ...(p.date ? { endDate: overnight ? nextDate(p.date) : p.date } : {}),
  });
}
export type Season = { exam: boolean; name: string; start: string; end: string; today: string };
type SpaceDraft = { draft: Booking; view: "search" | "form" | "preview" };
function isSpaceDraft(value: unknown): value is SpaceDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as SpaceDraft;
  return (
    ["search", "form", "preview"].includes(d.view) &&
    !!d.draft &&
    typeof d.draft.id === "string" &&
    typeof d.draft.purpose === "string" &&
    Array.isArray(d.draft.members)
  );
}
export function Spaces({
  profile,
  bookings,
  onUpsert,
  initialBooking,
  prefill,
  waitlist = [],
  onWaitlist,
  onRelease,
  onBorrow,
  onBooked,
  season,
  favorites = [],
  onFavorites,
  timetable = [],
}: {
  profile: Profile;
  bookings: Booking[];
  onUpsert: (b: Booking) => void;
  initialBooking?: Booking | undefined;
  prefill?: BookPrefill | undefined;
  waitlist?: WaitEntry[];
  onWaitlist?: ((list: WaitEntry[], message?: string) => void) | undefined;
  onRelease?: ((b: Booking, now: number) => string) | undefined;
  onBorrow?: ((b: Booking) => void) | undefined;
  onBooked?: ((b: Booking) => void) | undefined;
  season?: Season | undefined;
  favorites?: string[];
  onFavorites?: ((ids: string[]) => void) | undefined;
  timetable?: ClassBlock[];
}) {
  const [sortMode, setSortMode] = useState<"pref" | "size">("pref");
  const [restored] = useState(() =>
    initialBooking || prefill ? null : readDraft(SPACE_DRAFT_KEY, isSpaceDraft),
  );
  const [waitNote, setWaitNote] = useState("");
  const [view, setView] = useState<"menu" | "search" | "form" | "preview" | "detail">(
    initialBooking
      ? "detail"
      : prefill
        ? prefill.spaceId || prefill.kind === "NIGHT" || prefill.kind === "EXAM"
          ? "form"
          : "search"
        : restored
          ? restored.view === "preview"
            ? "form"
            : restored.view
          : "menu",
  );
  const [draft, setDraft] = useState<Booking>(
    () =>
      initialBooking ??
      (prefill
        ? fromPrefill(profile, prefill)
        : restored
          ? { ...migrateBooking(restored.draft, false), signature: "" }
          : blankBooking(profile, "INSTANT")),
  );
  const [working, setWorking] = useState(!!restored || !!prefill);
  const draftError = useDraftStorage(
    SPACE_DRAFT_KEY,
    {
      draft: { ...draft, signature: "" },
      view:
        view === "menu"
          ? draft.space
            ? "form"
            : ["NIGHT", "EXAM"].includes(draft.kind)
              ? "form"
              : "search"
          : view,
    },
    working,
  );
  const [active, setActive] = useState(initialBooking?.id ?? restored?.draft.id ?? "");
  const [searched, setSearched] = useState(
    !!prefill && !prefill.spaceId && prefill.kind !== "NIGHT" && prefill.kind !== "EXAM",
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [location, setLocation] = useState(false);
  const [cloudNotice, setCloudNotice] = useState("");
  const [demoNow, setDemoNow] = useState<number | null>(null);
  const pdfGeneration = useRef(0);
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const issue = errors[0];
    if (!issue || !formRef.current) return;
    const keyword = issue.includes("장소")
      ? "상주 장소"
      : issue.includes("목적")
        ? "사용 목적"
        : issue.includes("연락처")
          ? "연락처"
          : issue.includes("학번")
            ? "학번"
            : issue.includes("이름")
              ? "신청인"
              : issue.includes("종료")
                ? "종료 시간"
                : issue.includes("날짜")
                  ? "이용 날짜"
                  : issue.includes("인원")
                    ? "이용 인원"
                    : "";
    const label = Array.from(formRef.current.querySelectorAll("label")).find(
      (node) => node.textContent?.trim() === keyword,
    );
    const field =
      label?.querySelector<HTMLElement>("input,select,textarea") ??
      Array.from(formRef.current.querySelectorAll<HTMLButtonElement>("button")).find(
        (node) =>
          (
            node.getAttribute("aria-label") ??
            node
              .getAttribute("aria-labelledby")
              ?.split(" ")
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ")
          )?.startsWith(keyword) && keyword,
      );
    field?.focus();
    field?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [errors]);
  useEffect(() => {
    if (!pdf) {
      setPdfUrl("");
      return;
    }
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdf]);
  useEffect(() => {
    if (view !== "form" || draft.stage !== "CHANGES") return;
    const selector =
      draft.noteField === "members"
        ? ".j-member input"
        : draft.noteField === "schedule"
          ? "input[type=date]"
          : draft.noteField === "phone"
            ? "input[data-field=phone]"
            : "input[data-field=purpose]";
    const field = formRef.current?.querySelector<HTMLElement>(selector);
    field?.focus();
    field?.scrollIntoView?.({ block: "center" });
  }, [view, draft.stage, draft.noteField]);
  function change(patch: Partial<Booking>) {
    setDraft((prev) => patchBooking(prev, patch));
    setDemoNow(null);
    pdfGeneration.current++;
    setBusy(false);
    if (
      patch.spaceId !== undefined ||
      patch.date !== undefined ||
      patch.endDate !== undefined ||
      patch.start !== undefined ||
      patch.end !== undefined
    )
      setLocation(false);
    setPdf(null);
    setAgree(false);
    setErrors([]);
    setSearched(false);
  }
  function begin(kind: Kind) {
    setWorking(true);
    pdfGeneration.current++;
    setBusy(false);
    const blank = blankBooking(profile, kind);
    setDraft(
      kind === "EXAM" && season?.exam
        ? { ...blank, date: season.today, endDate: nextDate(season.today) }
        : blank,
    );
    setDemoNow(null);
    setSearched(false);
    setErrors([]);
    setPdf(null);
    setAgree(false);
    setLocation(false);
    setView(kind === "NIGHT" || kind === "EXAM" ? "form" : "search");
  }
  function edit(b: Booking) {
    setWorking(true);
    pdfGeneration.current++;
    setBusy(false);
    setDraft({ ...b, signature: "", revision: b.revision + 1 });
    setActive(b.id);
    setPdf(null);
    setAgree(false);
    setErrors([]);
    setView(
      ["INSTANT", "ROOM"].includes(b.kind) && b.noteField !== "purpose" && b.stage !== "CHANGES"
        ? "search"
        : "form",
    );
  }
  function rebook(b: Booking) {
    const date = nextDate(todayKst());
    setWorking(true);
    setActive("");
    setAgree(false);
    setPdf(null);
    setErrors([]);
    setSearched(false);
    setLocation(false);
    pdfGeneration.current++;
    setBusy(false);
    setDraft({
      ...b,
      id: uid(),
      date,
      endDate: ["NIGHT", "EXAM"].includes(b.kind) ? nextDate(date) : date,
      signature: "",
      stage: "REVIEW",
      revision: 1,
      revisions: [],
      note: "",
      events: [],
      reminder: false,
    });
    setView(["INSTANT", "ROOM"].includes(b.kind) ? "search" : "form");
  }
  async function preview() {
    const issues = validateBooking(draft, demoNow ?? Date.now());
    setErrors(issues);
    if (issues.length) return;
    setView("preview");
    setPdf(null);
  }
  async function renderPdf() {
    const generation = ++pdfGeneration.current;
    setBusy(true);
    setErrors([]);
    try {
      const result = await createApplicationPdf(draft);
      if (generation === pdfGeneration.current) setPdf(result);
    } catch (e) {
      if (generation === pdfGeneration.current)
        setErrors([e instanceof Error ? e.message : "PDF 생성 실패"]);
    } finally {
      if (generation === pdfGeneration.current) setBusy(false);
    }
  }
  async function submit() {
    const issues = validateBooking(draft, demoNow ?? Date.now());
    if (issues.length) {
      setErrors(issues);
      return;
    }
    if (draft.kind === "INSTANT") {
      const fair = fairUseIssues(
        draft,
        bookings.filter((b) => b.id !== draft.id),
        demoNow ?? Date.now(),
      );
      if (fair.length) {
        setErrors(fair);
        return;
      }
    }
    if (["ROOM", "NIGHT"].includes(draft.kind) && (!draft.signature || !agree || !pdf)) {
      setErrors(["서명과 PDF 미리보기, 내용 확인을 마쳐 주세요."]);
      return;
    }
    if (
      ["INSTANT", "ROOM"].includes(draft.kind) &&
      bookings.some(
        (b) =>
          b.id !== draft.id &&
          b.spaceId === draft.spaceId &&
          !["CANCELLED", "CHECKED_OUT"].includes(b.stage) &&
          b.date === draft.date &&
          b.start < draft.end &&
          draft.start < b.end,
      )
    ) {
      setErrors(["이 시간에 다른 데모 예약이 있어요. 시간을 다시 선택해 주세요."]);
      return;
    }
    const mine = ownOverlap(draft, bookings);
    if (mine) {
      setErrors([
        `같은 시간에 이미 ${mine.space} 예약이 있어요(${mine.date} ${mine.start}–${mine.end}). 한 사람이 여러 공간을 동시에 잡을 수 없어요.`,
      ]);
      return;
    }
    const now = new Date().toISOString();
    const original = bookings.find((b) => b.id === draft.id);
    const booking: Booking = {
      ...draft,
      stage:
        draft.kind === "EXAM" ? "CHECKED_IN" : draft.kind === "INSTANT" ? "APPROVED" : "REVIEW",
      note: "",
      events: [
        ...(original?.events ?? []),
        {
          label: original
            ? original.stage === "CHANGES"
              ? "보완 후 다시 제출"
              : `예약 내용 변경${draft.kind === "INSTANT" ? " 완료" : " · 재승인 대기"}`
            : draft.kind === "EXAM"
              ? "위치 확인 및 야간 상주 입실 · 데모"
              : draft.kind === "INSTANT"
                ? "예약 완료"
                : "서명한 신청서 제출",
          at: now,
        },
      ],
    };
    if (pdf && ["ROOM", "NIGHT"].includes(draft.kind)) {
      setBusy(true);
      try {
        const stored = await archiveDocument(`${booking.id}:r${booking.revision}`, pdf);
        booking.revisions = [
          ...(original?.revisions ?? []),
          {
            revision: booking.revision,
            submittedAt: now,
            documentId: stored.document.id,
            sha256: stored.document.sha256,
            storage: stored.storage,
            template: booking.kind === "ROOM" ? "classroom-v1" : "overnight-v1",
            fields: {
              purpose: booking.purpose,
              date: booking.date,
              endDate: booking.endDate,
              start: booking.start,
              end: booking.end,
              count: booking.count,
              space: booking.space,
              members: booking.members.map((m) => ({ ...m })),
              applicant: booking.applicant,
              studentId: booking.studentId,
              department: booking.department,
              phone: booking.phone,
              professor: booking.professor,
            },
          },
        ];
      } catch (error) {
        setErrors([error instanceof Error ? error.message : "문서 보관에 실패했어요."]);
        return;
      } finally {
        setBusy(false);
      }
    }
    onUpsert(booking);
    onBooked?.(booking);
    setWorking(false);
    setActive(booking.id);
    setView("detail");
    // Account mode: also place the request in the shared reviewer queue. Local demo is unaffected.
    submitCloudApplication(booking)
      .then((id) => id && setCloudNotice("계정에 연결된 공유 신청함에도 제출했어요."))
      .catch(() => setCloudNotice("공유 신청함 제출에 실패했어요. 이 기기에는 저장됐어요."));
  }
  function updateMember(id: string, patch: Partial<Member>) {
    const members = draft.members.map((m) => (m.id === id ? { ...m, ...patch } : m));
    change({ members, count: members.length });
  }
  const matches0 = availableSpaces(
    draft.count,
    draft.date,
    draft.start,
    draft.end,
    bookings.filter((b) => b.id !== draft.id),
    draft.kind === "ROOM" ? "ROOM" : "INSTANT",
  );
  const matches = matches0;
  const ranked =
    sortMode === "pref"
      ? rankSpaces(matches, { draft, bookings, favorites, timetable })
      : [...matches]
          .sort((a, b) => a.capacity - b.capacity)
          .map((space) => ({ space, score: 0, reasons: [] as string[] }));
  const nightRows = [
    <button key="EXAM" className="j-menu-row" type="button" onClick={() => begin("EXAM")}>
      시험기간 야간 상주
      <ChevronRight size={19} />
    </button>,
    <button key="NIGHT" className="j-menu-row" type="button" onClick={() => begin("NIGHT")}>
      평소 야간 잔류 신청
      <ChevronRight size={19} />
    </button>,
  ];
  const nightSection = (
    <section className={`j-paper${season?.exam ? " c-exam-first" : ""}`}>
      <div className="c-head">
        <Moon size={18} aria-hidden="true" />
        <h3>늦은 시간까지 함께해요</h3>
      </div>
      {season?.exam ? nightRows : [...nightRows].reverse()}
    </section>
  );
  if (view === "menu")
    return (
      <div className="j-stack">
        <p className="j-eyebrow">CAMPUS SPACES</p>
        <h1>어떤 공간이 필요해요?</h1>
        <TalkSearch
          bookings={bookings}
          onPick={(p) => {
            setWorking(true);
            setDraft(fromPrefill(profile, p));
            setErrors([]);
            setView("form");
          }}
        />
        {season?.exam && (
          <>
            <p className="c-season-note">
              {season.name} 기간이에요 ({Number(season.start.slice(5, 7))}.
              {Number(season.start.slice(8))}~{Number(season.end.slice(5, 7))}.
              {Number(season.end.slice(8))}). 밤샘 공부 자리부터 보여 드려요.
            </p>
            {nightSection}
          </>
        )}
        {working && (
          <section className="j-paper">
            <h3>작성 중인 신청이 있어요</h3>
            <p>
              {kindLabel[draft.kind]} · {draft.purpose || "목적 입력 전"}
            </p>
            <button
              className="j-primary"
              type="button"
              onClick={() =>
                setView(draft.space || ["NIGHT", "EXAM"].includes(draft.kind) ? "form" : "search")
              }
            >
              작성하던 신청 이어하기
            </button>
            <button className="j-link" type="button" onClick={() => setWorking(false)}>
              임시 신청 지우기
            </button>
          </section>
        )}
        <button className="j-space-choice" type="button" onClick={() => begin("INSTANT")}>
          <MapPin />
          <span>
            <b>빈 공간 바로 예약</b>
            <small>날짜·시간·인원으로 한 번에 찾아요</small>
          </span>
          <ChevronRight />
        </button>
        <button className="j-space-choice" type="button" onClick={() => begin("ROOM")}>
          <FileText />
          <span>
            <b>강의실·승인 신청</b>
            <small>서류 작성부터 담당자 승인까지</small>
          </span>
          <ChevronRight />
        </button>
        {!season?.exam && nightSection}
        <SpaceDirectory />
        <CampusInsights bookings={bookings} />
        <p className="j-caption">모든 예약·승인·위치 확인은 데모로 작동합니다.</p>
      </div>
    );
  if (view === "detail") {
    const b = bookings.find((b) => b.id === active);
    return (
      <div className="j-stack">
        <button className="j-back" type="button" onClick={() => setView("menu")}>
          <ArrowLeft size={18} />
          공간
        </button>
        {cloudNotice && <output className="j-feedback">{cloudNotice}</output>}
        {b ? (
          <BookingDetail
            key={`${b.id}-${b.stage}`}
            booking={b}
            onUpdate={onUpsert}
            onEdit={edit}
            onRebook={rebook}
            bookings={bookings}
            onRelease={onRelease}
            onBorrow={onBorrow}
          />
        ) : (
          <p>신청 내역을 찾지 못했어요.</p>
        )}
      </div>
    );
  }
  return (
    <div className="j-stack j-enter" key={view} ref={formRef}>
      <button
        className="j-back"
        type="button"
        onClick={() => {
          setErrors([]);
          pdfGeneration.current++;
          setBusy(false);
          if (view === "form" && ["INSTANT", "ROOM"].includes(draft.kind)) setSearched(true);
          setView(
            view === "preview"
              ? "form"
              : draft.stage === "CHANGES"
                ? "detail"
                : view === "form" && ["INSTANT", "ROOM"].includes(draft.kind)
                  ? "search"
                  : "menu",
          );
        }}
      >
        <ArrowLeft size={18} />
        이전
      </button>
      {bookings.some((b) => b.id === draft.id) && (
        <section className="j-paper">
          <p>변경을 제출하기 전까지 기존 예약은 그대로 유지돼요.</p>
          <button
            className="j-link"
            type="button"
            onClick={() => {
              setWorking(false);
              setActive(draft.id);
              setView("detail");
            }}
          >
            변경 취소하고 기존 예약 보기
          </button>
        </section>
      )}
      <p className="j-eyebrow">{kindLabel[draft.kind]} · 데모</p>
      <p className={draftError ? "j-error" : "j-caption"} role={draftError ? "alert" : undefined}>
        {draftError
          ? "임시 저장을 사용할 수 없어요. 저장 공간을 확인해 주세요."
          : restored
            ? "작성 내용을 복원했어요. 서명과 제출 확인은 다시 진행해 주세요."
            : "입력 내용은 이 브라우저에 임시 저장해요."}
      </p>
      {view === "search" ? (
        <>
          <h1>언제, 몇 명이 모이나요?</h1>
          <div className="j-reservation-fields">
            <label>
              사용 목적
              <input
                data-field="purpose"
                value={draft.purpose}
                onChange={(e) => change({ purpose: e.target.value })}
              />
            </label>
            <label>
              이용 인원
              <input
                type="number"
                min={1}
                max={200}
                value={draft.count}
                onChange={(e) => change({ count: Number(e.target.value) })}
              />
            </label>
            <MonthCalendar
              label="이용 날짜"
              today={todayKst()}
              min={todayKst()}
              max={addDays(todayKst(), BOOKING_HORIZON_DAYS)}
              value={draft.date}
              onChange={(v) => change({ date: v, endDate: v })}
            />
            <div className="j-time-pair">
              <label>
                시작 시간
                <StepBox
                  type="time"
                  label="시작 시간"
                  value={draft.start}
                  onChange={(v) => change({ start: v })}
                  onStep={(d) => {
                    const end = shiftTime(draft.end, d);
                    change({ start: shiftTime(draft.start, d), ...(end ? { end } : {}) });
                  }}
                />
              </label>
              <label>
                종료 시간
                <StepBox
                  type="time"
                  label="종료 시간"
                  value={draft.end}
                  onChange={(v) => change({ end: v })}
                />
              </label>
            </div>
          </div>
          <button
            className="j-primary"
            type="button"
            onClick={() => {
              const issues = validateSearch(draft);
              setErrors(issues);
              if (issues.length) return;
              setSearched(true);
            }}
          >
            가능한 공간 찾기
          </button>
          {searched && (
            <>
              <h2>조건에 맞는 공간 {matches.length}곳</h2>
              <p className="j-caption">
                학교 공개 공간 목록(2026.10.26 수집)과 코딩라운지 공개 예약 달력(
                {observedCalendarMonth}) 패턴, 내 신청 내역을 함께 확인했어요. 실제 예약은 각 운영
                부서 시스템에서 확정돼요.
              </p>
              {matches.length > 1 && (
                <div className="j-tabs c-seg c-sort">
                  <button
                    type="button"
                    aria-pressed={sortMode === "pref"}
                    onClick={() => setSortMode("pref")}
                  >
                    내 선호순
                  </button>
                  <button
                    type="button"
                    aria-pressed={sortMode === "size"}
                    onClick={() => setSortMode("size")}
                  >
                    작은 방부터
                  </button>
                </div>
              )}
              {ranked.map(({ space: s, reasons }) => (
                <div className="c-result" key={s.id}>
                  <button
                    className="j-space-choice"
                    type="button"
                    onClick={() => {
                      change({ spaceId: s.id, space: s.id === "classroom" ? "강의실" : s.name });
                      setView("form");
                    }}
                  >
                    <MapPin />
                    <span>
                      <b>{s.name}</b>
                      {sortMode === "pref" && reasons.length > 0 && (
                        <span className="c-reasons">
                          {reasons.map((reason) => (
                            <em key={reason}>{reason}</em>
                          ))}
                        </span>
                      )}
                      <small>
                        {s.building} ·{" "}
                        {s.capacityVerified
                          ? `${s.capacityMin ? `${s.capacityMin}~` : "최대 "}${s.capacity}명`
                          : `정원 미공개 · 데모 ${s.capacity}명`}{" "}
                        · {draft.start}–{draft.end}
                      </small>
                      <small className="j-space-how">{s.booking}</small>
                    </span>
                    <ChevronRight />
                  </button>
                  {onFavorites && (
                    <button
                      type="button"
                      className="c-star"
                      aria-pressed={favorites.includes(s.id)}
                      aria-label={`${s.name} 즐겨찾기${favorites.includes(s.id) ? " 해제" : ""}`}
                      onClick={() =>
                        onFavorites(
                          favorites.includes(s.id)
                            ? favorites.filter((id) => id !== s.id)
                            : [...favorites, s.id],
                        )
                      }
                    >
                      <Star size={18} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {!matches.length && (
                <div className="j-empty">
                  <img
                    className="j-mascot"
                    src="/brand/boogie-sorry.png"
                    alt=""
                    width="96"
                    height="96"
                  />
                  <p>조건에 맞는 공간이 없어요.</p>
                  {draft.kind === "INSTANT" && onWaitlist && (
                    <WaitlistOffer
                      draft={draft}
                      profile={profile}
                      bookings={bookings.filter((b) => b.id !== draft.id)}
                      waitlist={waitlist}
                      onWaitlist={(list, message) => {
                        onWaitlist(list, message);
                        setWaitNote(message ?? "");
                      }}
                    />
                  )}
                  {waitNote && <output className="j-feedback">{waitNote}</output>}
                  {draft.kind === "INSTANT" && draft.count > maxInstantCapacity ? (
                    <button
                      className="j-secondary"
                      type="button"
                      onClick={() => {
                        change({ kind: "ROOM", space: "", spaceId: "" });
                        setSearched(true);
                      }}
                    >
                      이 인원이라면 강의실 찾아보기
                    </button>
                  ) : (
                    <div className="j-stack">
                      <p>같은 길이로 이용할 수 있는 다른 시간이에요.</p>
                      {alternativeTimes(draft, bookings).map((time) => (
                        <button
                          type="button"
                          className="j-secondary"
                          key={time.start}
                          onClick={() => {
                            change({ start: time.start, end: time.end, space: "", spaceId: "" });
                            setSearched(true);
                          }}
                        >
                          {time.start}–{time.end} · {time.count}곳 다시 보기
                        </button>
                      ))}
                      {!alternativeTimes(draft, bookings).length && (
                        <p>가까운 시간에도 빈 곳이 없어요. 날짜를 바꿔 주세요.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      ) : view === "form" ? (
        <>
          <h1>
            {draft.kind === "INSTANT"
              ? "예약 내용을 확인해 주세요"
              : draft.kind === "EXAM"
                ? "오늘의 야간 상주"
                : "신청 내용을 알려 주세요"}
          </h1>
          {draft.spaceId === CLASSROOM_NIGHT_ID ? (
            <div className="j-fields">
              <p className="j-caption">
                강의실 야간잔류 · {draft.members.length}명 · 학생복지팀 승인 후 캡스 상황실에 사본
                전달
              </p>
              <ClassroomPicker value={draft.space} onChange={(space) => change({ space })} />
            </div>
          ) : ["NIGHT", "EXAM"].includes(draft.kind) ? (
            <div className="j-fields">
              <ChoiceField
                label="상주 장소"
                value={draft.space}
                onChange={(space) => change({ space, spaceId: `night-${space}` })}
                options={[
                  { value: "", label: "장소 선택" },
                  ...examSpaceInfo.map((space) => ({
                    value: space.name,
                    label: space.name,
                    description: `${space.building} · ${space.observed}`,
                    group: space.verified ? "학교 공지로 확인된 운영" : "운영 여부 확인 필요",
                  })),
                ]}
              />
              {draft.date && !examWindowFor(draft.date) && (
                <p className="j-warning">
                  학사일정상 시험기간이 아니에요. {(() => {
                    const next = academicCalendar.exams.find((e) => e.end >= draft.date);
                    return next
                      ? `다음 시험기간: ${next.name} (${next.start} ~ ${next.end})`
                      : "다음 학기 학사일정이 공개되면 확인해 주세요.";
                  })()}
                </p>
              )}
              {examSpaceInfo.find((s) => s.name === draft.space && !s.verified) && (
                <p className="j-caption">
                  이 장소는 시험기간 야간 운영 공지를 찾지 못했어요. 운영 부서 공지를 먼저 확인해
                  주세요.
                </p>
              )}
              <label>
                시작 날짜
                <StepBox
                  type="date"
                  label="시작 날짜"
                  value={draft.date}
                  onChange={(v) => change({ date: v })}
                />
              </label>
              <label>
                종료 날짜
                <StepBox
                  type="date"
                  label="종료 날짜"
                  value={draft.endDate}
                  onChange={(v) => change({ endDate: v })}
                />
              </label>
              <label>
                시작 시간
                <StepBox
                  type="time"
                  label="시작 시간"
                  value={draft.start}
                  onChange={(v) => change({ start: v })}
                />
              </label>
              <label>
                종료 시간
                <StepBox
                  type="time"
                  label="종료 시간"
                  value={draft.end}
                  onChange={(v) => change({ end: v })}
                />
              </label>
            </div>
          ) : (
            <section className="j-ticket">
              <b>{draft.spaceId === "classroom" ? "강의실" : draft.space}</b>
              {draft.spaceId === "classroom" && (
                <ClassroomPicker value={draft.space} onChange={(space) => change({ space })} />
              )}
              <BookingSchedule booking={draft} />
              <button type="button" className="j-link" onClick={() => setView("search")}>
                날짜·시간·장소 바꾸기
              </button>
            </section>
          )}
          <div className="j-fields">
            <label>
              신청인
              <input
                maxLength={15}
                value={draft.applicant}
                onChange={(e) => change({ applicant: e.target.value })}
              />
            </label>
            <label>
              학번
              <input
                maxLength={12}
                value={draft.studentId}
                onChange={(e) => change({ studentId: e.target.value })}
              />
            </label>
            {draft.kind !== "INSTANT" && (
              <label>
                소속
                <input
                  maxLength={20}
                  value={draft.department}
                  onChange={(e) => change({ department: e.target.value })}
                />
              </label>
            )}
            {["ROOM", "NIGHT"].includes(draft.kind) && (
              <label>
                연락처
                <input
                  maxLength={15}
                  data-field="phone"
                  value={draft.phone}
                  onChange={(e) => change({ phone: e.target.value })}
                />
              </label>
            )}
            <label>
              사용 목적
              <input
                maxLength={45}
                data-field="purpose"
                value={draft.purpose}
                onChange={(e) => change({ purpose: e.target.value })}
              />
            </label>
          </div>
          {draft.kind === "NIGHT" && (
            <section>
              <h2>같이 상주할 인원을 추가해 주세요</h2>
              <p className="j-caption">
                신청인 포함 {draft.members.length}명 · 최소 {nightStayRules.minMembers}명, 이 양식은
                최대 10명
              </p>
              <p className="j-caption">
                학교 안내: {nightStayRules.unit} · {nightStayRules.submitBefore} ·{" "}
                {nightStayRules.office}
              </p>
              {draft.members.map((m, index) => (
                <fieldset className="j-member" key={m.id}>
                  <legend>
                    참여자 {index + 1}
                    {index === 0 ? " · 신청인" : ""}
                  </legend>
                  <div className="j-fields">
                    <label>
                      학번
                      <input
                        aria-label={`참여자 ${index + 1} 학번`}
                        maxLength={12}
                        value={m.studentId}
                        onChange={(e) => updateMember(m.id, { studentId: e.target.value })}
                      />
                    </label>
                    <label>
                      이름
                      <input
                        aria-label={`참여자 ${index + 1} 이름`}
                        maxLength={15}
                        value={m.name}
                        onChange={(e) => updateMember(m.id, { name: e.target.value })}
                      />
                    </label>
                    <label>
                      소속
                      <input
                        aria-label={`참여자 ${index + 1} 소속`}
                        maxLength={20}
                        value={m.department}
                        onChange={(e) => updateMember(m.id, { department: e.target.value })}
                      />
                    </label>
                  </div>
                  {index > 0 && (
                    <button
                      type="button"
                      className="j-link"
                      aria-label={`참여자 ${index + 1} 삭제`}
                      onClick={() => {
                        const members = draft.members.filter((p) => p.id !== m.id);
                        change({ members, count: members.length });
                      }}
                    >
                      <Trash2 size={16} />이 인원 삭제
                    </button>
                  )}
                </fieldset>
              ))}
              <div className="j-stack">
                <button
                  className="j-secondary"
                  type="button"
                  disabled={draft.members.length >= 10}
                  onClick={() => {
                    const members = [
                      ...draft.members,
                      { id: uid(), name: "", studentId: "", department: draft.department },
                    ];
                    change({ members, count: members.length });
                  }}
                >
                  <Plus size={18} />
                  인원 더 추가하기
                </button>
                <button
                  className="j-link"
                  type="button"
                  onClick={() => {
                    const members = fillDemoMembers(draft);
                    change({ members, count: members.length });
                  }}
                >
                  시연용 5명 채우기
                </button>
              </div>
            </section>
          )}
          {draft.kind === "EXAM" && (
            <section className="j-paper">
              <p>시험기간 개방 장소와 본인 정보를 확인해 주세요.</p>
              <button
                className="j-secondary"
                type="button"
                onClick={() => {
                  setLocation(true);
                  setDemoNow(period(draft)[0]);
                }}
              >
                <MapPin size={18} />
                위치 확인 체험
              </button>
              {location && (
                <output>
                  교내 위치 확인 완료 · 시연 결과 · 데모 시각을 예약 시작으로 이동했어요
                </output>
              )}
              <p className="j-caption">
                GPS 좌표를 수집하지 않습니다. 실제 현장 확인은 별도 연동이 필요해요.
              </p>
            </section>
          )}
          <button
            className="j-primary"
            type="button"
            disabled={draft.kind === "EXAM" && !location}
            onClick={() => (["INSTANT", "EXAM"].includes(draft.kind) ? submit() : preview())}
          >
            {draft.kind === "INSTANT"
              ? bookings.some((b) => b.id === draft.id)
                ? "예약 변경 확정"
                : "예약하기"
              : draft.kind === "EXAM"
                ? "야간 상주 입실하기"
                : "서류 초안 확인하기"}
          </button>
        </>
      ) : (
        <>
          <h1>서류를 확인하고 서명해 주세요</h1>
          <section className="j-paper">
            <h3>{draft.kind === "NIGHT" ? "학생 야간잔류 신청서" : "강의실 사용 신청서"}</h3>
            <p>
              {draft.applicant} · {draft.studentId}
            </p>
            <h2>{draft.space}</h2>
            <BookingSchedule booking={draft} />
            <p>
              {draft.purpose} · {draft.count}명
            </p>
            <details>
              <summary>제출 내용 전체 보기</summary>
              <p>
                소속: {draft.department} · 연락처: {draft.phone}
              </p>
              {draft.kind === "NIGHT" && (
                <ul>
                  {draft.members.map((m) => (
                    <li key={m.id}>
                      {m.department} / {m.studentId} / {m.name}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </section>
          <Signature
            name={draft.applicant}
            value={draft.signature}
            onChange={(signature) => {
              pdfGeneration.current++;
              setBusy(false);
              setDraft((prev) => ({ ...prev, signature }));
              setPdf(null);
              setAgree(false);
            }}
          />
          <button
            className="j-secondary"
            type="button"
            disabled={!draft.signature || busy}
            onClick={renderPdf}
          >
            {busy ? "공식 양식에 입력 중…" : "서명 반영한 PDF 미리보기"}
          </button>
          {pdfUrl && (
            <>
              {pdf && <PdfPreview bytes={pdf} />}
              <a className="j-link" href={pdfUrl} target="_blank" rel="noreferrer">
                PDF가 보이지 않으면 새 창에서 열기
              </a>
              <button
                className="j-link"
                type="button"
                onClick={() => pdf && downloadPdf(pdf, `${draft.id}.pdf`)}
              >
                미리보기 PDF 다운로드
              </button>
              <label className="j-check">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                서류 내용을 확인했어요
              </label>
            </>
          )}
          <button
            className="j-primary"
            type="button"
            disabled={!pdf || !agree || busy}
            onClick={submit}
          >
            {draft.stage === "CHANGES"
              ? "보완 내용 다시 제출"
              : bookings.some((b) => b.id === draft.id)
                ? "변경 내용 제출하기"
                : "신청하기"}
          </button>
          <p className="j-caption">
            이 제출은 앱 안의 데모 접수입니다. 기관 서명·직인은 자동 생성하지 않습니다.
          </p>
        </>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="j-error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
