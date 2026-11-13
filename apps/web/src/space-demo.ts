export type RequestKind = "ROOM" | "NIGHT";
export type RequestStage =
  | "DEPARTMENT_REVIEW"
  | "SPACE_REVIEW"
  | "WELFARE_REVIEW"
  | "CAPS_COPY_REVIEW"
  | "DEMO_APPROVED"
  | "CHANGES_REQUESTED";

export type Participant = { department: string; studentId: string; name: string };

export type SpaceRequest = {
  id: string;
  kind: RequestKind;
  applicant: string;
  studentId: string;
  department: string;
  phone: string;
  professor: string;
  purpose: string;
  spaceId: string;
  spaceName: string;
  date: string;
  endDate: string;
  start: string;
  end: string;
  attendees: number;
  participants: Participant[];
  stage: RequestStage;
  createdAt: string;
  note: string;
};

export const NIGHT_FORM_URL =
  "https://www.hansung.ac.kr/sites/hansung/files/%ED%95%99%EC%83%9D_%EC%95%BC%EA%B0%84%EC%9E%94%EB%A5%98%EC%8B%A0%EC%B2%AD%EC%84%9C.hwp";
export const NIGHT_GUIDE_URL = "https://www.hansung.ac.kr/hansung/6139/subview.do";
export const ROOM_GUIDE_URL = "https://www.hansung.ac.kr/hansung/6164/subview.do";

export const requestStageLabel: Record<RequestStage, string> = {
  DEPARTMENT_REVIEW: "학과 확인 대기",
  SPACE_REVIEW: "공간 담당 검토",
  WELFARE_REVIEW: "학생복지팀 검토",
  CAPS_COPY_REVIEW: "CAPS 전달 확인",
  DEMO_APPROVED: "DEMO 승인 완료",
  CHANGES_REQUESTED: "보완 요청",
};

export function nextRequestStage(request: SpaceRequest): RequestStage | null {
  switch (request.stage) {
    case "DEPARTMENT_REVIEW":
      return request.kind === "NIGHT" ? "WELFARE_REVIEW" : "SPACE_REVIEW";
    case "SPACE_REVIEW":
      return "DEMO_APPROVED";
    case "WELFARE_REVIEW":
      return "CAPS_COPY_REVIEW";
    case "CAPS_COPY_REVIEW":
      return "DEMO_APPROVED";
    default:
      return null;
  }
}

export function validateRequest(
  request: Pick<
    SpaceRequest,
    | "kind"
    | "applicant"
    | "studentId"
    | "department"
    | "phone"
    | "purpose"
    | "spaceId"
    | "date"
    | "endDate"
    | "start"
    | "end"
    | "attendees"
    | "participants"
  >,
  capacity: number,
): string[] {
  const errors: string[] = [];
  if (!request.applicant.trim() || !request.studentId.trim() || !request.department.trim())
    errors.push("신청자·학번·소속을 입력해 주세요.");
  if (!request.phone.trim() || !request.purpose.trim() || !request.spaceId)
    errors.push("연락처·목적·공간을 입력해 주세요.");
  if (!request.date || !request.endDate || request.endDate < request.date)
    errors.push("올바른 이용 기간을 선택해 주세요.");
  const startsAt = Date.parse(`${request.date}T${request.start}:00`);
  const endsAt = Date.parse(`${request.endDate}T${request.end}:00`);
  if (
    !request.start ||
    !request.end ||
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt <= startsAt
  )
    errors.push("종료 일시를 시작 일시보다 늦게 선택해 주세요.");
  if (!Number.isInteger(request.attendees) || request.attendees < 1 || request.attendees > capacity)
    errors.push(`참여 인원은 1명 이상, 공간 정원 ${capacity}명 이하여야 합니다.`);
  if (request.kind === "NIGHT") {
    if (request.attendees < 5) errors.push("야간잔류는 최소 5명이 필요합니다.");
    if (
      request.participants.length < 5 ||
      request.participants.some(
        (person) => !person.name.trim() || !person.studentId.trim() || !person.department.trim(),
      )
    )
      errors.push("야간잔류 참여자 5명 이상의 소속·학번·이름을 입력해 주세요.");
    if (request.participants.length !== request.attendees)
      errors.push("참여 인원과 잔류자 명단의 인원이 같아야 합니다.");
    const startDate = Date.parse(`${request.date}T00:00:00Z`);
    const endDate = Date.parse(`${request.endDate}T00:00:00Z`);
    if (
      Number.isFinite(startDate) &&
      Number.isFinite(endDate) &&
      endDate - startDate >= 7 * 86_400_000
    )
      errors.push("야간잔류는 1주일 단위로 신청서를 나누어 작성해 주세요.");
  }
  return errors;
}
