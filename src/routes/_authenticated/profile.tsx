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
  const [avatarLoading, setAvatarLoading] = useState(false);
  const { data: me } = useCurrentRoles();

  const {
    data: profile,
    isLoading,
    error: profileError,
  } = useQuery({
    queryKey: ["me-profile-full"],
    queryFn: async () => {
      const { data: u, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, department_id, job_title")
        .eq("id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    const fd = new FormData(e.currentTarget);
    const fullName = String(fd.get("full_name") || "").trim();
    const jobTitle = String(fd.get("job_title") || "").trim();
    if (!fullName) return toast.error("Full name is required");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        job_title: jobTitle || null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["me-profile"] });
    qc.invalidateQueries({ queryKey: ["me-profile-full"] });
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const extensionByType: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extensionByType[file.type];
    if (!ext) {
      e.target.value = "";
      return toast.error("Choose a JPG, PNG, WebP, or GIF image");
    }
    if (file.size > 5 * 1024 * 1024) {
      e.target.value = "";
      return toast.error("Profile photos must be 5 MB or smaller");
    }
    setAvatarLoading(true);
    const path = `${profile.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setAvatarLoading(false);
      e.target.value = "";
      return toast.error(upErr.message);
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: pub.publicUrl })
      .eq("id", profile.id);
    if (error) {
      await supabase.storage.from("avatars").remove([path]);
      setAvatarLoading(false);
      e.target.value = "";
      return toast.error(error.message);
    }
    setAvatarLoading(false);
    e.target.value = "";
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

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (profileError || !profile) {
    return (
      <div className="text-sm text-destructive">
        {profileError instanceof Error ? profileError.message : "Profile could not be loaded."}
      </div>
    );
  }

  const initials = (profile.full_name || profile.email || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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
              <AvatarFallback className="gradient-brand text-lg font-bold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow">
              {avatarLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={avatarLoading}
                onChange={uploadAvatar}
              />
            </label>
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold">{profile.full_name || "—"}</div>
            <div className="truncate text-sm text-muted-foreground">{profile.email}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(me?.roles ?? []).map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
                >
                  {roleLabel(r)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input name="full_name" defaultValue={profile.full_name ?? ""} required />
          </div>
          <div className="space-y-1.5">
            <Label>Job title</Label>
            <Input
              name="job_title"
              defaultValue={profile.job_title ?? ""}
              placeholder="e.g. Bookkeeping"
            />
          </div>
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
          <Input
            name="new_pin"
            type="password"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            minLength={6}
            required
            autoComplete="new-password"
            className="w-40 tracking-[0.5em] text-center font-mono"
          />
        </div>
        <Button type="submit" disabled={pwLoading}>
          {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update PIN"}
        </Button>
      </form>
    </div>
  );
}
