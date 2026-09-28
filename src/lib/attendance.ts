import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

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
      return { status: "checked_out", since, next: [] };
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
  let breakMs = 0;
  let breakStart: Date | null = null;
  for (const ev of sorted) {
    const t = new Date(ev.event_at);
    if (ev.event_type === "check_in" && !checkIn) checkIn = t;
    if (ev.event_type === "break_start") breakStart = t;
    if (ev.event_type === "break_end" && breakStart) {
      breakMs += t.getTime() - breakStart.getTime();
      breakStart = null;
    }
    if (ev.event_type === "check_out") checkOut = t;
  }
  const now = new Date();
  const end = checkOut ?? now;
  const totalMs = checkIn ? end.getTime() - checkIn.getTime() : 0;
  const activeBreakMs = breakStart ? now.getTime() - breakStart.getTime() : 0;
  return {
    checkIn,
    checkOut,
    totalMs: Math.max(0, totalMs),
    breakMs: breakMs + activeBreakMs,
    productiveMs: Math.max(0, totalMs - breakMs - activeBreakMs),
  };
}

export function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export async function recordEvent(type: AttendanceEventType) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const gps = await new Promise<{ lat?: number; lng?: number }>((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { timeout: 3000, maximumAge: 60000 },
    );
  });
  return supabase.from("attendance_events").insert({
    user_id: u.user.id,
    event_type: type,
    gps_lat: gps.lat ?? null,
    gps_lng: gps.lng ?? null,
    device: navigator?.userAgent?.slice(0, 200) ?? null,
  });
}
