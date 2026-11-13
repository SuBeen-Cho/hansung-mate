import { useState } from "react";
import { CloudReviewPanel } from "./CloudReviewPanel";
import { type Booking, kindLabel, period, stageLabel, todayKst, transition } from "./model";
export function AdminDashboard({
  bookings,
  onUpdate,
  onOpen,
}: {
  bookings: Booking[];
  onUpdate: (b: Booking) => void;
  onOpen: (b: Booking) => void;
}) {
  const [filter, setFilter] = useState("REVIEW");
  const [note, setNote] = useState("사용 목적을 구체적으로 적어 주세요.");
  const [demoNow, setDemoNow] = useState<number | null>(null);
  const now = demoNow ?? Date.now();
  const today = todayKst(new Date(now));
  const rows = bookings.filter(
    (b) =>
      filter === "ALL" ||
      (filter === "TODAY" ? b.date <= today && b.endDate >= today : b.stage === filter),
  );
  return (
    <section className="j-stack" aria-label="데모 관리자 대시보드">
      <h1>캠퍼스 공간 운영</h1>
      <p className="j-tag">이 기기 데모 신청 처리 · 계정 연결 시 공유 신청함 사용</p>
      <div className="j-admin-metrics">
        {[
          ["승인 대기", bookings.filter((b) => b.stage === "REVIEW").length],
          ["보완 중", bookings.filter((b) => b.stage === "CHANGES").length],
          ["이용 중", bookings.filter((b) => b.stage === "CHECKED_IN").length],
        ].map(([name, count]) => (
          <div key={name}>
            <small>{name}</small>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
      <div className="j-tabs j-wrap j-admin-tabs">
        {[
          ["REVIEW", "대기"],
          ["CHANGES", "보완"],
          ["CHECKED_IN", "이용 중"],
          ["TODAY", "오늘"],
          ["ALL", "전체"],
        ].map(([value, title]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value ?? "ALL")}
          >
            {title}
          </button>
        ))}
      </div>
      <label className="j-field">
        보완·반려 사유
        <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
      <CloudReviewPanel note={note} />
      {demoNow && (
        <output className="j-feedback">
          데모 시각: {new Date(now).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
          <button type="button" className="j-link" onClick={() => setDemoNow(null)}>
            현재 시각으로 돌아가기
          </button>
        </output>
      )}
      {!rows.length && (
        <div className="j-empty">
          이 상태의 신청이 없어요. 공간에서 신청을 만든 뒤 여기서 처리해 보세요.
        </div>
      )}
      {rows.map((b) => (
        <section className="j-paper j-stack" key={b.id}>
          <div className="j-row">
            <b>{b.space}</b>
            <span className="j-tag">{stageLabel[b.stage]}</span>
          </div>
          <p>
            {b.date} {b.start} → {b.endDate} {b.end}
          </p>
          <p>
            {b.applicant} · {b.count}명 · {kindLabel[b.kind]}
          </p>
          <p>{b.purpose}</p>
          <button type="button" className="j-link" onClick={() => onOpen(b)}>
            신청 상세·명단·서류 열기
          </button>
          {b.stage === "REVIEW" && (
            <div className="j-row j-wrap">
              <button
                type="button"
                className="j-primary"
                disabled={now >= period(b)[0]}
                onClick={() => onUpdate(transition(b, "APPROVE", "", now))}
              >
                승인
              </button>
              <button
                type="button"
                className="j-secondary"
                disabled={!note.trim()}
                onClick={() =>
                  onUpdate({ ...transition(b, "CHANGES", note, now), noteField: "purpose" })
                }
              >
                보완 요청
              </button>
              <button
                type="button"
                className="j-secondary"
                disabled={!note.trim()}
                onClick={() => onUpdate(transition(b, "REJECT", note, now))}
              >
                반려
              </button>
            </div>
          )}
          {["REVIEW", "CHANGES", "APPROVED"].includes(b.stage) && (
            <details>
              <summary>마감·미입실 처리 체험</summary>
              <p className="j-caption">
                데모 정책: 시작 시각까지 승인되지 않으면 만료, 종료 시각까지 입실하지 않으면
                미입실이에요.
              </p>
              <button type="button" className="j-link" onClick={() => setDemoNow(period(b)[1])}>
                이 예약 종료 시각으로 이동
              </button>
              <button
                type="button"
                className="j-secondary"
                disabled={b.stage === "APPROVED" ? now < period(b)[1] : now < period(b)[0]}
                onClick={() =>
                  onUpdate(transition(b, b.stage === "APPROVED" ? "NO_SHOW" : "EXPIRE", "", now))
                }
              >
                {b.stage === "APPROVED" ? "미입실 처리" : "기한 만료 처리"}
              </button>
            </details>
          )}
          {b.note && <small>처리 의견: {b.note}</small>}
        </section>
      ))}
    </section>
  );
}
