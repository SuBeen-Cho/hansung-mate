import { useEffect, useRef, useState } from "react";
import {
  type CloudBackup,
  cloudClient,
  cloudConfigured,
  isDemoBackup,
  loadCloudBackup,
  restoreCloudDocuments,
  saveCloudBackup,
} from "./cloud";
import type { DemoState } from "./model";

const DEMO_BACKUP_KEY = "hansung-ieum-account-backup-demo-v1";
export function AccountBackup({
  state,
  onRestore,
}: {
  state: DemoState;
  onRestore: (data: DemoState) => void;
}) {
  const authOwner = useRef("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState("");
  const [recovery, setRecovery] = useState(
    new URLSearchParams(location.search).get("account") === "recovery",
  );
  const [backup, setBackup] = useState<CloudBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [action, setAction] = useState<"save" | "restore" | null>(null);
  useEffect(() => {
    if (!cloudConfigured) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    cloudClient()
      .then((db) => {
        const subscription = db.auth.onAuthStateChange((_event, session) => {
          if (!disposed) {
            if (_event === "PASSWORD_RECOVERY") setRecovery(true);
            const owner = session?.user.id ?? "";
            if (authOwner.current !== owner) {
              authOwner.current = owner;
              setBackup(null);
              setAction(null);
            }
            setAccount(session?.user.email ?? "");
          }
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
        if (disposed) unsubscribe();
      })
      .catch(() => {
        if (!disposed) setError("계정 연결을 확인하지 못했어요.");
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    if (!account || !cloudConfigured) return;
    let disposed = false;
    loadCloudBackup()
      .then((data) => {
        if (!disposed) setBackup(data);
      })
      .catch(() => {
        if (!disposed) setError("백업을 읽지 못했어요. 연결과 데이터베이스 설정을 확인해 주세요.");
      });
    return () => {
      disposed = true;
    };
  }, [account]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e
            ? String(e.message)
            : "요청을 완료하지 못했어요. 기존 데이터는 유지됩니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(signup: boolean) {
    await run(async () => {
      const db = await cloudClient();
      const result = signup
        ? await db.auth.signUp({ email, password })
        : await db.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setPassword("");
      setNotice(
        signup && !result.data.session
          ? "가입 확인 메일을 확인한 뒤 로그인해 주세요."
          : "로그인했어요.",
      );
    });
  }
  function enterDemo() {
    try {
      const stored = JSON.parse(localStorage.getItem(DEMO_BACKUP_KEY) ?? "null");
      if (stored && isDemoBackup(stored.data)) setBackup(stored);
      setAccount("데모 계정");
    } catch {
      setError("데모 백업 저장 공간을 사용할 수 없어요.");
    }
  }
  async function confirm() {
    await run(async () => {
      if (action === "save") {
        if (cloudConfigured) setBackup(await saveCloudBackup(state, backup?.version ?? 0));
        else {
          const prior = JSON.parse(localStorage.getItem(DEMO_BACKUP_KEY) ?? "null");
          if ((prior?.version ?? 0) !== (backup?.version ?? 0))
            throw new Error("다른 창에서 백업이 바뀌었어요. 데모 계정을 다시 열어 주세요.");
          const next = {
            version: (backup?.version ?? 0) + 1,
            savedAt: new Date().toISOString(),
            data: structuredClone(state),
          };
          localStorage.setItem(DEMO_BACKUP_KEY, JSON.stringify(next));
          setBackup(next);
        }
        setNotice(
          cloudConfigured ? "계정 백업을 저장했어요." : "데모 백업을 이 브라우저에 저장했어요.",
        );
      } else if (action === "restore" && backup) {
        const restored = structuredClone(backup.data);
        if (cloudConfigured) await restoreCloudDocuments(restored);
        onRestore(restored);
        setNotice("저장한 정보와 신청 내역을 복원했어요.");
      }
      setAction(null);
    });
  }
  return (
    <section className="j-stack">
      <h1>계정과 백업</h1>
      {!cloudConfigured && (
        <p className="j-caption">
          학교 계정과 서버 연결 전이에요. 아래 체험은 이 브라우저 안에서만 동작해요.
        </p>
      )}
      {recovery && account && cloudConfigured ? (
        <form
          className="j-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const db = await cloudClient();
              const result = await db.auth.updateUser({ password });
              if (result.error) throw result.error;
              setPassword("");
              setRecovery(false);
              history.replaceState(null, "", location.pathname);
              setNotice("비밀번호를 변경했어요.");
            });
          }}
        >
          <h2>새 비밀번호 설정</h2>
          <label className="j-field">
            새 비밀번호
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="j-primary" disabled={busy || password.length < 12}>
            비밀번호 변경
          </button>
        </form>
      ) : !account ? (
        cloudConfigured ? (
          <form
            className="j-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void authenticate(false);
            }}
          >
            <label className="j-field">
              이메일
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="j-field">
              비밀번호
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="j-primary" disabled={busy} type="submit">
              로그인
            </button>
            <button
              className="j-secondary"
              disabled={busy || !email.includes("@") || password.length < 12}
              type="button"
              onClick={() => authenticate(true)}
            >
              이메일로 가입하기
            </button>
            <button
              type="button"
              className="j-link"
              disabled={busy || !email.includes("@")}
              onClick={() =>
                run(async () => {
                  const db = await cloudClient();
                  const result = await db.auth.resetPasswordForEmail(email, {
                    redirectTo: `${location.origin}/?account=recovery`,
                  });
                  if (result.error) throw result.error;
                  setNotice("가입한 주소라면 비밀번호 재설정 메일을 확인해 주세요.");
                })
              }
            >
              비밀번호 재설정 메일 받기
            </button>
          </form>
        ) : (
          <button type="button" className="j-primary" onClick={enterDemo}>
            데모 계정으로 흐름 체험
          </button>
        )
      ) : (
        <>
          <section className="j-paper">
            <h2>{account}</h2>
            <output>
              {backup && JSON.stringify(backup.data) === JSON.stringify(state)
                ? cloudConfigured
                  ? "클라우드에 백업됨"
                  : "기기 데모 백업과 일치"
                : "이 기기에 저장됨 · 최신 변경은 아직 백업하지 않았어요"}
            </output>
            <p className="j-caption">개인 이수 기록과 계획 설정도 함께 백업해요.</p>
            <p>
              이 기기: 로드맵 {state.plans.length}개 · 신청 {state.bookings.length}개
            </p>
            <p>
              {backup
                ? `저장된 백업 ${backup.version}차 · 로드맵 ${backup.data.plans.length}개 · 신청 ${backup.data.bookings.length}개`
                : "아직 저장한 백업이 없어요."}
            </p>
            {backup && (
              <small>
                {new Date(backup.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </small>
            )}
          </section>
          <button
            className="j-primary"
            type="button"
            disabled={busy}
            onClick={() => setAction("save")}
          >
            지금 내용 백업하기
          </button>
          <button
            className="j-secondary"
            type="button"
            disabled={busy || !backup}
            onClick={() => setAction("restore")}
          >
            저장된 백업 불러오기
          </button>
          {action && (
            <section className="j-paper" role="alert">
              <h3>
                {action === "save"
                  ? "지금 내용으로 백업할까요?"
                  : "이 기기의 정보를 백업으로 바꿀까요?"}
              </h3>
              <p>
                {action === "save"
                  ? `로드맵 ${state.plans.length}개와 신청 ${state.bookings.length}개가 저장됩니다.`
                  : `로드맵 ${backup?.data.plans.length}개와 신청 ${backup?.data.bookings.length}개를 복원합니다. 작성 중인 임시 내용은 지워져요.`}
              </p>
              <div className="j-stack">
                <button className="j-primary" type="button" disabled={busy} onClick={confirm}>
                  {busy ? "처리 중…" : action === "save" ? "백업 확정" : "복원 확정"}
                </button>
                <button
                  className="j-link"
                  type="button"
                  disabled={busy}
                  onClick={() => setAction(null)}
                >
                  취소
                </button>
              </div>
            </section>
          )}
          <button
            className="j-link"
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (cloudConfigured) {
                  const { error } = await (await cloudClient()).auth.signOut();
                  if (error) throw error;
                }
                setAccount("");
                setBackup(null);
                setAction(null);
                setNotice("로그아웃했어요. 이 기기의 데모 기록은 유지됩니다.");
              })
            }
          >
            로그아웃
          </button>
          <button
            className="j-link"
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (cloudConfigured) setBackup(await loadCloudBackup());
                else enterDemo();
                setNotice("최신 백업을 확인했어요.");
              })
            }
          >
            계정 백업 새로고침
          </button>
          <p className="j-caption">
            프로필·저장한 계획·데모 신청·제출 문서를 백업해요. 임시 작성 내용과 학교 승인 권한은
            동기화하지 않아요.
          </p>
        </>
      )}
      {notice && <output className="j-feedback">{notice}</output>}
      {error && (
        <p role="alert" className="j-error">
          {error}
        </p>
      )}
    </section>
  );
}
