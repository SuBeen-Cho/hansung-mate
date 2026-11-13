export function registerPwa() {
  if (
    !import.meta.env.PROD ||
    !/^https?:$/.test(location.protocol) ||
    !("serviceWorker" in navigator)
  )
    return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        const announce = () => {
          if (registration.waiting)
            window.dispatchEvent(
              new CustomEvent("mate-update-ready", { detail: registration.waiting }),
            );
        };
        announce();
        registration.addEventListener("updatefound", () =>
          registration.installing?.addEventListener("statechange", announce),
        );
      })
      .catch(() => {
        /* Online use remains available if installation is unsupported. */
      });
  });
}
