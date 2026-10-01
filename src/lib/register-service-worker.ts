import { getAssetUrl } from "@/lib/app-url";

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return () => undefined;

  const appScope = new URL(getAssetUrl(""), window.location.origin).toString();
  if (import.meta.env.DEV) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => registration.scope.startsWith(appScope))
            .map((registration) => registration.unregister()),
        ),
      );
    return () => undefined;
  }

  let updateTimer: number | undefined;
  const build = import.meta.env.VITE_BUILD_SHA?.slice(0, 12) || "production";
  const workerUrl = `${getAssetUrl("sw.js")}?v=${encodeURIComponent(build)}`;

  void navigator.serviceWorker
    .register(workerUrl, { scope: getAssetUrl(""), updateViaCache: "none" })
    .then((registration) => {
      void registration.update();
      updateTimer = window.setInterval(() => void registration.update(), 60 * 60 * 1_000);
    })
    .catch((error) => {
      console.warn("TNS Opus installation is unavailable:", error);
    });

  return () => {
    if (updateTimer !== undefined) window.clearInterval(updateTimer);
  };
}
