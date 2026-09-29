import { supabase } from "@/integrations/supabase/client";
import { isMissingRpcError } from "@/lib/supabase-errors";

export type ActiveProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export async function fetchActiveProfiles(): Promise<ActiveProfile[]> {
  const { data, error } = await supabase.rpc("list_active_profiles");
  if (!error) return data ?? [];
  if (!isMissingRpcError(error)) throw error;

  // Compatibility path until the hardening migration reaches the hosted project.
  const { data: legacyData, error: legacyError } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .order("full_name");
  if (legacyError) throw legacyError;
  return legacyData ?? [];
}
