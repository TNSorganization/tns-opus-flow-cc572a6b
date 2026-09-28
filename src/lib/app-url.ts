const basePath = import.meta.env.BASE_URL || "/";

export function getAssetUrl(path: string) {
  const cleanPath = path.replace(/^\/+/, "");
  return `${basePath}${cleanPath}`;
}

export function getAppUrl(path = "") {
  const cleanPath = path.replace(/^\/+/, "");

  if (typeof window === "undefined") {
    return `${basePath}${cleanPath}`;
  }

  return new URL(cleanPath, new URL(basePath, window.location.origin)).toString();
}
