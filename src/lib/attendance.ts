import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { isMissingRpcError } from "@/lib/supabase-errors";
import { getSessionUser } from "@/lib/auth-session";

export type AttendanceEventType = Database["public"]["Enums"]["attendance_event_type"];

export type AttendanceStatus = "off" | "present" | "on_break" | "checked_out";

export function deriveStatus(events: { event_type: AttendanceEventType; event_at: string }[]): {
  status: AttendanceStatus;
  since: Date | null;
  next: AttendanceEventType[];
} {
  if (!events.length) return { status: "off", since: null, next: ["check_in"] };
  const sorted = [...events].sort(
    (a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime(),
  );
  const last = sorted[sorted.length - 1];
  const since = new Date(last.event_at);
  switch (last.event_type) {
    case "check_in":
    case "break_end":
      return { status: "present", since, next: ["break_start", "check_out"] };
    case "break_start":
      return { status: "on_break", since, next: ["break_end", "check_out"] };
    case "check_out":
      return { status: "checked_out", since, next: ["check_in"] };
  }
}

export function computeDailyTotals(
  events: { event_type: AttendanceEventType; event_at: string }[],
) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime(),
  );
  let checkIn: Date | null = null;
  let checkOut: Date | null = null;
  let sessionStart: Date | null = null;
  let productiveStart: Date | null = null;
  let breakMs = 0;
  let breakStart: Date | null = null;
  let productiveMs = 0;
  let totalMs = 0;
  for (const ev of sorted) {
    const t = new Date(ev.event_at);
    if (ev.event_type === "check_in" && !sessionStart) {
      checkIn ??= t;
      sessionStart = t;
      productiveStart = t;
      breakStart = null;
    } else if (ev.event_type === "break_start" && sessionStart && productiveStart) {
      productiveMs += Math.max(0, t.getTime() - productiveStart.getTime());
      productiveStart = null;
      breakStart = t;
    } else if (ev.event_type === "break_end" && sessionStart && breakStart) {
      breakMs += Math.max(0, t.getTime() - breakStart.getTime());
      breakStart = null;
      productiveStart = t;
    } else if (ev.event_type === "check_out" && sessionStart) {
      if (breakStart) {
        breakMs += Math.max(0, t.getTime() - breakStart.getTime());
      } else if (productiveStart) {
        productiveMs += Math.max(0, t.getTime() - productiveStart.getTime());
      }
      totalMs += Math.max(0, t.getTime() - sessionStart.getTime());
      checkOut = t;
      sessionStart = null;
      productiveStart = null;
      breakStart = null;
    }
  }

  const now = new Date();
  if (sessionStart) {
    totalMs += Math.max(0, now.getTime() - sessionStart.getTime());
    if (breakStart) {
      breakMs += Math.max(0, now.getTime() - breakStart.getTime());
    } else if (productiveStart) {
      productiveMs += Math.max(0, now.getTime() - productiveStart.getTime());
    }
  }

  return {
    checkIn,
    checkOut,
    totalMs: Math.max(0, totalMs),
    breakMs: Math.max(0, breakMs),
    productiveMs: Math.max(0, productiveMs),
  };
}

export function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export async function recordEvent(type: AttendanceEventType) {
  const user = await getSessionUser();
  if (!user) throw new Error("Not signed in");
  const gps = await new Promise<{ lat?: number; lng?: number }>((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { timeout: 3000, maximumAge: 60000 },
    );
  });
  const device = typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 200);
  const { error: rpcError } = await supabase.rpc("record_attendance_event", {
    _device: device ?? undefined,
    _event_type: type,
    _gps_lat: gps.lat,
    _gps_lng: gps.lng,
  });
  if (!rpcError) return { error: null };
  if (!isMissingRpcError(rpcError)) return { error: rpcError };

  // Compatibility path until the hardening migration reaches the hosted project.
  return supabase.from("attendance_events").insert({
    user_id: user.id,
    event_type: type,
    gps_lat: gps.lat ?? null,
    gps_lng: gps.lng ?? null,
    device,
  });
}
