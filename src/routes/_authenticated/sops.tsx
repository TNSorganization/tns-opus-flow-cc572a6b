import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, BookOpen, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { SectionHeader } from "@/components/kpi-card";

export const Route = createFileRoute("/_authenticated/sops")({
  component: SopsPage,
});

function SopsPage() {
  const { data: items = [] } = useQuery({
    queryKey: ["sops"],
    queryFn: async () => (await supabase.from("sops").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const sops = items.filter((i) => i.kind === "sop");
  const policies = items.filter((i) => i.kind === "policy");

  return (
    <div className="space-y-6">
      <div><NewButton /></div>

      <div>
        <SectionHeader title="Standard Operating Procedures" />
        <List items={sops} icon={<BookOpen className="h-5 w-5" />} tone="primary" empty="No SOPs yet." />
      </div>
      <div>
        <SectionHeader title="Policies" />
        <List items={policies} icon={<ShieldCheck className="h-5 w-5" />} tone="purple" empty="No policies yet." />
      </div>
    </div>
  );
}

type Sop = { id: string; title: string; version: string; status: string; content: string; updated_at: string };

function List({ items, icon, tone, empty }: { items: Sop[]; icon: React.ReactNode; tone: "primary" | "purple"; empty: string }) {
  const [open, setOpen] = useState<Sop | null>(null);
  if (items.length === 0) return <div className="tos-card p-8 text-center text-sm text-muted-foreground">{empty}</div>;
  const toneCls = tone === "primary" ? "bg-primary/15 text-primary" : "bg-brand-purple/15 text-brand-purple";
  return (
    <>
      <div className="space-y-2">
        {items.map((s) => (
          <button key={s.id} onClick={() => setOpen(s)}
            className="tos-card flex w-full items-start gap-4 text-left hover:border-primary/50">
            <div className={"icon-tile " + toneCls}>{icon}</div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 font-semibold">{s.title}</div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>v{s.version}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 uppercase">{s.status}</span>
                <span>Updated {format(new Date(s.updated_at), "d MMM yyyy")}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{open?.title}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
            {open?.content || "(empty)"}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("sops").insert({
      kind: String(fd.get("kind")),
      title: String(fd.get("title")),
      content: String(fd.get("content") || ""),
      version: String(fd.get("version") || "1.0"),
      status: "active",
      owner_id: u.user?.id,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Created");
    qc.invalidateQueries({ queryKey: ["sops"] });
    setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> New SOP / Policy</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New SOP / Policy</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select name="kind" defaultValue="sop">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sop">SOP</SelectItem>
                  <SelectItem value="policy">Policy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Version</Label>
              <Input name="version" defaultValue="1.0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input name="title" required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Textarea name="content" rows={10} placeholder="Write the SOP or policy here…" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
