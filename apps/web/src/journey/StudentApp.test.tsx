import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const styles = readFileSync(resolve("src/journey/journey.css"), "utf8");

import { STORAGE_KEY, todayKst } from "./model";
import { createApplicationPdf } from "./pdf";
import { StudentApp } from "./StudentApp";

vi.mock("./cloud", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cloud")>()),
  cloudConfigured: false,
}));

vi.mock("./PdfPreview", () => ({
  PdfPreview: () => (
    <section aria-label="공식 원본 양식에 입력한 데모 신청서">문서 렌더링 테스트 대역</section>
  ),
}));
vi.mock("./pdf", () => ({
  createApplicationPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
  downloadPdf: vi.fn(),
}));
// JSDOM lacks dialog APIs. These doubles test our selection/cancel logic,
// not the browser's native modal focus containment or rendered geometry.
beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      },
    },
  });
});
afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime("2026-09-28T09:00:00+09:00");
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  localStorage.clear();
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:demo-pdf");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    fillText: vi.fn(),
    getImageData: vi.fn(() => ({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([25, 31, 40, 255]),
    })),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,DEMO");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function enter(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "시작하기" }));
  await user.click(screen.getByRole("button", { name: "데모 시작하기" }));
}
async function tab(user: ReturnType<typeof userEvent.setup>, name: string) {
  if (name === "내 정보") {
    await user.click(screen.getByRole("button", { name: "내 정보 열기" }));
    return;
  }
  await user.click(
    within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole("button", {
      name,
    }),
  );
}
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(`^${label} `) }));
  const dialog = screen.getByRole("dialog", { name: `${label} 선택` });
  await user.click(within(dialog).getByRole("button", { name: option }));
}
async function sign(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("서명 이름 입력"), "메이트 학생");
  await user.click(screen.getByRole("button", { name: "입력한 이름으로 데모 서명" }));
  await user.click(screen.getByRole("button", { name: "서명 반영한 PDF 미리보기" }));
  await screen.findByRole("region", { name: "공식 원본 양식에 입력한 데모 신청서" });
  await user.click(screen.getByLabelText("서류 내용을 확인했어요"));
}
describe("통합 학생 앱의 전체 데모 여정", () => {
  it("내 정보 상단과 이수 과목의 학점·성적을 함께 보여 준다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "내 정보");
    expect(screen.getByRole("heading", { name: "메이트 학생" })).toBeTruthy();
    expect(screen.getAllByText("모바일소프트웨어트랙").length).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: "이수한 과목과 성적" }));
    expect(screen.getAllByText("A+ · 4.5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3학점").length).toBeGreaterThan(0);
  });
  it("바로 예약에서 입실·마감 알림·퇴실과 저장된 신청 내역까지 이어진다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    await u.click(screen.getByRole("button", { name: /빈 공간 바로 예약/ }));
    await u.click(screen.getByRole("button", { name: "가능한 공간 찾기" }));
    await u.click(
      screen.getAllByRole("button", { name: /상상파크 C&C멀티스튜디오/ })[0] as HTMLElement,
    );
    await u.click(screen.getByRole("button", { name: "예약하기" }));
    expect(screen.getByRole("heading", { name: "예약 완료" })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "시작 5분 전" }));
    await u.click(screen.getByRole("button", { name: "체크인" }));
    expect(screen.getByText(/동반자 1명이 자기 휴대폰으로/)).toBeTruthy();
    await u.type(screen.getByLabelText(/함께 온 사람 학번/), "2412999");
    await u.click(screen.getByRole("button", { name: "체크인" }));
    await u.click(screen.getByRole("button", { name: "종료 10분 전 알림 체험" }));
    expect(screen.getByRole("status").textContent).toContain("곧 이용 시간이 끝나요");
    await u.click(screen.getByRole("button", { name: "퇴실 확인" }));
    expect(screen.getByRole("heading", { name: "퇴실 완료" })).toBeTruthy();
    await tab(u, "내 정보");
    await u.click(screen.getByRole("button", { name: /공간 신청 내역/ }));
    expect(screen.getByText(new RegExp(`${todayKst()} 17:00 · 퇴실 완료`))).toBeTruthy();
  });
  it("야간 잔류 명단·서명·보완·재서명·재제출·승인을 끝까지 처리한다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    await u.click(screen.getByRole("button", { name: "평소 야간 잔류 신청" }));
    await choose(u, "상주 장소", "상상파크");
    await u.click(screen.getByRole("button", { name: "인원 더 추가하기" }));
    expect(screen.getByLabelText("참여자 2 이름")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "시연용 5명 채우기" }));
    await u.click(screen.getByRole("button", { name: "서류 초안 확인하기" }));
    await sign(u);
    await u.click(screen.getByRole("button", { name: "신청하기" }));
    await u.click(await screen.findByRole("button", { name: "관리자 처리 체험" }));
    await u.click(screen.getByRole("button", { name: "보완 요청 보내기" }));
    await u.click(screen.getByRole("button", { name: "내용 수정하고 다시 제출" }));
    fireEvent.change(screen.getByLabelText("사용 목적"), {
      target: { value: "졸업 작품 발표 준비" },
    });
    await u.click(screen.getByRole("button", { name: "서류 초안 확인하기" }));
    await sign(u);
    await u.click(screen.getByRole("button", { name: "보완 내용 다시 제출" }));
    await u.click(await screen.findByRole("button", { name: "관리자 처리 체험" }));
    await u.click(screen.getByRole("button", { name: "승인하기" }));
    expect(screen.getByRole("heading", { name: "예약 완료" })).toBeTruthy();
    expect(screen.getByText("수정 2차")).toBeTruthy();
    const revised = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").bookings[0];
    expect(revised.revisions).toHaveLength(2);
    expect(revised.revisions[0].revision).toBe(1);
    expect(revised.revisions[1].revision).toBe(2);
    expect(revised.revisions[1].fields.purpose).toBe("졸업 작품 발표 준비");
    expect(revised.revisions[0].fields.purpose).not.toBe(revised.revisions[1].fields.purpose);
    expect(createApplicationPdf).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 2 }));
    expect(screen.getByRole("button", { name: "내 신청서 PDF 다운로드" })).toBeTruthy();
  }, 15000);
  it("시험기간 위치 확인 데모를 거쳐 입실한다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    await u.click(screen.getByRole("button", { name: "시험기간 야간 상주" }));
    await choose(u, "상주 장소", "집중열람실");
    expect(
      (screen.getByRole("button", { name: "야간 상주 입실하기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await u.click(screen.getByRole("button", { name: "위치 확인 체험" }));
    await u.click(screen.getByRole("button", { name: "야간 상주 입실하기" }));
    expect(screen.getByRole("heading", { name: "이용 중" })).toBeTruthy();
  });
  it("실제 CSS가 모든 예약 입력칸에 공통 크기를 적용하고 트랙은 세로로 배치한다", async () => {
    const style = document.createElement("style");
    style.textContent = styles;
    document.head.append(style);
    try {
      const u = userEvent.setup();
      const { container } = render(<StudentApp />);
      await enter(u);
      expect(container.querySelector(".c-home")).toBeTruthy();
      await tab(u, "공간");
      await u.click(screen.getByRole("button", { name: /빈 공간 바로 예약/ }));
      for (const label of ["사용 목적", "이용 인원", "시작 시간", "종료 시간"]) {
        const input = screen.getByLabelText(label);
        const computed = getComputedStyle(input);
        expect(computed.width).toBe("100%");
        expect(computed.minHeight).toBe("56px");
        expect(computed.borderRadius).toBe("16px");
        expect(getComputedStyle(input.parentElement as Element).display).toBe("grid");
      }
    } finally {
      style.remove();
    }
  });
});

describe("입력 보존과 즉각적인 학점·일정 피드백", () => {
  it("목적이 있어도 장소 미선택이면 장소만 안내하고 명단에 변경값을 반영한다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    await u.click(screen.getByRole("button", { name: "평소 야간 잔류 신청" }));
    fireEvent.change(screen.getByLabelText("사용 목적"), { target: { value: "졸업 전시 준비" } });
    await u.click(screen.getByRole("button", { name: "시연용 5명 채우기" }));
    fireEvent.change(screen.getByLabelText("신청인"), { target: { value: "새 신청인" } });
    fireEvent.change(screen.getByRole("textbox", { name: "학번" }), {
      target: { value: "DEMO9999" },
    });
    expect((screen.getByLabelText("참여자 1 이름") as HTMLInputElement).value).toBe("새 신청인");
    expect((screen.getByLabelText("참여자 1 학번") as HTMLInputElement).value).toBe("DEMO9999");
    await u.click(screen.getByRole("button", { name: "서류 초안 확인하기" }));
    expect(screen.getByRole("alert").textContent).toBe("이용할 장소를 선택해 주세요.");
    await choose(u, "상주 장소", "상상베이스 자유이용공간");
    await u.click(screen.getByRole("button", { name: "서류 초안 확인하기" }));
    const summary = screen.getByRole("region", { name: "예약 일정 요약" });
    expect(summary.textContent).toContain("다음 날");
    expect(summary.textContent).toContain("총 10시간 · 5명");
    expect(screen.getByText("졸업 전시 준비 · 5명")).toBeTruthy();
    await u.type(screen.getByLabelText("서명 이름 입력"), "새 신청인");
    await u.click(screen.getByRole("button", { name: "입력한 이름으로 데모 서명" }));
    await u.click(screen.getByRole("button", { name: "서명 반영한 PDF 미리보기" }));
    await screen.findByRole("region", { name: "공식 원본 양식에 입력한 데모 신청서" });
    expect(createApplicationPdf).toHaveBeenLastCalledWith(
      expect.objectContaining({
        purpose: "졸업 전시 준비",
        applicant: "새 신청인",
        studentId: "DEMO9999",
        members: expect.arrayContaining([
          expect.objectContaining({ name: "새 신청인", studentId: "DEMO9999" }),
        ]),
      }),
    );
  });
});

describe("작성 중 상태 복원", () => {
  it("신청 입력을 복원하고 서명·제출 동의는 복원하지 않는다", async () => {
    const u = userEvent.setup();
    const app = render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    await u.click(screen.getByRole("button", { name: "평소 야간 잔류 신청" }));
    await choose(u, "상주 장소", "상상파크");
    await u.click(screen.getByRole("button", { name: "시연용 5명 채우기" }));
    fireEvent.change(screen.getByLabelText("사용 목적"), { target: { value: "복원 확인" } });
    await u.click(screen.getByRole("button", { name: "서류 초안 확인하기" }));
    await sign(u);
    app.unmount();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    expect((screen.getByLabelText("사용 목적") as HTMLInputElement).value).toBe("복원 확인");
    await u.click(screen.getByRole("button", { name: "서류 초안 확인하기" }));
    expect(screen.queryByLabelText("서류 내용을 확인했어요")).toBeNull();
    expect((screen.getByRole("button", { name: "신청하기" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe("학기 계획과 예약 변경", () => {
  it("예약 변경을 취소하면 원본을 보존하고 확정 시 같은 예약의 이력을 갱신한다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    await u.click(screen.getByRole("button", { name: /빈 공간 바로 예약/ }));
    await u.click(screen.getByRole("button", { name: "가능한 공간 찾기" }));
    await u.click(
      screen.getAllByRole("button", { name: /상상파크 C&C멀티스튜디오/ })[0] as HTMLElement,
    );
    await u.click(screen.getByRole("button", { name: "예약하기" }));
    const first = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").bookings[0];
    await u.click(screen.getByRole("button", { name: "예약 내용 변경하기" }));
    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "15:00" } });
    await u.click(screen.getByRole("button", { name: "변경 취소하고 기존 예약 보기" }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").bookings[0]).toEqual(first);
    await u.click(screen.getByRole("button", { name: "예약 내용 변경하기" }));
    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "15:00" } });
    await u.click(screen.getByRole("button", { name: "가능한 공간 찾기" }));
    await u.click(
      screen.getAllByRole("button", { name: /상상파크 C&C멀티스튜디오/ })[0] as HTMLElement,
    );
    await u.click(screen.getByRole("button", { name: "예약 변경 확정" }));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").bookings;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: first.id, start: "15:00", revision: 2 });
    await u.click(screen.getByRole("button", { name: "같은 내용으로 새 예약" }));
    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("종료 시간"), { target: { value: "11:00" } });
    await u.click(screen.getByRole("button", { name: "가능한 공간 찾기" }));
    await u.click(
      screen.getAllByRole("button", { name: /상상파크 C&C멀티스튜디오/ })[0] as HTMLElement,
    );
    await u.click(screen.getByRole("button", { name: "예약하기" }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").bookings).toHaveLength(2);
  });
});

describe("계정 백업 파이프라인", () => {
  it("데모 백업에서 저장·변경·복원을 끝까지 보여 준다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "내 정보");
    await u.click(screen.getByRole("button", { name: "계정과 백업" }));
    await u.click(screen.getByRole("button", { name: "데모 계정으로 흐름 체험" }));
    await u.click(screen.getByRole("button", { name: "지금 내용 백업하기" }));
    await u.click(screen.getByRole("button", { name: "백업 확정" }));
    expect(await screen.findByText("데모 백업을 이 브라우저에 저장했어요.")).toBeTruthy();
    await tab(u, "내 정보");
    await u.click(screen.getByRole("button", { name: "내 정보 수정" }));
    fireEvent.change(screen.getByLabelText("이름", { exact: true }), {
      target: { value: "변경 학생" },
    });
    await u.click(screen.getByRole("button", { name: "수정 완료" }));
    await u.click(screen.getByRole("button", { name: "계정과 백업" }));
    await u.click(screen.getByRole("button", { name: "데모 계정으로 흐름 체험" }));
    await u.click(screen.getByRole("button", { name: "저장된 백업 불러오기" }));
    await u.click(screen.getByRole("button", { name: "복원 확정" }));
    expect(await screen.findByText("저장한 정보와 신청 내역을 복원했어요.")).toBeTruthy();
    await tab(u, "내 정보");
    expect(screen.getByRole("heading", { name: "메이트 학생" })).toBeTruthy();
  });
});

describe("1차 회귀 방지", () => {
  it("저장 전 정보는 유지하고 수정 취소를 확인한 뒤 이동한다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "내 정보");
    await u.click(screen.getByRole("button", { name: "내 정보 수정" }));
    fireEvent.change(screen.getByLabelText("이름", { exact: true }), {
      target: { value: "저장하지 않은 이름" },
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").profile.name).toBe("메이트 학생");
    await tab(u, "홈");
    expect(screen.getByRole("dialog", { name: "수정 중인 정보를 닫을까요?" })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "수정 취소하고 이동" }));
    await tab(u, "내 정보");
    expect(screen.getByRole("heading", { name: "메이트 학생" })).toBeTruthy();
  });
});

describe("개인 이수 기록 연결", () => {
  it("성적 수정이 실제 수강 학기와 학점 요약에 반영되고 새로고침 후 남는다", async () => {
    const u = userEvent.setup();
    const app = render(<StudentApp />);
    await enter(u);
    await tab(u, "내 정보");
    await u.click(screen.getByRole("button", { name: "이수한 과목과 성적" }));
    const editButton = screen.getAllByRole("button", { name: /기록 수정$/ })[0];
    if (!editButton) throw Error("missing record");
    await u.click(editButton);
    await u.selectOptions(screen.getByLabelText("내 성적"), "F");
    await u.selectOptions(screen.getByLabelText("실제 수강 학기"), "2-2");
    await u.click(screen.getByRole("button", { name: "이수 기록 저장" }));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(saved.academic.records.find((r: { grade: string }) => r.grade === "F")).toMatchObject({
      term: "2-2",
      origin: "MANUAL",
      recognition: "UNVERIFIED",
    });
    app.unmount();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "학업");
    expect(screen.getByText(/학점/, { selector: "b" })).toBeTruthy();
  });
  it("강의실 신청은 건물과 호실을 골라야 서류로 넘어가고 서류에는 짧게 들어간다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    await u.click(screen.getByRole("button", { name: /강의실·승인 신청/ }));
    await u.click(screen.getByRole("button", { name: "가능한 공간 찾기" }));
    await u.click(screen.getAllByRole("button", { name: /강의실 \(미래관/ })[0] as HTMLElement);
    await u.click(screen.getByRole("button", { name: "서류 초안 확인하기" }));
    expect(screen.getByText(/건물과 호실을 골라 주세요/)).toBeTruthy();
    await u.selectOptions(screen.getByLabelText("강의실 건물"), "미래관");
    await u.type(screen.getByLabelText("호실"), "304");
    await u.click(screen.getByRole("button", { name: "서류 초안 확인하기" }));
    expect(screen.getByRole("heading", { name: "서류를 확인하고 서명해 주세요" })).toBeTruthy();
    expect(screen.getAllByText("미래관 304호").length).toBeGreaterThan(0);
  });
  it("팀원 학번으로 팀을 만들고 모두 승인하면 강의실을 신청하고, 승인 결과가 팀원 모두에게 간다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "모임");
    const invite = screen.getByRole("region", { name: "캡스톤 디자인 팀 (예시) 초대" });
    expect(within(invite).getByText(/학교 메일 인증을 한 계정만/)).toBeTruthy();
    await u.click(within(invite).getByRole("button", { name: "메일 인증하고 승인" }));
    expect(screen.queryByRole("region", { name: "캡스톤 디자인 팀 (예시) 초대" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "새 스터디·팀 만들기" }));
    await u.type(screen.getByLabelText("이름"), "캡스톤 회의");
    await u.type(screen.getByLabelText("팀원 1 학번"), "2412001");
    await u.type(screen.getByLabelText("팀원 1 이름"), "김하나");
    await u.type(screen.getByLabelText("팀원 2 학번"), "123");
    await u.click(screen.getByRole("button", { name: "만들고 초대 보내기" }));
    expect(screen.getByText(/123: 학번은 숫자 7~10자리/)).toBeTruthy();
    await u.clear(screen.getByLabelText("팀원 2 학번"));
    await u.type(screen.getByLabelText("팀원 2 학번"), "2412002");
    await u.click(screen.getByRole("button", { name: "만들고 초대 보내기" }));
    const team = screen.getByRole("region", { name: "캡스톤 회의" });
    expect(within(team).getAllByText("2412***")).toHaveLength(2);
    expect(
      (within(team).getByRole("button", { name: "강의실 신청" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(team).getByText(/그룹스터디룸은 2명 더 필요/)).toBeTruthy();
    for (const b of within(team).getAllByRole("button", { name: "데모: 팀원이 메일 인증 후 승인" }))
      await u.click(b);
    expect(within(team).getByText(/지금 3명/)).toBeTruthy();
    expect(within(team).getAllByText("학교 메일 ✓")).toHaveLength(3);
    expect(within(team).getByText("김하나 · 2412001")).toBeTruthy();
    await u.click(within(team).getByRole("button", { name: "강의실 신청" }));
    expect((screen.getByLabelText("이용 인원") as HTMLInputElement).value).toBe("3");
    await u.click(screen.getByRole("button", { name: "가능한 공간 찾기" }));
    await u.click(screen.getAllByRole("button", { name: /강의실 \(미래관/ })[0] as HTMLElement);
    await u.selectOptions(screen.getByLabelText("강의실 건물"), "미래관");
    await u.type(screen.getByLabelText("호실"), "304");
    await u.click(screen.getByRole("button", { name: "서류 초안 확인하기" }));
    await sign(u);
    await u.click(screen.getByRole("button", { name: "신청하기" }));
    await u.click(await screen.findByRole("button", { name: "관리자 처리 체험" }));
    await u.click(screen.getByRole("button", { name: "승인하기" }));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(saved.bookings[0].members.map((m: { studentId: string }) => m.studentId)).toEqual([
      "DEMO0001",
      "2412001",
      "2412002",
    ]);
    const group = saved.campus.groups.find((g: { name: string }) => g.name === "캡스톤 회의");
    expect(group.notices[0]).toMatchObject({
      text: expect.stringMatching(/강의실 신청이 승인됐어요 · 미래관 304호/),
      to: ["DEMO0001", "2412001", "2412002"],
    });
    await tab(u, "모임");
    expect(screen.getByText(/강의실 신청을 냈어요/)).toBeTruthy();
    expect(screen.getAllByText(/팀원 3명에게 알림/)).toHaveLength(2);
    await u.click(screen.getByRole("button", { name: "한성 메이트" }));
    expect(screen.getByText(/팀 알림 · 캡스톤 회의/)).toBeTruthy();
  });
  it("오른쪽 위에서 시험기간 체험으로 바꾸면 홈과 공간 탭에 야간 상주가 먼저 나온다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    const mode = screen.getByRole("group", { name: "체험 모드" });
    expect(within(mode).getByRole("button", { name: "평소" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.queryByText("오늘 밤 야간 상주 신청")).toBeNull();
    await u.click(within(mode).getByRole("button", { name: "시험기간" }));
    expect(screen.getByText(/10.19\(월\) 기준 · 시험기간 체험/)).toBeTruthy();
    await tab(u, "공간");
    expect(screen.getByText(/중간고사 기간이에요/)).toBeTruthy();
    await tab(u, "홈");
    await u.click(screen.getByRole("button", { name: /오늘 밤 야간 상주 신청/ }));
    expect(screen.getByRole("heading", { name: "오늘의 야간 상주" })).toBeTruthy();
    expect(screen.queryByText(/학사일정상 시험기간이 아니에요/)).toBeNull();
    await choose(u, "상주 장소", "집중열람실");
    await u.click(screen.getByRole("button", { name: "위치 확인 체험" }));
    await u.click(screen.getByRole("button", { name: "야간 상주 입실하기" }));
    expect(screen.getByRole("heading", { name: "이용 중" })).toBeTruthy();
    await tab(u, "홈");
    const stay = screen.getByRole("region", { name: "내 입실·퇴실" });
    expect(within(stay).getByText(/이용 중 · 시험기간 야간 상주/)).toBeTruthy();
    expect(within(stay).getByRole("button", { name: "퇴실하기" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").bookings[0]).toMatchObject({
      kind: "EXAM",
      date: "2026-10-19",
      endDate: "2026-10-20",
    });
    await u.click(within(mode).getByRole("button", { name: "평소" }));
    await tab(u, "홈");
    expect(screen.queryByText("오늘 밤 야간 상주 신청")).toBeNull();
  });
  it("모임의 야간잔류 탭에서 5명이 모이면 명단이 채워진 강의실 야간잔류 신청서를 바로 낸다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "모임");
    await u.click(screen.getByRole("button", { name: "야간잔류" }));
    expect(screen.getByText(/5명 이상이 함께 신청해야 허가돼요/)).toBeTruthy();
    const post = screen.getByRole("region", { name: "기말 대비 밤샘 스터디 (예시)" });
    expect(within(post).getByText("4/5명")).toBeTruthy();
    expect(
      (within(post).getByRole("button", { name: "바로 신청하기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await u.click(within(post).getByRole("button", { name: "참여하기" }));
    expect(within(post).getByText("5/5명")).toBeTruthy();
    expect(
      (within(post).getByRole("button", { name: "바로 신청하기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(post).getByText(/서명 0\/5/)).toBeTruthy();
    await u.click(within(post).getByRole("button", { name: "내 이름으로 전자서명" }));
    for (const b of within(post).getAllByRole("button", { name: "데모: 팀원 폰에서 서명" }))
      await u.click(b);
    expect(within(post).getByText(/5명 모두 전자서명을 마쳤어요/)).toBeTruthy();
    await u.click(within(post).getByRole("button", { name: "바로 신청하기" }));
    expect(screen.getByText(/강의실 야간잔류 · 5명/)).toBeTruthy();
    await u.selectOptions(screen.getByLabelText("강의실 건물"), "탐구관");
    await u.type(screen.getByLabelText("호실"), "205");
    await u.click(screen.getByRole("button", { name: "서류 초안 확인하기" }));
    await sign(u);
    await u.click(screen.getByRole("button", { name: "신청하기" }));
    await screen.findByRole("button", { name: "관리자 처리 체험" });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(saved.bookings[0]).toMatchObject({
      kind: "NIGHT",
      spaceId: "classroom-night",
      space: "탐구관 205호",
      start: "22:00",
      count: 5,
    });
    expect(saved.bookings[0].members[0].studentId).toBe("DEMO0001");
    expect(
      saved.bookings[0].members.every((m: { signature?: string }) =>
        m.signature?.startsWith("data:image/png"),
      ),
    ).toBe(true);
    expect(saved.campus.nightPosts[0].bookingId).toBe(saved.bookings[0].id);
  });
});
