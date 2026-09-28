import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { getPendingMatricule } from "@/lib/pending-matricule";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });

    const pendingMatricule = getPendingMatricule(data.user.email);
    const pathname = location.pathname.replace(/\/+$/, "");
    if (pendingMatricule && !pathname.endsWith("/settings")) {
      throw redirect({ to: "/settings" });
    }

    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
