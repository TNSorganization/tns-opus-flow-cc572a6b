import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createReadableAvatarUrl, isStoredAvatarPath } from "@/lib/avatar-url";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#0f766e",
  "#047857",
  "#0369a1",
  "#1d4ed8",
  "#7e22ce",
  "#be185d",
  "#b45309",
  "#c2410c",
  "#b91c1c",
  "#4d7c0f",
];

function colorFromId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = id.charCodeAt(index) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  const displayName = name?.trim();
  if (displayName) {
    const parts = displayName.split(/\s+/);
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }
  return (email?.[0] ?? "?").toUpperCase();
}

export interface AvatarProfile {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface UserAvatarProps {
  profile: AvatarProfile | null | undefined;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
  xl: "h-20 w-20 text-lg",
};

export function UserAvatar({ profile, size = "md", className }: UserAvatarProps) {
  const source = profile?.avatar_url?.trim() || undefined;
  const [imageUrl, setImageUrl] = useState<string | undefined>(
    source && !isStoredAvatarPath(source) ? source : undefined,
  );
  const attemptedFallback = useRef(false);
  const currentSource = useRef(source);

  useEffect(() => {
    currentSource.current = source;
    attemptedFallback.current = false;
    setImageUrl(source && !isStoredAvatarPath(source) ? source : undefined);

    if (!source || !isStoredAvatarPath(source)) return;
    attemptedFallback.current = true;
    void createReadableAvatarUrl(source).then((resolved) => {
      if (currentSource.current === source) setImageUrl(resolved ?? undefined);
    });
  }, [source]);

  function handleLoadingStatus(status: "idle" | "loading" | "loaded" | "error") {
    if (status !== "error" || !source || attemptedFallback.current) return;
    attemptedFallback.current = true;
    void createReadableAvatarUrl(source).then((resolved) => {
      if (currentSource.current === source && resolved && resolved !== source)
        setImageUrl(resolved);
    });
  }

  const initials = getInitials(profile?.full_name, profile?.email);
  const background = profile?.id ? colorFromId(profile.id) : PALETTE[0];

  return (
    <Avatar className={cn(SIZE_CLASSES[size], className)}>
      <AvatarImage
        src={imageUrl}
        alt={profile?.full_name || profile?.email || "Profile photo"}
        className="object-cover"
        onLoadingStatusChange={handleLoadingStatus}
      />
      <AvatarFallback style={{ background, color: "#fff" }} className="font-bold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
