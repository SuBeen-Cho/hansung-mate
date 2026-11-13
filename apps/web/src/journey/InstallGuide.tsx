import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function InstallGuide() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const updated = (event: Event) => setUpdate((event as CustomEvent<ServiceWorker>).detail);
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", done);
    window.addEventListener("mate-update-ready", updated);
    setInstalled(window.matchMedia?.("(display-mode: standalone)").matches ?? false);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .getRegistration()
        .then((r) => {
          if (r?.waiting) setUpdate(r.waiting);
        })
        .catch(() => {});
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", done);
      window.removeEventListener("mate-update-ready", updated);
    };
  }, []);
  return (
    <section className="j-paper j-stack">
      <h2>휴대폰에서 메이트 열기</h2>
      {installed ? (
        <p>홈 화면 앱으로 사용 중이에요.</p>
      ) : (
        <>
          <p>휴대폰 브라우저에서 배포 주소를 열면 홈 화면에 추가할 수 있어요.</p>
          <p className="j-caption">
            iPhone: Safari 공유 → 홈 화면에 추가
            <br />
            Android: 브라우저 메뉴 → 앱 설치 또는 홈 화면에 추가
          </p>
        </>
      )}
      {location.protocol === "file:" && (
        <p className="j-caption">
          지금은 로컬 HTML이에요. 설치와 기기 간 계정 백업은 HTTPS 배포 주소에서 사용할 수 있어요.
        </p>
      )}
      {prompt && (
        <button
          type="button"
          className="j-primary"
          onClick={async () => {
            try {
              await prompt.prompt();
              await prompt.userChoice;
              setPrompt(null);
            } catch {
              setError("설치 창을 열지 못했어요. 브라우저 메뉴에서 홈 화면에 추가해 주세요.");
            }
          }}
        >
          홈 화면에 설치하기
        </button>
      )}
      {update && (
        <>
          <p>새 버전이 준비됐어요. 작성 중인 내용을 저장한 뒤 업데이트해 주세요.</p>
          <button
            type="button"
            className="j-secondary"
            onClick={() => {
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => location.reload(),
                { once: true },
              );
              update.postMessage("SKIP_WAITING");
            }}
          >
            저장했어요 · 새 버전 열기
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="j-error">
          {error}
        </p>
      )}
      <p className="j-caption">알림·GPS·학교 예약은 현재 앱 안에서 체험하는 데모예요.</p>
    </section>
  );
}
