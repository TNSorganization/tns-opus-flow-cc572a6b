import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatMoneyFull } from "@/lib/currency";
import { format } from "date-fns";
import { Wallet } from "lucide-react";
import { useCurrentRoles, isFinance as isFin } from "@/hooks/use-current-role";
import { fetchActiveProfiles } from "@/lib/profiles";

export const Route = createFileRoute("/_authenticated/salary")({
  component: SalaryPage,
});

function SalaryPage() {
  const { data: me } = useCurrentRoles();
  const finance = isFin(me?.roles ?? []);

  const { data: mySalary } = useQuery({
    queryKey: ["my-salary", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salaries")
        .select("amount, currency, updated_at")
        .eq("user_id", me!.userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: myPayments = [] } = useQuery({
    queryKey: ["my-salary-payments", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_payments")
        .select("id, amount, currency, period, paid_at, note")
        .eq("user_id", me!.userId!)
        .order("paid_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allPayments = [] } = useQuery({
    queryKey: ["all-salary-payments"],
    enabled: finance,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_payments")
        .select("id, user_id, amount, currency, period, paid_at, note")
        .order("paid_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    enabled: finance,
    queryFn: fetchActiveProfiles,
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Private to you (and Finance / CEO)</p>
        <h1 className="text-3xl font-semibold tracking-tight">My Salary</h1>
      </header>

      <div className="surface p-6">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-primary" />
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Current agreed salary
            </div>
            <div className="mt-1 text-3xl font-bold kpi-number">
              {mySalary && mySalary.amount > 0
                ? formatMoneyFull(Number(mySalary.amount), mySalary.currency as "XCFA" | "USD")
                : "— not set —"}
            </div>
            {mySalary?.updated_at && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Last updated {format(new Date(mySalary.updated_at), "d MMM yyyy")}
              </div>
            )}
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Payment history
        </h2>
        <div className="surface divide-y divide-border">
          {myPayments.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No payments yet.</div>
          ) : (
            myPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-medium">{p.period}</div>
                  <div className="text-xs text-muted-foreground">
                    Paid {format(new Date(p.paid_at), "d MMM yyyy")} {p.note && `· ${p.note}`}
                  </div>
                </div>
                <div className="kpi-number text-sm font-semibold text-brand-success">
                  +{formatMoneyFull(Number(p.amount), p.currency as "XCFA" | "USD")}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {finance && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            All payments (Finance view)
          </h2>
          <div className="surface overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Paid at</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {allPayments.map((r) => {
                  const p = profiles.find((x) => x.id === r.user_id);
                  return (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="px-4 py-2">{p?.full_name || p?.email || "—"}</td>
                      <td className="px-4 py-2 font-mono">{r.period}</td>
                      <td className="px-4 py-2">{format(new Date(r.paid_at), "d MMM yyyy")}</td>
                      <td className="px-4 py-2 text-right kpi-number font-semibold text-brand-success">
                        +{formatMoneyFull(Number(r.amount), r.currency as "XCFA" | "USD")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
