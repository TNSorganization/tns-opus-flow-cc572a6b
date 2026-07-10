import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { useCurrentRoles, isFinance as isFin, isDeptHead as isDH } from "@/hooks/use-current-role";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, ArrowUp, Loader2, Calendar, CalendarDays, Building2, Check, X } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { toast } from "sonner";
import { KpiCard, SectionHeader } from "@/components/kpi-card";
import { formatMoney, type Currency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: ExpensesPage,
});

const PIE_COLORS = [
  "var(--brand-danger)", "var(--brand-orange)", "var(--brand-yellow)", "var(--brand-pink)",
  "var(--brand-purple)", "var(--primary)", "var(--brand-teal)", "var(--brand-info)",
];

function ExpensesPage() {
  const qc = useQueryClient();
  const [currency, setCurrency] = useState<Currency>("XCFA");
  const today = new Date();
  const { data: me } = useCurrentRoles();
  const roles = me?.roles ?? [];
  const canRecord = isFin(roles);
  const canRequest = !canRecord && isDH(roles);
  const canApprove = isFin(roles);
  useRealtimeInvalidate(
    "expenses-live",
    ["expense_entries"],
    [["expenses", currency], ["badge-expenses-pending"]],
  );

  const { data: rows = [] } = useQuery({
    queryKey: ["expenses", currency],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_entries")
        .select("id, entry_date, amount, currency, purpose, category_id, department_id, status, payment_method_id, reference, created_by")
        .eq("currency", currency)
        .order("entry_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: incomes = [] } = useQuery({
    queryKey: ["cashflow-incomes", currency],
    queryFn: async () => {
      const from = format(subDays(today, 13), "yyyy-MM-dd");
      const { data } = await supabase
        .from("income_entries")
        .select("entry_date, amount")
        .eq("currency", currency)
        .gte("entry_date", from);
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () =>
      (await supabase.from("expense_categories").select("*").eq("active", true).order("name")).data ?? [],
  });
  const { data: methods = [] } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () =>
      (await supabase.from("payment_methods").select("*").eq("active", true).order("name")).data ?? [],
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email")).data ?? [],
  });

  const sumRange = (from: Date, to: Date) =>
    rows.filter((r) => {
      const d = new Date(r.entry_date);
      return d >= from && d <= to;
    }).reduce((a, b) => a + Number(b.amount), 0);

  const todayTotal = sumRange(startOfDay(today), endOfDay(today));
  const weekTotal = sumRange(startOfWeek(today, { weekStartsOn: 1 }), endOfWeek(today, { weekStartsOn: 1 }));
  const monthTotal = sumRange(startOfMonth(today), endOfMonth(today));

  const byDept = new Map<string, number>();
  for (const r of rows) {
    const name = departments.find((d) => d.id === r.department_id)?.name || "Other";
    byDept.set(name, (byDept.get(name) ?? 0) + Number(r.amount));
  }
  const deptData = [...byDept.entries()].map(([name, value]) => ({ name, value }));
  const topDept = deptData.sort((a, b) => b.value - a.value)[0]?.name || "—";

  const days: { d: string; income: number; expense: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = subDays(today, i);
    const key = format(d, "yyyy-MM-dd");
    days.push({
      d: format(d, "d MMM"),
      income: incomes.filter((x) => x.entry_date === key).reduce((a, b) => a + Number(b.amount), 0),
      expense: rows.filter((x) => x.entry_date === key).reduce((a, b) => a + Number(b.amount), 0),
    });
  }

  const pending = rows.filter((r) => r.status === "pending");

  const approve = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("expense_entries").update({
        status,
        approved_by: u.user?.id,
        approved_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Approved" : "Rejected");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["badge-expenses-pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameOf = (id: string | null) => {
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {(canRecord || canRequest) && (
          <NewExpenseButton
            categories={categories}
            methods={methods}
            departments={departments}
            defaultCurrency={currency}
            mode={canRecord ? "record" : "request"}
          />
        )}
        {!canRecord && !canRequest && (
          <span className="text-xs text-muted-foreground">
            View-only. Ask Finance to record entries, or a Head of Department to request funds.
          </span>
        )}
        <div className="inline-flex rounded-md border border-border bg-muted/40 p-1">
          {(["XCFA", "USD"] as Currency[]).map((c) => (
            <button key={c} onClick={() => setCurrency(c)}
              className={"rounded px-3 py-1 text-xs font-bold transition-colors " +
                (currency === c ? "bg-card text-foreground shadow" : "text-muted-foreground")}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard tone="danger" icon={<ArrowUp className="h-5 w-5" />}
          value={formatMoney(todayTotal, currency)} label="Today's Expenses" />
        <KpiCard tone="orange" icon={<Calendar className="h-5 w-5" />}
          value={formatMoney(weekTotal, currency)} label="This Week" />
        <KpiCard tone="yellow" icon={<CalendarDays className="h-5 w-5" />}
          value={formatMoney(monthTotal, currency)} label="This Month" />
        <KpiCard tone="pink" icon={<Building2 className="h-5 w-5" />}
          value={<span className="text-xl">{topDept}</span>} label="Highest Spending Dept" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="tos-card">
          <h3 className="mb-4 text-sm font-bold">Expenses by Department</h3>
          <div className="h-72">
            {deptData.length === 0 ? <Empty /> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={deptData} dataKey="value" nameKey="name" outerRadius={100} innerRadius={55}>
                    {deptData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                    formatter={(v: number) => formatMoney(v, currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="tos-card">
          <h3 className="mb-4 text-sm font-bold">Cash Flow (14 days)</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={days}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                  formatter={(v: number) => formatMoney(v, currency)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="income" stroke="var(--brand-success)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="expense" stroke="var(--brand-danger)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="Pending Approvals">
          {pending.length > 0 && (
            <span className="text-sm font-semibold text-brand-danger">
              {pending.length} require action
            </span>
          )}
        </SectionHeader>
        <div className="tos-card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Purpose</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Paid By</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">No expenses yet.</td></tr>
              ) : rows.slice(0, 50).map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                  <td className="px-4 py-3">{format(new Date(r.entry_date), "d MMM yyyy")}</td>
                  <td className="px-4 py-3">{departments.find((d) => d.id === r.department_id)?.name || "—"}</td>
                  <td className="px-4 py-3">{r.purpose}</td>
                  <td className="px-4 py-3 text-right font-semibold kpi-number text-brand-danger">
                    −{formatMoney(Number(r.amount), currency)}
                  </td>
                  <td className="px-4 py-3">{nameOf(r.created_by)}</td>
                  <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
                  <td className="px-4 py-3">
                    {r.status === "pending" && canApprove ? (
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7 text-brand-success"
                          onClick={() => approve.mutate({ id: r.id, status: "approved" })}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-7 w-7 text-brand-danger"
                          onClick={() => approve.mutate({ id: r.id, status: "rejected" })}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending: "bg-brand-yellow/15 text-brand-yellow",
    approved: "bg-brand-success/15 text-brand-success",
    paid: "bg-brand-info/15 text-brand-info",
    rejected: "bg-brand-danger/15 text-brand-danger",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold uppercase", map[s] || "bg-muted text-muted-foreground")}>
      {s}
    </span>
  );
}

function Empty() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data</div>;
}

function NewExpenseButton({
  categories, methods, departments, defaultCurrency,
}: {
  categories: { id: string; name: string }[];
  methods: { id: string; name: string }[];
  departments: { id: string; name: string }[];
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
    const { error } = await supabase.from("expense_entries").insert({
      entry_date: String(fd.get("entry_date")),
      amount: Number(fd.get("amount")),
      currency: String(fd.get("currency")),
      purpose: String(fd.get("purpose")),
      category_id: (fd.get("category_id") as string) || null,
      department_id: (fd.get("department_id") as string) || null,
      payment_method_id: (fd.get("payment_method_id") as string) || null,
      reference: String(fd.get("reference") || "") || null,
      created_by: u.user?.id,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Expense recorded");
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["badge-expenses-pending"] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-brand-danger text-white hover:opacity-90">
          <Plus className="mr-1.5 h-4 w-4" /> Record Expense
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
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
              <Label>Category</Label>
              <Select name="category_id">
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select name="department_id">
              <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Purpose</Label>
            <Input name="purpose" required maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Reference</Label>
              <Input name="reference" maxLength={100} />
            </div>
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
