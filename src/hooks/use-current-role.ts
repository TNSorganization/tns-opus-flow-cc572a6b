import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Role = Database["public"]["Enums"]["app_role"];

export function useCurrentRoles() {
  return useQuery({
    queryKey: ["current-user-roles"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { userId: null as string | null, roles: [] as Role[] };
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      return {
        userId: u.user.id,
        roles: (data ?? []).map((r) => r.role as Role),
      };
    },
    staleTime: 60_000,
  });
}

export function hasAny(roles: Role[], ...check: Role[]) {
  return roles.some((r) => check.includes(r));
}

export const isAdmin = (r: Role[]) => hasAny(r, "administrator");
export const isOps = (r: Role[]) => hasAny(r, "administrator", "operations_manager");
export const isFinance = (r: Role[]) => hasAny(r, "administrator", "finance_officer");
export const isDeptHead = (r: Role[]) => hasAny(r, "administrator", "department_head");
