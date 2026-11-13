import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "./model";
import { StudentApp } from "./StudentApp";

vi.mock("./cloud", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cloud")>()),
  cloudConfigured: false,
}));
vi.mock("./pdf", () => ({
  createApplicationPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
  downloadPdf: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Monday 09:00 KST
  vi.setSystemTime("2026-09-28T09:00:00+09:00");
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  localStorage.clear();
  window.scrollTo = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:demo");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function enter(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole("button", { name: "시작하기" }));
  await u.click(screen.getByRole("button", { name: "데모 시작하기" }));
}
async function tab(u: ReturnType<typeof userEvent.setup>, name: string) {
  await u.click(
    within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole("button", { name }),
  );
}
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");

describe("캠퍼스 공유 앱", () => {
  it("하단 메뉴가 홈·공간·대여·모임·학업으로 바뀌고 로드맵 메뉴는 없다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["홈", "공간", "대여", "모임", "학업"]);
    expect(screen.getByRole("heading", { name: "오늘 캠퍼스, 어디서 모일까요?" })).toBeTruthy();
  });

  it("말로 찾은 방을 골라 바로 예약까지 이어진다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await u.type(
      screen.getAllByLabelText("찾는 공간을 문장으로 입력")[0] as HTMLElement,
      "내일 오후 3시부터 2시간 4명 화이트보드",
    );
    await u.click(screen.getAllByRole("button", { name: "찾기" })[0] as HTMLElement);
    expect(screen.getByText("4명")).toBeTruthy();
    const talk = screen.getByRole("region", { name: "말로 공간 찾기" });
    const pick = within(talk).getAllByRole("button", { name: /9\.29\(화\) 15:00–17:00/ })[0];
    if (!pick) throw Error("no suggestion");
    await u.click(pick);
    expect(screen.getByRole("heading", { name: "예약 내용을 확인해 주세요" })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "예약하기" }));
    expect(screen.getByRole("heading", { name: "예약 완료" })).toBeTruthy();
    expect(saved().bookings[0]).toMatchObject({ date: "2026-09-29", start: "15:00", count: 4 });
  });

  it("체크인하지 않으면 15분 뒤 자동 반납되고 기록이 남는다", async () => {
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
    await u.click(screen.getByRole("button", { name: /체크인 없이 16분 지남/ }));
    await u.click(screen.getByRole("button", { name: "자동 반납 처리 보기" }));
    expect(screen.getByText(/15분 안에 체크인이 없어 자동 반납/)).toBeTruthy();
    expect(screen.getByText(/대기자가 없어 바로 빈 방으로 공개/)).toBeTruthy();
    expect(saved().bookings[0]).toMatchObject({ stage: "NO_SHOW", autoReleased: true });
  });

  it("한 사람이 하루 3시간을 넘겨 같은 날 또 잡으면 막는다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    await u.click(screen.getByRole("button", { name: /빈 공간 바로 예약/ }));
    const start = screen.getByLabelText("시작 시간");
    await u.clear(start);
    await u.type(start, "13:00");
    const end = screen.getByLabelText("종료 시간");
    await u.clear(end);
    await u.type(end, "17:00");
    await u.click(screen.getByRole("button", { name: "가능한 공간 찾기" }));
    await u.click(
      screen.getAllByRole("button", { name: /상상베이스 그룹스터디룸 IB101/ })[0] as HTMLElement,
    );
    await u.click(screen.getByRole("button", { name: "예약하기" }));
    expect(screen.getByText(/하루 최대 3시간/)).toBeTruthy();
  });

  it("기자재는 기간·수량을 확인해 예약하고 학생회 물품은 회비 납부자만 빌린다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "대여");
    await u.click(screen.getByRole("button", { name: /포터블 모니터/ }));
    await u.click(screen.getByRole("button", { name: "대여 예약 · 데모" }));
    expect(screen.getByText(/포터블 모니터 알파스캔 16F90P 1개를/)).toBeTruthy();
    expect(screen.getByText("수령 전")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "학생회 물품" }));
    await u.click(screen.getByRole("button", { name: /^우산/ }));
    await u.click(screen.getByRole("button", { name: "대여 예약 · 데모" }));
    expect(screen.getByText(/총학생회비 납부 인증이 필요해요/)).toBeTruthy();
    expect(saved().campus.loans).toHaveLength(1);
  });

  it("학교 메일과 학생회 명단으로 인증하면 학생회 물품을 빌리고, 다른 학과 물품은 막힌다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "대여");
    await u.click(screen.getByRole("button", { name: "학생회 물품" }));
    // 학생회 운영자: 이번 학기 총학생회비 납부자 명단(예시)을 올린다
    await u.click(screen.getByText("학생회 운영자 보기 · 데모"));
    await u.click(screen.getByRole("button", { name: "예시 명단 불러오기" }));
    expect(await screen.findByText(/312명 등록 · 학번은 암호화해서 저장/)).toBeTruthy();
    // 학생: 메일 인증 → 명단 확인
    await u.click(screen.getByRole("button", { name: "인증하기" }));
    await u.click(screen.getByRole("button", { name: "학생회 납부자 명단으로 확인" }));
    expect((screen.getByLabelText("학교 메일") as HTMLInputElement).value).toBe(
      "demo0001@hansung.ac.kr",
    );
    await u.clear(screen.getByLabelText("학교 메일"));
    await u.type(screen.getByLabelText("학교 메일"), "demo0001@gmail.com");
    expect(
      (screen.getByRole("button", { name: "인증번호 받기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await u.clear(screen.getByLabelText("학교 메일"));
    await u.type(screen.getByLabelText("학교 메일"), "demo0001@hansung.ac.kr");
    await u.click(screen.getByRole("button", { name: "인증번호 받기" }));
    const code = screen.getByText(/^\d{6}$/).textContent ?? "";
    expect((screen.getByLabelText("인증번호") as HTMLInputElement).value).toBe(code);
    await u.click(screen.getByRole("button", { name: "메일 인증 확인" }));
    expect(screen.getByText(/demo0001@hansung.ac.kr 인증 완료/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "학생회 납부자 명단으로 확인" }));
    expect(await screen.findByText("총학생회비 납부가 확인됐어요.")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "대여 화면으로 돌아가기" }));
    await u.click(screen.getByRole("button", { name: /^우산/ }));
    await u.click(screen.getByRole("button", { name: "대여 예약 · 데모" }));
    expect(screen.getByText(/우산 1개를/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: /^디지털 멀티미터/ }));
    await u.click(screen.getByRole("button", { name: "대여 예약 · 데모" }));
    expect(screen.getByText(/기계전자공학부 학생만 빌릴 수 있어요/)).toBeTruthy();
    expect(JSON.stringify(saved().campus.council)).not.toContain('DEMO0001"');
  });

  it("공간 찾기 결과에서 즐겨찾기한 방이 맨 위로 올라온다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    await u.click(screen.getByRole("button", { name: /빈 공간 바로 예약/ }));
    await u.click(screen.getByRole("button", { name: "가능한 공간 찾기" }));
    const stars = Array.from(document.querySelectorAll<HTMLButtonElement>(".c-star"));
    const last = stars.at(-1);
    if (!last) throw Error("no rooms");
    const name = (last.getAttribute("aria-label") ?? "").replace(/ 즐겨찾기$/, "");
    await u.click(last);
    const first = document.querySelector(".c-star");
    expect(first?.getAttribute("aria-label")).toBe(`${name} 즐겨찾기 해제`);
    expect(screen.getAllByText("★ 즐겨찾기").length).toBe(1);
    await u.click(screen.getByRole("button", { name: "작은 방부터" }));
    expect(screen.queryByText("★ 즐겨찾기")).toBeNull();
  });

  it("모집 인원이 차면 그 시간으로 공간 찾기가 열린다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "모임");
    await u.click(screen.getByRole("button", { name: "모집" }));
    const card = screen.getByText("알고리즘 코딩테스트 모의고사").closest("section");
    if (!card) throw Error("no meetup");
    await u.click(within(card as HTMLElement).getByRole("button", { name: "참여하기" }));
    expect(within(card as HTMLElement).getByText("3/3명")).toBeTruthy();
    await u.click(within(card as HTMLElement).getByRole("button", { name: /공간 잡기/ }));
    expect(screen.getByRole("heading", { name: "언제, 몇 명이 모이나요?" })).toBeTruthy();
    expect((screen.getByLabelText("시작 시간") as HTMLInputElement).value).toBe("13:00");
    expect((screen.getByLabelText("이용 인원") as HTMLInputElement).value).toBe("3");
  });

  it("행사 QR 출석은 코드가 맞아야 하고 같은 학번은 한 번만 기록된다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "모임");
    await u.click(screen.getByRole("button", { name: "행사 QR" }));
    await u.click(screen.getByRole("button", { name: "행사 만들기" }));
    await u.type(screen.getByLabelText("행사 이름"), "학과 간담회");
    await u.click(screen.getByRole("button", { name: "만들고 QR 띄우기" }));
    expect(screen.getByAltText("출석 QR 코드")).toBeTruthy();
    const token = saved().campus.events[0].token as string;
    const fill = async (code: string) => {
      await u.type(screen.getByLabelText("이름"), "김한성");
      await u.type(screen.getByLabelText("학번"), "2412345");
      await u.type(screen.getByLabelText("출석 코드"), code);
      await u.click(screen.getByRole("button", { name: "출석하기" }));
    };
    await fill("WRONG");
    expect(screen.getByText("QR 코드가 맞지 않아요.")).toBeTruthy();
    for (const label of ["이름", "학번", "출석 코드"]) await u.clear(screen.getByLabelText(label));
    await fill(token);
    expect(screen.getByText("김한성님 출석했어요.")).toBeTruthy();
    await fill(token);
    expect(screen.getByText("이미 출석한 학번이에요.")).toBeTruthy();
    expect(saved().campus.events[0].attendees).toHaveLength(1);
  });

  it("학업 탭은 졸업 한 줄·공강·과목 개설 여부만 가볍게 보여 준다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "학업");
    expect(screen.getByText("졸업까지")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /공강 .* 빈 방/ }).length).toBeGreaterThan(0);
    await u.type(screen.getByLabelText("과목 이름 또는 코드"), "자료구조");
    expect(screen.getAllByText(/개설$/).length).toBeGreaterThan(0);
  });
  it("화살표로 시작 시간을 1시간씩 옮기면 종료도 같이 움직이고 날짜는 달력에서 2주 안만 고른다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "공간");
    await u.click(screen.getByRole("button", { name: /빈 공간 바로 예약/ }));
    const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
    expect([value("시작 시간"), value("종료 시간")]).toEqual(["17:00", "19:00"]);
    await u.click(screen.getByRole("button", { name: "시작 시간 1시간 늦게" }));
    expect([value("시작 시간"), value("종료 시간")]).toEqual(["18:00", "20:00"]);
    await u.click(screen.getByRole("button", { name: "종료 시간 1시간 일찍" }));
    expect(value("종료 시간")).toBe("19:00");
    const calendar = screen.getByRole("group", { name: "이용 날짜" });
    await u.click(within(calendar).getByRole("button", { name: "9월 29일 (화)" }));
    expect(within(calendar).getByText("9월 29일 (화)", { selector: "b" })).toBeTruthy();
    expect(
      (within(calendar).getByRole("button", { name: "9월 27일 (일)" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await u.click(within(calendar).getByRole("button", { name: "다음 달" }));
    const day = (name: string) =>
      (within(calendar).getByRole("button", { name }) as HTMLButtonElement).disabled;
    expect([day("10월 12일 (월)"), day("10월 13일 (화)")]).toEqual([false, true]);
  });
  it("데모에서는 학생회 코드도 받아서 자동으로 넣고, 명단이 없으면 예시 명단으로 바로 확인한다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "대여");
    await u.click(screen.getByRole("button", { name: "학생회 물품" }));
    await u.click(screen.getByRole("button", { name: "인증하기" }));
    await u.click(screen.getByRole("button", { name: "인증번호 받기" }));
    await u.click(screen.getByRole("button", { name: "메일 인증 확인" }));
    await u.click(screen.getByRole("button", { name: "학생회 납부자 명단으로 확인" }));
    expect(await screen.findByText(/명단을 올리지 않았어요/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "데모: 예시 명단 올리고 다시 확인" }));
    expect(await screen.findByText("총학생회비 납부가 확인됐어요.")).toBeTruthy();
    await u.click(
      within(screen.getByRole("region", { name: "학생회비 인증" })).getByRole("button", {
        name: /^컴퓨터공학부/,
      }),
    );
    await u.click(screen.getByRole("button", { name: "데모: 학생회에서 코드 받아 자동 입력" }));
    expect((await screen.findByDisplayValue(/^HSM-/)) as HTMLInputElement).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "코드로 확인" }));
    expect(await screen.findByText("컴퓨터공학부 학생회비 납부가 확인됐어요.")).toBeTruthy();
  });
  it("상상관 309호 통합기자재실 노트북은 1인 1대만 빌린다", async () => {
    const u = userEvent.setup();
    render(<StudentApp />);
    await enter(u);
    await tab(u, "대여");
    await u.click(screen.getByRole("button", { name: "통합기자재실" }));
    expect(screen.getByText(/상상관 3층 309호 통합기자재실/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: /노트북 \(삼성 i5 8세대\)/ }));
    expect(screen.getByText(/남은 120\/120/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "대여 예약 · 데모" }));
    await u.click(screen.getByRole("button", { name: /노트북 \(삼성 i5 8세대\)/ }));
    await u.click(screen.getByRole("button", { name: "대여 예약 · 데모" }));
    expect(screen.getByText(/1인 1대라 반납 후/)).toBeTruthy();
  });
  it("예약하면 홈에서 바로 입실하고 퇴실할 수 있다", async () => {
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
    await tab(u, "홈");
    const card = screen.getByRole("region", { name: "내 입실·퇴실" });
    expect(within(card).getByText("상상파크 C&C멀티스튜디오")).toBeTruthy();
    expect(
      (within(card).getByRole("button", { name: "입실하기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await u.click(within(card).getByRole("button", { name: "데모: 시작 시각으로 이동" }));
    await u.click(within(card).getByRole("button", { name: "입실하기" }));
    expect(within(card).getByText(/동반자 1명이/)).toBeTruthy();
    await u.type(within(card).getByLabelText("함께 온 사람 학번"), "2412999");
    await u.click(within(card).getByRole("button", { name: "입실하기" }));
    const inUse = screen.getByRole("region", { name: "내 입실·퇴실" });
    expect(within(inUse).getByText(/이용 중/)).toBeTruthy();
    await u.click(within(inUse).getByRole("button", { name: "퇴실하기" }));
    expect(screen.queryByRole("region", { name: "내 입실·퇴실" })).toBeNull();
    expect(saved().bookings[0].stage).toBe("CHECKED_OUT");
  });
});
