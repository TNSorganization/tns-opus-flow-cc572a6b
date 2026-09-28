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
  Plus,
  Trash2,
  Copy,
  KeyRound,
  Check,
  UserX,
  ShieldAlert,
  Wallet,
  CalendarDays,
  Send,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCurrentRoles,
  useIsActive,
  isCeo,
  isFinance as isFin,
  isOps as isOpsRole,
  canSendNotifications as canSend,
  ALL_ROLES,
  roleLabel,
  type Role,
} from "@/hooks/use-current-role";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import {
  clearPendingMatricule,
  getPendingMatricule,
  normalizeMatriculeCode,
} from "@/lib/pending-matricule";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function SettingsPage() {
  const { data: me } = useCurrentRoles();
  const roles = me?.roles ?? [];
  const { data: isActive } = useIsActive();
  const ceo = isCeo(roles);
  const admin = ceo || roles.includes("administrator");
  const finance = isFin(roles);
  const ops = isOpsRole(roles);
  const sender = canSend(roles) || finance;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Account, matricule, and administration</p>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      </header>

      {!isActive && <MatriculeConfirm userId={me?.userId ?? null} />}

      {isActive && !ceo && !admin && !ops && !finance && (
        <div className="tos-card border-brand-success/40 bg-brand-success/5 text-sm flex items-center gap-3">
          <Check className="h-5 w-5 text-brand-success" />
          <span>Your matricule is confirmed. You now have full access to the platform.</span>
        </div>
      )}

      <Tabs defaultValue={ceo ? "matricules" : "people"}>
        <TabsList className="flex-wrap">
          {ceo && <TabsTrigger value="matricules">Matricules</TabsTrigger>}
          {admin && <TabsTrigger value="people">People & Roles</TabsTrigger>}
          {finance && <TabsTrigger value="salaries">Salaries</TabsTrigger>}
          {ops && <TabsTrigger value="schedules">Work schedules</TabsTrigger>}
          {ops && <TabsTrigger value="excuses">Absence excuses</TabsTrigger>}
          {sender && <TabsTrigger value="notify">Send notification</TabsTrigger>}
          {admin && <TabsTrigger value="departments">Departments</TabsTrigger>}
          {finance && <TabsTrigger value="finance">Finance lists</TabsTrigger>}
        </TabsList>

        {ceo && (
          <TabsContent value="matricules" className="mt-4">
            <MatriculesSettings />
          </TabsContent>
        )}
        {admin && (
          <TabsContent value="people" className="mt-4">
            <PeopleSettings ceo={ceo} currentUserId={me?.userId ?? null} />
          </TabsContent>
        )}
        {finance && (
          <TabsContent value="salaries" className="mt-4">
            <SalariesTab />
          </TabsContent>
        )}
        {ops && (
          <TabsContent value="schedules" className="mt-4">
            <SchedulesTab />
          </TabsContent>
        )}
        {ops && (
          <TabsContent value="excuses" className="mt-4">
            <ExcusesTab />
          </TabsContent>
        )}
        {sender && (
          <TabsContent value="notify" className="mt-4">
            <NotifyComposer />
          </TabsContent>
        )}
        {admin && (
          <TabsContent value="departments" className="mt-4">
            <MasterList
              table="departments"
              title="Departments"
              queryKey={["departments"]}
              columns={["name", "description"]}
            />
          </TabsContent>
        )}
        {finance && (
          <TabsContent value="finance" className="mt-4 space-y-6">
            <MasterList
              table="income_sources"
              title="Income sources"
              queryKey={["income-sources"]}
              columns={["name", "description"]}
            />
            <MasterList
              table="expense_categories"
              title="Expense categories"
              queryKey={["expense-categories"]}
              columns={["name", "description"]}
            />
            <MasterList
              table="payment_methods"
              title="Payment methods"
              queryKey={["payment-methods"]}
              columns={["name"]}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ============ Matricule Confirmation (for everyone once) ============
function MatriculeConfirm({ userId }: { userId: string | null }) {
  const qc = useQueryClient();
  const [code, setCode] = useState(() => getPendingMatricule()?.code ?? "");
  const [loading, setLoading] = useState(false);
  const { data: myMat } = useQuery({
    queryKey: ["my-matricule", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("matricules")
        .select("code, role, confirmed_at, revoked_at")
        .eq("used_by", userId!)
        .maybeSingle();
      return data;
    },
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalizedCode = normalizeMatriculeCode(code);
    setLoading(true);

    // A confirmed-email signup has not yet had an authenticated session in which
    // to attach its matricule. Redeeming first also keeps older signups working.
    const { error: redeemError } = await supabase.rpc("redeem_matricule", {
      _code: normalizedCode,
    });
    const { error: confirmError } = await supabase.rpc("confirm_matricule", {
      _code: normalizedCode,
    });
    setLoading(false);

    const alreadyConfirmed = confirmError?.message.toLowerCase().includes("already confirmed");
    if (confirmError && !alreadyConfirmed) {
      const redeemFailedUnexpectedly =
        redeemError && !redeemError.message.toLowerCase().includes("already-used");
      return toast.error(
        redeemFailedUnexpectedly
          ? `Could not activate this matricule: ${redeemError.message}`
          : "This matricule is invalid, expired, revoked, or belongs to another account.",
      );
    }

    clearPendingMatricule(normalizedCode);
    setCode("");
    toast.success("Matricule activated. Your account is ready.");
    qc.invalidateQueries({ queryKey: ["is-active"] });
    qc.invalidateQueries({ queryKey: ["my-matricule"] });
    qc.invalidateQueries({ queryKey: ["current-user-roles"] });
  }

  const revoked = myMat?.revoked_at;
  return (
    <div className="tos-card border-brand-yellow/50 bg-brand-yellow/5">
      <div className="mb-3 flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-brand-yellow" />
        <div>
          <div className="text-lg font-semibold">Confirm your matricule to unlock the platform</div>
          <p className="text-sm text-muted-foreground">
            {revoked
              ? "Your matricule has been revoked. Ask the CEO to issue you a new one, then confirm it below."
              : "Enter the code the CEO gave you once to activate your account."}
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label>Matricule code</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="TNS-XXXXX-XXXXX"
            className="uppercase tracking-wider font-mono"
            required
          />
        </div>
        <Button type="submit" disabled={loading || !code.trim()}>
          <KeyRound className="mr-1 h-4 w-4" /> {loading ? "Activating..." : "Activate account"}
        </Button>
      </form>
    </div>
  );
}

function genCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `TNS-${out.slice(0, 5)}-${out.slice(5)}`;
}

function MatriculesSettings() {
  const qc = useQueryClient();
  const [role, setRole] = useState<Role>("staff");
  const [copied, setCopied] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["matricules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matricules")
        .select(
          "id, code, role, full_name, email, note, used_by, used_at, confirmed_at, revoked_at, expires_at, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (payload: { full_name: string; email: string; note: string; role: Role }) => {
      const code = genCode();
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("matricules").insert({
        code,
        role: payload.role,
        full_name: payload.full_name || null,
        email: payload.email || null,
        note: payload.note || null,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
      return code;
    },
    onSuccess: (code) => {
      toast.success(`Matricule ${code} created`);
      qc.invalidateQueries({ queryKey: ["matricules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("matricules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["matricules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({
      full_name: String(fd.get("full_name") ?? ""),
      email: String(fd.get("email") ?? ""),
      note: String(fd.get("note") ?? ""),
      role,
    });
    (e.currentTarget as HTMLFormElement).reset();
    setRole("staff");
  }

  return (
    <div className="space-y-6">
      <div className="surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Generate enrollment code</h3>
        </div>
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Recruit name</Label>
            <Input name="full_name" placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input name="email" type="email" placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Role to grant</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input name="note" placeholder="Optional" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={create.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Generate matricule
            </Button>
          </div>
        </form>
      </div>

      <div className="surface">
        <div className="p-4">
          <h3 className="text-sm font-semibold">All matricules</h3>
          <p className="text-xs text-muted-foreground">
            Send the code to the recruit. The app carries it through signup and prompts them to
            activate their account after email confirmation.
          </p>
        </div>
        <div className="divide-y divide-border border-t border-border">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No matricules yet.</div>
          ) : (
            rows.map((r) => {
              const used = !!r.used_by;
              const revoked = !!r.revoked_at;
              const confirmed = !!r.confirmed_at;
              const status = revoked
                ? "Revoked"
                : confirmed
                  ? "Active"
                  : used
                    ? "Signed up"
                    : "Pending";
              const tone = revoked
                ? "bg-brand-danger/15 text-brand-danger"
                : confirmed
                  ? "bg-brand-success/15 text-brand-success"
                  : used
                    ? "bg-brand-info/15 text-brand-info"
                    : "bg-brand-yellow/15 text-brand-yellow";
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                  <button
                    onClick={() => copy(r.code)}
                    className="group flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 font-mono text-sm hover:border-primary"
                  >
                    <span className={revoked ? "line-through opacity-60" : ""}>{r.code}</span>
                    {copied === r.code ? (
                      <Check className="h-3.5 w-3.5 text-brand-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                    )}
                  </button>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                    {roleLabel(r.role as Role)}
                  </span>
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="truncate">{r.full_name || r.email || r.note || "—"}</div>
                    <div className="text-muted-foreground">
                      Created {format(new Date(r.created_at), "d MMM yyyy")}
                      {r.confirmed_at &&
                        ` · Confirmed ${format(new Date(r.confirmed_at), "d MMM")}`}
                      {r.revoked_at && ` · Revoked ${format(new Date(r.revoked_at), "d MMM")}`}
                    </div>
                  </div>
                  <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + tone}>
                    {status}
                  </span>
                  {!used && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => del.mutate(r.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function PeopleSettings({ ceo, currentUserId }: { ceo: boolean; currentUserId: string | null }) {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery({
    queryKey: ["people-full"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name, email, department_id, job_title"))
        .data ?? [],
  });
  const { data: roles = [] } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => (await supabase.from("user_roles").select("user_id, role")).data ?? [],
  });
  const { data: depts = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () =>
      (await supabase.from("departments").select("id, name").order("name")).data ?? [],
  });

  const addRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: Role }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id, role });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-roles"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const removeRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: Role }) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-roles"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const fire = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.rpc("admin_delete_user", { _user_id: user_id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff fired");
      qc.invalidateQueries({ queryKey: ["people-full"] });
      qc.invalidateQueries({ queryKey: ["all-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revokeMat = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.rpc("revoke_matricule", { _user_id: user_id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Matricule revoked");
      qc.invalidateQueries({ queryKey: ["matricules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function updateProfile(
    id: string,
    patch: { department_id?: string | null; job_title?: string | null },
  ) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["people-full"] });
  }

  return (
    <div className="surface divide-y divide-border">
      {profiles.map((p) => {
        const userRoles = roles.filter((r) => r.user_id === p.id).map((r) => r.role);
        const isSelf = p.id === currentUserId;
        return (
          <div key={p.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0 space-y-2">
              <div>
                <div className="truncate text-sm font-semibold">{p.full_name || p.email}</div>
                <div className="truncate text-xs text-muted-foreground">{p.email}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={p.department_id ?? "none"}
                  onValueChange={(v) =>
                    updateProfile(p.id, { department_id: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No department —</SelectItem>
                    {depts.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  defaultValue={p.job_title ?? ""}
                  placeholder="Job title"
                  className="h-7 w-40 text-xs"
                  onBlur={(e) =>
                    e.target.value !== (p.job_title ?? "") &&
                    updateProfile(p.id, { job_title: e.target.value || null })
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              {userRoles.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary"
                >
                  {roleLabel(r as Role)}
                  <button
                    onClick={() => removeRole.mutate({ user_id: p.id, role: r as Role })}
                    className="text-primary/70 hover:text-primary"
                    title="Remove role"
                  >
                    ×
                  </button>
                </span>
              ))}
              <Select onValueChange={(v) => addRole.mutate({ user_id: p.id, role: v as Role })}>
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue placeholder="Add role" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.filter((r) => !userRoles.includes(r)).map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ceo && !isSelf && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1"
                    onClick={() =>
                      confirm(
                        "Revoke this user's matricule? They'll be locked out until you issue a new one.",
                      ) && revokeMat.mutate(p.id)
                    }
                  >
                    <Ban className="h-3.5 w-3.5" /> Revoke
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() =>
                      confirm(
                        `Permanently remove ${p.full_name || p.email}? This is irreversible.`,
                      ) && fire.mutate(p.id)
                    }
                  >
                    <UserX className="h-3.5 w-3.5" /> Fire
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SalariesTab() {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name, email")).data ?? [],
  });
  const { data: sal = [] } = useQuery({
    queryKey: ["salaries"],
    queryFn: async () =>
      (await supabase.from("salaries").select("user_id, amount, currency")).data ?? [],
  });
  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);

  const setSal = useMutation({
    mutationFn: async ({
      user_id,
      amount,
      currency,
    }: {
      user_id: string;
      amount: number;
      currency: string;
    }) => {
      const { error } = await supabase.rpc("set_salary", {
        _user: user_id,
        _amount: amount,
        _currency: currency,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["salaries"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  async function runPayroll() {
    setRunning(true);
    const { data, error } = await supabase.rpc("run_payroll", {
      _period: period,
      _note: note || undefined,
    });
    setRunning(false);
    if (error) return toast.error(error.message);
    toast.success(`Payroll run: ${data} people paid`);
    qc.invalidateQueries({ queryKey: ["salaries"] });
  }
  const salMap = new Map(sal.map((s) => [s.user_id, s]));
  return (
    <div className="space-y-6">
      <div className="surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Run payroll</h3>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Period</Label>
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="YYYY-MM"
              className="w-32 font-mono"
            />
          </div>
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. July salaries"
            />
          </div>
          <Button onClick={runPayroll} disabled={running}>
            Pay everyone with a salary set
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Each recipient gets a private notification of their own amount, auto-hiding after 24 h.
          Duplicate periods are skipped.
        </p>
      </div>
      <div className="surface divide-y divide-border">
        {profiles.map((p) => {
          const s = salMap.get(p.id);
          return (
            <form
              key={p.id}
              className="flex flex-wrap items-center gap-3 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setSal.mutate({
                  user_id: p.id,
                  amount: Number(fd.get("amount")),
                  currency: String(fd.get("currency")),
                });
              }}
            >
              <div className="min-w-40 flex-1">
                <div className="truncate text-sm font-medium">{p.full_name || p.email}</div>
                <div className="truncate text-xs text-muted-foreground">{p.email}</div>
              </div>
              <Input
                name="amount"
                type="number"
                step="1"
                min="0"
                defaultValue={s?.amount ?? 0}
                className="w-32"
              />
              <Select name="currency" defaultValue={s?.currency ?? "XCFA"}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="XCFA">XCFA</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" size="sm" variant="outline">
                Save
              </Button>
            </form>
          );
        })}
      </div>
    </div>
  );
}

function SchedulesTab() {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name, email")).data ?? [],
  });
  const { data: schedules = [] } = useQuery({
    queryKey: ["work-schedules"],
    queryFn: async () => (await supabase.from("work_schedules").select("*")).data ?? [],
  });
  const schedMap = new Map(schedules.map((s) => [s.user_id, s]));
  async function toggle(user_id: string, day: (typeof WEEKDAYS)[number], on: boolean) {
    const current = schedMap.get(user_id);
    const base = {
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
    };
    const next = { user_id, ...base, ...(current ?? {}), [day]: on };
    const { error } = await supabase
      .from("work_schedules")
      .upsert(next as never, { onConflict: "user_id" });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["work-schedules"] });
  }
  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2">Staff</th>
            {WEEKDAYS.map((d) => (
              <th key={d} className="px-2 py-2 text-center">
                {d.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => {
            const s = schedMap.get(p.id);
            return (
              <tr key={p.id} className="border-b border-border/60">
                <td className="px-3 py-2 text-sm">{p.full_name || p.email}</td>
                {WEEKDAYS.map((d) => {
                  const on = s
                    ? (s as unknown as Record<string, boolean>)[d]
                    : d !== "saturday" && d !== "sunday";
                  return (
                    <td key={d} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggle(p.id, d, e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExcusesTab() {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name, email")).data ?? [],
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["excuses"],
    queryFn: async () =>
      (
        await supabase
          .from("absence_excuses")
          .select("*")
          .order("excuse_date", { ascending: false })
          .limit(200)
      ).data ?? [],
  });
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("absence_excuses").insert({
      user_id: String(fd.get("user_id")),
      excuse_date: String(fd.get("excuse_date")),
      reason: String(fd.get("reason") || "") || null,
      granted_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    (e.currentTarget as HTMLFormElement).reset();
    qc.invalidateQueries({ queryKey: ["excuses"] });
    toast.success("Excuse recorded");
  }
  async function del(id: string) {
    const { error } = await supabase.from("absence_excuses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["excuses"] });
  }
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="surface flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label>Staff</Label>
          <Select name="user_id" required>
            <SelectTrigger>
              <SelectValue placeholder="Choose staff" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input
            name="excuse_date"
            type="date"
            required
            defaultValue={format(new Date(), "yyyy-MM-dd")}
          />
        </div>
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label>Reason</Label>
          <Input name="reason" placeholder="e.g. medical leave" />
        </div>
        <Button type="submit">
          <Plus className="mr-1 h-4 w-4" /> Excuse
        </Button>
      </form>
      <div className="surface divide-y divide-border">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No excuses recorded.</div>
        ) : (
          rows.map((r) => {
            const p = profiles.find((x) => x.id === r.user_id);
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {p?.full_name || p?.email || "Unknown"} ·{" "}
                    {format(new Date(r.excuse_date), "d MMM yyyy")}
                  </div>
                  {r.reason && (
                    <div className="truncate text-xs text-muted-foreground">{r.reason}</div>
                  )}
                </div>
                <Button size="icon" variant="ghost" onClick={() => del(r.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function NotifyComposer() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<"all" | "role" | "user">("all");
  const [roleSel, setRoleSel] = useState<Role>("staff");
  const [userSel, setUserSel] = useState<string>("");
  const [sending, setSending] = useState(false);
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name, email").order("full_name")).data ??
      [],
  });
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSending(true);
    const { data, error } = await supabase.rpc("send_notification", {
      _title: String(fd.get("title")),
      _body: String(fd.get("body") || ""),
      _target: target,
      _target_role: target === "role" ? roleSel : undefined,
      _target_user: target === "user" ? userSel : undefined,
      _category: "broadcast",
      _hide_after: undefined,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success(`Notification sent to ${data} people`);
    qc.invalidateQueries({ queryKey: ["my-notifications"] });
    (e.currentTarget as HTMLFormElement).reset();
  }
  return (
    <form onSubmit={submit} className="surface space-y-3 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Send className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Send a notification</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Target</Label>
          <Select value={target} onValueChange={(v) => setTarget(v as typeof target)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="role">A specific role</SelectItem>
              <SelectItem value="user">One person</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {target === "role" && (
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={roleSel} onValueChange={(v) => setRoleSel(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {target === "user" && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Person</Label>
            <Select value={userSel} onValueChange={setUserSel}>
              <SelectTrigger>
                <SelectValue placeholder="Choose staff" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input name="title" required maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea name="body" rows={3} maxLength={1000} />
      </div>
      <div>
        <Button type="submit" disabled={sending}>
          <Send className="mr-1 h-4 w-4" /> Send
        </Button>
      </div>
    </form>
  );
}

type MasterTable = "departments" | "income_sources" | "expense_categories" | "payment_methods";

function MasterList({
  table,
  title,
  queryKey,
  columns,
}: {
  table: MasterTable;
  title: string;
  queryKey: string[];
  columns: ("name" | "description")[];
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data: rows = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await supabase.from(table).select("*").order("name");
      return (data as { id: string; name: string; description?: string | null }[]) ?? [];
    },
  });
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = { name: String(fd.get("name")) };
    if (columns.includes("description"))
      payload.description = String(fd.get("description") || "") || null;
    const { error } = await supabase.from(table).insert(payload as never);
    if (error) return toast.error(error.message);
    (e.currentTarget as HTMLFormElement).reset();
    qc.invalidateQueries({ queryKey });
    setAdding(false);
  }
  async function del(id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey });
  }
  return (
    <div className="surface">
      <div className="flex items-center justify-between p-4">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {adding && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-t border-border p-4">
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label>Name</Label>
            <Input name="name" required autoFocus />
          </div>
          {columns.includes("description") && (
            <div className="min-w-40 flex-[2] space-y-1.5">
              <Label>Description</Label>
              <Input name="description" />
            </div>
          )}
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      )}
      <div className="divide-y divide-border border-t border-border">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="text-sm">{r.name}</div>
              {r.description && (
                <div className="text-xs text-muted-foreground">{r.description}</div>
              )}
            </div>
            <Button size="icon" variant="ghost" onClick={() => del(r.id)}>
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
