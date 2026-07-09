import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Copy, KeyRound, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";

type Role = Database["public"]["Enums"]["app_role"];
const ROLES: Role[] = ["administrator", "operations_manager", "finance_officer", "department_head", "staff"];

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Enrollment codes, roles, and master data</p>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      </header>
      <Tabs defaultValue="matricules">
        <TabsList>
          <TabsTrigger value="matricules">Matricules</TabsTrigger>
          <TabsTrigger value="people">People & Roles</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="finance">Finance lists</TabsTrigger>
        </TabsList>
        <TabsContent value="matricules" className="mt-4"><MatriculesSettings /></TabsContent>
        <TabsContent value="people" className="mt-4"><PeopleSettings /></TabsContent>
        <TabsContent value="departments" className="mt-4">
          <MasterList
            table="departments"
            title="Departments"
            queryKey={["departments"]}
            columns={["name", "description"]}
          />
        </TabsContent>
        <TabsContent value="finance" className="mt-4 space-y-6">
          <MasterList table="income_sources" title="Income sources" queryKey={["income-sources"]} columns={["name", "description"]} />
          <MasterList table="expense_categories" title="Expense categories" queryKey={["expense-categories"]} columns={["name", "description"]} />
          <MasterList table="payment_methods" title="Payment methods" queryKey={["payment-methods"]} columns={["name"]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function genCode() {
  // Human-friendly 10-char code, no confusable chars.
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
        .select("id, code, role, full_name, email, note, used_by, used_at, expires_at, created_at")
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
            <Input name="email" type="email" placeholder="Optional — for reference" />
          </div>
          <div className="space-y-1.5">
            <Label>Role to grant</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
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
            Send the code to the recruit by email. Each code works once.
          </p>
        </div>
        <div className="divide-y divide-border border-t border-border">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No matricules yet. Generate one above.
            </div>
          ) : (
            rows.map((r) => {
              const used = !!r.used_by;
              const expired = r.expires_at && new Date(r.expires_at) < new Date();
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                  <button
                    onClick={() => copy(r.code)}
                    className="group flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 font-mono text-sm hover:border-primary"
                    title="Copy code"
                  >
                    <span className={used ? "line-through opacity-60" : ""}>{r.code}</span>
                    {copied === r.code ? (
                      <Check className="h-3.5 w-3.5 text-brand-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                    )}
                  </button>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                    {r.role.replace(/_/g, " ")}
                  </span>
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="truncate">{r.full_name || r.email || r.note || "—"}</div>
                    <div className="text-muted-foreground">
                      Created {format(new Date(r.created_at), "d MMM yyyy")}
                      {r.used_at && ` · Used ${format(new Date(r.used_at), "d MMM yyyy")}`}
                    </div>
                  </div>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                      (used
                        ? "bg-brand-success/15 text-brand-success"
                        : expired
                          ? "bg-brand-danger/15 text-brand-danger"
                          : "bg-brand-yellow/15 text-brand-yellow")
                    }
                  >
                    {used ? "Redeemed" : expired ? "Expired" : "Pending"}
                  </span>
                  {!used && (
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(r.id)} title="Delete">
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


function PeopleSettings() {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery({
    queryKey: ["people-full"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email")).data ?? [],
  });
  const { data: roles = [] } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => (await supabase.from("user_roles").select("user_id, role")).data ?? [],
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
      const { error } = await supabase.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-roles"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="surface divide-y divide-border">
      {profiles.map((p) => {
        const userRoles = roles.filter((r) => r.user_id === p.id).map((r) => r.role);
        return (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.full_name || p.email}</div>
              <div className="truncate text-xs text-muted-foreground">{p.email}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {userRoles.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                  {r.replace("_", " ")}
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
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue placeholder="Add role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => !userRoles.includes(r)).map((r) => (
                    <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      })}
    </div>
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
    if (columns.includes("description")) payload.description = String(fd.get("description") || "") || null;
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
          <Button type="submit" size="sm">Save</Button>
        </form>
      )}
      <div className="divide-y divide-border border-t border-border">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="text-sm">{r.name}</div>
              {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => del(r.id)} title="Delete">
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
