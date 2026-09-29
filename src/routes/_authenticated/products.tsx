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
import { Plus, Loader2, Trash2, Package, Edit2, TrendingUp, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { formatDual, formatDualCompact } from "@/lib/currency";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useCurrentRoles, isManager } from "@/hooks/use-current-role";
import { ModuleErrorState } from "@/components/module-error-state";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

type Product = {
  id: string;
  name: string;
  category_id: string | null;
  status: string;
  description: string | null;
  build_cost: number | null;
  build_start_at: string | null;
  build_end_at: string | null;
  unit_price: number | null;
  registered_count: number | null;
  orders_placed: number | null;
  orders_delivered: number | null;
  created_at: string;
};

type ProductCategory = { id: string; name: string };

const STATUSES = [
  { key: "development", label: "Under Development", color: "bg-brand-info/15 text-brand-info" },
  { key: "review", label: "Being Reviewed", color: "bg-brand-yellow/15 text-brand-yellow" },
  { key: "deployed", label: "Deployed", color: "bg-brand-success/15 text-brand-success" },
  { key: "dormant", label: "Dormant", color: "bg-muted text-muted-foreground" },
  { key: "decommissioned", label: "Decommissioned", color: "bg-destructive/15 text-destructive" },
] as const;

function statusInfo(key: string) {
  return (
    STATUSES.find((s) => s.key === key) ?? { label: key, color: "bg-muted text-muted-foreground" }
  );
}

function ProductsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCat, setFilterCat] = useState<string>("all");
  const qc = useQueryClient();
  const { data: me } = useCurrentRoles();
  const canManage = isManager(me?.roles ?? []);

  const {
    data: categories = [],
    error: catErr,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories" as never)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductCategory[];
    },
  });

  const {
    data: products = [],
    isLoading,
    error,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ["products", filterStatus, filterCat],
    queryFn: async () => {
      let q = supabase
        .from("products" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (filterStatus !== "all") q = q.eq("status", filterStatus) as typeof q;
      if (filterCat !== "all") q = q.eq("category_id", filterCat) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("products" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product deleted");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error || catErr)
    return (
      <ModuleErrorState
        name="Products"
        error={error ?? catErr}
        onRetry={() => void Promise.all([refetchProducts(), refetchCategories()])}
      />
    );

  // Summary metrics
  const totalRevProjected = products.reduce(
    (a, p) => a + (p.unit_price ?? 0) * (p.registered_count ?? 0),
    0,
  );
  const totalRevActual = products.reduce(
    (a, p) => a + (p.unit_price ?? 0) * (p.orders_delivered ?? 0),
    0,
  );
  const totalBuildCost = products.reduce((a, p) => a + (p.build_cost ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Track what we build and sell</p>
          <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
        </div>
        <div className="flex items-center gap-2">
          {canManage && !catErr && (
            <ManageCategoriesButton
              categories={categories}
              onDone={() => qc.invalidateQueries({ queryKey: ["product-categories"] })}
            />
          )}
          {canManage && (
            <>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Product
              </Button>
              {addOpen && (
                <ProductFormDialog
                  categories={categories}
                  onDone={() => {
                    setAddOpen(false);
                    qc.invalidateQueries({ queryKey: ["products"] });
                  }}
                  onClose={() => setAddOpen(false)}
                />
              )}
            </>
          )}
        </div>
      </header>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Total Products
          </div>
          <div className="mt-2 text-3xl font-bold">{products.length}</div>
        </div>
        <div className="surface p-4">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3 w-3" /> Projected Revenue
          </div>
          <div className="mt-2 text-xl font-bold text-brand-success">
            {formatDualCompact(totalRevProjected)}
          </div>
        </div>
        <div className="surface p-4">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <DollarSign className="h-3 w-3" /> Delivered Revenue
          </div>
          <div className="mt-2 text-xl font-bold text-primary">
            {formatDualCompact(totalRevActual)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <div className="surface p-12 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No products. {canManage ? "Add your first one." : "Check back later."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const s = statusInfo(p.status);
            const cat = categories.find((c) => c.id === p.category_id);
            const buildDays =
              p.build_start_at && p.build_end_at
                ? differenceInDays(new Date(p.build_end_at), new Date(p.build_start_at))
                : p.build_start_at
                  ? differenceInDays(new Date(), new Date(p.build_start_at))
                  : null;
            const projected = (p.unit_price ?? 0) * (p.registered_count ?? 0);
            const delivered = (p.unit_price ?? 0) * (p.orders_delivered ?? 0);
            return (
              <div key={p.id} className="surface p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold leading-tight">{p.name}</div>
                    {cat && <div className="text-xs text-muted-foreground">{cat.name}</div>}
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

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {p.build_cost !== null && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Build cost:</span>{" "}
                      <span className="font-medium">{formatDual(p.build_cost)}</span>
                    </div>
                  )}
                  {buildDays !== null && (
                    <div>
                      <span className="text-muted-foreground">Build time:</span>{" "}
                      <span className="font-medium">{buildDays}d</span>
                    </div>
                  )}
                  {p.unit_price !== null && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Unit price:</span>{" "}
                      <span className="font-medium">{formatDual(p.unit_price)}</span>
                    </div>
                  )}
                  {p.registered_count !== null && (
                    <div>
                      <span className="text-muted-foreground">Registered:</span>{" "}
                      <span className="font-medium">{p.registered_count}</span>
                    </div>
                  )}
                  {p.orders_placed !== null && (
                    <div>
                      <span className="text-muted-foreground">Orders:</span>{" "}
                      <span className="font-medium">{p.orders_placed}</span>
                    </div>
                  )}
                  {p.orders_delivered !== null && (
                    <div>
                      <span className="text-muted-foreground">Delivered:</span>{" "}
                      <span className="font-medium">{p.orders_delivered}</span>
                    </div>
                  )}
                  {projected > 0 && (
                    <div className="col-span-2 pt-1 border-t border-border/60">
                      <span className="text-muted-foreground">Proj. revenue:</span>{" "}
                      <span className="font-medium text-brand-success">
                        {formatDual(projected)}
                      </span>
                      {" · "}
                      <span className="text-muted-foreground">Delivered:</span>{" "}
                      <span className="font-medium text-primary">{formatDual(delivered)}</span>
                    </div>
                  )}
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
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editItem && (
        <ProductFormDialog
          categories={categories}
          existing={editItem}
          onDone={() => {
            setEditItem(null);
            qc.invalidateQueries({ queryKey: ["products"] });
          }}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  );
}

function ManageCategoriesButton({
  categories,
  onDone,
}: {
  categories: ProductCategory[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return;
    setLoading(true);
    const { error } = await supabase.from("product_categories" as never).insert({ name } as never);
    setLoading(false);
    if (error) return toast.error((error as { message: string }).message);
    toast.success(`Category "${name}" added`);
    onDone();
    (e.currentTarget as HTMLFormElement).reset();
  }

  async function del(id: string) {
    const { error } = await supabase
      .from("product_categories" as never)
      .delete()
      .eq("id", id);
    if (error) return toast.error((error as { message: string }).message);
    onDone();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Manage Categories
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Product Categories</DialogTitle>
          </DialogHeader>
          <form onSubmit={add} className="flex gap-2">
            <Input name="name" placeholder="New category name…" required />
            <Button type="submit" size="sm" disabled={loading}>
              Add
            </Button>
          </form>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
              >
                <span className="text-sm">{c.name}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => del(c.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProductFormDialog({
  categories,
  existing,
  onDone,
  onClose,
}: {
  categories: ProductCategory[];
  existing?: Product;
  onDone: () => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(existing?.status ?? "development");
  const [categoryId, setCategoryId] = useState(existing?.category_id ?? "");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      category_id: categoryId || null,
      status,
      description: String(fd.get("description") ?? "").trim() || null,
      build_cost: Number(fd.get("build_cost")) || null,
      build_start_at: String(fd.get("build_start_at") ?? "") || null,
      build_end_at: String(fd.get("build_end_at") ?? "") || null,
      unit_price: Number(fd.get("unit_price")) || null,
      registered_count: Number(fd.get("registered_count")) || 0,
      orders_placed: Number(fd.get("orders_placed")) || 0,
      orders_delivered: Number(fd.get("orders_delivered")) || 0,
    };
    if (!payload.name) return toast.error("Name is required");
    setLoading(true);
    let error;
    if (existing) {
      ({ error } = await supabase
        .from("products" as never)
        .update(payload as never)
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("products" as never).insert(payload as never));
    }
    setLoading(false);
    if (error) return toast.error((error as { message: string }).message);
    toast.success(existing ? "Product updated" : "Product added");
    onDone();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Product" : "New Product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <Input name="name" defaultValue={existing?.name} required />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
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
                  {STATUSES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea name="description" rows={2} defaultValue={existing?.description ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Build cost (USD)</Label>
              <Input
                name="build_cost"
                type="number"
                min={0}
                step="0.01"
                defaultValue={existing?.build_cost ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit price (USD)</Label>
              <Input
                name="unit_price"
                type="number"
                min={0}
                step="0.01"
                defaultValue={existing?.unit_price ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Build start</Label>
              <Input
                name="build_start_at"
                type="date"
                defaultValue={existing?.build_start_at ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Build end</Label>
              <Input name="build_end_at" type="date" defaultValue={existing?.build_end_at ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Registered</Label>
              <Input
                name="registered_count"
                type="number"
                min={0}
                defaultValue={existing?.registered_count ?? 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Orders placed</Label>
              <Input
                name="orders_placed"
                type="number"
                min={0}
                defaultValue={existing?.orders_placed ?? 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Orders delivered</Label>
              <Input
                name="orders_delivered"
                type="number"
                min={0}
                defaultValue={existing?.orders_delivered ?? 0}
              />
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
                "Add Product"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
