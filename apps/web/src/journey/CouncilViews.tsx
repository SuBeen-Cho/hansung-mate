/**
 * Student-council verification screens (DEMO): school-mail check, dues roster match or a
 * one-time council code, and the council's own roster/code screen.
 */
import { BadgeCheck, CircleAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  buildRoster,
  type CouncilState,
  currentTerm,
  type DuesScope,
  departmentOf,
  hasDues,
  idsFromCsv,
  isSchoolMail,
  issueCode,
  newOtp,
  OTP_MINUTES,
  sampleIds,
  scopeLabel,
  termEnd,
  verifyDues,
} from "./council";
import type { Profile } from "./model";

export function CouncilStatus({
  profile,
  council,
  onVerify,
}: {
  profile: Profile;
  council: CouncilState;
  onVerify: () => void;
}) {
  const dept = departmentOf(profile);
  const term = currentTerm();
  const rows: [string, boolean][] = [
    ["학교 메일 인증", !!council.verify.email],
    [scopeLabel("TOTAL"), hasDues(council, "TOTAL")],
    ...(dept ? [[scopeLabel(dept), hasDues(council, dept)] as [string, boolean]] : []),
  ];
  const all = rows.every(([, ok]) => ok);
  return (
    <section className="j-paper c-council" aria-label="학생회비 인증 상태">
      <div className="c-head">
        <ShieldCheck size={18} aria-hidden="true" />
        <h3>학생회비 인증 · {term}학기</h3>
      </div>
      <ul className="c-checks">
        {rows.map(([label, ok]) => (
          <li key={label} className={ok ? "c-ok" : ""}>
            {ok ? (
              <BadgeCheck size={17} aria-hidden="true" />
            ) : (
              <CircleAlert size={17} aria-hidden="true" />
            )}
            <span>{label}</span>
            <small>{ok ? `확인됨 · ${termEnd(term)}까지` : "확인 전"}</small>
          </li>
        ))}
      </ul>
      {!all && (
        <button type="button" className="j-primary" onClick={onVerify}>
          인증하기
        </button>
      )}
      <p className="j-caption">
        학과는 내 정보의 1트랙({profile.track1 || "선택 전"}) 기준 {dept || "확인 불가"}로 봐요.
      </p>
    </section>
  );
}

export function CouncilVerify({
  profile,
  council,
  onChange,
  onDone,
}: {
  profile: Profile;
  council: CouncilState;
  onChange: (c: CouncilState) => void;
  onDone: () => void;
}) {
  const dept = departmentOf(profile);
  // Demo: the school mail is filled from the 학번, as a school login would provide it.
  const [address, setAddress] = useState(
    council.verify.email?.address ?? `${profile.studentId.toLowerCase()}@hansung.ac.kr`,
  );
  const [otp, setOtp] = useState<{ code: string; until: number } | null>(null);
  const [typed, setTyped] = useState("");
  const [scope, setScope] = useState<DuesScope>(hasDues(council, "TOTAL") && dept ? dept : "TOTAL");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [needsRoster, setNeedsRoster] = useState(false);
  const run = async (withCode: boolean, base: CouncilState = council) => {
    const r = await verifyDues(base, profile, scope, withCode ? { code } : {});
    onChange(r.state);
    setMessage({ ok: r.ok, text: r.message });
    setNeedsRoster(!r.ok && /명단을 올리지 않았어요/.test(r.message));
    if (r.ok) setCode("");
  };
  return (
    <section className="j-paper c-council" aria-label="학생회비 인증">
      <p className="j-eyebrow">1단계 · 본인 확인</p>
      {council.verify.email ? (
        <p className="c-done">
          <BadgeCheck size={17} aria-hidden="true" /> {council.verify.email.address} 인증 완료
        </p>
      ) : (
        <>
          <label className="j-field">
            학교 메일
            <input
              type="email"
              value={address}
              placeholder="학번@hansung.ac.kr"
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="j-secondary"
            disabled={!isSchoolMail(address)}
            onClick={() => {
              const next = newOtp();
              setOtp({ code: next, until: Date.now() + OTP_MINUTES * 60_000 });
              // Demo: the code that "arrived by mail" is filled in, like phone autofill.
              setTyped(next);
              setMessage(null);
            }}
          >
            인증번호 받기
          </button>
          {address && !isSchoolMail(address) && (
            <p className="j-caption">학교 메일(@hansung.ac.kr)만 쓸 수 있어요.</p>
          )}
          {otp && (
            <>
              <p className="c-demo-box">
                데모: 메일로 온 인증번호 <b>{otp.code}</b>를 자동으로 넣었어요 ({OTP_MINUTES}분 안에
                확인)
              </p>
              <label className="j-field">
                인증번호
                <input
                  inputMode="numeric"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="j-primary"
                onClick={() => {
                  if (Date.now() > otp.until)
                    setMessage({ ok: false, text: "인증번호 시간이 지났어요. 다시 받아 주세요." });
                  else if (typed.trim() !== otp.code)
                    setMessage({ ok: false, text: "인증번호가 맞지 않아요." });
                  else {
                    onChange({
                      ...council,
                      verify: {
                        ...council.verify,
                        email: { address: address.trim(), at: new Date().toISOString() },
                      },
                    });
                    setMessage({ ok: true, text: "학교 메일 인증이 끝났어요." });
                  }
                }}
              >
                메일 인증 확인
              </button>
            </>
          )}
        </>
      )}
      <p className="j-eyebrow">2단계 · 학생회비 납부 확인</p>
      <div className="j-tabs c-seg">
        {(["TOTAL", ...(dept ? [dept] : [])] as DuesScope[]).map((s) => (
          <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)}>
            {s === "TOTAL" ? "총학생회비" : s}
            {hasDues(council, s) ? " ✓" : ""}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="j-primary"
        disabled={!council.verify.email || hasDues(council, scope)}
        onClick={() => run(false)}
      >
        학생회 납부자 명단으로 확인
      </button>
      <div className="c-code-row">
        <input
          aria-label="학생회 발급 인증코드"
          placeholder="학생회가 준 코드 (HSM-…)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          type="button"
          className="j-secondary c-small-btn"
          disabled={!council.verify.email || !code.trim() || hasDues(council, scope)}
          onClick={() => run(true)}
        >
          코드로 확인
        </button>
      </div>
      <button
        type="button"
        className="j-link"
        disabled={!council.verify.email || hasDues(council, scope)}
        onClick={async () => {
          const { plain, code: issued } = await issueCode(scope);
          onChange({
            ...council,
            codes: [...council.codes, issued],
            log: [
              { at: issued.issuedAt, text: `${scopeLabel(scope)} 인증코드 1개 발급 (데모)` },
              ...council.log,
            ],
          });
          setCode(plain);
          setMessage(null);
        }}
      >
        데모: 학생회에서 코드 받아 자동 입력
      </button>
      {message && <output className={message.ok ? "j-feedback" : "j-error"}>{message.text}</output>}
      {needsRoster && (
        <button
          type="button"
          className="j-secondary"
          onClick={async () => {
            const roster = await buildRoster(
              sampleIds(profile.studentId, true),
              currentTerm(),
              scope,
              true,
            );
            const next = {
              ...council,
              rosters: [
                ...council.rosters.filter((x) => !(x.term === roster.term && x.scope === scope)),
                roster,
              ],
              log: [
                { at: roster.uploadedAt, text: `${scopeLabel(scope)} 예시 명단 등록 (데모)` },
                ...council.log,
              ],
            };
            await run(false, next);
          }}
        >
          데모: 예시 명단 올리고 다시 확인
        </button>
      )}
      <p className="j-caption">
        학번은 학기·회비 종류별로 암호화(SHA-256)한 값으로만 명단과 비교해요. 학생회 명단 원본은
        앱에 남지 않아요. 이 화면은 데모라 실제 메일을 보내거나 학교 시스템을 조회하지 않아요.
      </p>
      <button type="button" className="j-link" onClick={onDone}>
        대여 화면으로 돌아가기
      </button>
    </section>
  );
}

export function CouncilAdmin({
  profile,
  council,
  onChange,
}: {
  profile: Profile;
  council: CouncilState;
  onChange: (c: CouncilState) => void;
}) {
  const dept = departmentOf(profile);
  const term = currentTerm();
  const [scope, setScope] = useState<DuesScope>("TOTAL");
  const [includeMe, setIncludeMe] = useState(true);
  const [plain, setPlain] = useState("");
  const [note, setNote] = useState("");
  const roster = council.rosters.find((r) => r.term === term && r.scope === scope);
  const save = async (ids: string[], sample: boolean) => {
    const next = await buildRoster(ids, term, scope, sample);
    onChange({
      ...council,
      rosters: [...council.rosters.filter((r) => !(r.term === term && r.scope === scope)), next],
      log: [
        { at: next.uploadedAt, text: `${scopeLabel(scope)} 명단 ${ids.length}명 등록` },
        ...council.log,
      ],
    });
    setNote(`${ids.length}명 등록 · 학번은 암호화해서 저장했어요.`);
  };
  return (
    <details className="j-paper c-insights">
      <summary>
        <b>학생회 운영자 보기 · 데모</b>
        <small className="c-sub">납부자 명단·인증코드·인증 기록</small>
      </summary>
      <div className="j-tabs c-seg">
        {(["TOTAL", ...(dept ? [dept] : [])] as DuesScope[]).map((s) => (
          <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)}>
            {s === "TOTAL" ? "총학생회" : s}
          </button>
        ))}
      </div>
      <p>
        {roster
          ? `${term}학기 명단 ${roster.hashes.length}명 등록됨${roster.sample ? " (예시 명단)" : ""}`
          : `${term}학기 명단이 아직 없어요.`}
      </p>
      <label className="j-check">
        <input
          type="checkbox"
          checked={includeMe}
          onChange={(e) => setIncludeMe(e.target.checked)}
        />
        예시 명단에 데모 학생({profile.studentId}) 넣기
      </label>
      <button
        type="button"
        className="j-secondary"
        onClick={() => save(sampleIds(profile.studentId, includeMe), true)}
      >
        예시 명단 불러오기
      </button>
      <label className="j-secondary c-file">
        납부자 명단 CSV 올리기
        <input
          className="j-sr-hidden"
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const ids = idsFromCsv(await file.text());
            if (!ids.length) setNote("학번(숫자 7~10자리)을 찾지 못했어요.");
            else await save(ids, false);
            e.target.value = "";
          }}
        />
      </label>
      <button
        type="button"
        className="j-secondary"
        onClick={async () => {
          const { plain: p, code } = await issueCode(scope);
          onChange({
            ...council,
            codes: [...council.codes, code],
            log: [
              { at: code.issuedAt, text: `${scopeLabel(scope)} 인증코드 1개 발급` },
              ...council.log,
            ],
          });
          setPlain(p);
        }}
      >
        일회용 인증코드 발급
      </button>
      {plain && (
        <p className="c-demo-box">
          발급한 코드 <b>{plain}</b> · 납부 학생에게만 전달하세요. 앱에는 암호화한 값만 남아요.
        </p>
      )}
      {note && <p className="c-note">{note}</p>}
      {council.log.length > 0 && (
        <ol className="c-roster">
          {council.log.slice(0, 6).map((l) => (
            <li key={`${l.at}-${l.text}`}>
              {new Date(l.at).toLocaleTimeString("ko-KR", {
                timeZone: "Asia/Seoul",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              {l.text}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
