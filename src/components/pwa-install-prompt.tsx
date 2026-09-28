import { useEffect, useState } from "react";
import { Download, PlusSquare, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone
  );
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(Boolean(isStandalone()));
    setIos(isIos());

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed || dismissed || (!deferredPrompt && !ios)) return null;

  async function install() {
    if (!deferredPrompt) {
      setShowIosHelp(true);
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[70] flex items-center gap-1 rounded-xl border border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur">
        <Button size="sm" onClick={install} className="gap-2">
          <Download className="h-4 w-4" />
          Install Opus
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {showIosHelp && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="ios-install-title" className="text-lg font-semibold">
                  Install Opus
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add the operations app to your iPhone or iPad home screen.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => setShowIosHelp(false)}
                aria-label="Close install instructions"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ol className="mt-5 space-y-3 text-sm">
              <li className="flex gap-3">
                <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Open this page in Safari and tap the Share button.
              </li>
              <li className="flex gap-3">
                <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Choose <strong>Add to Home Screen</strong>, then confirm.
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
