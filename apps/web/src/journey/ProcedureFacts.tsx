import { findProgram, type Procedure, procedures } from "../catalog";
import { academicCalendar, todayKst } from "./model";

const typeLabel: Record<string, string> = {
  TRACK_SELECT: "트랙 선택",
  TRACK_CHANGE: "트랙 변경",
  GENERAL_TRANSFER: "일반 전부(과)",
  CROSS_TRANSFER: "주야간 교차 전부(과)",
  THIRD_TRACK: "제3트랙",
  DOUBLE_MINOR: "복수·부전공",
  MICRO_DEGREE: "마이크로디그리",
  KMOOC: "K-MOOC 학점 인정",
  TRACK_CREDIT_RECOGNITION: "트랙 변경 후 학점인정 과목 전공 인정",
};
const basisLabel: Record<string, string> = {
  TRANSFER_QUOTA: "선발",
  SECOND_TRACK_LIMIT: "2트랙 선발 한도",
  REMAINING_SECOND_TRACK_SEATS: "2트랙 잔여",
  SECOND_TRACK_CHANGE_SEATS: "2트랙 변경 가능",
};
const termKey = (t: string) => {
  const [y, s] = t.split("-");
  return Number(y) * 10 + Number(s);
};
const fmt = (iso: string | null) =>
  iso
    ? iso.replace(
        /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?.*$/,
        (_m, y, mo, d, hm) => `${y}.${Number(mo)}.${Number(d)}${hm ? ` ${hm}` : ""}`,
      )
    : "";

function latest(type: string, count = 2): Procedure[] {
  const byTerm = new Map<string, Procedure>();
  for (const p of procedures.filter((p) => p.type === type)) {
    const prior = byTerm.get(p.term);
    // Prefer the notice that carries a period; result notices add results.
    if (!prior || (!prior.applyStart && p.applyStart))
      byTerm.set(p.term, { ...p, results: [...(prior?.results ?? []), ...p.results] });
    else prior.results = [...prior.results, ...p.results];
  }
  return [...byTerm.values()].sort((a, b) => termKey(b.term) - termKey(a.term)).slice(0, count);
}
function unitMatches(unit: string, names: string[]) {
  const clean = unit.replace(/[[\]()（）주야\s]/g, "");
  return names.some(
    (n) => n && (clean.includes(n.replace(/\s/g, "")) || n.replace(/\s/g, "").includes(clean)),
  );
}

/** Facts from past official notices, labelled by term so they are never read as a forecast. */
export function ProcedureFacts({ mode, targets }: { mode: string; targets: string[] }) {
  const programs = targets.map((t) => findProgram(t)).filter(Boolean);
  const names = [
    ...targets,
    ...programs.flatMap((p) => [p?.unit ?? "", p?.college ?? "", ...(p?.aliases ?? [])]),
  ].filter(Boolean);
  const types =
    mode === "FIRST" ? ["TRACK_SELECT"] : ["TRACK_CHANGE", "GENERAL_TRANSFER", "CROSS_TRANSFER"];
  const today = todayKst();
  const upcoming = academicCalendar.events.filter((e) => types.includes(e.type) && e.end >= today);
  return (
    <div className="j-stack j-procedures">
      {upcoming.length > 0 && (
        <section className="j-procedure j-procedure-next">
          <h4>다가오는 학사일정</h4>
          {upcoming.map((e) => (
            <p key={`${e.type}-${e.start}`}>
              <b>{e.name}</b> · {fmt(e.start)} ~ {fmt(e.end)} ({e.term.replace("-", "학년도 ")}학기
              적용)
            </p>
          ))}
          <a href={academicCalendar.source} target="_blank" rel="noreferrer">
            학사일정 원문
          </a>
        </section>
      )}
      {types.map((type) => {
        const rows = latest(type);
        if (!rows.length) return null;
        return (
          <section key={type} className="j-procedure">
            <h4>{typeLabel[type] ?? type}</h4>
            {rows.map((p) => {
              const quota = p.quotas
                .filter((q) => unitMatches(q.unit, names))
                .filter(
                  (q, i, all) =>
                    all.findIndex((o) => o.unit === q.unit && o.basis === q.basis) === i,
                );
              const accepted = p.results.filter((r) => unitMatches(r.toUnit, names));
              return (
                <div key={p.id} className="j-procedure-term">
                  <p>
                    <b>{p.term.replace("-", "학년도 ")}학기</b>{" "}
                    {p.applyStart ? `· 접수 ${fmt(p.applyStart)} ~ ${fmt(p.applyEnd)}` : ""}
                  </p>
                  {quota.map((q) => (
                    <p key={`${q.unit}-${q.basis ?? ""}`}>
                      {q.unit} {basisLabel[q.basis ?? ""] ?? "선발"}{" "}
                      {q.total ?? (q.day ?? 0) + (q.night ?? 0)}명
                      {q.day !== null || q.night !== null
                        ? ` (주 ${q.day ?? "-"} · 야 ${q.night ?? "-"})`
                        : ""}
                    </p>
                  ))}
                  {accepted.map((r) => (
                    <p key={r.toUnit}>
                      {r.toUnit} 합격 {r.accepted}명
                    </p>
                  ))}
                  {!quota.length && !accepted.length && p.eligibility && (
                    <p className="j-caption">{p.eligibility}</p>
                  )}
                  <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                    공지 원문
                  </a>
                </div>
              );
            })}
          </section>
        );
      })}
      <p className="j-caption">
        지난 학교 공지를 학기별로 보여줘요. 합격자 평균 학점은 학교가 공개하지 않아 표시하지 않아요.
        다음 일정은 새 공지로 확인해 주세요.
      </p>
    </div>
  );
}
