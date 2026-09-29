import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getSessionUser } from "@/lib/auth-session";

export type Role = Database["public"]["Enums"]["app_role"];

export const ALL_ROLES: Role[] = [
  "ceo",
  "administrator",
  "operations_manager",
  "finance_officer",
  "programs_officer",
  "department_head",
  "staff",
];

export function roleLabel(r: Role) {
  return r === "ceo" ? "CEO" : r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useCurrentRoles() {
  return useQuery({
    queryKey: ["current-user-roles"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return { userId: null as string | null, roles: [] as Role[] };
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) throw error;
      return {
        userId: user.id,
        roles: (data ?? []).map((r) => r.role as Role),
      };
    },
    staleTime: 60_000,
  });
}

/** Whether the current user has an active matricule or a bootstrap role. */
export function useIsActive() {
  return useQuery({
    queryKey: ["is-active"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return false;
      const { data, error } = await supabase.rpc("is_active", { _uid: user.id });
      if (error) throw error;
      return !!data;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function hasAny(roles: Role[], ...check: Role[]) {
  return roles.some((r) => check.includes(r));
}

export const isCeo = (r: Role[]) => hasAny(r, "ceo");
export const isAdmin = (r: Role[]) => hasAny(r, "ceo", "administrator");
export const isManager = (r: Role[]) => hasAny(r, "ceo", "administrator", "operations_manager");
export const isOps = (r: Role[]) => hasAny(r, "ceo", "operations_manager");
export const isFinance = (r: Role[]) => hasAny(r, "ceo", "administrator", "finance_officer");
export const isDeptHead = (r: Role[]) => hasAny(r, "ceo", "administrator", "department_head");
export const canRequestFunds = (r: Role[]) =>
  hasAny(r, "ceo", "administrator", "operations_manager", "department_head");
export const canSendNotifications = (r: Role[]) =>
  hasAny(r, "ceo", "operations_manager", "programs_officer");
