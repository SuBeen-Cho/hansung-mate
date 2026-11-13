import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(cleanup);

async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

async function openDemo(user: ReturnType<typeof userEvent.setup>) {
  await login(user);
  await user.click(screen.getByRole("button", { name: "실제 과목 DEMO 보기" }));
}

describe("한성 메이트 공개 교육과정 흐름", () => {
  it("실제 과목코드 기반 DEMO에서 분류와 학기 보드를 보여준다", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect((screen.getByLabelText("아이디") as HTMLInputElement).value).toBe("20260001");
    await openDemo(user);

    expect(screen.getByText("현재 이수 학점")).toBeTruthy();
    expect(screen.getByText("이수분류별 학점")).toBeTruthy();
    expect(screen.getAllByText("웹프로그래밍").length).toBeGreaterThan(0);
    expect(screen.getByText("학년·학기별 과정 보드")).toBeTruthy();
  });

  it("과목코드로 탐색하고 계획에 담은 뒤 제거한다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDemo(user);
    await user.click(
      within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole("button", {
        name: /과목 탐색/,
      }),
    );
    await user.type(screen.getByLabelText("과목코드 또는 과목명"), "V024009");

    expect(screen.getByText("클라우드 컴퓨팅")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "내 계획에 담기" }));
    expect(screen.getByRole("button", { name: "계획에서 빼기" })).toBeTruthy();
  });

  it("학업 설정 후 공개 과목표에서 이수 과목을 추가한다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    await user.type(screen.getByLabelText("이름"), "홍길동");
    await user.type(screen.getByLabelText("학번"), "20260001");
    await user.type(screen.getByLabelText("입학년도"), "2026");
    await user.type(screen.getByPlaceholderText("예: 웹공학트랙"), "웹공학트랙");
    await user.click(screen.getByRole("button", { name: "학업 설정 저장" }));
    await user.click(
      within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole("button", {
        name: /이수 내역/,
      }),
    );

    await user.selectOptions(screen.getByLabelText("과목 선택"), "V020002");
    await user.click(screen.getByRole("button", { name: "이수 완료로 추가" }));
    expect(screen.getAllByText(/자료구조/).length).toBeGreaterThan(0);
    expect(screen.getByText("전선")).toBeTruthy();
  });

  it("학업 설정 전에도 조건을 입력해 공간 DEMO 흐름을 만든다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    await user.click(screen.getByRole("button", { name: /공간 찾기/ }));
    await user.click(screen.getByRole("button", { name: "조건에 맞는 공간 찾기" }));
    expect(screen.getByText(/2026-10-07 · 17:00–20:00 · 5명/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /상상관 201/ }));
    await user.type(screen.getByLabelText("신청인"), "홍길동");
    await user.type(screen.getByLabelText("학번"), "20260001");
    await user.type(screen.getByLabelText("소속"), "웹공학트랙");
    await user.type(screen.getByLabelText("연락처"), "010-0000-0000");
    await user.type(screen.getByLabelText("사용 목적"), "팀 프로젝트");
    await user.click(screen.getByRole("button", { name: "DEMO 신청서 생성" }));
    expect(screen.getByText(/DEMO 미제출 · 실제 허가서가 아닙니다/)).toBeTruthy();
    await user.click(
      within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole("button", {
        name: /관리자·자료/,
      }),
    );
    expect(screen.getByText("신청 중간 점검 · 관리자 DEMO")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "다음 단계로" }));
    expect(screen.getByText("현재: 공간 담당 검토")).toBeTruthy();
  });

  it("경로 비교에서 트랙 겹침을 표시하되 졸업 판정으로 표현하지 않는다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDemo(user);
    await user.click(screen.getByRole("button", { name: /경로 비교/ }));
    await user.selectOptions(screen.getByLabelText("비교할 트랙"), "웹공학트랙");
    expect(screen.getByText(/이 숫자는 졸업까지 부족한 학점이 아닙니다/)).toBeTruthy();
    expect(screen.getByText("겹치는 이수 과목")).toBeTruthy();
  });

  it("야간잔류 공식 양식 항목과 시연 명단으로 신청서를 만든다", async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    await user.click(screen.getByRole("button", { name: /공간 찾기/ }));
    await user.click(screen.getByRole("button", { name: "조건에 맞는 공간 찾기" }));
    await user.click(screen.getByRole("button", { name: /상상관 201/ }));
    await user.click(screen.getByRole("button", { name: "야간잔류" }));
    await user.click(screen.getByRole("button", { name: "시연용 신청서 자동 입력" }));
    await user.click(screen.getByRole("button", { name: "DEMO 신청서 생성" }));
    expect(screen.getByText("학생 야간잔류 신청서")).toBeTruthy();
    expect(screen.getByText("잔류자 명단")).toBeTruthy();
    expect(screen.getByRole("link", { name: "원본 HWP 다운로드" })).toBeTruthy();
  });
});
