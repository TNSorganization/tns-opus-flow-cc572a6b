import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export function RoutePending() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <BrandLogo kind="mark" className="mx-auto h-14 w-14" />
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading TNS Opus
        </div>
      </div>
    </main>
  );
}
