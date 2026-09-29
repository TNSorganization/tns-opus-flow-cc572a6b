import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime";
import { useCurrentRoles, isOps } from "@/hooks/use-current-role";
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
import { Plus, Loader2, CheckCircle2, Send, ShieldCheck } from "lucide-react";
import { endOfDay, format, isPast, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { isMissingRpcError } from "@/lib/supabase-errors";
import { fetchActiveProfiles } from "@/lib/profiles";
import { getSessionUser } from "@/lib/auth-session";

type TaskStatus = Database["public"]["Enums"]["task_status"];
type TaskPriority = Database["public"]["Enums"]["task_priority"];

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: "not_started", label: "Not Started" },
  { key: "in_progress", label: "In Progress" },
  { key: "waiting", label: "Waiting" },
  { key: "overdue", label: "Overdue" },
  { key: "submitted", label: "Awaiting Validation" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];
const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];
const PRIORITY_TONE: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-chart-2/20 text-chart-2",
  high: "bg-status-break/20 text-status-break",
  urgent: "bg-destructive/20 text-destructive",
};

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: me } = useCurrentRoles();
  const canCreate = isOps(me?.roles ?? []);
  const canValidate = canCreate;
  useRealtimeInvalidate(
    "tasks-live",
    ["tasks", "task_checklist_items"],
    [["tasks"], ["badge-tasks-overdue"]],
  );

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, description, priority, status, deadline, assigned_to, assigned_by, progress",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people"],
    queryFn: fetchActiveProfiles,
  });

  const nameOf = (id: string | null) => {
    const p = people.find((x) => x.id === id);
    return p?.full_name || p?.email || "—";
  };

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      previousStatus,
    }: {
      id: string;
      status: TaskStatus;
      previousStatus: TaskStatus;
    }) => {
      const { error: rpcError } = await supabase.rpc("set_task_status", {
        _status: status,
        _task_id: id,
      });
      if (!rpcError) return;
      if (!isMissingRpcError(rpcError)) throw rpcError;

      // Keep the current backend usable until the hardening migration is applied.
      const patch =
        status === "completed"
          ? { status, completed_at: new Date().toISOString(), progress: 100 }
          : {
              status,
              completed_at: null,
              ...(status === "not_started" || previousStatus === "completed"
                ? { progress: 0 }
                : {}),
            };
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(v.status === "completed" ? "Task validated" : "Task updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {canCreate
              ? "Assign work and validate submissions"
              : "Progress and submit your work for validation"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Tasks</h1>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1.5 h-4 w-4" /> New task
              </Button>
            </DialogTrigger>
            <NewTaskDialog people={people} onDone={() => setOpen(false)} />
          </Dialog>
        )}
      </header>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((col) => {
            const items = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="surface p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="text-sm font-medium">{col.label}</span>
                  <span className="kpi-number text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">
                      Nothing here
                    </div>
                  ) : (
                    items.map((t) => {
                      const overdue =
                        t.deadline &&
                        isPast(new Date(t.deadline)) &&
                        t.status !== "completed" &&
                        t.status !== "cancelled";
                      const mine = t.assigned_to === me?.userId;
                      return (
                        <div
                          key={t.id}
                          className="group rounded-md border border-border/60 bg-background/40 p-3 transition-colors hover:border-primary/50"
                        >
                          <div className="mb-1.5 flex items-start justify-between gap-2">
                            <span className="text-sm font-medium leading-tight">{t.title}</span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase",
                                PRIORITY_TONE[t.priority as TaskPriority],
                              )}
                            >
                              {t.priority}
                            </span>
                          </div>
                          {t.description && (
                            <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
                              {t.description}
                            </p>
                          )}
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="truncate">{nameOf(t.assigned_to)}</span>
                            {t.deadline && (
                              <span
                                className={cn(
                                  "kpi-number",
                                  overdue ? "text-destructive" : "text-muted-foreground",
                                )}
                              >
                                {format(new Date(t.deadline), "d MMM")}
                              </span>
                            )}
                          </div>

                          {/* Action row: role & state-aware */}
                          <TaskActions
                            task={t}
                            mine={mine}
                            canValidate={canValidate}
                            disabled={updateStatus.isPending}
                            onMove={(s) =>
                              updateStatus.mutate({
                                id: t.id,
                                status: s,
                                previousStatus: t.status,
                              })
                            }
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskActions({
  task,
  mine,
  canValidate,
  disabled,
  onMove,
}: {
  task: { status: TaskStatus };
  mine: boolean;
  canValidate: boolean;
  disabled: boolean;
  onMove: (s: TaskStatus) => void;
}) {
  const s = task.status;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {mine && s === "not_started" && (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={() => onMove("in_progress")}
        >
          Start
        </Button>
      )}
      {mine && s === "in_progress" && (
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={() => onMove("submitted")}
        >
          <Send className="mr-1 h-3 w-3" /> Submit
        </Button>
      )}
      {mine && (s === "waiting" || s === "overdue") && (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={() => onMove("in_progress")}
        >
          Resume
        </Button>
      )}
      {canValidate && s === "submitted" && (
        <Button
          size="sm"
          className="h-7 bg-brand-success text-xs hover:bg-brand-success/90"
          disabled={disabled}
          onClick={() => onMove("completed")}
        >
          <ShieldCheck className="mr-1 h-3 w-3" /> Validate
        </Button>
      )}
      {canValidate && s === "submitted" && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={() => onMove("in_progress")}
        >
          Reject
        </Button>
      )}
      {canValidate && s !== "completed" && s !== "submitted" && s !== "cancelled" && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-brand-success"
          disabled={disabled}
          onClick={() => onMove("completed")}
        >
          <CheckCircle2 className="mr-1 h-3 w-3" /> Mark done
        </Button>
      )}
      {canValidate && (s === "completed" || s === "cancelled") && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={() => onMove("in_progress")}
        >
          Reopen
        </Button>
      )}
    </div>
  );
}

function NewTaskDialog({
  people,
  onDone,
}: {
  people: { id: string; full_name: string | null; email: string | null }[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const user = await getSessionUser();
    if (!user) {
      setLoading(false);
      return toast.error("Not signed in");
    }
    const deadline = String(fd.get("deadline") || "");
    const { error } = await supabase.from("tasks").insert({
      title: String(fd.get("title")),
      description: String(fd.get("description") || "") || null,
      priority: (fd.get("priority") as TaskPriority) || "medium",
      deadline: deadline ? endOfDay(parseISO(deadline)).toISOString() : null,
      assigned_to: (fd.get("assigned_to") as string) || null,
      assigned_by: user.id,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Task created");
    qc.invalidateQueries({ queryKey: ["tasks"] });
    onDone();
  }
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>New task</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input name="title" required maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea name="description" rows={3} maxLength={2000} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select name="priority" defaultValue="medium">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Deadline</Label>
            <Input name="deadline" type="date" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Assign to</Label>
          <Select name="assigned_to">
            <SelectTrigger>
              <SelectValue placeholder="Choose person" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
