import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];
const ROLES: Role[] = ["administrator", "operations_manager", "finance_officer", "department_head", "staff"];

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Roles, departments, and finance master data</p>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      </header>
      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">People & Roles</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="finance">Finance lists</TabsTrigger>
        </TabsList>
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
