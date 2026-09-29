import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Plus, Loader2, Download, Folder, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { isManager, useCurrentRoles } from "@/hooks/use-current-role";

export const Route = createFileRoute("/_authenticated/documents")({
  component: DocumentsPage,
});

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rtf: "application/rtf",
  txt: "text/plain",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function safeStorageName(name: string) {
  return (
    name
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-120) || "document"
  );
}

function DocumentsPage() {
  const qc = useQueryClient();
  const [folderId, setFolderId] = useState<string | "all">("all");
  const { data: me } = useCurrentRoles();
  const canManage = isManager(me?.roles ?? []);

  const { data: folders = [] } = useQuery({
    queryKey: ["doc-folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_folders")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: docs = [] } = useQuery({
    queryKey: ["documents", folderId],
    queryFn: async () => {
      let q = supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (folderId !== "all") q = q.eq("folder_id", folderId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  async function openDoc(path: string) {
    const pendingTab = window.open("", "_blank");
    if (pendingTab) pendingTab.opener = null;
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 300);
    if (error || !data) {
      pendingTab?.close();
      return toast.error(error?.message || "Failed to open");
    }
    if (pendingTab) pendingTab.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  }
  async function del(id: string, path: string) {
    if (!confirm("Delete this document?")) return;
    const { data: deleted, error } = await supabase
      .from("documents")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error || !deleted) return toast.error(error?.message || "You cannot delete this document");

    const { error: storageError } = await supabase.storage.from("documents").remove([path]);
    if (storageError) {
      toast.warning("Document removed, but its stored file still needs cleanup.");
    } else {
      toast.success("Deleted");
    }
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <UploadButton folders={folders} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="tos-card h-fit">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Folders
          </h3>
          <div className="space-y-1">
            <FolderRow
              active={folderId === "all"}
              onClick={() => setFolderId("all")}
              label="All Documents"
            />
            {folders.map((f) => (
              <FolderRow
                key={f.id}
                active={folderId === f.id}
                onClick={() => setFolderId(f.id)}
                label={f.name}
              />
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-base font-bold">Recent Documents</h2>
          {docs.length === 0 ? (
            <div className="tos-card p-10 text-center text-sm text-muted-foreground">
              No documents yet. Upload one to get started.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((d) => (
                <div
                  key={d.id}
                  className="tos-card group cursor-pointer"
                  onClick={() => openDoc(d.file_path)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDoc(d.file_path);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="icon-tile mb-3 bg-primary/15 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="mb-1 truncate text-sm font-semibold">{d.name}</div>
                  <div className="mb-2 truncate text-xs text-muted-foreground">
                    {folders.find((f) => f.id === d.folder_id)?.name || "—"} ·{" "}
                    {format(new Date(d.created_at), "d MMM yyyy")}
                  </div>
                  <div className="flex gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDoc(d.file_path);
                      }}
                      aria-label={`Open ${d.name}`}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    {(d.uploaded_by === me?.userId || canManage) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-brand-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          del(d.id, d.file_path);
                        }}
                        aria-label={`Delete ${d.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FolderRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted",
      )}
    >
      <Folder className="h-4 w-4 text-brand-yellow" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function UploadButton({ folders }: { folders: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file") as File | null;
    if (!file || !file.size) return toast.error("Choose a file");
    if (file.size > MAX_DOCUMENT_BYTES) return toast.error("Documents must be 20 MB or smaller");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = DOCUMENT_MIME_BY_EXTENSION[extension];
    if (!contentType) return toast.error("This file type is not supported");
    setLoading(true);
    const { data: u, error: userError } = await supabase.auth.getUser();
    if (userError || !u.user) {
      setLoading(false);
      return toast.error(userError?.message || "Not signed in");
    }
    const path = `${u.user.id}/${Date.now()}-${crypto.randomUUID()}-${safeStorageName(file.name)}`;
    const up = await supabase.storage.from("documents").upload(path, file, { contentType });
    if (up.error) {
      setLoading(false);
      return toast.error(up.error.message);
    }
    const { error } = await supabase.from("documents").insert({
      name: String(fd.get("name") || file.name).trim() || file.name,
      description: String(fd.get("description") || "").trim() || null,
      folder_id: (fd.get("folder_id") as string) || null,
      file_path: path,
      mime_type: contentType,
      size_bytes: file.size,
      uploaded_by: u.user.id,
    });
    setLoading(false);
    if (error) {
      await supabase.storage.from("documents").remove([path]);
      return toast.error(error.message);
    }
    toast.success("Uploaded");
    qc.invalidateQueries({ queryKey: ["documents"] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-brand text-white">
          <Plus className="mr-1.5 h-4 w-4" /> Upload Document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>File</Label>
            <Input
              name="file"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,image/jpeg,image/png,image/webp"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input name="name" maxLength={200} placeholder="Optional — defaults to filename" />
          </div>
          <div className="space-y-1.5">
            <Label>Folder</Label>
            <Select name="folder_id">
              <SelectTrigger>
                <SelectValue placeholder="Choose folder" />
              </SelectTrigger>
              <SelectContent>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea name="description" rows={2} maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
