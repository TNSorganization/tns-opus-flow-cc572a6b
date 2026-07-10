import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, ArrowDown, Loader2, Calendar, CalendarDays, PieChart as PieIcon } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { toast } from "sonner";
import { KpiCard, SectionHeader } from "@/components/kpi-card";
import { formatMoney, type Currency } from "@/lib/currency";
import {
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useCurrentRoles, isFinance as isFin } from "@/hooks/use-current-role";

export const Route = createFileRoute("/_authenticated/income")({
  component: IncomePage,
});

const PIE_COLORS = [
  "var(--primary)", "var(--brand-purple)", "var(--brand-teal)", "var(--brand-info)",
  "var(--brand-yellow)", "var(--brand-orange)", "var(--brand-pink)", "var(--brand-success)",
];

function IncomePage() {
  const [currency, setCurrency] = useState<Currency>("XCFA");
  const today = new Date();

  const { data: rows = [] } = useQuery({
    queryKey: ["income", currency],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("income_entries")
        .select("id, entry_date, amount, currency, description, source_id, payment_method_id, reference, created_by")
        .eq("currency", currency)
        .order("entry_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["income-sources"],
    queryFn: async () =>
      (await supabase.from("income_sources").select("*").eq("active", true).order("name")).data ?? [],
  });
  const { data: methods = [] } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () =>
      (await supabase.from("payment_methods").select("*").eq("active", true).order("name")).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email")).data ?? [],
  });

  const inRange = (d: string, from: Date, to: Date) => {
    const x = new Date(d);
    return x >= from && x <= to;
  };
  const sumRange = (from: Date, to: Date) =>
    rows.filter((r) => inRange(r.entry_date, from, to)).reduce((a, b) => a + Number(b.amount), 0);

  const todayTotal = sumRange(startOfDay(today), endOfDay(today));
  const weekTotal = sumRange(startOfWeek(today, { weekStartsOn: 1 }), endOfWeek(today, { weekStartsOn: 1 }));
  const monthTotal = sumRange(startOfMonth(today), endOfMonth(today));

  const bySource = new Map<string, number>();
  for (const r of rows) {
    const name = sources.find((s) => s.id === r.source_id)?.name || "Other";
    bySource.set(name, (bySource.get(name) ?? 0) + Number(r.amount));
  }
  const sourceData = [...bySource.entries()].map(([name, value]) => ({ name, value }));
  const topSource = sourceData.sort((a, b) => b.value - a.value)[0]?.name || "—";

  const trendDays = 14;
  const trend: { d: string; v: number }[] = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = subDays(today, i);
    const key = format(d, "yyyy-MM-dd");
    trend.push({
      d: format(d, "d MMM"),
      v: rows.filter((r) => r.entry_date === key).reduce((a, b) => a + Number(b.amount), 0),
    });
  }

  const nameOf = (id: string | null) => {
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <NewIncomeButton
          sources={sources}
          methods={methods}
          defaultCurrency={currency}
        />
        <div className="inline-flex rounded-md border border-border bg-muted/40 p-1">
          {(["XCFA", "USD"] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={
                "rounded px-3 py-1 text-xs font-bold transition-colors " +
                (currency === c ? "bg-card text-foreground shadow" : "text-muted-foreground")
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard tone="success" icon={<ArrowDown className="h-5 w-5" />}
          value={formatMoney(todayTotal, currency)} label="Today's Income" />
        <KpiCard tone="info" icon={<Calendar className="h-5 w-5" />}
          value={formatMoney(weekTotal, currency)} label="This Week" />
        <KpiCard tone="purple" icon={<CalendarDays className="h-5 w-5" />}
          value={formatMoney(monthTotal, currency)} label="This Month" />
        <KpiCard tone="teal" icon={<PieIcon className="h-5 w-5" />}
          value={<span className="text-xl">{topSource}</span>} label="Top Income Source" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="tos-card">
          <h3 className="mb-4 text-sm font-bold">Income by Source</h3>
          <div className="h-72">
            {sourceData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={sourceData} dataKey="value" nameKey="name" outerRadius={100} innerRadius={55}>
                    {sourceData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                    formatter={(v: number) => formatMoney(v, currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="tos-card">
          <h3 className="mb-4 text-sm font-bold">Income Trend (14 days)</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                  formatter={(v: number) => formatMoney(v, currency)} />
                <Line type="monotone" dataKey="v" stroke="var(--brand-success)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="Recent Transactions" />
        <div className="tos-card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Received By</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No income yet.</td></tr>
              ) : rows.slice(0, 50).map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                  <td className="px-4 py-3">{format(new Date(r.entry_date), "d MMM yyyy")}</td>
                  <td className="px-4 py-3">{sources.find((s) => s.id === r.source_id)?.name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.description || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold kpi-number text-brand-success">
                    +{formatMoney(Number(r.amount), currency)}
                  </td>
                  <td className="px-4 py-3">{methods.find((m) => m.id === r.payment_method_id)?.name || "—"}</td>
                  <td className="px-4 py-3">{nameOf(r.created_by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Empty() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data</div>;
}

function NewIncomeButton({
  sources,
  methods,
  defaultCurrency,
}: {
  sources: { id: string; name: string }[];
  methods: { id: string; name: string }[];
  defaultCurrency: Currency;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("income_entries").insert({
      entry_date: String(fd.get("entry_date")),
      amount: Number(fd.get("amount")),
      currency: String(fd.get("currency")),
      description: String(fd.get("description") || "") || null,
      source_id: (fd.get("source_id") as string) || null,
      payment_method_id: (fd.get("payment_method_id") as string) || null,
      reference: String(fd.get("reference") || "") || null,
      created_by: u.user?.id,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Income recorded");
    qc.invalidateQueries({ queryKey: ["income"] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-brand text-white">
          <Plus className="mr-1.5 h-4 w-4" /> Record Income
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Income</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input name="entry_date" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input name="amount" type="number" step="0.01" min="0" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select name="currency" defaultValue={defaultCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="XCFA">XCFA</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select name="source_id">
                <SelectTrigger><SelectValue placeholder="Choose source" /></SelectTrigger>
                <SelectContent>
                  {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select name="payment_method_id">
              <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
              <SelectContent>
                {methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea name="description" rows={2} maxLength={1000} />
          </div>
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input name="reference" maxLength={100} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
