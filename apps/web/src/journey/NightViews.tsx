/**
 * “야간잔류” gathering: students who want to stay late in a classroom collect at least four
 * people, then file the night-stay request for a classroom straight away with the roster filled.
 */
import { Moon, Plus } from "lucide-react";
import { useState } from "react";
import type { BookPrefill } from "./CampusViews";
import { addDays } from "./campus";
import type { CampusState } from "./campus-life";
import { departmentOf } from "./council";
import { type Booking, nightStayRules, type Profile, todayKst, uid } from "./model";
import { nameSignature } from "./signature";

/** 학내 야간잔류(22시 이후)는 5인 이상일 때만 허가돼요 (학생복지팀 안내). */
export const CLASSROOM_NIGHT_MIN = nightStayRules.minMembers;
export const CLASSROOM_NIGHT_ID = "classroom-night";

export type NightPost = {
  id: string;
  title: string;
  building: string;
  date: string;
  start: string;
  end: string;
  host: string;
  members: {
    name: string;
    studentId: string;
    department: string;
    signature?: string;
    signedAt?: string;
  }[];
  bookingId?: string;
  sample?: boolean;
};

const BUILDINGS = ["미래관", "우촌관", "탐구관", "진리관"];
const shortDate = (date: string) => {
  const dow = "일월화수목금토"[new Date(`${date}T12:00:00+09:00`).getUTCDay()];
  return `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}(${dow})`;
};

export function sampleNightPosts(today: string): NightPost[] {
  return [
    {
      id: "night-sample-1",
      title: "기말 대비 밤샘 스터디 (예시)",
      building: "탐구관",
      date: addDays(today, 1),
      start: "22:00",
      end: "08:00",
      host: "예시 학생 H",
      members: [
        { name: "예시 학생 H", studentId: "2312008", department: "IT융합공학부" },
        { name: "예시 학생 I", studentId: "2412009", department: "IT융합공학부" },
        { name: "예시 학생 J", studentId: "2412010", department: "컴퓨터공학부" },
        { name: "예시 학생 K", studentId: "2512011", department: "컴퓨터공학부" },
      ],
      sample: true,
    },
  ];
}

export function NightGather({
  profile,
  state,
  bookings,
  onChange,
  onBook,
  onOpenBooking,
}: {
  profile: Profile;
  state: CampusState;
  bookings: Booking[];
  onChange: (s: CampusState) => void;
  onBook: (prefill: BookPrefill, postId: string) => void;
  onOpenBooking: (b: Booking) => void;
}) {
  const today = todayKst();
  const posts = state.nightPosts ?? sampleNightPosts(today);
  const save = (next: NightPost[]) => onChange({ ...state, nightPosts: next });
  const me = {
    name: profile.name,
    studentId: profile.studentId,
    department: departmentOf(profile) || profile.track1,
  };
  const [form, setForm] = useState<{ title: string; building: string; date: string } | null>(null);
  return (
    <div className="j-stack">
      <section className="j-paper c-night-intro">
        <div className="c-head">
          <Moon size={18} aria-hidden="true" />
          <h3>강의실에서 함께 밤새 공부해요</h3>
        </div>
        <p>
          밤 10시 이후 학교에 남는 야간잔류는 {CLASSROOM_NIGHT_MIN}명 이상이 함께 신청해야 허가돼요.
          같이 남을 사람을 여기서 모으고, {CLASSROOM_NIGHT_MIN}명이 되는 순간 명단이 채워진
          학내잔류신청서를 바로 낼 수 있어요. 신청서는 하루 전까지(당일은 낮 12시 전) 학생복지팀
          승인을 받고, 승인 사본은 캡스 상황실에 전달돼요.
        </p>
      </section>
      {!form ? (
        <button
          type="button"
          className="j-secondary"
          onClick={() => setForm({ title: "", building: "탐구관", date: addDays(today, 1) })}
        >
          <Plus size={18} aria-hidden="true" />
          야간잔류 같이 할 사람 모으기
        </button>
      ) : (
        <section className="j-paper c-group" aria-label="야간잔류 모집 글">
          <label className="j-field">
            무엇을 하나요
            <input
              value={form.title}
              placeholder="예: 운영체제 기말 밤샘 스터디"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <div className="j-time-pair">
            <label>
              희망 건물
              <select
                value={form.building}
                onChange={(e) => setForm({ ...form, building: e.target.value })}
              >
                {BUILDINGS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label>
              날짜
              <input
                type="date"
                min={today}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
          </div>
          <p className="j-caption">
            야간잔류는 밤 10시 이후 남는 걸 말해요. 시간은 22:00부터 다음 날 08:00까지로 시작하고
            신청서에서 바꿀 수 있어요.
          </p>
          <button
            type="button"
            className="j-primary"
            disabled={!form.title.trim() || form.date < today}
            onClick={() => {
              save([
                {
                  id: uid(),
                  title: form.title.trim(),
                  building: form.building,
                  date: form.date,
                  start: "22:00",
                  end: "08:00",
                  host: profile.name,
                  members: [me],
                },
                ...posts,
              ]);
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
      {posts.map((p) => {
        const joined = p.members.some((m) => m.studentId === me.studentId);
        const enough = p.members.length >= CLASSROOM_NIGHT_MIN;
        const signed = p.members.filter((m) => m.signature).length;
        const ready = enough && signed === p.members.length;
        const sign = (studentId: string) =>
          put({
            ...p,
            members: p.members.map((m) =>
              m.studentId === studentId
                ? { ...m, signature: nameSignature(m.name), signedAt: new Date().toISOString() }
                : m,
            ),
          });
        const booking = p.bookingId ? bookings.find((b) => b.id === p.bookingId) : undefined;
        const put = (next: NightPost) => save(posts.map((x) => (x.id === next.id ? next : x)));
        const ordered = [
          ...p.members.filter((m) => m.studentId === me.studentId),
          ...p.members.filter((m) => m.studentId !== me.studentId),
        ];
        return (
          <section className="j-paper c-meetup" key={p.id} aria-label={p.title}>
            <div className="j-row">
              <span className="c-badge">야간잔류</span>
              <b className="j-ov-grow">{p.title}</b>
              <small>
                {p.members.length}/{CLASSROOM_NIGHT_MIN}명
              </small>
            </div>
            <small>
              {shortDate(p.date)} {p.start} ~ 다음 날 {p.end} · {p.building} 강의실 희망 · {p.host}
            </small>
            <div className="c-bar" aria-hidden="true">
              <span
                style={{
                  width: `${Math.min(100, (p.members.length / CLASSROOM_NIGHT_MIN) * 100)}%`,
                }}
              />
            </div>
            <p className="c-headcount">
              {!enough
                ? `${CLASSROOM_NIGHT_MIN - p.members.length}명이 더 모이면 강의실 야간 잔류를 신청할 수 있어요.`
                : ready
                  ? `${p.members.length}명 모두 전자서명을 마쳤어요. 신청서 잔류자 명단에 이름·학번·소속과 서명이 자동으로 들어가요.`
                  : `${p.members.length}명이 모였어요. 서명 ${signed}/${p.members.length} · 모두 각자 휴대폰에서 전자서명하면 신청할 수 있어요.`}
            </p>
            {joined && (
              <ul className="c-members">
                {p.members.map((m) => (
                  <li key={m.studentId} className={m.signature ? "c-m-accepted" : "c-m-invited"}>
                    <span className="j-ov-grow">
                      {m.name} · {m.studentId}
                      {m.studentId === me.studentId ? " (나)" : ""}
                    </span>
                    {m.signature ? (
                      <img className="c-sig" src={m.signature} alt={`${m.name} 서명`} />
                    ) : m.studentId === me.studentId ? (
                      <button type="button" className="j-link" onClick={() => sign(m.studentId)}>
                        내 이름으로 전자서명
                      </button>
                    ) : (
                      <button type="button" className="j-link" onClick={() => sign(m.studentId)}>
                        데모: 팀원 폰에서 서명
                      </button>
                    )}
                    <em>{m.signature ? "서명 완료" : "서명 전"}</em>
                  </li>
                ))}
              </ul>
            )}
            {booking ? (
              <button type="button" className="j-menu-row" onClick={() => onOpenBooking(booking)}>
                <span>
                  <b>{booking.space}</b>
                  <small>신청서를 냈어요 · 상태 보기</small>
                </span>
              </button>
            ) : (
              <div className="c-two">
                {joined ? (
                  p.host !== profile.name ? (
                    <button
                      type="button"
                      className="j-secondary"
                      onClick={() =>
                        put({
                          ...p,
                          members: p.members.filter((m) => m.studentId !== me.studentId),
                        })
                      }
                    >
                      참여 취소
                    </button>
                  ) : (
                    <span />
                  )
                ) : (
                  <button
                    type="button"
                    className="j-secondary"
                    onClick={() => put({ ...p, members: [...p.members, me] })}
                  >
                    참여하기
                  </button>
                )}
                <button
                  type="button"
                  className="j-primary"
                  disabled={!ready || !joined}
                  onClick={() =>
                    onBook(
                      {
                        kind: "NIGHT",
                        spaceId: CLASSROOM_NIGHT_ID,
                        space: `${p.building} 강의실`,
                        date: p.date,
                        start: p.start,
                        end: p.end,
                        count: p.members.length,
                        purpose: p.title.replace(/\s*\(예시\)$/, ""),
                        members: ordered.map((m) => ({ id: uid(), ...m })),
                      },
                      p.id,
                    )
                  }
                >
                  바로 신청하기
                </button>
              </div>
            )}
          </section>
        );
      })}
      <p className="j-caption">“예시 학생” 글은 화면을 보여 주기 위한 데모 글이에요.</p>
    </div>
  );
}
