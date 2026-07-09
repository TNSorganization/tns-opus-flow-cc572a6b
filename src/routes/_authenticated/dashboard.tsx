import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime";
import { deriveStatus, type AttendanceEventType } from "@/lib/attendance";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function DashboardPage() {
  useRealtimeInvalidate(
    "dashboard-live",
    ["attendance_events", "tasks", "expense_entries", "income_entries"],
    [["dash-att-today"], ["dash-tasks"], ["dash-expenses"], ["dash-incomes"]],
  );
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const chartFrom = subDays(today, 29);

  const { data: profiles = [] } = useQuery({
    queryKey: ["dash-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name")).data ?? [],
  });
  const { data: attToday = [] } = useQuery({
    queryKey: ["dash-att-today"],
    queryFn: async () =>
      (
        await supabase
          .from("attendance_events")
          .select("user_id, event_type, event_at")
          .gte("event_at", startOfDay(today).toISOString())
          .lte("event_at", endOfDay(today).toISOString())
      ).data ?? [],
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["dash-tasks"],
    queryFn: async () =>
      (
        await supabase
          .from("tasks")
          .select("id, status, deadline, completed_at, assigned_to")
      ).data ?? [],
  });
  const { data: incomes = [] } = useQuery({
    queryKey: ["dash-incomes"],
    queryFn: async () =>
      (
        await supabase
          .from("income_entries")
          .select("amount, entry_date")
          .gte("entry_date", format(chartFrom, "yyyy-MM-dd"))
      ).data ?? [],
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["dash-expenses"],
    queryFn: async () =>
      (
        await supabase
          .from("expense_entries")
          .select("amount, entry_date")
          .gte("entry_date", format(chartFrom, "yyyy-MM-dd"))
      ).data ?? [],
  });

  const byUser = new Map<string, { event_type: AttendanceEventType; event_at: string }[]>();
  for (const e of attToday) {
    const arr = byUser.get(e.user_id) ?? [];
    arr.push({ event_type: e.event_type as AttendanceEventType, event_at: e.event_at });
    byUser.set(e.user_id, arr);
  }
  const counts = { present: 0, on_break: 0, checked_out: 0, off: 0 };
  for (const p of profiles) {
    counts[deriveStatus(byUser.get(p.id) ?? []).status]++;
  }

  const doneToday = tasks.filter(
    (t) =>
      t.completed_at &&
      new Date(t.completed_at) >= startOfDay(today) &&
      new Date(t.completed_at) <= endOfDay(today),
  ).length;
  const pending = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;
  const overdue = tasks.filter(
    (t) =>
      t.deadline &&
      new Date(t.deadline) < today &&
      t.status !== "completed" &&
      t.status !== "cancelled",
  ).length;

  const inWeek = incomes
    .filter((i) => new Date(i.entry_date) >= weekStart && new Date(i.entry_date) <= weekEnd)
    .reduce((a, b) => a + Number(b.amount), 0);
  const outWeek = expenses
    .filter((i) => new Date(i.entry_date) >= weekStart && new Date(i.entry_date) <= weekEnd)
    .reduce((a, b) => a + Number(b.amount), 0);
  const inMonth = incomes
    .filter((i) => new Date(i.entry_date) >= monthStart && new Date(i.entry_date) <= monthEnd)
    .reduce((a, b) => a + Number(b.amount), 0);
  const outMonth = expenses
    .filter((i) => new Date(i.entry_date) >= monthStart && new Date(i.entry_date) <= monthEnd)
    .reduce((a, b) => a + Number(b.amount), 0);

  // build 30-day chart
  const days: { d: string; income: number; expense: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = subDays(today, i);
    const key = format(d, "yyyy-MM-dd");
    days.push({
      d: format(d, "d MMM"),
      income: incomes.filter((x) => x.entry_date === key).reduce((a, b) => a + Number(b.amount), 0),
      expense: expenses.filter((x) => x.entry_date === key).reduce((a, b) => a + Number(b.amount), 0),
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">{format(today, "EEEE, d MMMM yyyy")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Executive Dashboard</h1>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Today</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Working" value={counts.present} tone="working" />
          <Card label="On break" value={counts.on_break} tone="break" />
          <Card label="Not arrived" value={counts.off} tone="absent" />
          <Card label="Signed out" value={counts.checked_out} tone="off" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Tasks</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card label="Done today" value={doneToday} />
          <Card label="Pending" value={pending} />
          <Card label="Overdue" value={overdue} tone="absent" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Finance</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Week in" value={money(inWeek)} tone="working" mono />
          <Card label="Week out" value={money(outWeek)} tone="absent" mono />
          <Card label="Month in" value={money(inMonth)} tone="working" mono />
          <Card label="Month profit" value={money(inMonth - outMonth)} tone={inMonth - outMonth >= 0 ? "working" : "absent"} mono />
        </div>

        <div className="surface mt-4 p-4">
          <h3 className="mb-3 text-sm font-medium">Last 30 days</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="inc" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--status-present)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--status-present)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="exp" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--status-absent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--status-absent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Area type="monotone" dataKey="income" stroke="var(--status-present)" fill="url(#inc)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" stroke="var(--status-absent)" fill="url(#exp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "working" | "break" | "absent" | "off";
  mono?: boolean;
}) {
  const toneCls =
    tone === "working"
      ? "text-status-working"
      : tone === "break"
        ? "text-status-break"
        : tone === "absent"
          ? "text-status-absent"
          : tone === "off"
            ? "text-status-off"
            : "text-foreground";
  return (
    <div className="surface p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-2 text-2xl font-semibold", mono && "kpi-number", toneCls)}>{value}</div>
    </div>
  );
}
