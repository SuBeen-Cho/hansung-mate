/** “내 스터디·팀” screen: make a team by 학번, collect approvals, book together, get notices. */
import { Bell, Check, Plus, UserPlus, X } from "lucide-react";
import { useState } from "react";
import type { BookPrefill } from "./CampusViews";
import { spaceRules } from "./campus";
import type { CampusState } from "./campus-life";
import { type CouncilState, departmentOf, freshCouncil } from "./council";
import {
  bookingMembers,
  createGroup,
  expired,
  groupReady,
  headcountHint,
  INVITE_HOURS,
  inviteIssues,
  joined,
  maskId,
  respond,
  type StudyGroup,
  sampleInvite,
  waiting,
} from "./groups";
import { type Booking, demoSpaces, type Profile, stageLabel } from "./model";

const statusLabel: Record<string, string> = {
  LEADER: "팀장",
  INVITED: "승인 대기",
  ACCEPTED: "승인",
  DECLINED: "거절",
};

export function MyGroups({
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
  onBook: (prefill: BookPrefill, groupId: string) => void;
  onOpenBooking: (b: Booking) => void;
}) {
  const me = { studentId: profile.studentId, name: profile.name };
  const groups = state.groups ?? [sampleInvite(me)];
  const council = state.council ?? freshCouncil();
  const myMail = council.verify.email?.address ?? "";
  const demoMail = `${profile.studentId.toLowerCase()}@hansung.ac.kr`;
  /** Demo shortcut for the school-mail check (the full flow lives under 대여 → 학생회 물품). */
  const withMail = (): CouncilState =>
    myMail
      ? council
      : {
          ...council,
          verify: { ...council.verify, email: { address: demoMail, at: new Date().toISOString() } },
        };
  const save = (next: StudyGroup[], verify = false) =>
    onChange({ ...state, groups: next, ...(verify ? { council: withMail() } : {}) });
  const put = (g: StudyGroup, verify = false) =>
    save(
      groups.map((x) => (x.id === g.id ? g : x)),
      verify,
    );
  const names = Object.fromEntries(demoSpaces.map((sp) => [sp.id, sp.name]));
  const [form, setForm] = useState<{
    name: string;
    kind: StudyGroup["kind"];
    rows: { studentId: string; name: string }[];
  } | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const invites = groups.filter((g) =>
    g.members.some((m) => m.studentId === me.studentId && m.status === "INVITED"),
  );
  const mine = groups.filter((g) =>
    g.members.some(
      (m) => m.studentId === me.studentId && (m.status === "LEADER" || m.status === "ACCEPTED"),
    ),
  );
  const dept = departmentOf(profile) || profile.track1;
  return (
    <div className="j-stack">
      {invites.map((g) => {
        const leader = g.members.find((m) => m.status === "LEADER");
        return (
          <section className="j-paper c-offer c-group" key={g.id} aria-label={`${g.name} 초대`}>
            <div className="c-head">
              <UserPlus size={18} aria-hidden="true" />
              <h3>받은 초대</h3>
            </div>
            <p>
              <b>{g.name}</b> · {leader?.name}님이 나를 팀원으로 넣었어요.
            </p>
            <p className="j-caption">
              승인하면 팀원들에게 내 이름과 학번이 보이고, 팀 이름으로 신청하는 공간 신청서 이용자
              명단에 들어가요.
            </p>
            {!myMail && (
              <p className="c-demo-box">
                학교 메일 인증을 한 계정만 팀에 들어갈 수 있어요. 남의 학번으로 들어가는 걸 막기
                위해서예요.
              </p>
            )}
            <div className="c-two">
              <button
                type="button"
                className="j-primary"
                onClick={() =>
                  myMail
                    ? put(respond(g, me.studentId, true, Date.now(), myMail))
                    : put(respond(g, me.studentId, true, Date.now(), demoMail), true)
                }
              >
                <Check size={18} aria-hidden="true" />
                {myMail ? "승인" : "메일 인증하고 승인"}
              </button>
              <button
                type="button"
                className="j-secondary"
                onClick={() => put(respond(g, me.studentId, false))}
              >
                거절
              </button>
            </div>
          </section>
        );
      })}
      {!form && (
        <button
          type="button"
          className="j-secondary"
          onClick={() =>
            setForm({
              name: "",
              kind: "STUDY",
              rows: [
                { studentId: "", name: "" },
                { studentId: "", name: "" },
              ],
            })
          }
        >
          <Plus size={18} aria-hidden="true" />새 스터디·팀 만들기
        </button>
      )}
      {form && (
        <section className="j-paper c-group" aria-label="새 스터디·팀">
          <label className="j-field">
            이름
            <input
              value={form.name}
              placeholder="예: 정보보안기사 스터디"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <div className="j-tabs c-seg">
            {(
              [
                ["STUDY", "스터디"],
                ["TEAM", "팀 프로젝트"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={form.kind === k}
                onClick={() => setForm({ ...form, kind: k })}
              >
                {label}
              </button>
            ))}
          </div>
          {!myMail && (
            <p className="c-demo-box">
              팀은 학교 메일 인증을 한 계정끼리만 만들 수 있어요. 데모에서는 {demoMail}로 인증한
              걸로 처리해요.
            </p>
          )}
          <p className="j-caption">
            팀원 학번을 넣으면 각자 앱에서 승인해야 팀에 들어와요. ({INVITE_HOURS}시간 안에)
          </p>
          {form.rows.map((r, i) => (
            <div className="c-member-row" key={`row-${i}-${form.rows.length}`}>
              <input
                aria-label={`팀원 ${i + 1} 학번`}
                inputMode="numeric"
                placeholder="학번"
                value={r.studentId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    rows: form.rows.map((x, j) =>
                      j === i ? { ...x, studentId: e.target.value } : x,
                    ),
                  })
                }
              />
              <input
                aria-label={`팀원 ${i + 1} 이름`}
                placeholder="이름(선택)"
                value={r.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    rows: form.rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  })
                }
              />
              <button
                type="button"
                className="c-icon-btn"
                aria-label={`팀원 ${i + 1} 빼기`}
                onClick={() => setForm({ ...form, rows: form.rows.filter((_, j) => j !== i) })}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="j-link"
            onClick={() => setForm({ ...form, rows: [...form.rows, { studentId: "", name: "" }] })}
          >
            팀원 더 넣기
          </button>
          {issues.map((m) => (
            <p className="j-error" key={m}>
              {m}
            </p>
          ))}
          <button
            type="button"
            className="j-primary"
            disabled={!form.name.trim()}
            onClick={() => {
              const rows = form.rows.filter((r) => r.studentId.trim());
              const found = inviteIssues(me, rows);
              setIssues(found);
              if (found.length) return;
              const g = createGroup(form.name, form.kind, me, rows);
              save(
                [
                  {
                    ...g,
                    members: g.members.map((m) =>
                      m.status === "LEADER" ? { ...m, mail: myMail || demoMail } : m,
                    ),
                  },
                  ...groups,
                ],
                !myMail,
              );
              setForm(null);
            }}
          >
            {myMail ? "만들고 초대 보내기" : "메일 인증하고 초대 보내기"}
          </button>
          <button
            type="button"
            className="j-link"
            onClick={() => {
              setForm(null);
              setIssues([]);
            }}
          >
            취소
          </button>
        </section>
      )}
      {mine.map((g) => {
        const lead = g.members.find((m) => m.status === "LEADER")?.studentId === me.studentId;
        const booking = g.bookingId ? bookings.find((b) => b.id === g.bookingId) : undefined;
        const ready = groupReady(g);
        const prefill = (kind: "INSTANT" | "ROOM"): BookPrefill => ({
          kind,
          count: joined(g).length,
          purpose: g.name.replace(/\s*\(예시\)$/, ""),
          members: bookingMembers(g, dept),
        });
        return (
          <section className="j-paper c-group" key={g.id} aria-label={g.name}>
            <div className="j-row">
              <span className="c-badge">{g.kind === "STUDY" ? "스터디" : "팀"}</span>
              <b className="j-ov-grow">{g.name}</b>
              <small>
                {joined(g).length}/{g.members.filter((m) => m.status !== "DECLINED").length}명 승인
              </small>
            </div>
            <ul className="c-members">
              {g.members.map((m) => {
                const shown =
                  m.status === "LEADER" || m.status === "ACCEPTED" || m.studentId === me.studentId;
                return (
                  <li key={m.studentId} className={`c-m-${m.status.toLowerCase()}`}>
                    <span className="j-ov-grow">
                      {shown ? `${m.name || "이름 미입력"} · ${m.studentId}` : maskId(m.studentId)}
                      {m.studentId === me.studentId ? " (나)" : ""}
                    </span>
                    {m.mail && <small className="c-mail">학교 메일 ✓</small>}
                    <em>{statusLabel[m.status]}</em>
                    {lead && m.status === "INVITED" && (
                      <button
                        type="button"
                        className="j-link"
                        onClick={() =>
                          put(
                            respond(
                              g,
                              m.studentId,
                              true,
                              Date.now(),
                              `${m.studentId}@hansung.ac.kr`,
                            ),
                          )
                        }
                      >
                        데모: 팀원이 메일 인증 후 승인
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {(() => {
              const hint = headcountHint(joined(g).length, spaceRules, names);
              return (
                <p className="c-headcount">
                  <b>지금 {joined(g).length}명</b>
                  {hint.ok.length ? ` · ${hint.ok.join(", ")} 가능` : ""}
                  {hint.short.length ? ` · ${hint.short.join(", ")}` : ""}
                </p>
              );
            })()}
            {waiting(g).length > 0 && !expired(g) && (
              <p className="j-caption">
                {waiting(g).length}명이 아직 승인하지 않았어요. 모두 답하면(또는 {INVITE_HOURS}
                시간이 지나면) 공간을 잡을 수 있어요.
              </p>
            )}
            {booking ? (
              <button type="button" className="j-menu-row" onClick={() => onOpenBooking(booking)}>
                <span>
                  <b>{booking.space}</b>
                  <small>
                    {booking.date} {booking.start}–{booking.end} · {stageLabel[booking.stage]}
                  </small>
                </span>
              </button>
            ) : (
              lead && (
                <div className="c-two">
                  <button
                    type="button"
                    className="j-primary"
                    disabled={!ready}
                    onClick={() => onBook(prefill("INSTANT"), g.id)}
                  >
                    스터디룸 바로 예약
                  </button>
                  <button
                    type="button"
                    className="j-secondary"
                    disabled={!ready}
                    onClick={() => onBook(prefill("ROOM"), g.id)}
                  >
                    강의실 신청
                  </button>
                </div>
              )
            )}
            {g.notices.length > 0 && (
              <div className="c-notices">
                {g.notices.slice(0, 4).map((n) => (
                  <p key={`${n.at}-${n.text}`}>
                    <Bell size={15} aria-hidden="true" />
                    <span>
                      {n.text}
                      <small>
                        팀원 {n.to.length}명에게 알림 ·{" "}
                        {new Date(n.at).toLocaleTimeString("ko-KR", {
                          timeZone: "Asia/Seoul",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </span>
                  </p>
                ))}
              </div>
            )}
          </section>
        );
      })}
      {!mine.length && !form && (
        <p className="j-caption">아직 내 스터디·팀이 없어요. 팀원 학번으로 바로 만들어 보세요.</p>
      )}
    </div>
  );
}
