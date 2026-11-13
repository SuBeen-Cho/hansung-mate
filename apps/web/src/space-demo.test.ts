import { describe, expect, it } from "vitest";
import { nextRequestStage, type SpaceRequest, validateRequest } from "./space-demo";

const sample: SpaceRequest = {
  id: "DEMO-1",
  kind: "NIGHT",
  applicant: "메이트 데모",
  studentId: "20260001",
  department: "컴퓨터공학부",
  phone: "010-0000-0000",
  professor: "",
  purpose: "팀 프로젝트",
  spaceId: "room-1",
  spaceName: "데모 강의실",
  date: "2026-10-07",
  endDate: "2026-10-07",
  start: "18:00",
  end: "22:00",
  attendees: 5,
  participants: Array.from({ length: 5 }, (_, index) => ({
    department: "컴퓨터공학부",
    studentId: `2026000${index + 1}`,
    name: `참여자 ${index + 1}`,
  })),
  stage: "DEPARTMENT_REVIEW",
  createdAt: "2026-09-23T00:00:00Z",
  note: "",
};

describe("공간 신청 DEMO", () => {
  it("야간잔류 인원·명단·주 단위 입력을 검증한다", () => {
    expect(validateRequest(sample, 30)).toEqual([]);
    expect(
      validateRequest(
        { ...sample, attendees: 4, participants: sample.participants.slice(0, 4) },
        30,
      ),
    ).toContain("야간잔류는 최소 5명이 필요합니다.");
    expect(validateRequest({ ...sample, endDate: "2026-10-14" }, 30)).toContain(
      "야간잔류는 1주일 단위로 신청서를 나누어 작성해 주세요.",
    );
    expect(
      validateRequest({ ...sample, start: "20:00", end: "08:00", endDate: "2026-10-08" }, 30),
    ).toEqual([]);
  });

  it("학과 검토 후 야간잔류 담당·CAPS 단계로만 이동한다", () => {
    expect(nextRequestStage(sample)).toBe("WELFARE_REVIEW");
    expect(nextRequestStage({ ...sample, stage: "WELFARE_REVIEW" })).toBe("CAPS_COPY_REVIEW");
    expect(nextRequestStage({ ...sample, stage: "CAPS_COPY_REVIEW" })).toBe("DEMO_APPROVED");
    expect(nextRequestStage({ ...sample, stage: "DEMO_APPROVED" })).toBeNull();
  });
});
