const basePath = import.meta.env.BASE_URL || "/";
const publicAppUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");

export function getAssetUrl(path: string) {
  const cleanPath = path.replace(/^\/+/, "");
  return `${basePath}${cleanPath}`;
}

export function buildAbsoluteAppUrl(appUrl: string, path = "") {
  const cleanPath = path.replace(/^\/+/, "");
  return new URL(cleanPath, `${appUrl.replace(/\/+$/, "")}/`).toString();
}

export function getAppUrl(path = "") {
  const cleanPath = path.replace(/^\/+/, "");

  // Production auth emails must always return to the canonical deployment,
  // even if a request began on an obsolete preview or cached installation.
  if (publicAppUrl) {
    return buildAbsoluteAppUrl(publicAppUrl, cleanPath);
  }

  if (typeof window === "undefined") {
    return `${basePath}${cleanPath}`;
  }

  return new URL(cleanPath, new URL(basePath, window.location.origin)).toString();
}
