import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { getSessionWithTimeout } from "@/lib/auth-session";

export const Route = createFileRoute("/")({
  ssr: false,
  component: OpeningPage,
});

function OpeningPage() {
  const navigate = useNavigate();

  useEffect(() => {
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
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <BrandLogo kind="mark" className="mx-auto h-16 w-16" />
        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening TNS Opus
        </div>
      </div>
    </main>
  );
}
