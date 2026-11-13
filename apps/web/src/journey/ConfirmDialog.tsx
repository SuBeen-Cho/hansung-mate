import { type ReactNode, useEffect, useRef, useState } from "react";

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="j-confirm"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2>{title}</h2>
      {children}
      {error && (
        <p role="alert" className="j-error">
          {error}
        </p>
      )}
      <div className="j-row j-wrap">
        <button type="button" className="j-secondary" disabled={busy} onClick={onCancel}>
          유지하기
        </button>
        <button
          type="button"
          className="j-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onConfirm();
            } catch {
              setError("처리를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "처리 중…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
