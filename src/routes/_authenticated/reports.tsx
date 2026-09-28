import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Preset = "today" | "week" | "month" | "custom";

function ReportsPage() {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState<string>(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const range = useMemo(() => {
    const now = new Date();
    if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
    if (preset === "week")
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }),
        to: endOfWeek(now, { weekStartsOn: 1 }),
      };
    if (preset === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
    return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };
  }, [preset, from, to]);

  const { data: att = [] } = useQuery({
    queryKey: ["report-att", range.from.toISOString(), range.to.toISOString()],
    queryFn: async () =>
      (
        await supabase
          .from("attendance_events")
          .select("user_id, event_type, event_at")
          .gte("event_at", range.from.toISOString())
          .lte("event_at", range.to.toISOString())
      ).data ?? [],
  });
  const { data: inc = [] } = useQuery({
    queryKey: ["report-inc", range.from.toISOString(), range.to.toISOString()],
    queryFn: async () =>
      (
        await supabase
          .from("income_entries")
          .select("entry_date, amount, description, reference")
          .gte("entry_date", format(range.from, "yyyy-MM-dd"))
          .lte("entry_date", format(range.to, "yyyy-MM-dd"))
      ).data ?? [],
  });
  const { data: exp = [] } = useQuery({
    queryKey: ["report-exp", range.from.toISOString(), range.to.toISOString()],
    queryFn: async () =>
      (
        await supabase
          .from("expense_entries")
          .select("entry_date, amount, purpose, reference, status")
          .gte("entry_date", format(range.from, "yyyy-MM-dd"))
          .lte("entry_date", format(range.to, "yyyy-MM-dd"))
      ).data ?? [],
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["report-tasks", range.from.toISOString(), range.to.toISOString()],
    queryFn: async () =>
      (
        await supabase
          .from("tasks")
          .select("title, status, priority, deadline, completed_at, assigned_to")
          .gte("created_at", range.from.toISOString())
          .lte("created_at", range.to.toISOString())
      ).data ?? [],
  });

  const totalIn = inc.reduce((a, b) => a + Number(b.amount), 0);
  const totalOut = exp.reduce((a, b) => a + Number(b.amount), 0);

  function download(name: string, rows: Record<string, unknown>[]) {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => escape(r[k])).join(","))].join(
      "\n",
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${format(range.from, "yyyy-MM-dd")}_${format(range.to, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Export operational data by period</p>
        <h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
      </header>

      <div className="surface flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-40 space-y-1.5">
          <Label>Period</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" && (
          <>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
        <div className="text-xs text-muted-foreground">
          {format(range.from, "d MMM yyyy")} → {format(range.to, "d MMM yyyy")}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Attendance events" value={att.length} />
        <Stat label="Income entries" value={inc.length} />
        <Stat label="Expense entries" value={exp.length} />
        <Stat label="Tasks in period" value={tasks.length} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Total income" value={totalIn.toLocaleString()} mono tone="in" />
        <Stat label="Total expenses" value={totalOut.toLocaleString()} mono tone="out" />
      </div>

      <div className="surface p-4">
        <h3 className="mb-3 text-sm font-medium">Export</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => download("attendance", att)}>
            <Download className="mr-1.5 h-4 w-4" /> Attendance CSV
          </Button>
          <Button variant="outline" onClick={() => download("income", inc)}>
            <Download className="mr-1.5 h-4 w-4" /> Income CSV
          </Button>
          <Button variant="outline" onClick={() => download("expenses", exp)}>
            <Download className="mr-1.5 h-4 w-4" /> Expenses CSV
          </Button>
          <Button variant="outline" onClick={() => download("tasks", tasks)}>
            <Download className="mr-1.5 h-4 w-4" /> Tasks CSV
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          PDF and Excel exports coming next. CSV opens directly in Excel, Numbers and Google Sheets.
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  tone?: "in" | "out";
}) {
  return (
    <div className="surface p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={
          "mt-2 text-2xl font-semibold " +
          (mono ? "kpi-number " : "") +
          (tone === "in" ? "text-status-present" : tone === "out" ? "text-status-absent" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
