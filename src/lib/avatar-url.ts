import { supabase } from "@/integrations/supabase/client";

const AVATAR_URL_MARKERS = [
  "/storage/v1/object/public/avatars/",
  "/storage/v1/object/sign/avatars/",
  "/storage/v1/object/authenticated/avatars/",
];

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const pendingUrls = new Map<string, Promise<string | null>>();

export function getAvatarObjectPath(value: string | null | undefined): string | null {
  const source = value?.trim();
  if (!source || source.startsWith("data:") || source.startsWith("blob:")) return null;

  for (const marker of AVATAR_URL_MARKERS) {
    const markerIndex = source.indexOf(marker);
    if (markerIndex === -1) continue;
    const encodedPath = source.slice(markerIndex + marker.length).split(/[?#]/, 1)[0];
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  }

  if (source.startsWith("avatars/")) return source.slice("avatars/".length);
  if (!/^[a-z][a-z\d+.-]*:/i.test(source) && !source.startsWith("/")) return source;
  return null;
}

export function isStoredAvatarPath(value: string | null | undefined): boolean {
  const source = value?.trim();
  return !!source && !!getAvatarObjectPath(source) && !/^[a-z][a-z\d+.-]*:/i.test(source);
}

export async function createReadableAvatarUrl(
  value: string | null | undefined,
): Promise<string | null> {
  const source = value?.trim();
  const path = getAvatarObjectPath(source);
  if (!source || !path) return source || null;

  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const pending = pendingUrls.get(path);
  if (pending) return pending;

  const request = supabase.storage
    .from("avatars")
    .createSignedUrl(path, 60 * 60)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) return source;
      signedUrlCache.set(path, {
        url: data.signedUrl,
        expiresAt: Date.now() + 55 * 60 * 1000,
      });
      return data.signedUrl;
    })
    .finally(() => pendingUrls.delete(path));

  pendingUrls.set(path, request);
  return request;
}
