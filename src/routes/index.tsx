import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) throw redirect({ to: "/home" });
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
