import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Camera } from "lucide-react";
import { useCurrentRoles, roleLabel } from "@/hooks/use-current-role";
import { getSessionUser, withTimeout } from "@/lib/auth-session";
import { UserAvatar } from "@/components/user-avatar";
import { AvatarCropDialog } from "@/components/avatar-crop-dialog";
import { getAvatarObjectPath } from "@/lib/avatar-url";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const { data: me } = useCurrentRoles();

  const {
    data: profile,
    isLoading,
    error: profileError,
  } = useQuery({
    queryKey: ["me-profile-full"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, department_id, job_title")
        .eq("id", user.id)
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

  function chooseAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      e.target.value = "";
      return toast.error("Choose a JPG, PNG, WebP, or GIF image");
    }
    if (file.size > 15 * 1024 * 1024) {
      e.target.value = "";
      return toast.error("Choose an image smaller than 15 MB");
    }
    setAvatarFile(file);
    e.target.value = "";
  }

  async function uploadAvatar(image: Blob) {
    if (!profile) return;
    setAvatarLoading(true);
    const path = `${profile.id}/${Date.now()}.webp`;
    let uploaded = false;
    try {
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, image, { contentType: "image/webp", upsert: false });
      if (uploadError) throw uploadError;
      uploaded = true;

      const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: publicData.publicUrl })
        .eq("id", profile.id);
      if (error) throw error;

      const previousPath = getAvatarObjectPath(profile.avatar_url);
      if (previousPath?.startsWith(`${profile.id}/`) && previousPath !== path) {
        void supabase.storage.from("avatars").remove([previousPath]);
      }

      setAvatarFile(null);
      toast.success("Photo cropped and updated");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["me-profile"] }),
        qc.invalidateQueries({ queryKey: ["me-profile-full"] }),
        qc.invalidateQueries({ queryKey: ["all-profiles"] }),
      ]);
    } catch (error) {
      if (uploaded) await supabase.storage.from("avatars").remove([path]);
      toast.error(error instanceof Error ? error.message : "Photo upload failed");
    } finally {
      setAvatarLoading(false);
    }
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("new_password"));
    const confirmation = String(fd.get("password_confirmation"));
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirmation) return toast.error("The passwords do not match.");
    setPwLoading(true);
    try {
      const { error } = await withTimeout(supabase.auth.updateUser({ password }), 15_000);
      if (error) return toast.error(error.message);
      toast.success("Password updated");
      (e.currentTarget as HTMLFormElement).reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password update failed.");
    } finally {
      setPwLoading(false);
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (profileError || !profile) {
    return (
      <div className="text-sm text-destructive">
        {profileError instanceof Error ? profileError.message : "Profile could not be loaded."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Your account</p>
        <h1 className="text-3xl font-semibold tracking-tight">My Profile</h1>
      </header>

      <div className="surface p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="relative">
            <UserAvatar profile={profile} size="xl" />
            <label
              className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow"
              title="Choose and crop a profile photo"
            >
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
                onChange={chooseAvatar}
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

      <form onSubmit={changePassword} className="surface space-y-3 p-6">
        <h3 className="text-sm font-semibold">Change your password</h3>
        <p className="text-xs text-muted-foreground">
          Use at least 6 characters. Letters, numbers, spaces, and symbols are accepted.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              name="new_password"
              type="password"
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password-confirmation">Confirm password</Label>
            <Input
              id="password-confirmation"
              name="password_confirmation"
              type="password"
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>
        </div>
        <Button type="submit" disabled={pwLoading}>
          {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
        </Button>
      </form>

      <AvatarCropDialog
        file={avatarFile}
        saving={avatarLoading}
        onCancel={() => setAvatarFile(null)}
        onSave={uploadAvatar}
      />
    </div>
  );
}
