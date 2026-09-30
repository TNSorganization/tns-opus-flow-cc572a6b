import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { getSessionWithTimeout } from "@/lib/auth-session";
import { hasAuthCallback } from "@/lib/auth-flow";
import { getAppUrl } from "@/lib/app-url";

export const Route = createFileRoute("/")({
  ssr: false,
  component: OpeningPage,
});

function OpeningPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (hasAuthCallback(window.location.href)) {
      const callbackUrl = new URL(getAppUrl("callback"));
      callbackUrl.search = window.location.search;
      callbackUrl.hash = window.location.hash;
      window.location.replace(callbackUrl);
      return;
    }

    let mounted = true;
    getSessionWithTimeout(5_000)
      .then((session) => {
        if (mounted) navigate({ to: session ? "/home" : "/auth", replace: true });
      })
      .catch(() => {
        if (mounted) navigate({ to: "/auth", replace: true });
      });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <main className="auth-canvas flex min-h-screen items-center justify-center px-4">
      <div className="relative text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/10 bg-[#12281f] shadow-2xl">
          <BrandLogo kind="mark" className="h-16 w-10" />
        </div>
        <div className="mt-6 text-2xl font-semibold tracking-[-0.04em]">TNS Opus</div>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Opening your workspace
        </div>
      </div>
    </main>
  );
}
