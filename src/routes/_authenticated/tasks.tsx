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
import { Plus, Loader2 } from "lucide-react";
import { format, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];
type TaskPriority = Database["public"]["Enums"]["task_priority"];

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: "not_started", label: "Not Started" },
  { key: "in_progress", label: "In Progress" },
  { key: "waiting", label: "Waiting" },
  { key: "completed", label: "Completed" },
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

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, description, priority, status, deadline, assigned_to, assigned_by, progress")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data ?? [];
    },
  });

  const nameOf = (id: string | null) => {
    const p = people.find((x) => x.id === id);
    return p?.full_name || p?.email || "—";
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "completed") {
        patch.completed_at = new Date().toISOString();
        patch.progress = 100;
      }
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Track execution across the team</p>
          <h1 className="text-3xl font-semibold tracking-tight">Tasks</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1.5 h-4 w-4" /> New task
            </Button>
          </DialogTrigger>
          <NewTaskDialog people={people} onDone={() => setOpen(false)} />
        </Dialog>
      </header>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {STATUSES.map((col) => {
            const items = tasks.filter((t) => {
              if (col.key === "not_started" && t.status === "not_started") return true;
              if (col.key === "in_progress" && t.status === "in_progress") return true;
              if (col.key === "waiting" && t.status === "waiting") return true;
              if (col.key === "completed" && t.status === "completed") return true;
              return false;
            });
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
                      const overdue = t.deadline && isPast(new Date(t.deadline)) && t.status !== "completed";
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
                          <Select
                            value={t.status}
                            onValueChange={(v) =>
                              updateStatus.mutate({ id: t.id, status: v as TaskStatus })
                            }
                          >
                            <SelectTrigger className="mt-2 h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s.key} value={s.key}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("tasks").insert({
      title: String(fd.get("title")),
      description: String(fd.get("description") || "") || null,
      priority: (fd.get("priority") as TaskPriority) || "medium",
      deadline: fd.get("deadline") ? new Date(String(fd.get("deadline"))).toISOString() : null,
      assigned_to: (fd.get("assigned_to") as string) || null,
      assigned_by: u.user?.id,
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
