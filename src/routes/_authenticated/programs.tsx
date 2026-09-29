import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  Trash2,
  Layers,
  Edit2,
  Sparkles,
  Activity,
  FileText,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCurrentRoles, isManager } from "@/hooks/use-current-role";
import { formatDual, formatDualCompact } from "@/lib/currency";
import { fetchActiveProfiles } from "@/lib/profiles";
import { getSessionUser } from "@/lib/auth-session";
import { ModuleErrorState } from "@/components/module-error-state";

export const Route = createFileRoute("/_authenticated/programs")({
  component: ProgramsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type Program = {
  id: string;
  name: string;
  program_type: string;
  status: string;
  frequency: string | null;
  money_in: number | null;
  money_out: number | null;
  description: string | null;
  created_at: string;
  responsible_user_id: string | null;
  contact_info: string | null;
};
type Initiative = {
  id: string;
  name: string;
  house: string;
  status: string;
  document_url: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  created_at: string;
  responsible_user_id: string | null;
  contact_info: string | null;
};
type ProgramActivity = {
  id: string;
  program_id: string;
  name: string;
  frequency: string | null;
  cost_in: number | null;
  cost_out: number | null;
  created_at: string;
};
type Person = { id: string; full_name: string | null; email: string | null };

// ─── Constants ────────────────────────────────────────────────────────────────
const PROGRAM_TYPES = ["campaign", "experience", "development", "mentorship"] as const;
const PROGRAM_STATUSES = [
  { key: "upcoming", label: "Upcoming", color: "bg-brand-info/15 text-brand-info" },
  { key: "running", label: "Running", color: "bg-brand-success/15 text-brand-success" },
  { key: "paused", label: "Paused", color: "bg-brand-yellow/15 text-brand-yellow" },
  { key: "stopped", label: "Stopped", color: "bg-brand-orange/15 text-brand-orange" },
  { key: "decommissioned", label: "Decommissioned", color: "bg-muted text-muted-foreground" },
] as const;

const HOUSES = [
  { key: "maja", label: "Maja — House of Standards" },
  { key: "yon", label: "Yon — House of Archives" },
  { key: "nuru", label: "Nuru — House of Displays" },
  { key: "meyana", label: "Meyana — House of Love" },
  { key: "lomari", label: "Lomari — House of Gatherings" },
] as const;

const INITIATIVE_STATUSES = [
  { key: "submitted", label: "Submitted", color: "bg-muted text-muted-foreground" },
  { key: "validated", label: "Validated", color: "bg-brand-info/15 text-brand-info" },
  { key: "selected", label: "Selected", color: "bg-primary/15 text-primary" },
  { key: "running", label: "Running", color: "bg-brand-success/15 text-brand-success" },
  { key: "rejected", label: "Rejected", color: "bg-destructive/15 text-destructive" },
  { key: "completed", label: "Completed", color: "bg-brand-purple/15 text-brand-purple" },
  { key: "resubmitted", label: "Resubmitted", color: "bg-brand-yellow/15 text-brand-yellow" },
] as const;

const FREQUENCIES = ["one-time", "weekly", "bi-weekly", "monthly", "quarterly", "yearly"] as const;

function statusColor(
  statuses: readonly { key: string; label: string; color: string }[],
  key: string,
) {
  return (
    statuses.find((s) => s.key === key) ?? { label: key, color: "bg-muted text-muted-foreground" }
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
const TABS = [
  { key: "programs", label: "Programs", icon: Layers },
  { key: "initiatives", label: "Initiatives", icon: Sparkles },
] as const;

function ProgramsPage() {
  const [tab, setTab] = useState<"programs" | "initiatives">("programs");
  const { data: me } = useCurrentRoles();
  const canManage = isManager(me?.roles ?? []) || (me?.roles ?? []).includes("programs_officer");
  const canDeleteInitiatives = isManager(me?.roles ?? []);

  const {
    data: programs = [],
    isLoading: plLoad,
    error: plErr,
    refetch: refetchPrograms,
  } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Program[];
    },
  });

  const {
    data: initiatives = [],
    isLoading: inLoad,
    error: inErr,
    refetch: refetchInitiatives,
  } = useQuery({
    queryKey: ["initiatives"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("initiatives" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Initiative[];
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people"],
    queryFn: fetchActiveProfiles,
  });

  const hasError = plErr || inErr;

  if (hasError)
    return (
      <ModuleErrorState
        name="Programs"
        error={hasError}
        onRetry={() => void Promise.all([refetchPrograms(), refetchInitiatives()])}
      />
    );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          Campaigns, experiences, development & mentorship
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Programs</h1>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-b-0 border-transparent rounded-t-md transition-colors -mb-px",
              tab === key
                ? "border-border bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "programs" && (
        <ProgramsTab
          programs={programs}
          isLoading={plLoad}
          canManage={canManage}
          people={people as Person[]}
        />
      )}
      {tab === "initiatives" && (
        <InitiativesTab
          initiatives={initiatives}
          isLoading={inLoad}
          canManage={canManage}
          canDelete={canDeleteInitiatives}
          people={people as Person[]}
        />
      )}
    </div>
  );
}

// ─── Programs Tab ─────────────────────────────────────────────────────────────
function ProgramsTab({
  programs,
  isLoading,
  canManage,
  people,
}: {
  programs: Program[];
  isLoading: boolean;
  canManage: boolean;
  people: Person[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Program | null>(null);
  const [activitiesProgram, setActivitiesProgram] = useState<Program | null>(null);
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("programs" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Program deleted");
      qc.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalMoneyIn = programs.reduce((a, p) => a + (p.money_in ?? 0), 0);
  const totalMoneyOut = programs.reduce((a, p) => a + (p.money_out ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="grid grid-cols-3 gap-4 flex-1">
          <div className="surface p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase">Total</div>
            <div className="text-2xl font-bold">{programs.length}</div>
          </div>
          <div className="surface p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase">Money In</div>
            <div className="text-lg font-bold text-brand-success">
              {formatDualCompact(totalMoneyIn)}
            </div>
          </div>
          <div className="surface p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase">Money Out</div>
            <div className="text-lg font-bold text-destructive">
              {formatDualCompact(totalMoneyOut)}
            </div>
          </div>
        </div>
        {canManage && (
          <div className="shrink-0">
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New Program
            </Button>
            {addOpen && (
              <ProgramFormDialog
                people={people}
                onDone={() => {
                  setAddOpen(false);
                  qc.invalidateQueries({ queryKey: ["programs"] });
                }}
                onClose={() => setAddOpen(false)}
              />
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : programs.length === 0 ? (
        <div className="surface p-12 text-center">
          <Layers className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No programs yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((p) => {
            const s = statusColor(PROGRAM_STATUSES, p.status);
            const responsible = people.find((x) => x.id === p.responsible_user_id);
            return (
              <div key={p.id} className="surface p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {p.program_type} {p.frequency ? `· ${p.frequency}` : ""}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase shrink-0",
                      s.color,
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {p.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                )}
                {(responsible || p.contact_info) && (
                  <div className="space-y-0.5 text-xs border-t border-border/60 pt-2">
                    {responsible && (
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium">
                          {responsible.full_name || responsible.email}
                        </span>
                      </div>
                    )}
                    {p.contact_info && (
                      <div className="text-muted-foreground pl-4">{p.contact_info}</div>
                    )}
                  </div>
                )}
                <div className="flex gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">In:</span>{" "}
                    <span className="font-medium text-brand-success">{formatDual(p.money_in)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Out:</span>{" "}
                    <span className="font-medium text-destructive">{formatDual(p.money_out)}</span>
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1 pt-1 border-t border-border/60">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1"
                      onClick={() => setActivitiesProgram(p)}
                    >
                      <Activity className="h-3 w-3" /> Activities
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 ml-auto"
                      onClick={() => setEditItem(p)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => del.mutate(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editItem && (
        <ProgramFormDialog
          people={people}
          existing={editItem}
          onDone={() => {
            setEditItem(null);
            qc.invalidateQueries({ queryKey: ["programs"] });
          }}
          onClose={() => setEditItem(null)}
        />
      )}
      {activitiesProgram && (
        <ActivitiesDialog program={activitiesProgram} onClose={() => setActivitiesProgram(null)} />
      )}
    </div>
  );
}

function ProgramFormDialog({
  existing,
  onDone,
  onClose,
  people,
}: {
  existing?: Program;
  onDone: () => void;
  onClose: () => void;
  people: Person[];
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(existing?.status ?? "upcoming");
  const [type, setType] = useState(existing?.program_type ?? "campaign");
  const [frequency, setFrequency] = useState(existing?.frequency ?? "");
  const [responsibleId, setResponsibleId] = useState(existing?.responsible_user_id ?? "");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      program_type: type,
      status,
      frequency: frequency || null,
      money_in: Number(fd.get("money_in")) || 0,
      money_out: Number(fd.get("money_out")) || 0,
      description: String(fd.get("description") ?? "").trim() || null,
      responsible_user_id: responsibleId || null,
      contact_info: String(fd.get("contact_info") ?? "").trim() || null,
    };
    if (!payload.name) return toast.error("Name required");
    setLoading(true);
    let error;
    if (existing) {
      ({ error } = await supabase
        .from("programs" as never)
        .update(payload as never)
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("programs" as never).insert(payload as never));
    }
    setLoading(false);
    if (error) return toast.error((error as { message: string }).message);
    toast.success(existing ? "Program updated" : "Program created");
    onDone();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Program" : "New Program"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <Input name="name" defaultValue={existing?.name} required />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROGRAM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROGRAM_STATUSES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Money In (USD)</Label>
              <Input
                name="money_in"
                type="number"
                min={0}
                step="0.01"
                defaultValue={existing?.money_in ?? 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Money Out (USD)</Label>
              <Input
                name="money_out"
                type="number"
                min={0}
                step="0.01"
                defaultValue={existing?.money_out ?? 0}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Responsible person</Label>
              <Select value={responsibleId} onValueChange={setResponsibleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select person…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Contact info</Label>
              <Input
                name="contact_info"
                defaultValue={existing?.contact_info ?? ""}
                placeholder="Phone, email, or other contact…"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea name="description" rows={2} defaultValue={existing?.description ?? ""} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : existing ? (
                "Save"
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActivitiesDialog({ program, onClose }: { program: Program; onClose: () => void }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [reportActivity, setReportActivity] = useState<ProgramActivity | null>(null);

  const { data: activities = [], error: activitiesError } = useQuery({
    queryKey: ["program-activities", program.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_activities" as never)
        .select("*")
        .eq("program_id", program.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ProgramActivity[];
    },
  });

  async function addActivity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      program_id: program.id,
      name: String(fd.get("name") ?? "").trim(),
      frequency: String(fd.get("frequency") ?? "") || null,
      cost_in: Number(fd.get("cost_in")) || 0,
      cost_out: Number(fd.get("cost_out")) || 0,
    };
    if (!payload.name) return toast.error("Name required");
    setLoading(true);
    const { error } = await supabase.from("program_activities" as never).insert(payload as never);
    setLoading(false);
    if (error) return toast.error((error as { message: string }).message);
    toast.success("Activity added");
    qc.invalidateQueries({ queryKey: ["program-activities", program.id] });
    form.reset();
  }

  async function delActivity(id: string) {
    const { error } = await supabase
      .from("program_activities" as never)
      .delete()
      .eq("id", id);
    if (error) return toast.error((error as { message: string }).message);
    toast.success("Activity removed");
    qc.invalidateQueries({ queryKey: ["program-activities", program.id] });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activities — {program.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={addActivity} className="space-y-2 border border-border rounded-lg p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase">Add activity</p>
          <div className="grid grid-cols-2 gap-2">
            <Input name="name" placeholder="Activity name *" required className="col-span-2" />
            <select
              name="frequency"
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">No frequency</option>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <div />
            <Input name="cost_in" type="number" min={0} placeholder="Cost In (USD)" />
            <Input name="cost_out" type="number" min={0} placeholder="Cost Out (USD)" />
          </div>
          <Button type="submit" size="sm" disabled={loading}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </form>

        <div className="space-y-2">
          {activitiesError ? (
            <p className="py-4 text-center text-sm text-destructive">
              {activitiesError instanceof Error
                ? activitiesError.message
                : "Activities could not be loaded."}
            </p>
          ) : activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No activities yet</p>
          ) : (
            activities.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.frequency ?? "No frequency"} · In: ${(a.cost_in ?? 0).toLocaleString()} ·
                    Out: ${(a.cost_out ?? 0).toLocaleString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => setReportActivity(a)}
                >
                  <FileText className="h-3 w-3" /> Report
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => delActivity(a.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))
          )}
        </div>

        {reportActivity && (
          <ReportDialog activity={reportActivity} onClose={() => setReportActivity(null)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ activity, onClose }: { activity: ProgramActivity; onClose: () => void }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const { data: reports = [], error: reportsError } = useQuery({
    queryKey: ["activity-reports", activity.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_reports" as never)
        .select("*")
        .eq("activity_id", activity.id)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        period: string;
        report_text: string | null;
        submitted_at: string;
      }[];
    },
  });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setLoading(true);
    try {
      const user = await getSessionUser();
      if (!user) throw new Error("Your session has expired. Please sign in again.");
      const { error } = await supabase.from("activity_reports" as never).insert({
        activity_id: activity.id,
        period: String(fd.get("period") ?? ""),
        report_text: String(fd.get("report_text") ?? "").trim() || null,
        submitted_by: user.id,
      } as never);
      if (error) throw error;
      toast.success("Report submitted");
      qc.invalidateQueries({ queryKey: ["activity-reports", activity.id] });
      form.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report submission failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reports — {activity.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 border border-border rounded-lg p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase">Submit report</p>
          <div className="space-y-1.5">
            <Label>Period</Label>
            <Input name="period" placeholder="e.g. July 2026, Week 28…" required />
          </div>
          <div className="space-y-1.5">
            <Label>Report</Label>
            <Textarea name="report_text" rows={4} placeholder="What happened this period?" />
          </div>
          <Button type="submit" size="sm" disabled={loading}>
            Submit
          </Button>
        </form>
        <div className="space-y-2">
          {reportsError && (
            <p className="py-3 text-center text-sm text-destructive">
              {reportsError instanceof Error
                ? reportsError.message
                : "Reports could not be loaded."}
            </p>
          )}
          {!reportsError &&
            reports.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/60 p-3 text-sm">
                <div className="font-medium">{r.period}</div>
                {r.report_text && (
                  <p className="mt-1 text-muted-foreground text-xs whitespace-pre-wrap">
                    {r.report_text}
                  </p>
                )}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {new Date(r.submitted_at).toLocaleDateString()}
                </div>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Initiatives Tab ──────────────────────────────────────────────────────────
function InitiativesTab({
  initiatives,
  isLoading,
  canManage,
  canDelete,
  people,
}: {
  initiatives: Initiative[];
  isLoading: boolean;
  canManage: boolean;
  canDelete: boolean;
  people: Person[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Initiative | null>(null);
  const [filterHouse, setFilterHouse] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("initiatives" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Initiative removed");
      qc.invalidateQueries({ queryKey: ["initiatives"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = initiatives.filter(
    (i) =>
      (filterHouse === "all" || i.house === filterHouse) &&
      (filterStatus === "all" || i.status === filterStatus),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterHouse} onValueChange={setFilterHouse}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue placeholder="All houses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All houses</SelectItem>
            {HOUSES.map((h) => (
              <SelectItem key={h.key} value={h.key}>
                {h.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INITIATIVE_STATUSES.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <div className="ml-auto">
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New Initiative
            </Button>
            {addOpen && (
              <InitiativeFormDialog
                people={people}
                onDone={() => {
                  setAddOpen(false);
                  qc.invalidateQueries({ queryKey: ["initiatives"] });
                }}
                onClose={() => setAddOpen(false)}
              />
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface p-12 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No initiatives.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ini) => {
            const s = statusColor(INITIATIVE_STATUSES, ini.status);
            const house = HOUSES.find((h) => h.key === ini.house);
            const responsible = people.find((x) => x.id === ini.responsible_user_id);
            return (
              <div
                key={ini.id}
                className={cn(
                  "surface p-4 space-y-3 border-l-4",
                  ini.status === "running" ? "border-l-brand-success" : "border-l-transparent",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold leading-tight">{ini.name}</div>
                    {house && <div className="text-xs text-muted-foreground">{house.label}</div>}
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase shrink-0",
                      s.color,
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {ini.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{ini.description}</p>
                )}
                {(responsible || ini.contact_info) && (
                  <div className="space-y-0.5 text-xs border-t border-border/60 pt-2">
                    {responsible && (
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium">
                          {responsible.full_name || responsible.email}
                        </span>
                      </div>
                    )}
                    {ini.contact_info && (
                      <div className="text-muted-foreground pl-4">{ini.contact_info}</div>
                    )}
                  </div>
                )}
                {ini.start_date && (
                  <div className="text-xs text-muted-foreground">
                    {ini.start_date} {ini.end_date ? `→ ${ini.end_date}` : ""}
                  </div>
                )}
                {ini.document_url && (
                  <a
                    href={ini.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" /> Concept Note
                  </a>
                )}
                {canManage && (
                  <div className="flex gap-1 pt-1 border-t border-border/60">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 ml-auto"
                      onClick={() => setEditItem(ini)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => del.mutate(ini.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editItem && (
        <InitiativeFormDialog
          people={people}
          existing={editItem}
          onDone={() => {
            setEditItem(null);
            qc.invalidateQueries({ queryKey: ["initiatives"] });
          }}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  );
}

function InitiativeFormDialog({
  existing,
  onDone,
  onClose,
  people,
}: {
  existing?: Initiative;
  onDone: () => void;
  onClose: () => void;
  people: Person[];
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(existing?.status ?? "submitted");
  const [house, setHouse] = useState(existing?.house ?? "maja");
  const [responsibleId, setResponsibleId] = useState(existing?.responsible_user_id ?? "");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      house,
      status,
      document_url: String(fd.get("document_url") ?? "").trim() || null,
      start_date: String(fd.get("start_date") ?? "") || null,
      end_date: String(fd.get("end_date") ?? "") || null,
      description: String(fd.get("description") ?? "").trim() || null,
      responsible_user_id: responsibleId || null,
      contact_info: String(fd.get("contact_info") ?? "").trim() || null,
    };
    if (!payload.name) return toast.error("Name required");
    setLoading(true);
    let error;
    if (existing) {
      ({ error } = await supabase
        .from("initiatives" as never)
        .update(payload as never)
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("initiatives" as never).insert(payload as never));
    }
    setLoading(false);
    if (error) return toast.error((error as { message: string }).message);
    toast.success(existing ? "Initiative updated" : "Initiative submitted");
    onDone();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Initiative" : "Submit Initiative"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <Input name="name" defaultValue={existing?.name} required />
            </div>
            <div className="space-y-1.5">
              <Label>House</Label>
              <Select value={house} onValueChange={setHouse}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUSES.map((h) => (
                    <SelectItem key={h.key} value={h.key}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INITIATIVE_STATUSES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Responsible person</Label>
              <Select value={responsibleId} onValueChange={setResponsibleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select person…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Contact info</Label>
              <Input
                name="contact_info"
                defaultValue={existing?.contact_info ?? ""}
                placeholder="Phone, email, or other contact…"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Concept note (URL or link)</Label>
              <Input
                name="document_url"
                type="url"
                defaultValue={existing?.document_url ?? ""}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input name="start_date" type="date" defaultValue={existing?.start_date ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <Input name="end_date" type="date" defaultValue={existing?.end_date ?? ""} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea name="description" rows={3} defaultValue={existing?.description ?? ""} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : existing ? (
                "Save"
              ) : (
                "Submit"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
