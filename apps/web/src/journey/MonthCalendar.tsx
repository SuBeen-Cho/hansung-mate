/**
 * Inline month calendar for picking a booking date. Days before `min` or after `max`
 * (the 14-day booking window) are shown but cannot be chosen.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function MonthCalendar({
  label,
  value,
  onChange,
  min,
  max,
  today,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  min?: string;
  max?: string;
  today: string;
}) {
  const base = value || today;
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) });
  const first = new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const move = (delta: number) => {
    const m = view.m + delta;
    setView({ y: view.y + Math.floor((m - 1) / 12), m: ((m - 1 + 120) % 12) + 1 });
  };
  const monthStart = iso(view.y, view.m, 1);
  const monthEnd = iso(view.y, view.m, days);
  const selected = value
    ? `${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일 (${
        DOW[new Date(`${value}T12:00:00Z`).getUTCDay()]
      })`
    : "날짜를 골라 주세요";
  return (
    <fieldset className="c-cal" aria-label={label}>
      <div className="c-cal-head">
        <span className="c-cal-label">{label}</span>
        <b>{selected}</b>
      </div>
      <div className="c-cal-nav">
        <button
          type="button"
          aria-label="이전 달"
          disabled={!!min && monthStart <= min}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span>
          {view.y}년 {view.m}월
        </span>
        <button
          type="button"
          aria-label="다음 달"
          disabled={!!max && monthEnd >= max}
          onClick={() => move(1)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="c-cal-grid">
        {DOW.map((d, i) => (
          <span key={d} className={`c-cal-dow${i === 0 ? " c-sun" : i === 6 ? " c-sat" : ""}`}>
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`blank-${view.m}-${i}`} />;
          const date = iso(view.y, view.m, d);
          const off = (!!min && date < min) || (!!max && date > max);
          const dow = i % 7;
          return (
            <button
              key={date}
              type="button"
              className={[
                "c-cal-day",
                date === value ? "c-cal-on" : "",
                date === today ? "c-cal-today" : "",
                dow === 0 ? "c-sun" : dow === 6 ? "c-sat" : "",
              ].join(" ")}
              aria-label={`${view.m}월 ${d}일 (${DOW[dow]})${date === today ? " 오늘" : ""}`}
              aria-pressed={date === value}
              disabled={off}
              onClick={() => onChange(date)}
            >
              {d}
            </button>
          );
        })}
      </div>
      {max && <p className="c-cal-note">오늘부터 {14}일 뒤까지 예약할 수 있어요.</p>}
    </fieldset>
  );
}
