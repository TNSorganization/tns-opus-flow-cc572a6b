import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BusinessModule = "products" | "logistics" | "programs" | "marketing";

const MODULE_TABLES: Record<BusinessModule, string> = {
  products: "products",
  logistics: "logistics_items",
  programs: "programs",
  marketing: "media_platforms",
};

function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "PGRST205" ||
    candidate.message?.toLowerCase().includes("could not find the table") === true
  );
}

export function useBusinessModuleHealth(enabled: boolean) {
  return useQuery({
    queryKey: ["business-module-health"],
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const entries = await Promise.all(
        (Object.entries(MODULE_TABLES) as [BusinessModule, string][]).map(
          async ([module, table]) => {
            const { error } = await supabase
              .from(table as never)
              .select("id", { count: "exact", head: true });
            return [module, !isMissingTable(error)] as const;
          },
        ),
      );
      return Object.fromEntries(entries) as Record<BusinessModule, boolean>;
    },
  });
}
