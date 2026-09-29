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
import { Plus, Loader2, Trash2, Package, Truck, ShoppingCart, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { formatDual } from "@/lib/currency";
import { useCurrentRoles, isManager } from "@/hooks/use-current-role";
import { fetchActiveProfiles } from "@/lib/profiles";
import { ModuleErrorState } from "@/components/module-error-state";

export const Route = createFileRoute("/_authenticated/logistics")({
  component: LogisticsPage,
});

type LogisticsItem = {
  id: string;
  name: string;
  item_category: string; // 'owned' | 'needed' | 'rented'
  state: string | null;
  quantity: number | null;
  model: string | null;
  location: string | null;
  image_url: string | null;
  wear_tear_days: number | null;
  wear_tear_reset_at: string | null;
  contact_info: string | null;
  displacement_days: number | null;
  rent_amount: number | null;
  rent_start_at: string | null;
  rent_end_at: string | null;
  responsible_user_id: string | null;
  notes: string | null;
  created_at: string;
};

const ITEM_STATES = ["good", "fair", "poor", "broken"] as const;
const STATE_COLORS: Record<string, string> = {
  good: "bg-brand-success/15 text-brand-success",
  fair: "bg-brand-yellow/15 text-brand-yellow",
  poor: "bg-brand-orange/15 text-brand-orange",
  broken: "bg-destructive/15 text-destructive",
};

const TABS = [
  { key: "owned", label: "What We Own", icon: Package },
  { key: "needed", label: "What We Need", icon: ShoppingCart },
  { key: "rented", label: "On Rent", icon: Truck },
] as const;

function LogisticsPage() {
  const [tab, setTab] = useState<"owned" | "needed" | "rented">("owned");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<LogisticsItem | null>(null);
  const qc = useQueryClient();
  const { data: me } = useCurrentRoles();
  const canManage = isManager(me?.roles ?? []);

  const {
    data: items = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["logistics", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logistics_items" as never)
        .select("*")
        .eq("item_category", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LogisticsItem[];
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people"],
    queryFn: fetchActiveProfiles,
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("logistics_items" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item removed");
      qc.invalidateQueries({ queryKey: ["logistics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetWearTear = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("logistics_items" as never)
        .update({
          wear_tear_reset_at: new Date().toISOString(),
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Wear & tear counter reset");
      qc.invalidateQueries({ queryKey: ["logistics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentTab = TABS.find((t) => t.key === tab)!;
  const TabIcon = currentTab.icon;

  if (error)
    return <ModuleErrorState name="Logistics" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Inventory, needs, and rentals</p>
          <h1 className="text-3xl font-semibold tracking-tight">Logistics</h1>
        </div>
        {canManage && (
          <>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Item
            </Button>
            {addOpen && (
              <ItemFormDialog
                category={tab}
                people={people}
                onDone={() => {
                  setAddOpen(false);
                  qc.invalidateQueries({ queryKey: ["logistics"] });
                }}
                onClose={() => setAddOpen(false)}
              />
            )}
          </>
        )}
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

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="surface p-12 text-center">
          <TabIcon className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No items yet. {canManage ? "Add the first one." : "Check back later."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const responsible = people.find((p) => p.id === item.responsible_user_id);
            const daysRented = item.rent_start_at
              ? differenceInDays(new Date(), new Date(item.rent_start_at))
              : null;
            const daysLeft = item.rent_end_at
              ? differenceInDays(new Date(item.rent_end_at), new Date())
              : null;
            const wearDays = item.wear_tear_reset_at
              ? differenceInDays(new Date(), new Date(item.wear_tear_reset_at))
              : null;
            return (
              <div key={item.id} className="surface p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{item.name}</div>
                    {item.model && (
                      <div className="text-xs text-muted-foreground">{item.model}</div>
                    )}
                  </div>
                  {item.state && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase shrink-0",
                        STATE_COLORS[item.state] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.state}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {item.quantity !== null && (
                    <div>
                      <span className="text-muted-foreground">Qty:</span>{" "}
                      <span className="font-medium">{item.quantity}</span>
                    </div>
                  )}
                  {item.location && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Location:</span>{" "}
                      <span className="font-medium">{item.location}</span>
                    </div>
                  )}
                  {tab === "owned" && wearDays !== null && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Wear & tear:</span>{" "}
                      <span
                        className={cn(
                          "font-medium",
                          wearDays > 365
                            ? "text-destructive"
                            : wearDays > 180
                              ? "text-brand-orange"
                              : "text-brand-success",
                        )}
                      >
                        {wearDays} days since reset
                      </span>
                    </div>
                  )}
                  {responsible && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Responsible:</span>{" "}
                      <span className="font-medium">
                        {responsible.full_name || responsible.email}
                      </span>
                    </div>
                  )}
                  {tab === "needed" && item.contact_info && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Contact:</span>{" "}
                      <span className="font-medium">{item.contact_info}</span>
                    </div>
                  )}
                  {tab === "needed" && item.displacement_days !== null && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Lead time:</span>{" "}
                      <span className="font-medium">{item.displacement_days} days</span>
                    </div>
                  )}
                  {tab === "rented" && item.rent_amount !== null && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Rent:</span>{" "}
                      <span className="font-medium">{formatDual(item.rent_amount)}</span>
                    </div>
                  )}
                  {tab === "rented" && daysRented !== null && (
                    <div>
                      <span className="text-muted-foreground">Out:</span>{" "}
                      <span className="font-medium">{daysRented}d</span>
                    </div>
                  )}
                  {tab === "rented" && daysLeft !== null && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Returns in:</span>{" "}
                      <span
                        className={cn(
                          "font-medium",
                          daysLeft < 7
                            ? "text-destructive"
                            : daysLeft < 30
                              ? "text-brand-orange"
                              : "text-brand-success",
                        )}
                      >
                        {daysLeft > 0 ? `${daysLeft} days` : "Overdue"}
                      </span>
                    </div>
                  )}
                </div>

                {item.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.notes}</p>
                )}

                {canManage && (
                  <div className="flex gap-1 pt-1 border-t border-border/60">
                    {tab === "owned" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => resetWearTear.mutate(item.id)}
                      >
                        Reset W&T
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 ml-auto"
                      onClick={() => setEditItem(item)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => del.mutate(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      {editItem && (
        <ItemFormDialog
          category={tab}
          people={people}
          existing={editItem}
          onDone={() => {
            setEditItem(null);
            qc.invalidateQueries({ queryKey: ["logistics"] });
          }}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  );
}

function ItemFormDialog({
  category,
  people,
  existing,
  onDone,
  onClose,
}: {
  category: string;
  people: { id: string; full_name: string | null; email: string | null }[];
  existing?: LogisticsItem;
  onDone: () => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState(existing?.state ?? "good");
  const [responsibleId, setResponsibleId] = useState(existing?.responsible_user_id ?? "");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      item_category: category,
      state: state || null,
      quantity: Number(fd.get("quantity")) || null,
      model: String(fd.get("model") ?? "").trim() || null,
      location: String(fd.get("location") ?? "").trim() || null,
      contact_info: String(fd.get("contact_info") ?? "").trim() || null,
      displacement_days: Number(fd.get("displacement_days")) || null,
      rent_amount: Number(fd.get("rent_amount")) || null,
      rent_start_at: String(fd.get("rent_start_at") ?? "") || null,
      rent_end_at: String(fd.get("rent_end_at") ?? "") || null,
      responsible_user_id: responsibleId || null,
      notes: String(fd.get("notes") ?? "").trim() || null,
      wear_tear_reset_at: existing?.wear_tear_reset_at ?? new Date().toISOString(),
    };
    if (!payload.name) return toast.error("Name is required");
    setLoading(true);
    let error;
    if (existing) {
      ({ error } = await supabase
        .from("logistics_items" as never)
        .update(payload as never)
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("logistics_items" as never).insert(payload as never));
    }
    setLoading(false);
    if (error) return toast.error((error as { message: string }).message);
    toast.success(existing ? "Item updated" : "Item added");
    onDone();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Item" : "Add Item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Name *</Label>
              <Input name="name" defaultValue={existing?.name} required />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input name="quantity" type="number" min={0} defaultValue={existing?.quantity ?? 1} />
            </div>
            <div className="space-y-1.5">
              <Label>Model / SKU</Label>
              <Input name="model" defaultValue={existing?.model ?? ""} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Location</Label>
              <Input
                name="location"
                defaultValue={existing?.location ?? ""}
                placeholder="Office, storage room…"
              />
            </div>

            {(category === "owned" || category === "rented") && (
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {category === "needed" && (
              <>
                <div className="space-y-1.5 col-span-2">
                  <Label>Supplier / Contact</Label>
                  <Input name="contact_info" defaultValue={existing?.contact_info ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>Lead time (days)</Label>
                  <Input
                    name="displacement_days"
                    type="number"
                    min={0}
                    defaultValue={existing?.displacement_days ?? ""}
                  />
                </div>
              </>
            )}

            {category === "rented" && (
              <>
                <div className="space-y-1.5">
                  <Label>Rent amount (USD)</Label>
                  <Input
                    name="rent_amount"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={existing?.rent_amount ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Rent start</Label>
                  <Input
                    name="rent_start_at"
                    type="date"
                    defaultValue={existing?.rent_start_at?.slice(0, 10) ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Expected return</Label>
                  <Input
                    name="rent_end_at"
                    type="date"
                    defaultValue={existing?.rent_end_at?.slice(0, 10) ?? ""}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Person responsible for return</Label>
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
              </>
            )}

            <div className="space-y-1.5 col-span-2">
              <Label>Notes</Label>
              <Textarea name="notes" rows={2} defaultValue={existing?.notes ?? ""} />
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
                "Save changes"
              ) : (
                "Add item"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
