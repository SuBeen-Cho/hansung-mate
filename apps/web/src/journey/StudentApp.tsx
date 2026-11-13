import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Home,
  MapPin,
  Package,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { pairingError } from "../catalog";
import { TrackPicker } from "./Academic";
import { AcademicDataContext, defaultAcademicData } from "./AcademicData";
import { AcademicRecords } from "./AcademicRecords";
import { AccountBackup } from "./AccountBackup";
import { type BookPrefill, CampusHome, Lending, Meetups, StudyLite } from "./CampusViews";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  autoRelease,
  CLAIM_WINDOW_MIN,
  expireOffers,
  offerReleased,
  type WaitEntry,
} from "./campus";
import { type CampusState, freshCampus } from "./campus-life";
import { clearDocuments } from "./documents";
import { clearDrafts } from "./drafts";
import { bookingNotice, notify } from "./groups";
import { InstallGuide } from "./InstallGuide";
import {
  academicCalendar,
  type Booking,
  type DemoState,
  freshState,
  migrateDemoState,
  type Profile,
  profileTerm,
  readDemo,
  STORAGE_KEY,
  stageLabel,
  todayKst,
} from "./model";
import { sampleNightPosts } from "./NightViews";
import { type Season, Spaces } from "./Spaces";
import "./journey.css";

type Tab = "home" | "spaces" | "lending" | "meetups" | "study" | "me";
export function StudentApp() {
  const [state, setState] = useState<DemoState>(readDemo);
  const recoveryRequested = new URLSearchParams(location.search).get("account") === "recovery";
  const [entered, setEntered] = useState(recoveryRequested);
  const [intro, setIntro] = useState(false);
  const [tab, setTab] = useState<Tab>(recoveryRequested ? "me" : "home");
  const [myView, setMyView] = useState<"profile" | "edit" | "records" | "bookings" | "account">(
    recoveryRequested ? "account" : "profile",
  );
  const [selectedBooking, setSelectedBooking] = useState<Booking | undefined>();
  const [prefill, setPrefill] = useState<BookPrefill | undefined>();
  const [pendingMeetup, setPendingMeetup] = useState("");
  const [pendingGroup, setPendingGroup] = useState("");
  const [pendingNight, setPendingNight] = useState("");
  const [lendPrefill, setLendPrefill] = useState<
    { from: string; to: string; bookingId?: string } | undefined
  >();
  const [lendSource, setLendSource] = useState<"PARK" | "ITROOM" | "COUNCIL">("PARK");
  const [resetAsk, setResetAsk] = useState(false);
  const [fullReset, setFullReset] = useState(false);
  const [profileDraft, setProfileDraft] = useState<Profile | null>(null);
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  const editProfile = profileDraft ?? state.profile;
  const dirtyProfile =
    profileDraft !== null && JSON.stringify(profileDraft) !== JSON.stringify(state.profile);
  function navigate(action: () => void) {
    if (dirtyProfile) setLeaveAction(() => action);
    else {
      setProfileDraft(null);
      action();
    }
  }
  const [bookingVisit, setBookingVisit] = useState(0);
  const [storageError, setStorageError] = useState(false);
  const [demoSession, setDemoSession] = useState(0);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  // Opening the app settles what the clock already decided: missed check-ins and stale offers.
  useEffect(() => {
    setState((s) => {
      const now = Date.now();
      const { bookings, released } = autoRelease(s.bookings, now);
      let waitlist = expireOffers(s.campus?.waitlist ?? [], now);
      for (const b of released) waitlist = offerReleased(waitlist, b, now).list;
      const changed =
        released.length > 0 ||
        JSON.stringify(waitlist) !== JSON.stringify(s.campus?.waitlist ?? []);
      if (!changed) return s;
      return { ...s, bookings, campus: { ...(s.campus ?? freshCampus(todayKst())), waitlist } };
    });
  }, []);
  const p = state.profile;
  const seasonMode = state.season ?? "NORMAL";
  const realToday = todayKst();
  const nextExam = academicCalendar.exams.find((e) => e.end >= realToday);
  const season: Season | undefined = nextExam
    ? {
        exam: seasonMode === "EXAM",
        name: (nextExam.name ?? "시험").replace(/^\d{4}-\d /, ""),
        start: nextExam.start,
        end: nextExam.end,
        // Exam-season demo jumps to the first exam day so the night-stay flow can be tried.
        today:
          seasonMode === "EXAM"
            ? realToday >= nextExam.start
              ? realToday
              : nextExam.start
            : realToday,
      }
    : undefined;
  const campusState: CampusState = state.campus ?? freshCampus(todayKst());
  const setCampus = (c: CampusState) => setState((s) => ({ ...s, campus: c }));
  const academic = state.academic ?? defaultAcademicData;
  const mainPlan = state.plans.find((plan) => plan.id === state.academic?.primaryPlanId);
  function go(t: Tab) {
    navigate(() => {
      setTab(t);
      if (t === "me") setMyView("profile");
      if (t === "spaces") {
        setPrefill(undefined);
        setSelectedBooking(undefined);
        setBookingVisit((n) => n + 1);
      }
      if (t !== "lending") setLendPrefill(undefined);
      if (t === "lending") setLendSource("PARK");
      window.scrollTo?.({ top: 0 });
    });
  }
  function book(next: BookPrefill, meetupId = "", groupId = "", nightId = "") {
    setPrefill(next);
    setPendingMeetup(meetupId);
    setPendingGroup(groupId);
    setPendingNight(nightId);
    setSelectedBooking(undefined);
    setBookingVisit((n) => n + 1);
    setTab("spaces");
    window.scrollTo?.({ top: 0 });
  }
  function updateProfile(patch: Partial<Profile>) {
    setProfileDraft((s) => ({ ...(s ?? state.profile), ...patch }));
  }
  function upsert(b: Booking) {
    setState((s) => {
      const prev = s.bookings.find((x) => x.id === b.id);
      const text = bookingNotice(prev, b);
      const groups = s.campus?.groups;
      return {
        ...s,
        bookings: [b, ...s.bookings.filter((x) => x.id !== b.id)],
        ...(text && s.campus && groups?.some((g) => g.bookingId === b.id)
          ? {
              campus: {
                ...s.campus,
                groups: groups.map((g) => (g.bookingId === b.id ? notify(g, text) : g)),
              },
            }
          : {}),
      };
    });
  }
  function openBooking(b: Booking) {
    setSelectedBooking(b);
    setPrefill(undefined);
    setBookingVisit((n) => n + 1);
    setTab("spaces");
  }
  function release(b: Booking, now: number) {
    const { bookings, released } = autoRelease([b], now);
    const out = bookings[0];
    if (!out || !released.length) return "아직 반납할 때가 아니에요.";
    const offer = offerReleased(campusState.waitlist, out, now);
    const note = offer.offered
      ? `대기 1순위에게 ${CLAIM_WINDOW_MIN}분 동안 확정 기회를 넘김`
      : "대기자가 없어 바로 빈 방으로 공개";
    const settled = {
      ...out,
      events: [...out.events, { label: note, at: new Date(now).toISOString() }],
    };
    setState((s) => ({
      ...s,
      bookings: [settled, ...s.bookings.filter((x) => x.id !== settled.id)],
      campus: { ...(s.campus ?? freshCampus(todayKst())), waitlist: offer.list },
    }));
    return note;
  }
  function claim(w: WaitEntry) {
    setCampus({
      ...campusState,
      waitlist: campusState.waitlist.map((x) =>
        x.id === w.id ? { ...x, status: "CLAIMED" as const } : x,
      ),
    });
    book({
      spaceId: w.spaceId,
      space: w.space,
      date: w.date,
      start: w.start,
      end: w.end,
      count: w.count,
      purpose: "대기 자리 확정",
    });
  }
  if (!entered)
    return (
      <div className="ieum-app">
        <main className="j-cover">
          <p className="j-wordmark">한성 메이트</p>
          <img src="/brand/boogie-hello.png" alt="인사하는 상상부기" width="190" height="190" />
          <p className="j-eyebrow">공간도, 물건도, 사람도</p>
          <h1>
            <span>{intro ? "반가워요." : "캠퍼스를"}</span>
            <span>{intro ? "부기와 함께 시작해요" : "함께 나눠 써요"}</span>
          </h1>
          <p>
            {intro
              ? "빈 공간을 찾고, 필요한 물건을 빌리고, 함께할 사람을 모아요."
              : "흩어진 학교 예약을 한곳에서"}
          </p>
          <button
            className="j-primary"
            type="button"
            onClick={() => (intro ? setEntered(true) : setIntro(true))}
          >
            {intro ? "데모 시작하기" : "시작하기"}
            <ArrowRight size={19} />
          </button>
          <small>가상 학적 · 데모 예약 · 이 브라우저에 저장</small>
        </main>
      </div>
    );
  return (
    <AcademicDataContext value={academic}>
      <div className="ieum-app">
        <header className="j-app-header">
          <button className="j-brand" type="button" onClick={() => go("home")}>
            한성 메이트
          </button>
          <span className="j-header-side">
            <fieldset className="c-mode" aria-label="체험 모드">
              {(
                [
                  ["NORMAL", "평소"],
                  ["EXAM", "시험기간"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={seasonMode === mode}
                  onClick={() =>
                    navigate(() => {
                      setState((s) => ({ ...s, season: mode }));
                      setPrefill(undefined);
                      setSelectedBooking(undefined);
                      setBookingVisit((n) => n + 1);
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </fieldset>
            <button
              type="button"
              className="j-me-button"
              aria-label="내 정보 열기"
              aria-current={tab === "me" ? "page" : undefined}
              onClick={() => go("me")}
            >
              <UserRound size={20} aria-hidden="true" />
            </button>
          </span>
        </header>
        <main className="j-content" key={demoSession}>
          {storageError && (
            <p role="alert" className="j-error">
              브라우저 저장 공간을 사용할 수 없어요. 새로고침하면 이번 변경이 사라질 수 있어요.
            </p>
          )}
          {tab === "home" && (
            <CampusHome
              profile={p}
              bookings={state.bookings}
              state={campusState}
              onBook={book}
              onOpenBooking={openBooking}
              onClaim={claim}
              onGo={go}
              season={season}
              onUpdate={upsert}
            />
          )}
          <div hidden={tab !== "spaces"}>
            <Spaces
              key={`${selectedBooking?.id ?? "spaces"}-${bookingVisit}`}
              profile={p}
              bookings={state.bookings}
              onUpsert={upsert}
              initialBooking={selectedBooking}
              prefill={prefill}
              waitlist={campusState.waitlist}
              onWaitlist={(waitlist) => setCampus({ ...campusState, waitlist })}
              onRelease={release}
              season={season}
              favorites={campusState.favorites ?? []}
              onFavorites={(favorites) => setCampus({ ...campusState, favorites })}
              timetable={campusState.timetable}
              onBorrow={(b) => {
                setLendPrefill({ from: b.date, to: b.date, bookingId: b.id });
                setTab("lending");
                window.scrollTo?.({ top: 0 });
              }}
              onBooked={(b) => {
                if (pendingNight) {
                  setState((s) => {
                    const c = s.campus ?? freshCampus(todayKst());
                    return {
                      ...s,
                      campus: {
                        ...c,
                        nightPosts: (c.nightPosts ?? sampleNightPosts(todayKst())).map((n) =>
                          n.id === pendingNight ? { ...n, bookingId: b.id } : n,
                        ),
                      },
                    };
                  });
                  setPendingNight("");
                }
                if (pendingGroup) {
                  setState((s) => {
                    const c = s.campus ?? freshCampus(todayKst());
                    return {
                      ...s,
                      campus: {
                        ...c,
                        groups: (c.groups ?? []).map((g) =>
                          g.id === pendingGroup
                            ? notify({ ...g, bookingId: b.id }, bookingNotice(undefined, b))
                            : g,
                        ),
                      },
                    };
                  });
                  setPendingGroup("");
                }
                if (!pendingMeetup) return;
                setState((s) => {
                  const c = s.campus ?? freshCampus(todayKst());
                  return {
                    ...s,
                    campus: {
                      ...c,
                      meetups: c.meetups.map((m) =>
                        m.id === pendingMeetup ? { ...m, bookingId: b.id } : m,
                      ),
                    },
                  };
                });
                setPendingMeetup("");
              }}
            />
          </div>
          {tab === "lending" && (
            <Lending
              key={`${lendPrefill?.bookingId ?? "lending"}-${lendSource}`}
              profile={p}
              initialSource={lendSource}
              state={campusState}
              onChange={setCampus}
              prefill={lendPrefill}
            />
          )}
          {tab === "meetups" && (
            <Meetups
              profile={p}
              state={campusState}
              onChange={setCampus}
              onBook={book}
              bookings={state.bookings}
              onBookGroup={(next, groupId) => book(next, "", groupId)}
              onBookNight={(next, nightId) => book(next, "", "", nightId)}
              onOpenBooking={openBooking}
            />
          )}
          {tab === "study" && (
            <StudyLite
              profile={p}
              academic={academic}
              plan={mainPlan}
              state={campusState}
              onChange={setCampus}
              onBook={book}
            />
          )}
          {tab === "me" && (
            <div className="j-stack">
              {myView !== "profile" && (
                <button
                  type="button"
                  className="j-back"
                  onClick={() => navigate(() => setMyView("profile"))}
                >
                  <ArrowLeft size={18} />내 정보
                </button>
              )}
              {myView === "profile" ? (
                <>
                  <section className="j-profile-head">
                    <div className="j-avatar">{p.name[0]}</div>
                    <h1>{p.name}</h1>
                    <p>
                      {p.studentId} · {p.entryYear}학번 · {p.year}학년
                    </p>
                    <div className="j-profile-tracks">
                      <span>
                        1트랙 <b>{p.track1 || "선택 전"}</b>
                      </span>
                      <span>
                        2트랙 <b>{p.track2 || "선택 전"}</b>
                      </span>
                    </div>
                    <small>{p.optional || "추가 과정 선택 안 함"}</small>
                    <button
                      type="button"
                      className="j-link"
                      onClick={() => {
                        setProfileDraft({ ...p });
                        setMyView("edit");
                      }}
                    >
                      내 정보 수정
                    </button>
                  </section>
                  <section className="j-paper">
                    {[
                      ["records", "이수한 과목과 성적"],
                      ["loans", `대여 내역 · ${campusState.loans.length}`],
                      ["council", "학생회비 인증"],
                      ["account", "계정과 백업"],
                      ["bookings", `공간 신청 내역 · ${state.bookings.length}`],
                    ].map(([v, label]) => (
                      <button
                        type="button"
                        className="j-menu-row"
                        key={v}
                        onClick={() =>
                          v === "loans"
                            ? go("lending")
                            : v === "council"
                              ? navigate(() => {
                                  setLendSource("COUNCIL");
                                  setTab("lending");
                                  window.scrollTo?.({ top: 0 });
                                })
                              : setMyView(v as typeof myView)
                        }
                      >
                        {label}
                        <ChevronRight size={19} />
                      </button>
                    ))}
                  </section>
                  <p className="j-caption">
                    데모 정보는 이 브라우저에 저장됩니다. 학교 계정이나 성적표를 조회하지 않아요.
                  </p>
                  <InstallGuide />
                  <button type="button" className="j-link" onClick={() => setResetAsk(true)}>
                    데모 데이터 초기화
                  </button>
                  {resetAsk && (
                    <ConfirmDialog
                      title="데모 초기화 확인"
                      confirmLabel="초기화하기"
                      onCancel={() => setResetAsk(false)}
                      onConfirm={async () => {
                        if (fullReset) {
                          await clearDocuments();
                          localStorage.removeItem("hansung-ieum-account-backup-demo-v1");
                        }
                        clearDrafts();
                        setState(freshState());
                        setSelectedBooking(undefined);
                        setDemoSession((n) => n + 1);
                        setResetAsk(false);
                        setFullReset(false);
                      }}
                    >
                      <p>프로필, 이수 기록, 공간·대여·모임 기록과 임시 저장을 초기화해요.</p>
                      <label className="j-check">
                        <input
                          type="checkbox"
                          checked={fullReset}
                          onChange={(e) => setFullReset(e.target.checked)}
                        />
                        이 기기의 보관 PDF와 데모 백업도 삭제
                      </label>
                      <p className="j-caption">
                        선택하지 않으면 보관 PDF와 데모 백업은 남아요. 클라우드 백업은 변경하지
                        않아요.
                      </p>
                    </ConfirmDialog>
                  )}
                </>
              ) : myView === "edit" ? (
                <>
                  <h1>내 정보 수정</h1>
                  <div className="j-fields">
                    <label>
                      이름
                      <input
                        maxLength={15}
                        value={editProfile.name}
                        onChange={(e) => updateProfile({ name: e.target.value })}
                      />
                    </label>
                    <label>
                      학번
                      <input
                        maxLength={12}
                        value={editProfile.studentId}
                        onChange={(e) => updateProfile({ studentId: e.target.value })}
                      />
                    </label>
                    <label>
                      입학년도
                      <input
                        type="number"
                        min={2000}
                        max={2030}
                        value={editProfile.entryYear}
                        onChange={(e) => updateProfile({ entryYear: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      현재 학년
                      <select
                        value={editProfile.year}
                        onChange={(e) => updateProfile({ year: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n}학년
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      현재 학기
                      <select
                        value={Number(profileTerm(editProfile).split("-")[1])}
                        onChange={(e) =>
                          updateProfile({ semester: Number(e.target.value) as 1 | 2 })
                        }
                      >
                        <option value={1}>1학기</option>
                        <option value={2}>2학기</option>
                      </select>
                    </label>
                  </div>
                  {/^\d{7,}$/.test(editProfile.studentId.trim()) &&
                    editProfile.studentId.trim().slice(0, 2) !==
                      String(editProfile.entryYear).slice(2) && (
                      <p className="j-warning">
                        학번 앞 두 자리와 입학년도({editProfile.entryYear})가 달라요. 편입·재입학이
                        아니라면 다시 확인해 주세요.
                      </p>
                    )}
                  {editProfile.entryYear > new Date().getFullYear() && (
                    <p className="j-warning">입학년도가 올해보다 늦어요.</p>
                  )}
                  {pairingError(editProfile.track1, editProfile.track2) && (
                    <p className="j-warning">
                      {pairingError(editProfile.track1, editProfile.track2)}
                    </p>
                  )}
                  <TrackPicker
                    label="1트랙"
                    value={editProfile.track1}
                    onChange={(track1) => updateProfile({ track1 })}
                  />
                  <TrackPicker
                    label="2트랙"
                    value={editProfile.track2}
                    onChange={(track2) => updateProfile({ track2 })}
                  />
                  <button
                    type="button"
                    className="j-primary"
                    disabled={
                      !editProfile.name.trim() ||
                      !editProfile.studentId.trim() ||
                      !Number.isInteger(editProfile.entryYear) ||
                      editProfile.entryYear < 2000 ||
                      editProfile.entryYear > 2030
                    }
                    onClick={() => {
                      setState((s) => ({
                        ...s,
                        profile: {
                          ...editProfile,
                          name: editProfile.name.trim(),
                          studentId: editProfile.studentId.trim(),
                        },
                      }));
                      setProfileDraft(null);
                      setMyView("profile");
                    }}
                  >
                    수정 완료
                  </button>
                </>
              ) : myView === "records" ? (
                <AcademicRecords
                  data={state.academic ?? defaultAcademicData}
                  onChange={(academic) => setState((s) => ({ ...s, academic }))}
                />
              ) : myView === "account" ? (
                <AccountBackup
                  state={state}
                  onRestore={(data) => {
                    clearDrafts();
                    setState(migrateDemoState(data));
                    setSelectedBooking(undefined);
                    setBookingVisit((n) => n + 1);
                  }}
                />
              ) : (
                <>
                  <h1>공간 신청 내역</h1>
                  {state.bookings.length ? (
                    state.bookings.map((b) => (
                      <button
                        className="j-menu-row"
                        type="button"
                        key={b.id}
                        onClick={() => openBooking(b)}
                      >
                        <span>
                          <b>{b.space}</b>
                          <small>
                            {b.date} {b.start} · {stageLabel[b.stage]}
                          </small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))
                  ) : (
                    <div className="j-empty">
                      <img
                        className="j-mascot"
                        src="/brand/boogie-rest.png"
                        alt=""
                        width="96"
                        height="96"
                      />
                      <p>아직 신청한 공간이 없어요.</p>
                      <button type="button" className="j-primary" onClick={() => go("spaces")}>
                        공간 둘러보기
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </main>
        {leaveAction && (
          <ConfirmDialog
            title="수정 중인 정보를 닫을까요?"
            confirmLabel="수정 취소하고 이동"
            onCancel={() => setLeaveAction(null)}
            onConfirm={() => {
              setProfileDraft(null);
              leaveAction();
              setLeaveAction(null);
            }}
          >
            <p>수정 완료를 누르지 않은 내용은 저장되지 않아요.</p>
          </ConfirmDialog>
        )}
        <nav className="j-bottom-nav" aria-label="주요 메뉴">
          {(
            [
              { id: "home", label: "홈", Icon: Home },
              { id: "spaces", label: "공간", Icon: MapPin },
              { id: "lending", label: "대여", Icon: Package },
              { id: "meetups", label: "모임", Icon: Users },
              { id: "study", label: "학업", Icon: BookOpen },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={23} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </AcademicDataContext>
  );
}
