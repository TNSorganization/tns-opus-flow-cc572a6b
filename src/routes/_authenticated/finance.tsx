import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Plus, ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/finance")({
  component: FinancePage,
});

function money(n: number | null | undefined) {
  const v = typeof n === "number" ? n : 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function FinancePage() {
  const today = new Date();

  const { data: incomes = [] } = useQuery({
    queryKey: ["incomes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("income_entries")
        .select("id, entry_date, amount, description, source_id, payment_method_id, reference")
        .order("entry_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_entries")
        .select("id, entry_date, amount, purpose, category_id, status, payment_method_id, reference")
        .order("entry_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["income-sources"],
    queryFn: async () => (await supabase.from("income_sources").select("*").eq("active", true).order("name")).data ?? [],
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => (await supabase.from("expense_categories").select("*").eq("active", true).order("name")).data ?? [],
  });
  const { data: methods = [] } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => (await supabase.from("payment_methods").select("*").eq("active", true).order("name")).data ?? [],
  });

  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const sum = (arr: { amount: number; entry_date: string }[], from: Date, to: Date) =>
    arr
      .filter((r) => {
        const d = new Date(r.entry_date);
        return d >= from && d <= to;
      })
      .reduce((a, b) => a + Number(b.amount), 0);

  const todayIn = sum(incomes, startOfDay(today), endOfDay(today));
  const todayOut = sum(expenses, startOfDay(today), endOfDay(today));
  const monthIn = sum(incomes, monthStart, monthEnd);
  const monthOut = sum(expenses, monthStart, monthEnd);
  const totalIn = incomes.reduce((a, b) => a + Number(b.amount), 0);
  const totalOut = expenses.reduce((a, b) => a + Number(b.amount), 0);
  const balance = totalIn - totalOut;
  void todayStart; void todayEnd;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Income, expenses and cash flow</p>
        <h1 className="text-3xl font-semibold tracking-tight">Finance</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Today in" value={money(todayIn)} tone="up" />
        <Kpi label="Today out" value={money(todayOut)} tone="down" />
        <Kpi label="Month in" value={money(monthIn)} tone="up" />
        <Kpi label="Month out" value={money(monthOut)} tone="down" />
        <Kpi label="Cash balance" value={money(balance)} accent />
      </div>

      <Tabs defaultValue="income">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="expense">Expenses</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="income" className="mt-4">
          <NewEntryButton
            kind="income"
            sources={sources}
            categories={categories}
            methods={methods}
          />
          <EntryList
            rows={incomes.map((r) => ({
              id: r.id,
              date: r.entry_date,
              label:
                sources.find((s) => s.id === r.source_id)?.name ||
                r.description ||
                "Income",
              method: methods.find((m) => m.id === r.payment_method_id)?.name,
              ref: r.reference,
              amount: Number(r.amount),
              direction: "in",
            }))}
          />
        </TabsContent>
        <TabsContent value="expense" className="mt-4">
          <NewEntryButton
            kind="expense"
            sources={sources}
            categories={categories}
            methods={methods}
          />
          <EntryList
            rows={expenses.map((r) => ({
              id: r.id,
              date: r.entry_date,
              label:
                categories.find((c) => c.id === r.category_id)?.name ||
                r.purpose ||
                "Expense",
              method: methods.find((m) => m.id === r.payment_method_id)?.name,
              ref: r.reference,
              amount: Number(r.amount),
              direction: "out",
              status: r.status,
            }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  accent,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  accent?: boolean;
}) {
  return (
    <div className={cn("surface p-4", accent && "border-primary/40")}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "kpi-number mt-2 text-2xl font-semibold",
          tone === "up" && "text-status-present",
          tone === "down" && "text-status-absent",
          accent && "text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}

type Row = {
  id: string;
  date: string;
  label: string;
  method?: string;
  ref?: string | null;
  amount: number;
  direction: "in" | "out";
  status?: string;
};

function EntryList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="surface mt-3 p-10 text-center text-sm text-muted-foreground">
        No entries yet.
      </div>
    );
  }
  return (
    <div className="surface mt-3 divide-y divide-border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              r.direction === "in"
                ? "bg-status-present/15 text-status-present"
                : "bg-status-absent/15 text-status-absent",
            )}
          >
            {r.direction === "in" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{r.label}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{format(new Date(r.date), "d MMM yyyy")}</span>
              {r.method && <span>· {r.method}</span>}
              {r.ref && <span className="font-mono">· {r.ref}</span>}
              {r.status && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 uppercase">{r.status}</span>
              )}
            </div>
          </div>
          <div
            className={cn(
              "kpi-number text-sm font-semibold",
              r.direction === "in" ? "text-status-present" : "text-status-absent",
            )}
          >
            {r.direction === "in" ? "+" : "−"}
            {money(r.amount)}
          </div>
        </div>
      ))}
    </div>
  );
}

function NewEntryButton({
  kind,
  sources,
  categories,
  methods,
}: {
  kind: "income" | "expense";
  sources: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  methods: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (kind === "income") {
      const { error } = await supabase.from("income_entries").insert({
        entry_date: String(fd.get("entry_date")),
        amount: Number(fd.get("amount")),
        description: String(fd.get("description") || "") || null,
        source_id: (fd.get("source_id") as string) || null,
        payment_method_id: (fd.get("payment_method_id") as string) || null,
        reference: String(fd.get("reference") || "") || null,
        created_by: u.user?.id,
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["incomes"] });
    } else {
      const { error } = await supabase.from("expense_entries").insert({
        entry_date: String(fd.get("entry_date")),
        amount: Number(fd.get("amount")),
        purpose: String(fd.get("purpose")),
        category_id: (fd.get("category_id") as string) || null,
        payment_method_id: (fd.get("payment_method_id") as string) || null,
        reference: String(fd.get("reference") || "") || null,
        created_by: u.user?.id,
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["expenses"] });
    }
    toast.success("Saved");
    setOpen(false);
  }

  return (
    <div className="flex justify-end">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-1.5 h-4 w-4" /> New {kind}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New {kind}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  name="entry_date"
                  type="date"
                  defaultValue={format(new Date(), "yyyy-MM-dd")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input name="amount" type="number" step="0.01" min="0" required />
              </div>
            </div>
            {kind === "income" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Source</Label>
                  <Select name="source_id">
                    <SelectTrigger>
                      <SelectValue placeholder="Choose source" />
                    </SelectTrigger>
                    <SelectContent>
                      {sources.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea name="description" rows={2} maxLength={1000} />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select name="category_id">
                    <SelectTrigger>
                      <SelectValue placeholder="Choose category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Purpose</Label>
                  <Input name="purpose" required maxLength={200} />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <Select name="payment_method_id">
                  <SelectTrigger>
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    {methods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
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
    </div>
  );
}
