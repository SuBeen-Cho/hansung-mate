import { useState } from "react";
import {
  NIGHT_FORM_URL,
  NIGHT_GUIDE_URL,
  nextRequestStage,
  type Participant,
  type RequestKind,
  ROOM_GUIDE_URL,
  requestStageLabel,
  type SpaceRequest,
  validateRequest,
} from "./space-demo";

const demoSpaces = [
  {
    id: "sang-sang-201",
    name: "상상관 201",
    capacity: 30,
    from: "17:00",
    to: "20:00",
    place: "상상관 2층",
  },
  {
    id: "creative-b1",
    name: "창의융합 라운지 B1",
    capacity: 12,
    from: "18:00",
    to: "21:00",
    place: "연구관 B1층",
  },
  {
    id: "seminar-401",
    name: "세미나실 401",
    capacity: 18,
    from: "14:00",
    to: "17:00",
    place: "상상관 4층",
  },
];

function parseParticipants(value: string): Participant[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [department = "", studentId = "", name = ""] = line
        .split(",")
        .map((part) => part.trim());
      return { department, studentId, name };
    });
}

function followingDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function RequestDocument({ request }: { request: SpaceRequest }) {
  return (
    <article className="request-document">
      <div className="document-head">
        <small>HAN SUNG · DEMO 문서</small>
        <h3>{request.kind === "NIGHT" ? "학생 야간잔류 신청서" : "강의실 이용 요청서"}</h3>
      </div>
      <dl className="document-grid">
        <div>
          <dt>기간</dt>
          <dd>
            {request.date} {request.start} ~ {request.endDate} {request.end}
          </dd>
        </div>
        <div>
          <dt>목적</dt>
          <dd>{request.purpose}</dd>
        </div>
        <div>
          <dt>건물명 / 호실</dt>
          <dd>{request.spaceName}</dd>
        </div>
        <div>
          <dt>소속 / 학번</dt>
          <dd>
            {request.department} / {request.studentId}
          </dd>
        </div>
        <div>
          <dt>신청인 / 연락처</dt>
          <dd>
            {request.applicant} / {request.phone}
          </dd>
        </div>
        <div>
          <dt>지도교수</dt>
          <dd>{request.professor || "미입력 · 실제 서명 필요"}</dd>
        </div>
        <div>
          <dt>학과장·전공주임</dt>
          <dd>실제 결재/서명 미연동</dd>
        </div>
        <div>
          <dt>참여 인원</dt>
          <dd>{request.attendees}명</dd>
        </div>
      </dl>
      {request.kind === "NIGHT" ? (
        <>
          <h4>잔류자 명단</h4>
          <ol className="document-people">
            {request.participants.map((person, index) => (
              <li key={`${person.studentId}-${index}`}>
                {person.department} / {person.studentId} / {person.name}
              </li>
            ))}
          </ol>
        </>
      ) : null}
      <p className="document-signature">신청인 {request.applicant} (전자서명 미적용)</p>
      <p className="document-stamp">DEMO 미제출 · 실제 허가서가 아닙니다</p>
    </article>
  );
}

export function SpaceWorkflow({
  profile,
  requests,
  onCreate,
}: {
  profile: { name: string; studentId: string; currentTrack: string };
  requests: SpaceRequest[];
  onCreate: (request: SpaceRequest) => void;
}) {
  const [date, setDate] = useState("2026-10-07");
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("20:00");
  const [attendees, setAttendees] = useState(5);
  const [searched, setSearched] = useState(false);
  const [spaceId, setSpaceId] = useState("");
  const [kind, setKind] = useState<RequestKind>("ROOM");
  const [endDate, setEndDate] = useState(date);
  const [nightEnd, setNightEnd] = useState("08:00");
  const [applicant, setApplicant] = useState(profile.name);
  const [studentId, setStudentId] = useState(profile.studentId);
  const [department, setDepartment] = useState(profile.currentTrack);
  const [phone, setPhone] = useState("");
  const [professor, setProfessor] = useState("");
  const [purpose, setPurpose] = useState("");
  const [participantText, setParticipantText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [createdId, setCreatedId] = useState("");
  const [locationResult, setLocationResult] = useState("");
  const selected = demoSpaces.find((item) => item.id === spaceId);
  const matches = demoSpaces.filter(
    (item) => item.capacity >= attendees && item.from <= start && item.to >= end,
  );
  const created = requests.find((item) => item.id === createdId);

  function createRequest() {
    if (!selected) return;
    const draft = {
      kind,
      applicant,
      studentId,
      department,
      phone,
      professor,
      purpose,
      spaceId: selected.id,
      spaceName: selected.name,
      date,
      endDate: kind === "NIGHT" ? endDate : date,
      start,
      end: kind === "NIGHT" ? nightEnd : end,
      attendees,
      participants: kind === "NIGHT" ? parseParticipants(participantText) : [],
    };
    const validation = validateRequest(draft, selected.capacity);
    setErrors(validation);
    if (validation.length) return;
    const request: SpaceRequest = {
      ...draft,
      id: `DEMO-${Date.now()}`,
      stage: "DEPARTMENT_REVIEW",
      createdAt: new Date().toISOString(),
      note: "",
    };
    onCreate(request);
    setCreatedId(request.id);
  }

  function fillDemoRequest() {
    setApplicant(profile.name || "한성 데모");
    setStudentId(profile.studentId || "20260001");
    setDepartment(profile.currentTrack || "웹공학트랙");
    setPhone("010-0000-0000");
    setProfessor("데모 지도교수");
    setPurpose("팀 프로젝트 및 발표 준비");
    if (kind === "NIGHT") {
      setAttendees(5);
      setEndDate(followingDate(date));
      setNightEnd("08:00");
      setParticipantText(
        Array.from(
          { length: 5 },
          (_, index) => `웹공학트랙, 2026000${index + 1}, 데모 학생 ${index + 1}`,
        ).join("\n"),
      );
    }
    setErrors([]);
  }

  function probeLocation() {
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationResult("이 브라우저에서는 보안 연결 또는 위치 기능이 없어 확인할 수 없습니다.");
      return;
    }
    setLocationResult("위치 권한을 확인하고 있습니다…");
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocationResult(
          `기기 위치 확인 가능 · 오차 반경 약 ${Math.round(position.coords.accuracy)}m. 실내 강의실 입실 증빙은 아닙니다. 위치 좌표는 저장하지 않습니다.`,
        ),
      () =>
        setLocationResult(
          "위치 권한이 거부되었거나 위치를 확인할 수 없습니다. 신청·승인 데모는 계속 사용할 수 있습니다.",
        ),
      { timeout: 10000, maximumAge: 0, enableHighAccuracy: false },
    );
  }

  return (
    <section className="feature-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SPACE WORKFLOW · DEMO</p>
          <h2>이용 조건 → 공간 → 신청서 → 승인 현황</h2>
        </div>
      </div>
      <p className="feature-note">
        공간 목록과 빈 시간은 시연용 예시입니다. 수업 편성·실제 예약·학과/학생복지팀/CAPS 전송과
        연동하지 않습니다.
      </p>
      <form
        className="panel feature-panel"
        onSubmit={(event) => {
          event.preventDefault();
          setSearched(true);
          setSpaceId("");
          setCreatedId("");
        }}
      >
        <h3>1. 언제, 몇 명이 이용하나요?</h3>
        <div className="feature-fields">
          <label>
            이용 날짜
            <input
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setEndDate(
                  kind === "NIGHT" ? followingDate(event.target.value) : event.target.value,
                );
              }}
              required
            />
          </label>
          <label>
            시작 시간
            <input
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              required
            />
          </label>
          <label>
            종료 시간
            <input
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              required
            />
          </label>
          <label>
            참여 인원
            <input
              type="number"
              min="1"
              value={attendees}
              onChange={(event) => setAttendees(Number(event.target.value))}
              required
            />
          </label>
        </div>
        <button className="primary-button" type="submit">
          조건에 맞는 공간 찾기
        </button>
      </form>
      {searched ? (
        <section className="panel feature-panel">
          <h3>
            2. 공간 선택{" "}
            <small>
              {date} · {start}–{end} · {attendees}명
            </small>
          </h3>
          {start >= end ? (
            <p role="alert">종료 시간을 시작 시간보다 늦게 선택해 주세요.</p>
          ) : matches.length ? (
            <div className="space-choices">
              {matches.map((space) => (
                <button
                  key={space.id}
                  type="button"
                  className={spaceId === space.id ? "selected" : ""}
                  onClick={() => {
                    setSpaceId(space.id);
                    setCreatedId("");
                  }}
                >
                  <b>{space.name}</b>
                  <span>
                    {space.place} · 정원 {space.capacity}명 · DEMO {space.from}–{space.to}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p>이 조건에 맞는 DEMO 공간이 없습니다. 시간이나 인원을 바꿔 다시 검색해 주세요.</p>
          )}
        </section>
      ) : null}
      {selected ? (
        <section className="panel feature-panel">
          <h3>3. 신청서 작성</h3>
          <fieldset className="scenario-tabs">
            <legend>신청 유형</legend>
            <button
              type="button"
              className={kind === "ROOM" ? "selected" : ""}
              aria-pressed={kind === "ROOM"}
              onClick={() => setKind("ROOM")}
            >
              강의실 이용
            </button>
            <button
              type="button"
              className={kind === "NIGHT" ? "selected" : ""}
              aria-pressed={kind === "NIGHT"}
              onClick={() => {
                setKind("NIGHT");
                setEndDate(followingDate(date));
              }}
            >
              야간잔류
            </button>
          </fieldset>
          <p className="feature-note">
            {kind === "NIGHT"
              ? "공식 야간잔류 HWP의 주요 항목을 반영했습니다. 최소 5명, 1주일 단위로 신청하세요. 위 공간 검색은 시작 시간대의 샘플일 뿐, 다음 날까지의 이용 가능성을 확인하지 않습니다. 실제 결재·CAPS 전달은 수행하지 않습니다."
              : "강의실 이용 요청은 서비스 제안용 DEMO 양식이며 학교 공식 서식이 아닙니다. 실제 절차는 학사운영팀 확인 후 진행해야 합니다."}
          </p>
          <button className="secondary-button" type="button" onClick={fillDemoRequest}>
            시연용 신청서 자동 입력
          </button>
          <div className="feature-fields">
            <label>
              신청인
              <input value={applicant} onChange={(event) => setApplicant(event.target.value)} />
            </label>
            <label>
              학번
              <input value={studentId} onChange={(event) => setStudentId(event.target.value)} />
            </label>
            <label>
              소속
              <input value={department} onChange={(event) => setDepartment(event.target.value)} />
            </label>
            <label>
              연락처
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="예: 010-0000-0000"
              />
            </label>
            <label>
              지도교수 성명
              <input
                value={professor}
                onChange={(event) => setProfessor(event.target.value)}
                placeholder="실제 결재/서명은 별도"
              />
            </label>
            <label>
              사용 목적
              <input
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="예: 팀 프로젝트"
              />
            </label>
            {kind === "NIGHT" ? (
              <>
                <label>
                  잔류 종료 날짜
                  <input
                    type="date"
                    min={date}
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </label>
                <label>
                  잔류 종료 시간
                  <input
                    type="time"
                    value={nightEnd}
                    onChange={(event) => setNightEnd(event.target.value)}
                  />
                </label>
              </>
            ) : null}
          </div>
          {kind === "NIGHT" ? (
            <label className="feature-field">
              잔류자 명단 · 한 줄에 소속, 학번, 성명
              <textarea
                rows={6}
                value={participantText}
                onChange={(event) => setParticipantText(event.target.value)}
                placeholder={"웹공학트랙, 20260001, 김한성\n웹공학트랙, 20260002, 이한성"}
              />
            </label>
          ) : null}
          {errors.length ? (
            <ul className="feature-errors" role="alert">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          <button className="primary-button" type="button" onClick={createRequest}>
            DEMO 신청서 생성
          </button>
          <p className="feature-links">
            <a
              href={kind === "NIGHT" ? NIGHT_GUIDE_URL : ROOM_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
            >
              학교 안내 확인
            </a>
            {kind === "NIGHT" ? (
              <>
                {" "}
                ·{" "}
                <a href={NIGHT_FORM_URL} target="_blank" rel="noreferrer">
                  원본 HWP 다운로드
                </a>
              </>
            ) : null}
          </p>
        </section>
      ) : null}
      {created ? (
        <section className="feature-stack" aria-live="polite">
          <div className="panel feature-panel">
            <h3>4. 내 신청 현황</h3>
            <p>
              <b>{requestStageLabel[created.stage]}</b> · {created.id}
            </p>
            <p>
              관리자 DEMO 화면에서 상태를 변경하면 여기에 반영됩니다. 실제 승인·예약은 발생하지
              않습니다.
            </p>
            {created.note ? <p>관리자 메모: {created.note}</p> : null}
          </div>
          <RequestDocument request={created} />
          <button type="button" className="secondary-button" onClick={() => window.print()}>
            문서 인쇄
          </button>
          {created.stage === "DEMO_APPROVED" ? (
            <div className="panel feature-panel">
              <h3>입실 위치 확인 기술 시험</h3>
              <p>
                사용자 동의를 받아 기기 위치를 읽을 수 있는지만 확인합니다. 실내 강의실 입실·퇴실
                증명은 불가능하며 좌표를 저장하지 않습니다.
              </p>
              <button type="button" onClick={probeLocation}>
                내 위치 확인해 보기
              </button>
              <output>{locationResult}</output>
            </div>
          ) : null}
        </section>
      ) : null}
      {requests.length > 0 ? (
        <section className="panel feature-panel">
          <h3>신청 내역 · 이 세션의 DEMO</h3>
          <ul className="feature-list">
            {requests.map((request) => (
              <li key={request.id}>
                <span>
                  <b>{request.spaceName}</b>
                  <small>
                    {request.date} · {request.kind === "NIGHT" ? "야간잔류" : "강의실 이용"}
                  </small>
                </span>
                <button type="button" onClick={() => setCreatedId(request.id)}>
                  {requestStageLabel[request.stage]} · 문서 보기
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

export function SpaceAdmin({
  requests,
  onUpdate,
}: {
  requests: SpaceRequest[];
  onUpdate: (id: string, patch: Partial<SpaceRequest>) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <section className="panel feature-panel">
      <h2>신청 중간 점검 · 관리자 DEMO</h2>
      <p className="feature-note">
        역할 인증·학교 시스템 연동이 없는 시연 화면입니다. 이 화면의 승인은 학교 허가가 아닙니다.
      </p>
      <div className="feature-metrics">
        <span>
          <b>{requests.length}건</b> 전체 신청
        </span>
        <span>
          <b>{requests.filter((item) => item.stage === "DEMO_APPROVED").length}건</b> DEMO 완료
        </span>
        <span>
          <b>{requests.filter((item) => item.stage === "CHANGES_REQUESTED").length}건</b> 보완 요청
        </span>
      </div>
      {requests.length ? (
        requests.map((request) => (
          <article key={request.id} className="admin-request">
            <div>
              <b>
                {request.spaceName} · {request.kind === "NIGHT" ? "야간잔류" : "강의실 이용"}
              </b>
              <p>
                {request.applicant} · {request.date} {request.start}–{request.end} ·{" "}
                {request.attendees}명
              </p>
              <p>현재: {requestStageLabel[request.stage]}</p>
            </div>
            <details>
              <summary>신청 문서 확인</summary>
              <RequestDocument request={request} />
            </details>
            <label>
              검토 메모
              <input
                value={notes[request.id] ?? request.note}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                }
                placeholder="보완 요청 사유"
              />
            </label>
            <div className="admin-actions">
              <button
                type="button"
                disabled={!nextRequestStage(request)}
                onClick={() => {
                  const stage = nextRequestStage(request);
                  if (stage)
                    onUpdate(request.id, { stage, note: notes[request.id] ?? request.note });
                }}
              >
                다음 단계로
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdate(request.id, {
                    stage: "CHANGES_REQUESTED",
                    note: notes[request.id] ?? request.note,
                  })
                }
              >
                보완 요청
              </button>
            </div>
          </article>
        ))
      ) : (
        <p>아직 DEMO 신청이 없습니다. 공간 찾기에서 신청서를 생성해 보세요.</p>
      )}
    </section>
  );
}
