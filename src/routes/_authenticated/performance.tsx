import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";
import { Trophy, TrendingDown, TrendingUp, Clock } from "lucide-react";
import { KpiCard, SectionHeader } from "@/components/kpi-card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/performance")({
  component: PerformancePage,
});

type Row = {
  id: string;
  name: string;
  attendance: number;
  completion: number;
  deadline: number;
  score: number;
};

function PerformancePage() {
  const from = subDays(new Date(), 30).toISOString();

  const { data: profiles = [] } = useQuery({
    queryKey: ["perf-profiles"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name, email")).data ?? [],
  });
  const { data: att = [] } = useQuery({
    queryKey: ["perf-att", from],
    queryFn: async () =>
      (
        await supabase
          .from("attendance_events")
          .select("user_id, event_type, event_at")
          .gte("event_at", from)
      ).data ?? [],
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["perf-tasks", from],
    queryFn: async () =>
      (
        await supabase
          .from("tasks")
          .select("assigned_to, status, deadline, completed_at")
          .gte("created_at", from)
      ).data ?? [],
  });

  // Total working days = distinct days ANY employee checked in during the window.
  // Fallback to elapsed days if nothing recorded yet.
  const workingDays = (() => {
    const s = new Set(
      att.filter((e) => e.event_type === "check_in").map((e) => e.event_at.slice(0, 10)),
    );
    return Math.max(s.size, 1);
  })();

  const rows: Row[] = profiles
    .map((p) => {
      const daysPresent = new Set(
        att
          .filter((e) => e.user_id === p.id && e.event_type === "check_in")
          .map((e) => e.event_at.slice(0, 10)),
      ).size;
      const attendance = Math.min(100, Math.round((daysPresent / workingDays) * 100));
      const my = tasks.filter((t) => t.assigned_to === p.id);
      // Count both validated and submitted as "done" progress
      const done = my.filter((t) => t.status === "completed" || t.status === "submitted");
      const validated = my.filter((t) => t.status === "completed");
      const completion = my.length ? Math.round((done.length / my.length) * 100) : 0;
      const onTime = validated.filter(
        (t) => t.completed_at && t.deadline && new Date(t.completed_at) <= new Date(t.deadline),
      );
      const deadline = validated.length ? Math.round((onTime.length / validated.length) * 100) : 0;
      const score = Math.round(attendance * 0.4 + completion * 0.4 + deadline * 0.2);
      return {
        id: p.id,
        name: p.full_name || p.email || "—",
        attendance,
        completion,
        deadline,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  const top = rows[0];
  const bottom = rows[rows.length - 1];
  const avg = rows.length ? Math.round(rows.reduce((a, b) => a + b.score, 0) / rows.length) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          tone="success"
          icon={<Trophy className="h-5 w-5" />}
          value={<span className="text-xl">{top?.name || "—"}</span>}
          label={`Top Performer (${top?.score || 0}%)`}
        />
        <KpiCard
          tone="danger"
          icon={<TrendingDown className="h-5 w-5" />}
          value={<span className="text-xl">{bottom?.name || "—"}</span>}
          label={`Needs Attention (${bottom?.score || 0}%)`}
        />
        <KpiCard
          tone="purple"
          icon={<TrendingUp className="h-5 w-5" />}
          value={`${avg}%`}
          label="Team Average Score"
        />
        <KpiCard
          tone="info"
          icon={<Clock className="h-5 w-5" />}
          value={rows.length}
          label="Staff Tracked"
        />
      </div>

      <div>
        <SectionHeader title="Employee Performance Rankings" />
        <div className="tos-card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Attendance</th>
                <th className="px-4 py-3">Completion</th>
                <th className="px-4 py-3">On Time</th>
                <th className="px-4 py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    No data yet.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3">
                      <Bar v={r.attendance} tone="info" />
                    </td>
                    <td className="px-4 py-3">
                      <Bar v={r.completion} tone="success" />
                    </td>
                    <td className="px-4 py-3">
                      <Bar v={r.deadline} tone="purple" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "kpi-number rounded-md px-2 py-1 text-sm font-bold",
                          r.score >= 80
                            ? "bg-brand-success/15 text-brand-success"
                            : r.score >= 60
                              ? "bg-brand-yellow/15 text-brand-yellow"
                              : "bg-brand-danger/15 text-brand-danger",
                        )}
                      >
                        {r.score}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Bar({ v, tone }: { v: number; tone: "info" | "success" | "purple" }) {
  const color =
    tone === "info" ? "bg-brand-info" : tone === "success" ? "bg-brand-success" : "bg-brand-purple";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", color)} style={{ width: `${v}%` }} />
      </div>
      <span className="kpi-number text-xs text-muted-foreground">{v}%</span>
    </div>
  );
}
