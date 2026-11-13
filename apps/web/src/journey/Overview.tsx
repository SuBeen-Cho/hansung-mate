import { formatCredit } from "@hansung/academic-engine";
import { AlertTriangle, ArrowRight, Check as CheckIcon, ChevronRight, Info } from "lucide-react";
import type { ReactNode } from "react";
import { useAcademicData } from "./AcademicData";
import { type Profile, profileTerm, type SavedPlan } from "./model";
import {
  type AreaProgress,
  areaProgress,
  type Check,
  type CheckTarget,
  graduationLeft,
  roadmapTerms,
  upcomingEvents,
} from "./roadmap-data";

const credit = (milli: number) => formatCredit(milli);
const pct = (value: number, max: number) => `${Math.min(100, (value / Math.max(max, 1)) * 100)}%`;

export function Bar({
  label,
  parts,
  max,
  thin,
}: {
  label: string;
  parts: { value: number; tone: "done" | "now" | "plan" }[];
  max: number;
  thin?: boolean;
}) {
  return (
    <div className={`j-ov-bar${thin ? " j-ov-bar-thin" : ""}`} role="img" aria-label={label}>
      {parts.map((p) => (
        <span key={p.tone} data-tone={p.tone} style={{ width: pct(p.value, max) }} />
      ))}
    </div>
  );
}

function AreaRow({ area }: { area: AreaProgress }) {
  return (
    <div className="j-ov-area">
      <div className="j-row">
        <span>
          {area.label} <small>{area.sub}</small>
        </span>
        <span>
          <b>{credit(area.completedMilli)}</b> / {credit(area.targetMilli)}
          {area.completedMilli >= area.targetMilli && <small> · 충족</small>}
        </span>
      </div>
      <Bar
        thin
        label={`${area.label} 이수 ${credit(area.completedMilli)}학점, 계획 ${credit(area.plannedMilli)}학점, 목표 ${credit(area.targetMilli)}학점`}
        max={area.targetMilli}
        parts={[
          { value: area.completedMilli, tone: "done" },
          { value: area.plannedMilli, tone: "plan" },
        ]}
      />
    </div>
  );
}

export function ChecksSummary({ checks, onOpen }: { checks: Check[]; onOpen: () => void }) {
  const block = checks.filter((c) => c.level === "BLOCK").length;
  const note = checks.length - block;
  return (
    <button type="button" className="j-ov-card j-ov-checks-link" onClick={onOpen}>
      <span className="j-ov-icon" data-level={block ? "BLOCK" : checks.length ? "NOTE" : "OK"}>
        {checks.length ? <AlertTriangle size={21} /> : <CheckIcon size={21} />}
      </span>
      <span className="j-ov-grow">
        <span className="j-ov-title-row">
          <b>{checks.length ? `확인할 것 ${checks.length}개` : "확인할 것 없음"}</b>
          {block > 0 && (
            <span className="j-ov-pill" data-level="BLOCK">
              막힘 {block}
            </span>
          )}
          {note > 0 && (
            <span className="j-ov-pill" data-level="NOTE">
              참고 {note}
            </span>
          )}
        </span>
        <small>{checks[0]?.title ?? "로드맵과 기록에서 걸리는 게 없어요"}</small>
      </span>
      <ChevronRight size={19} aria-hidden="true" />
    </button>
  );
}

export function HomeOverview({
  profile,
  baseProfile,
  plan,
  checks,
  banner,
  onRoadmap,
  onChecks,
}: {
  profile: Profile;
  baseProfile: Profile;
  plan: SavedPlan | undefined;
  checks: Check[];
  banner?: ReactNode;
  onRoadmap: () => void;
  onChecks: () => void;
}) {
  const data = useAcademicData();
  const items = plan?.items ?? [];
  const { areas, total } = areaProgress(profile, data, items);
  const { terms } = roadmapTerms(profile, data, items);
  const nowMilli = terms.find((t) => t.status === "NOW")?.creditMilli ?? 0;
  const left = graduationLeft(baseProfile, data, profile, items);
  const events = upcomingEvents();
  return (
    <div className="j-stack j-ov">
      <header className="j-ov-head">
        <small>
          {profile.entryYear % 100}학번 · {profile.year}학년 {profileTerm(profile).split("-")[1]}
          학기 · {[profile.track1, profile.track2].filter(Boolean).join(" + ") || "전공 선택 전"}
        </small>
        <h1>나의 졸업 로드맵</h1>
      </header>
      {banner}
      <section className="j-ov-card" aria-label="졸업 진행률">
        <div className="j-row j-ov-hero">
          <div>
            <small>졸업까지 남은 학점</small>
            <p className="j-ov-big">
              <b>{credit(left)}</b>학점
            </p>
          </div>
          <small>
            {credit(total.completedMilli)} / {credit(total.targetMilli)}학점
          </small>
        </div>
        <Bar
          label={`이수 ${credit(total.completedMilli)}학점, 이번 학기 ${credit(nowMilli)}학점, 남음 ${credit(left)}학점`}
          max={total.targetMilli}
          parts={[
            { value: total.completedMilli, tone: "done" },
            { value: Math.min(nowMilli, left), tone: "now" },
          ]}
        />
        <div className="j-ov-legend">
          <span data-tone="done">이수 {credit(total.completedMilli)}</span>
          <span data-tone="now">이번 학기 계획 {credit(nowMilli)}</span>
          <span data-tone="rest">남음 {credit(Math.max(0, left - nowMilli))}</span>
        </div>
        <hr />
        <div className="j-ov-areas">
          {areas.map((a) => (
            <AreaRow key={a.key} area={a} />
          ))}
        </div>
      </section>
      <ChecksSummary checks={checks} onOpen={onChecks} />
      {events.length > 0 && (
        <section className="j-ov-card" aria-label="다가오는 학사일정">
          <h2 className="j-ov-h2">다가오는 학사일정</h2>
          {events.map((e, i) => (
            <div className="j-ov-event" key={`${e.name}-${e.start}`} data-first={i === 0}>
              <span className="j-ov-date">
                <small>{Number(e.start.slice(5, 7))}월</small>
                <b>{Number(e.start.slice(8, 10))}</b>
              </span>
              <span className="j-ov-grow">
                <b>{e.name}</b>
                <small>
                  {e.start.slice(5).replace("-", ".")} – {e.end.slice(5).replace("-", ".")}
                </small>
              </span>
              <span className="j-ov-dday">{e.ongoing ? "진행 중" : `D-${e.daysLeft}`}</span>
            </div>
          ))}
        </section>
      )}
      <button type="button" className="j-primary" onClick={onRoadmap}>
        학기별 로드맵 열기 <ArrowRight size={18} />
      </button>
    </div>
  );
}

const targetWords: Record<CheckTarget, string> = {
  roadmap: "로드맵에서 고치기",
  profile: "내 정보에서 고치기",
  records: "이수 기록 고치기",
  remaining: "남은 것에서 고치기",
};
export function ChecksView({
  checks,
  onTarget,
}: {
  checks: Check[];
  onTarget: (target: CheckTarget) => void;
}) {
  const groups = [
    {
      level: "BLOCK" as const,
      title: "막힘",
      hint: "그대로 두면 신청·졸업이 안 돼요",
      Icon: AlertTriangle,
    },
    { level: "NOTE" as const, title: "참고", hint: "확인만 하면 돼요", Icon: Info },
  ];
  return (
    <div className="j-stack j-ov">
      <header className="j-ov-head">
        <h1>{checks.length ? `확인할 것 ${checks.length}개` : "확인할 것이 없어요"}</h1>
        <p>화면 곳곳의 경고를 여기에 모았어요</p>
      </header>
      {groups.map(({ level, title, hint, Icon }) => {
        const list = checks.filter((c) => c.level === level);
        if (!list.length) return null;
        return (
          <section key={level} className="j-ov-group" aria-label={title}>
            <h2 data-level={level}>
              <Icon size={16} aria-hidden="true" />
              {title} {list.length} <small>· {hint}</small>
            </h2>
            {list.map((c) => (
              <article key={c.id} className="j-ov-card j-ov-check" data-level={level}>
                <small>{c.where}</small>
                <b>{c.title}</b>
                {c.detail && <p>{c.detail}</p>}
                <button
                  type="button"
                  className={level === "BLOCK" ? "j-ov-fix" : "j-ov-fix-soft"}
                  onClick={() => onTarget(c.target)}
                >
                  {targetWords[c.target]}
                </button>
              </article>
            ))}
          </section>
        );
      })}
      <div className="j-ov-legend-box">
        <b>경고는 두 단계로만 나눠요</b>
        <span>
          <b data-level="BLOCK">막힘</b> 조합 불가, 학점 상한 초과, 재수강 한도처럼 실제로 안 되는
          것
        </span>
        <span>
          <b data-level="NOTE">참고</b> 학번 불일치, 학점 차이처럼 확인만 하면 되는 것
        </span>
      </div>
    </div>
  );
}

export function RemainingHeader({
  profile,
  plan,
}: {
  profile: Profile;
  plan: SavedPlan | undefined;
}) {
  const data = useAcademicData();
  const { areas } = areaProgress(profile, data, plan?.items ?? []);
  const majors = areas.filter((a) => a.key.startsWith("major"));
  return (
    <>
      <header className="j-ov-head">
        <h1>졸업까지 남은 것</h1>
        <p>학점·졸업요건을 한곳에 모았어요</p>
      </header>
      {majors.map((a) => (
        <section className="j-ov-card" key={a.key} aria-label={a.label}>
          <div className="j-row j-ov-hero">
            <div>
              <small>
                {a.label} · {a.sub}
              </small>
              <p className="j-ov-left">
                {a.completedMilli >= a.targetMilli ? (
                  <b>기준 학점 충족</b>
                ) : (
                  <>
                    <b>{credit(a.targetMilli - a.completedMilli)}학점</b> 남음
                  </>
                )}
              </p>
            </div>
            <small>
              {credit(a.completedMilli)} / {credit(a.targetMilli)}
            </small>
          </div>
          <Bar
            label={`${a.label} 이수 ${credit(a.completedMilli)}학점, 계획 ${credit(a.plannedMilli)}학점`}
            max={a.targetMilli}
            parts={[
              { value: a.completedMilli, tone: "done" },
              { value: a.plannedMilli, tone: "plan" },
            ]}
          />
          {a.plannedMilli > 0 && (
            <small>로드맵에 {credit(a.plannedMilli)}학점이 계획돼 있어요</small>
          )}
        </section>
      ))}
    </>
  );
}

export function SchoolCommon({ profile, plan }: { profile: Profile; plan: SavedPlan | undefined }) {
  const data = useAcademicData();
  const { total } = areaProgress(profile, data, plan?.items ?? []);
  return (
    <section className="j-ov-card j-ov-common" aria-label="학교 공통 졸업 기준">
      <small>학교 공통</small>
      <div className="j-row">
        <span>총 학점</span>
        <span>
          <b>{credit(total.completedMilli)}</b> / {credit(total.targetMilli)}
        </span>
      </div>
      <div className="j-row">
        <span>총 평점 2.0 이상</span>
        <span className="j-ov-muted">성적표로 확인</span>
      </div>
      {profile.entryYear >= 2016 && (
        <div className="j-row">
          <span>비교과 800포인트</span>
          <span className="j-ov-muted">학교 포털에서 확인</span>
        </div>
      )}
      <div className="j-row">
        <span>두 전공의 학과 졸업요건 각각</span>
        <span className="j-ov-muted">아래 학과 졸업요건</span>
      </div>
    </section>
  );
}
