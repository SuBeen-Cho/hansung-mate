import { useEffect, useState } from "react";
import {
  amISpaceReviewer,
  type CloudApplication,
  cloudConfigured,
  loadReviewQueue,
  openCloudDocument,
  reviewCloudApplication,
} from "./cloud";
import { type Kind, kindLabel, type Stage, stageLabel } from "./model";

const time = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Account-mode reviewer inbox backed by space_applications (RLS + reviewer role). */
export function CloudReviewPanel({ note }: { note: string }) {
  const [reviewer, setReviewer] = useState<boolean | null>(null);
  const [stage, setStage] = useState("REVIEW");
  const [rows, setRows] = useState<CloudApplication[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cloudConfigured) return;
    amISpaceReviewer()
      .then(setReviewer)
      .catch(() => setReviewer(false));
  }, []);
  useEffect(() => {
    if (!reviewer) return;
    loadReviewQueue(stage)
      .then(setRows)
      .catch((e: Error) => setMessage(e.message));
  }, [reviewer, stage]);

  if (!cloudConfigured) return null;
  if (reviewer === null) return <p className="j-caption">검토자 권한을 확인하고 있어요.</p>;
  if (!reviewer)
    return (
      <p className="j-caption">
        학교 검토자 계정으로 로그인하면 여러 학생이 보낸 실제 공유 신청함이 이곳에 열려요. 지금은 이
        기기의 데모 신청만 처리해요.
      </p>
    );

  async function act(app: CloudApplication, action: "APPROVE" | "REQUEST_CHANGES" | "REJECT") {
    setBusy(true);
    setMessage("");
    try {
      const next = await reviewCloudApplication(app, action, action === "APPROVE" ? "" : note);
      setMessage(`${app.space_name} 신청을 ${stageLabel[next as Stage] ?? next} 처리했어요.`);
      setRows(await loadReviewQueue(stage));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="j-paper j-stack" aria-label="공유 신청함">
      <div className="j-row">
        <h2>공유 신청함</h2>
        <span className="j-tag">검토자 계정</span>
      </div>
      <div className="j-tabs j-wrap">
        {[
          ["REVIEW", "승인 대기"],
          ["CHANGES", "보완 중"],
          ["APPROVED", "승인"],
          ["ALL", "전체"],
        ].map(([value, title]) => (
          <button
            key={value}
            type="button"
            aria-pressed={stage === value}
            onClick={() => setStage(value ?? "ALL")}
          >
            {title}
          </button>
        ))}
      </div>
      {message && <output className="j-feedback">{message}</output>}
      {!rows.length && <div className="j-empty">이 상태의 공유 신청이 없어요.</div>}
      {rows.map((app) => (
        <article className="j-stack j-cloud-app" key={app.id}>
          <div className="j-row">
            <b>{app.space_name}</b>
            <span className="j-tag">{stageLabel[app.stage as Stage] ?? app.stage}</span>
          </div>
          <p>
            {time(app.starts_at)} → {time(app.ends_at)} · {app.head_count}명 ·{" "}
            {kindLabel[app.kind as Kind] ?? app.kind} · {app.revision}차
          </p>
          <p>{String(app.payload.purpose ?? "")}</p>
          {app.document_path && (
            <button
              type="button"
              className="j-link"
              onClick={async () => {
                try {
                  window.open(await openCloudDocument(app), "_blank", "noopener");
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              제출된 신청서 PDF 열기
            </button>
          )}
          {app.stage === "REVIEW" && (
            <div className="j-row j-wrap">
              <button
                type="button"
                className="j-primary"
                disabled={busy}
                onClick={() => act(app, "APPROVE")}
              >
                승인
              </button>
              <button
                type="button"
                className="j-secondary"
                disabled={busy || !note.trim()}
                onClick={() => act(app, "REQUEST_CHANGES")}
              >
                보완 요청
              </button>
              <button
                type="button"
                className="j-secondary"
                disabled={busy || !note.trim()}
                onClick={() => act(app, "REJECT")}
              >
                반려
              </button>
            </div>
          )}
          {app.reviewer_note && <small>처리 의견: {app.reviewer_note}</small>}
        </article>
      ))}
    </section>
  );
}
