import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { isTrustedOwnerEmail } from "@/lib/access";
import { clearPendingMatricule, getPendingMatricule } from "@/lib/pending-matricule";
import { getSessionWithTimeout } from "@/lib/auth-session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    let session;
    try {
      session = await getSessionWithTimeout(6_000);
    } catch {
      throw redirect({ to: "/auth" });
    }
    if (!session?.user) throw redirect({ to: "/auth" });

    const trustedOwner = isTrustedOwnerEmail(session.user.email);
    if (trustedOwner) clearPendingMatricule();
    const pendingMatricule = trustedOwner ? null : getPendingMatricule(session.user.email);
    const pathname = location.pathname.replace(/\/+$/, "");
    if (pendingMatricule && !pathname.endsWith("/settings")) {
      throw redirect({ to: "/settings" });
    }

    return { user: session.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
