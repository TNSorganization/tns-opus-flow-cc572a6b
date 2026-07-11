import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Loader2, Camera } from "lucide-react";
import { useCurrentRoles, roleLabel } from "@/hooks/use-current-role";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const { data: me } = useCurrentRoles();

  const { data: profile } = useQuery({
    queryKey: ["me-profile-full"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles")
        .select("id, full_name, email, avatar_url, department_id, job_title").eq("id", u.user.id).maybeSingle();
      return data;
    },
  });

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: String(fd.get("full_name") || "") || null,
      job_title: String(fd.get("job_title") || "") || null,
    }).eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["me-profile"] });
    qc.invalidateQueries({ queryKey: ["me-profile-full"] });
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${profile.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) return toast.error(upErr.message);
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", profile.id);
    if (error) return toast.error(error.message);
    toast.success("Photo updated");
    qc.invalidateQueries({ queryKey: ["me-profile"] });
    qc.invalidateQueries({ queryKey: ["me-profile-full"] });
  }

  async function changePin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pin = String(fd.get("new_pin"));
    if (!/^\d{6}$/.test(pin)) return toast.error("PIN must be 6 digits");
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pin });
    setPwLoading(false);
    if (error) return toast.error(error.message);
    toast.success("PIN updated");
    (e.currentTarget as HTMLFormElement).reset();
  }

  if (!profile) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const initials = (profile.full_name || profile.email || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Your account</p>
        <h1 className="text-3xl font-semibold tracking-tight">My Profile</h1>
      </header>

      <div className="surface p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="gradient-brand text-lg font-bold text-white">{initials}</AvatarFallback>
            </Avatar>
            <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow">
              <Camera className="h-3.5 w-3.5" />
              <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
            </label>
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold">{profile.full_name || "—"}</div>
            <div className="truncate text-sm text-muted-foreground">{profile.email}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(me?.roles ?? []).map((r) => (
                <span key={r} className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {roleLabel(r)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Full name</Label>
            <Input name="full_name" defaultValue={profile.full_name ?? ""} required /></div>
          <div className="space-y-1.5"><Label>Job title</Label>
            <Input name="job_title" defaultValue={profile.job_title ?? ""} placeholder="e.g. Bookkeeping" /></div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save profile"}
            </Button>
          </div>
        </form>
      </div>

      <form onSubmit={changePin} className="surface space-y-3 p-6">
        <h3 className="text-sm font-semibold">Change your 6-digit PIN</h3>
        <div className="space-y-1.5">
          <Label>New PIN</Label>
          <Input name="new_pin" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} minLength={6} required
            className="w-40 tracking-[0.5em] text-center font-mono" />
        </div>
        <Button type="submit" disabled={pwLoading}>
          {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update PIN"}
        </Button>
      </form>
    </div>
  );
}
