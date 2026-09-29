import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  deriveStatus,
  computeDailyTotals,
  fmtDuration,
  recordEvent,
  type AttendanceEventType,
} from "@/lib/attendance";
import { LogIn, Coffee, Play, LogOut, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, startOfDay, endOfDay } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

const LABELS: Record<AttendanceEventType, { label: string; Icon: typeof LogIn; tone: string }> = {
  check_in: { label: "Check In", Icon: LogIn, tone: "text-status-present" },
  break_start: { label: "Start Break", Icon: Coffee, tone: "text-status-break" },
  break_end: { label: "End Break", Icon: Play, tone: "text-status-working" },
  check_out: { label: "Check Out", Icon: LogOut, tone: "text-status-off" },
};

function HomePage() {
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel("attendance-self")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_events" }, () =>
        qc.invalidateQueries({ queryKey: ["attendance-today"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const today = new Date();
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: async () => {
      const { data: u, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("attendance_events")
        .select("id, event_type, event_at")
        .eq("user_id", u.user.id)
        .gte("event_at", startOfDay(today).toISOString())
        .lte("event_at", endOfDay(today).toISOString())
        .order("event_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const state = deriveStatus(events);
  const totals = computeDailyTotals(events);
  void tick;

  const mut = useMutation({
    mutationFn: async (t: AttendanceEventType) => {
      const { error } = await recordEvent(t);
      if (error) throw error;
    },
    onSuccess: (_d, t) => {
      toast.success(`${LABELS[t].label} recorded`);
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["live-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allActions: AttendanceEventType[] = ["check_in", "break_start", "break_end", "check_out"];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{format(today, "EEEE, d MMMM yyyy")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Today</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Status" value={<StatusPill state={state.status} />} />
        <StatCard
          label="Check-in"
          value={totals.checkIn ? format(totals.checkIn, "HH:mm") : "—"}
          mono
        />
        <StatCard label="Productive" value={fmtDuration(totals.productiveMs)} mono />
        <StatCard label="Break" value={fmtDuration(totals.breakMs)} mono />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {allActions.map((t) => {
          const enabled = state.next.includes(t);
          const meta = LABELS[t];
          const Icon = meta.Icon;
          return (
            <button
              key={t}
              disabled={!enabled || mut.isPending}
              onClick={() => mut.mutate(t)}
              className={cn(
                "surface group relative flex aspect-square flex-col items-center justify-center gap-3 p-4 text-center transition-all",
                enabled
                  ? "cursor-pointer hover:border-primary/50 hover:bg-accent/40 active:scale-[0.98]"
                  : "cursor-not-allowed opacity-40",
              )}
            >
              <Icon className={cn("h-8 w-8 sm:h-10 sm:w-10", enabled && meta.tone)} />
              <span className="text-sm font-medium sm:text-base">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <section className="surface p-5">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">Today's timeline</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet. Tap Check In to start.</p>
        ) : (
          <ol className="space-y-2">
            <AnimatePresence initial={false}>
              {events.map((e) => {
                const meta = LABELS[e.event_type as AttendanceEventType];
                const Icon = meta.Icon;
                return (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={cn("h-4 w-4", meta.tone)} />
                      <span>{meta.label}</span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {format(new Date(e.event_at), "HH:mm:ss")}
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="surface p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-2 text-2xl font-semibold", mono && "kpi-number")}>{value}</div>
    </div>
  );
}

function StatusPill({ state }: { state: "off" | "present" | "on_break" | "checked_out" }) {
  const map = {
    off: { label: "Off duty", cls: "bg-status-off/20 text-status-off" },
    present: { label: "Working", cls: "bg-status-working/20 text-status-working" },
    on_break: { label: "On break", cls: "bg-status-break/20 text-status-break" },
    checked_out: { label: "Signed out", cls: "bg-status-off/20 text-status-off" },
  } as const;
  const m = map[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        m.cls,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
}
