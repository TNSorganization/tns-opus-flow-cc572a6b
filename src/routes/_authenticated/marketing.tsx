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
  Edit2,
  Monitor,
  Users,
  ExternalLink,
  BarChart2,
  Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDual } from "@/lib/currency";
import { useCurrentRoles, isManager } from "@/hooks/use-current-role";
import { ModuleErrorState } from "@/components/module-error-state";

export const Route = createFileRoute("/_authenticated/marketing")({
  component: MarketingPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type MediaPlatform = {
  id: string;
  name: string;
  page_url: string | null;
  status: string;
  followers: number | null;
  total_interactions: number | null;
  total_views: number | null;
  total_likes: number | null;
  total_comments: number | null;
  total_reshares: number | null;
  total_saves: number | null;
  new_followers: number | null;
  created_at: string;
};
type MediaService = {
  id: string;
  name: string;
  service_type: string;
  cost: number | null;
  contact_or_link: string | null;
  efficiency_scores: Record<string, boolean> | null;
  what_they_do: string | null;
  what_they_do_best: string | null;
  worked_before: boolean | null;
  recommendation: string | null;
  created_at: string;
};

const EFFICIENCY_METRICS = [
  "Quick accessibility",
  "High integration",
  "Low learn time",
  "Quick delivery",
  "Quality delivery",
  "Adaptability",
  "Master of storytelling",
] as const;

const RECOMMENDATIONS = [
  { key: "contract", label: "Contract", color: "bg-brand-success/15 text-brand-success" },
  { key: "try_again", label: "Try Again", color: "bg-brand-info/15 text-brand-info" },
  {
    key: "not_recommended",
    label: "Not Recommended",
    color: "bg-brand-yellow/15 text-brand-yellow",
  },
  { key: "never", label: "Never", color: "bg-destructive/15 text-destructive" },
] as const;

function recColor(key: string | null) {
  return (
    RECOMMENDATIONS.find((r) => r.key === key) ?? {
      label: key ?? "—",
      color: "bg-muted text-muted-foreground",
    }
  );
}

const TABS = [
  { key: "platforms", label: "Platforms", icon: Monitor },
  { key: "services", label: "Services", icon: Users },
] as const;

// ─── Page ────────────────────────────────────────────────────────────────────
function MarketingPage() {
  const [tab, setTab] = useState<"platforms" | "services">("platforms");
  const { data: me } = useCurrentRoles();
  const canManage = isManager(me?.roles ?? []) || (me?.roles ?? []).includes("programs_officer");

  const {
    data: platforms = [],
    isLoading: plLoad,
    error: plErr,
    refetch: refetchPlatforms,
  } = useQuery({
    queryKey: ["media-platforms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_platforms" as never)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as MediaPlatform[];
    },
  });

  const {
    data: services = [],
    isLoading: svcLoad,
    error: svcErr,
    refetch: refetchServices,
  } = useQuery({
    queryKey: ["media-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_services" as never)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as MediaService[];
    },
  });

  if (plErr || svcErr)
    return (
      <ModuleErrorState
        name="Marketing"
        error={plErr ?? svcErr}
        onRetry={() => void Promise.all([refetchPlatforms(), refetchServices()])}
      />
    );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Platforms, services and audience reach</p>
        <h1 className="text-3xl font-semibold tracking-tight">Marketing & Media</h1>
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

      {tab === "platforms" && (
        <PlatformsTab platforms={platforms} isLoading={plLoad} canManage={canManage} />
      )}
      {tab === "services" && (
        <ServicesTab services={services} isLoading={svcLoad} canManage={canManage} />
      )}
    </div>
  );
}

// ─── Platforms Tab ─────────────────────────────────────────────────────────────
function PlatformsTab({
  platforms,
  isLoading,
  canManage,
}: {
  platforms: MediaPlatform[];
  isLoading: boolean;
  canManage: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<MediaPlatform | null>(null);
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("media_platforms" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Platform removed");
      qc.invalidateQueries({ queryKey: ["media-platforms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalFollowers = platforms.reduce((a, p) => a + (p.followers ?? 0), 0);
  const totalInteractions = platforms.reduce((a, p) => a + (p.total_interactions ?? 0), 0);

  function conversionRate(p: MediaPlatform): string {
    const views = p.total_views ?? 0;
    if (!views) return "—";
    const engagements =
      (p.total_likes ?? 0) +
      (p.total_comments ?? 0) +
      (p.total_reshares ?? 0) +
      (p.total_saves ?? 0) +
      (p.new_followers ?? 0);
    return `${((engagements / views) * 100).toFixed(1)}%`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="grid grid-cols-2 gap-4 flex-1">
          <div className="surface p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase">Total Followers</div>
            <div className="text-2xl font-bold">{totalFollowers.toLocaleString()}</div>
          </div>
          <div className="surface p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase">Total Interactions</div>
            <div className="text-2xl font-bold">{totalInteractions.toLocaleString()}</div>
          </div>
        </div>
        {canManage && (
          <>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Platform
            </Button>
            {addOpen && (
              <PlatformFormDialog
                onDone={() => {
                  setAddOpen(false);
                  qc.invalidateQueries({ queryKey: ["media-platforms"] });
                }}
                onClose={() => setAddOpen(false)}
              />
            )}
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : platforms.length === 0 ? (
        <div className="surface p-12 text-center">
          <Monitor className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No platforms yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((p) => (
            <div key={p.id} className="surface p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  {p.page_url && (
                    <a
                      href={p.page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-0.5 mt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View page <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase shrink-0",
                    p.status === "active"
                      ? "bg-brand-success/15 text-brand-success"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {p.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-muted-foreground">Followers:</span>{" "}
                  <span className="font-medium">{(p.followers ?? 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Interactions:</span>{" "}
                  <span className="font-medium">
                    {(p.total_interactions ?? 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Views:</span>{" "}
                  <span className="font-medium">{(p.total_views ?? 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Conversion:</span>{" "}
                  <span className="font-medium text-primary">{conversionRate(p)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Likes:</span>{" "}
                  <span className="font-medium">{(p.total_likes ?? 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Comments:</span>{" "}
                  <span className="font-medium">{(p.total_comments ?? 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Reshares:</span>{" "}
                  <span className="font-medium">{(p.total_reshares ?? 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Saves:</span>{" "}
                  <span className="font-medium">{(p.total_saves ?? 0).toLocaleString()}</span>
                </div>
              </div>

              {canManage && (
                <div className="flex gap-1 pt-1 border-t border-border/60">
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
          ))}
        </div>
      )}

      {editItem && (
        <PlatformFormDialog
          existing={editItem}
          onDone={() => {
            setEditItem(null);
            qc.invalidateQueries({ queryKey: ["media-platforms"] });
          }}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  );
}

function PlatformFormDialog({
  existing,
  onDone,
  onClose,
}: {
  existing?: MediaPlatform;
  onDone: () => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(existing?.status ?? "active");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      page_url: String(fd.get("page_url") ?? "").trim() || null,
      status,
      followers: Number(fd.get("followers")) || 0,
      total_interactions: Number(fd.get("total_interactions")) || 0,
      total_views: Number(fd.get("total_views")) || 0,
      total_likes: Number(fd.get("total_likes")) || 0,
      total_comments: Number(fd.get("total_comments")) || 0,
      total_reshares: Number(fd.get("total_reshares")) || 0,
      total_saves: Number(fd.get("total_saves")) || 0,
      new_followers: Number(fd.get("new_followers")) || 0,
    };
    if (!payload.name) return toast.error("Name required");
    setLoading(true);
    let error;
    if (existing) {
      ({ error } = await supabase
        .from("media_platforms" as never)
        .update(payload as never)
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("media_platforms" as never).insert(payload as never));
    }
    setLoading(false);
    if (error) return toast.error((error as { message: string }).message);
    toast.success(existing ? "Platform updated" : "Platform added");
    onDone();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Platform" : "Add Platform"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Platform name *</Label>
              <Input
                name="name"
                defaultValue={existing?.name}
                required
                placeholder="Instagram, LinkedIn…"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Page URL</Label>
              <Input
                name="page_url"
                type="url"
                defaultValue={existing?.page_url ?? ""}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Followers</Label>
              <Input
                name="followers"
                type="number"
                min={0}
                defaultValue={existing?.followers ?? 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Total interactions</Label>
              <Input
                name="total_interactions"
                type="number"
                min={0}
                defaultValue={existing?.total_interactions ?? 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Total views</Label>
              <Input
                name="total_views"
                type="number"
                min={0}
                defaultValue={existing?.total_views ?? 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Likes</Label>
              <Input
                name="total_likes"
                type="number"
                min={0}
                defaultValue={existing?.total_likes ?? 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Comments</Label>
              <Input
                name="total_comments"
                type="number"
                min={0}
                defaultValue={existing?.total_comments ?? 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reshares</Label>
              <Input
                name="total_reshares"
                type="number"
                min={0}
                defaultValue={existing?.total_reshares ?? 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Saves</Label>
              <Input
                name="total_saves"
                type="number"
                min={0}
                defaultValue={existing?.total_saves ?? 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>New followers</Label>
              <Input
                name="new_followers"
                type="number"
                min={0}
                defaultValue={existing?.new_followers ?? 0}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Services Tab ──────────────────────────────────────────────────────────────
function ServicesTab({
  services,
  isLoading,
  canManage,
}: {
  services: MediaService[];
  isLoading: boolean;
  canManage: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<MediaService | null>(null);
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("media_services" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service removed");
      qc.invalidateQueries({ queryKey: ["media-services"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Freelancers, studios, and applications we work with
        </p>
        {canManage && (
          <>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Service
            </Button>
            {addOpen && (
              <ServiceFormDialog
                onDone={() => {
                  setAddOpen(false);
                  qc.invalidateQueries({ queryKey: ["media-services"] });
                }}
                onClose={() => setAddOpen(false)}
              />
            )}
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <div className="surface p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No services yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {services.map((svc) => {
            const rec = recColor(svc.recommendation);
            const scores = svc.efficiency_scores ?? {};
            const checkedCount = EFFICIENCY_METRICS.filter((m) => scores[m]).length;
            return (
              <div key={svc.id} className="surface p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{svc.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {svc.service_type} {svc.cost ? `· ${formatDual(svc.cost)}` : ""}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase shrink-0",
                      rec.color,
                    )}
                  >
                    {rec.label}
                  </span>
                </div>

                {svc.what_they_do && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{svc.what_they_do}</p>
                )}
                {svc.what_they_do_best && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">Best at:</span> {svc.what_they_do_best}
                  </p>
                )}

                <div className="flex flex-wrap gap-1">
                  {EFFICIENCY_METRICS.filter((m) => scores[m]).map((m) => (
                    <span
                      key={m}
                      className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                    >
                      {m}
                    </span>
                  ))}
                  {checkedCount === 0 && (
                    <span className="text-[11px] text-muted-foreground">No efficiency data</span>
                  )}
                </div>

                {svc.contact_or_link && (
                  <a
                    href={
                      svc.contact_or_link.startsWith("http")
                        ? svc.contact_or_link
                        : `tel:${svc.contact_or_link}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" /> {svc.contact_or_link}
                  </a>
                )}

                {svc.worked_before && (
                  <span className="text-xs text-brand-success">✓ Worked with before</span>
                )}

                {canManage && (
                  <div className="flex gap-1 pt-1 border-t border-border/60">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 ml-auto"
                      onClick={() => setEditItem(svc)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => del.mutate(svc.id)}
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
        <ServiceFormDialog
          existing={editItem}
          onDone={() => {
            setEditItem(null);
            qc.invalidateQueries({ queryKey: ["media-services"] });
          }}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  );
}

function ServiceFormDialog({
  existing,
  onDone,
  onClose,
}: {
  existing?: MediaService;
  onDone: () => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState(existing?.service_type ?? "individual");
  const [recommendation, setRecommendation] = useState(existing?.recommendation ?? "");
  const [scores, setScores] = useState<Record<string, boolean>>(existing?.efficiency_scores ?? {});

  function toggleScore(metric: string) {
    setScores((prev) => ({ ...prev, [metric]: !prev[metric] }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      service_type: type,
      cost: Number(fd.get("cost")) || null,
      contact_or_link: String(fd.get("contact_or_link") ?? "").trim() || null,
      efficiency_scores: scores,
      what_they_do: String(fd.get("what_they_do") ?? "").trim() || null,
      what_they_do_best: String(fd.get("what_they_do_best") ?? "").trim() || null,
      worked_before: fd.get("worked_before") === "on",
      recommendation: recommendation || null,
    };
    if (!payload.name) return toast.error("Name required");
    setLoading(true);
    let error;
    if (existing) {
      ({ error } = await supabase
        .from("media_services" as never)
        .update(payload as never)
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("media_services" as never).insert(payload as never));
    }
    setLoading(false);
    if (error) return toast.error((error as { message: string }).message);
    toast.success(existing ? "Service updated" : "Service added");
    onDone();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Service" : "Add Service"}</DialogTitle>
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
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="application">Application</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cost (USD)</Label>
              <Input
                name="cost"
                type="number"
                min={0}
                step="0.01"
                defaultValue={existing?.cost ?? ""}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Contact / Link</Label>
              <Input
                name="contact_or_link"
                defaultValue={existing?.contact_or_link ?? ""}
                placeholder="+212 6XX… or https://…"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>What they do</Label>
              <Textarea name="what_they_do" rows={2} defaultValue={existing?.what_they_do ?? ""} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>What they do best</Label>
              <Input name="what_they_do_best" defaultValue={existing?.what_they_do_best ?? ""} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Efficiency (check what applies)</Label>
              <div className="flex flex-wrap gap-2">
                {EFFICIENCY_METRICS.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!scores[m]}
                      onChange={() => toggleScore(m)}
                      className="rounded"
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Recommendation</Label>
              <Select value={recommendation} onValueChange={setRecommendation}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {RECOMMENDATIONS.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                name="worked_before"
                id="wb"
                defaultChecked={!!existing?.worked_before}
                className="rounded"
              />
              <Label htmlFor="wb">Worked with before</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
