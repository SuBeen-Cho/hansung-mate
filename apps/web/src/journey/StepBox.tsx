/**
 * Date/time field with ▲▼ buttons: one tap moves a time by an hour or a date by a day,
 * so a booking can be nudged without opening the native picker.
 */
import { ChevronDown, ChevronUp } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");

/** Moves "HH:MM" by `hours`; returns "" when it would leave the day. */
export function shiftTime(time: string, hours: number) {
  if (!/^\d{2}:\d{2}$/.test(time)) return "";
  const m = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + hours * 60;
  if (m < 0 || m > 23 * 60 + 59) return "";
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
export function shiftDate(date: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function StepBox({
  type,
  label,
  value,
  onChange,
  onStep,
  min,
  dataField,
}: {
  type: "date" | "time";
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Override for the buttons (e.g. moving start and end together). */
  onStep?: ((delta: 1 | -1) => void) | undefined;
  min?: string | undefined;
  dataField?: string | undefined;
}) {
  const next = (delta: 1 | -1) =>
    type === "time" ? shiftTime(value, delta) : shiftDate(value, delta);
  const blocked = (delta: 1 | -1) => {
    const v = next(delta);
    return !v || (min !== undefined && v < min);
  };
  const step = (delta: 1 | -1) => {
    if (blocked(delta)) return;
    if (onStep) onStep(delta);
    else onChange(next(delta));
  };
  const unit = type === "time" ? "1시간" : "하루";
  return (
    <span className="c-step">
      <input
        type={type}
        value={value}
        min={min}
        data-field={dataField}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          // The native icon is hidden to make room for ▲▼, so a tap on the field opens the picker.
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* not allowed here (e.g. not a user gesture); typing still works */
          }
        }}
      />
      <span className="c-step-btns">
        <button
          type="button"
          aria-label={`${label} ${unit} ${type === "time" ? "늦게" : "뒤로"}`}
          disabled={blocked(1)}
          onClick={() => step(1)}
        >
          <ChevronUp size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`${label} ${unit} ${type === "time" ? "일찍" : "앞으로"}`}
          disabled={blocked(-1)}
          onClick={() => step(-1)}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </span>
    </span>
  );
}
