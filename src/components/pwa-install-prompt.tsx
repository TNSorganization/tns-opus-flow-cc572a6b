import { useEffect, useRef, useState } from "react";
import { Download, MoreVertical, PlusSquare, Share, X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

const SESSION_KEY = "tns_opus_install_prompt_seen";

function readSessionValue(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // The persistent install button still works when storage is unavailable.
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOSDevice() {
  const { userAgent, platform, maxTouchPoints } = navigator;
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

function isIOSSafari() {
  return (
    isIOSDevice() &&
    /Safari/.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent)
  );
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [guide, setGuide] = useState<"ios" | "browser" | null>(null);
  const installButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    if (readSessionValue(SESSION_KEY)) return;

    const timer = window.setTimeout(() => {
      writeSessionValue(SESSION_KEY, "1");
      setVisible(true);
    }, 2_600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const capturePrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const markInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    installButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setVisible(false);
        setGuide(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [visible]);

  function dismiss() {
    setVisible(false);
    setGuide(null);
  }

  async function install() {
    if (isIOSDevice()) {
      setGuide("ios");
      setVisible(true);
      return;
    }
    if (!deferredPrompt) {
      setGuide("browser");
      setVisible(true);
      return;
    }

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setVisible(false);
    } catch {
      setGuide("browser");
      setVisible(true);
    }
  }

  if (installed) return null;

  return (
    <>
      <Button
        type="button"
        onClick={install}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 h-11 rounded-full px-4 shadow-xl"
        aria-label="Install TNS Opus on this device"
      >
        <Download className="h-4 w-4" />
        Install
      </Button>

      {visible && (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-[#071611]/60 p-3 backdrop-blur-sm sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismiss();
          }}
        >
          <section
            className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-opus-title"
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={dismiss}
              className="absolute right-3 top-3 rounded-full"
              aria-label="Close install prompt"
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-3 pr-10">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#153228]">
                <BrandLogo kind="mark" className="h-10 w-6" />
              </div>
              <div>
                <h2 id="install-opus-title" className="text-xl font-semibold tracking-tight">
                  Install TNS Opus
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Open your workspace faster from this device.
                </p>
              </div>
            </div>

            {guide === "ios" ? (
              <div className="mt-5 space-y-3 text-sm">
                <p className="font-semibold">Install on your iPhone or iPad:</p>
                <ol className="space-y-3 text-muted-foreground">
                  {!isIOSSafari() && (
                    <li className="rounded-xl border border-brand-yellow/30 bg-brand-yellow/10 p-3 font-medium text-foreground">
                      First open this website in Safari. Installation may be hidden inside WhatsApp,
                      Instagram, or another in-app browser.
                    </li>
                  )}
                  <li className="flex gap-2">
                    <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    In Safari, tap the Share button.
                  </li>
                  <li className="flex gap-2">
                    <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Choose <span className="font-semibold text-foreground">Add to Home Screen</span>
                    .
                  </li>
                  <li className="pl-6">
                    Tap <span className="font-semibold text-foreground">Add</span>.
                  </li>
                </ol>
                <Button type="button" onClick={dismiss} className="w-full">
                  Done
                </Button>
              </div>
            ) : guide === "browser" ? (
              <div className="mt-5 space-y-3 text-sm">
                <p className="font-semibold">Install from your browser menu:</p>
                <ol className="space-y-3 text-muted-foreground">
                  <li className="flex gap-2">
                    <MoreVertical className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Open the browser menu.
                  </li>
                  <li className="flex gap-2">
                    <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Choose <span className="font-semibold text-foreground">Install app</span> or
                    <span className="font-semibold text-foreground">Add to Home Screen</span>.
                  </li>
                </ol>
                <p className="rounded-xl border border-border bg-muted/45 p-3 text-xs text-muted-foreground">
                  If the option is missing, open this page directly in Chrome, Safari, or Edge.
                </p>
                <Button type="button" onClick={dismiss} className="w-full">
                  Done
                </Button>
              </div>
            ) : (
              <div className="mt-5 flex gap-2">
                <Button ref={installButtonRef} type="button" onClick={install} className="flex-1">
                  Install App
                </Button>
                <Button type="button" variant="outline" onClick={dismiss}>
                  Not now
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
