import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshState } from "./model";

const mocks = vi.hoisted(() => ({
  listener: undefined as
    | undefined
    | ((event: string, session: { user: { id: string; email: string } } | null) => void),
  load: vi.fn(),
  save: vi.fn(),
  unsubscribe: vi.fn(),
  reset: vi.fn(),
  update: vi.fn(),
}));
vi.mock("./cloud", () => ({
  cloudConfigured: true,
  cloudClient: async () => ({
    auth: {
      resetPasswordForEmail: mocks.reset,
      updateUser: mocks.update,
      onAuthStateChange: (listener: typeof mocks.listener) => {
        mocks.listener = listener;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
    },
  }),
  loadCloudBackup: mocks.load,
  saveCloudBackup: mocks.save,
  restoreCloudDocuments: vi.fn(),
  isDemoBackup: vi.fn(() => true),
}));

import { AccountBackup } from "./AccountBackup";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listener = undefined;
  mocks.reset.mockResolvedValue({ error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.load.mockResolvedValue({ version: 1, savedAt: "2026-09-28", data: freshState() });
});
afterEach(cleanup);
async function signIn() {
  await act(async () => {
    await Promise.resolve();
    mocks.listener?.("SIGNED_IN", { user: { id: "DEMO-user", email: "demo@example.invalid" } });
  });
  await screen.findByText(/저장된 백업 1차/);
}
describe("연결된 계정의 백업 상태", () => {
  it("토큰 갱신 때 불러온 백업을 지우지 않는다", async () => {
    render(<AccountBackup state={freshState()} onRestore={vi.fn()} />);
    await signIn();
    await act(async () => {
      mocks.listener?.("TOKEN_REFRESHED", {
        user: { id: "DEMO-user", email: "demo@example.invalid" },
      });
    });
    expect(screen.getByText(/저장된 백업 1차/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "저장된 백업 불러오기" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("백업 충돌 메시지를 보여 주고 최신 백업을 다시 읽는다", async () => {
    const u = userEvent.setup();
    mocks.save.mockRejectedValue({ message: "백업이 다른 기기에서 변경됐어요." });
    render(<AccountBackup state={freshState()} onRestore={vi.fn()} />);
    await signIn();
    await u.click(screen.getByRole("button", { name: "지금 내용 백업하기" }));
    await u.click(screen.getByRole("button", { name: "백업 확정" }));
    expect(await screen.findByText("백업이 다른 기기에서 변경됐어요.")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "계정 백업 새로고침" }));
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
});

it("재설정 메일 요청과 복구 세션의 비밀번호 변경을 연결한다", async () => {
  const u = userEvent.setup();
  render(<AccountBackup state={freshState()} onRestore={vi.fn()} />);
  await u.type(screen.getByLabelText("이메일"), "demo@example.invalid");
  await u.click(screen.getByRole("button", { name: "비밀번호 재설정 메일 받기" }));
  expect(mocks.reset).toHaveBeenCalledWith(
    "demo@example.invalid",
    expect.objectContaining({ redirectTo: expect.stringContaining("?account=recovery") }),
  );
  await act(async () => {
    mocks.listener?.("PASSWORD_RECOVERY", {
      user: { id: "DEMO-user", email: "demo@example.invalid" },
    });
  });
  await u.type(await screen.findByLabelText("새 비밀번호"), "demo-new-password");
  await u.click(screen.getByRole("button", { name: "비밀번호 변경" }));
  expect(mocks.update).toHaveBeenCalledWith({ password: "demo-new-password" });
  expect(await screen.findByText("비밀번호를 변경했어요.")).toBeTruthy();
});
