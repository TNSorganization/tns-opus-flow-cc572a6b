import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ErrorLike = { code?: string; message?: string };

function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as ErrorLike;
  return (
    value.code === "PGRST205" ||
    value.message?.toLowerCase().includes("could not find the table") === true
  );
}

export function ModuleErrorState({
  name,
  error,
  onRetry,
}: {
  name: string;
  error: unknown;
  onRetry: () => void;
}) {
  const setupPending = isMissingTable(error);
  const detail = error instanceof Error ? error.message : (error as ErrorLike | null)?.message;

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <AlertTriangle className="h-10 w-10 text-brand-yellow" />
      <div className="max-w-md">
        <p className="font-semibold">
          {setupPending ? `${name} database setup is pending` : `${name} could not be loaded`}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {setupPending
            ? "The screen is installed, but its checked-in Supabase migration still needs to be applied."
            : detail || "Check your connection and try again."}
        </p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="mr-1.5 h-4 w-4" /> Retry
      </Button>
    </div>
  );
}
