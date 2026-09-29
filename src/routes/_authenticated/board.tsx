import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deriveStatus, type AttendanceEventType } from "@/lib/attendance";
import { startOfDay, endOfDay, formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import { fetchActiveProfiles } from "@/lib/profiles";
import { UserAvatar } from "@/components/user-avatar";

export const Route = createFileRoute("/_authenticated/board")({
  component: BoardPage,
});

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

function BoardPage() {
  const qc = useQueryClient();
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const today = new Date();
  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async (): Promise<Row[]> => fetchActiveProfiles(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["all-attendance-today"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_events")
        .select("id, user_id, event_type, event_at")
        .gte("event_at", startOfDay(today).toISOString())
        .lte("event_at", endOfDay(today).toISOString())
        .order("event_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("attendance-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_events" }, () =>
        qc.invalidateQueries({ queryKey: ["all-attendance-today"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const byUser = new Map<string, { event_type: AttendanceEventType; event_at: string }[]>();
  for (const e of events) {
    const arr = byUser.get(e.user_id) ?? [];
    arr.push({ event_type: e.event_type as AttendanceEventType, event_at: e.event_at });
    byUser.set(e.user_id, arr);
  }

  const grouped = {
    present: [] as Row[],
    on_break: [] as Row[],
    checked_out: [] as Row[],
    off: [] as Row[],
  };
  const sinceMap = new Map<string, Date | null>();
  for (const p of profiles) {
    const s = deriveStatus(byUser.get(p.id) ?? []);
    grouped[s.status].push(p);
    sinceMap.set(p.id, s.since);
  }

  const buckets = [
    {
      key: "present" as const,
      label: "Working",
      tone: "text-status-working",
      dot: "bg-status-working",
    },
    {
      key: "on_break" as const,
      label: "On break",
      tone: "text-status-break",
      dot: "bg-status-break",
    },
    {
      key: "checked_out" as const,
      label: "Signed out",
      tone: "text-status-off",
      dot: "bg-status-off",
    },
    {
      key: "off" as const,
      label: "Not arrived",
      tone: "text-status-absent",
      dot: "bg-status-absent",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Live attendance · updates in realtime</p>
        <h1 className="text-3xl font-semibold tracking-tight">Live Board</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {buckets.map((b) => (
          <div key={b.key} className="surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", b.dot)} />
                <span className="text-sm font-medium">{b.label}</span>
              </div>
              <span className={cn("kpi-number text-lg font-semibold", b.tone)}>
                {grouped[b.key].length}
              </span>
            </div>
            <div className="space-y-1.5">
              {grouped[b.key].length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 py-4 text-center text-xs text-muted-foreground">
                  Nobody
                </div>
              ) : (
                grouped[b.key].map((p) => {
                  const since = sinceMap.get(p.id);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-md border border-border/60 bg-background/40 px-2.5 py-2"
                    >
                      <UserAvatar profile={p} size="sm" className="h-7 w-7" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{p.full_name || p.email}</div>
                        {since && (
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {formatDistanceToNowStrict(since, { addSuffix: false })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
