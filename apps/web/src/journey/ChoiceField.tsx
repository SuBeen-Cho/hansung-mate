import { Check, ChevronDown, X } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState } from "react";

type Choice = { value: string; label: string; description?: string; group?: string };

export function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div className="j-choice-field">
      <span id={`${id}-label`} className="j-field-label">
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        className="j-select-trigger"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-dialog`}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
          const current = dialog.current?.querySelector<HTMLButtonElement>("[aria-pressed=true]");
          current?.focus({ preventScroll: true });
          current?.scrollIntoView?.({ block: "center" });
        }}
      >
        <span id={`${id}-value`}>{selected?.label ?? (value || "선택해 주세요")}</span>
        <ChevronDown size={20} aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        id={`${id}-dialog`}
        className="j-choice-dialog"
        aria-labelledby={`${id}-title`}
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="j-sheet-content">
          <div className="j-sheet-handle" aria-hidden="true" />
          <div className="j-sheet-header">
            <h2 id={`${id}-title`}>{label} 선택</h2>
            <button
              className="j-icon-button"
              type="button"
              aria-label="선택창 닫기"
              onClick={close}
            >
              <X size={22} aria-hidden="true" />
            </button>
          </div>
          <fieldset
            className="j-sheet-options"
            aria-label={`${label} 목록`}
            onKeyDown={(event) => {
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
              );
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              let next: number | undefined;
              if (event.key === "ArrowDown") next = Math.min(index + 1, buttons.length - 1);
              if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
              if (event.key === "Home") next = 0;
              if (event.key === "End") next = buttons.length - 1;
              if (next !== undefined) {
                event.preventDefault();
                buttons[next]?.focus();
              }
            }}
          >
            {options.map((option, index) => (
              <Fragment key={option.value}>
                {option.group && option.group !== options[index - 1]?.group && (
                  <div className="j-choice-group">{option.group}</div>
                )}
                <button
                  key={option.value}
                  type="button"
                  className="j-sheet-option"
                  aria-pressed={option.value === value}
                  aria-label={option.label}
                  aria-describedby={option.description ? `${id}-opt-${index}` : undefined}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                >
                  <span>
                    {option.label}
                    {option.description && (
                      <small id={`${id}-opt-${index}`}>{option.description}</small>
                    )}
                  </span>
                  {option.value === value && <Check size={20} aria-hidden="true" />}
                </button>
              </Fragment>
            ))}
          </fieldset>
        </div>
      </dialog>
    </div>
  );
}
