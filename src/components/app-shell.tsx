import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Bell,
  BookOpen,
  CircleAlert,
  Clock3,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Layers3,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Package,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  TrendingUp,
  Truck,
  User,
  Users2,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { useBusinessModuleHealth, type BusinessModule } from "@/hooks/use-business-module-health";
import { isOps, roleLabel, useCurrentRoles, useIsActive } from "@/hooks/use-current-role";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { getAppUrl } from "@/lib/app-url";
import { getSessionUser, withTimeout } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "tasks" | "expenses";
  businessModule?: BusinessModule;
};

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "People & Work",
    items: [
      { to: "/home", label: "Attendance", icon: Clock3 },
      { to: "/board", label: "Live Board", icon: Users2 },
      { to: "/tasks", label: "Productivity", icon: ListChecks, badgeKey: "tasks" },
      { to: "/performance", label: "Performance", icon: TrendingUp },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/income", label: "Income", icon: ArrowDownCircle },
      { to: "/expenses", label: "Expenses", icon: ArrowUpCircle, badgeKey: "expenses" },
      { to: "/salary", label: "My Salary", icon: WalletCards },
      { to: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/products", label: "Products", icon: Package, businessModule: "products" },
      { to: "/logistics", label: "Logistics", icon: Truck, businessModule: "logistics" },
      { to: "/programs", label: "Programs", icon: Layers3, businessModule: "programs" },
      { to: "/marketing", label: "Marketing", icon: Megaphone, businessModule: "marketing" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { to: "/documents", label: "Documents", icon: FolderOpen },
      { to: "/sops", label: "SOPs & Policies", icon: BookOpen },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/profile", label: "My Profile", icon: User },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const ROUTE_META: Record<string, { title: string; description: string }> = {
  "/dashboard": { title: "Dashboard", description: "The organization at a glance" },
  "/home": { title: "Attendance", description: "Your day and working time" },
  "/board": { title: "Live Board", description: "Who is working right now" },
  "/tasks": { title: "Productivity", description: "Assignments, progress, and delivery" },
  "/performance": { title: "Performance", description: "Team rhythm and completion trends" },
  "/income": { title: "Income", description: "Revenue and incoming funds" },
  "/expenses": { title: "Expenses", description: "Requests, approvals, and spending" },
  "/salary": { title: "My Salary", description: "Your salary and payment history" },
  "/reports": { title: "Reports", description: "Operational reporting" },
  "/products": { title: "Products", description: "The TNS product portfolio" },
  "/logistics": { title: "Logistics", description: "Equipment, rentals, and needs" },
  "/programs": { title: "Programs", description: "Programs, activities, and initiatives" },
  "/marketing": { title: "Marketing & Media", description: "Channels, reach, and partners" },
  "/documents": { title: "Documents", description: "Shared working files" },
  "/sops": { title: "SOPs & Policies", description: "How TNS works" },
  "/profile": { title: "My Profile", description: "Identity, photo, and password" },
  "/settings": { title: "Settings", description: "Access, people, and administration" },
};

const UNLOCKED_ROUTES = new Set(["/settings", "/profile"]);
const buildSha = import.meta.env.VITE_BUILD_SHA?.slice(0, 7) || "local";

function routeMeta(pathname: string) {
  const key = Object.keys(ROUTE_META).find(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return key ? ROUTE_META[key] : { title: "TNS Opus", description: "Operations workspace" };
}

function useBadges(enabled: boolean) {
  const { data: tasks = 0 } = useQuery({
    queryKey: ["badge-tasks-overdue"],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .lt("deadline", new Date().toISOString())
        .not("status", "in", "(completed,cancelled)");
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const { data: expenses = 0 } = useQuery({
    queryKey: ["badge-expenses-pending"],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("expense_entries")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  return { tasks, expenses };
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();
  const { data: activeState } = useIsActive();
  const { data: currentUser } = useCurrentRoles();
  const active = activeState === true;
  const locked = activeState === false;
  const badges = useBadges(active);
  const { data: moduleHealth } = useBusinessModuleHealth(active);
  const meta = routeMeta(pathname);

  const { data: profile } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (activeState === undefined) return;
    if (locked && !UNLOCKED_ROUTES.has(pathname)) {
      navigate({ to: "/settings", replace: true });
    }
  }, [activeState, locked, pathname, navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    try {
      const { error } = await withTimeout(supabase.auth.signOut({ scope: "local" }), 8_000);
      if (error) throw error;
      queryClient.clear();
      window.location.replace(getAppUrl("auth"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign out failed.");
    }
  }

  const missingModules = moduleHealth
    ? (Object.values(moduleHealth).filter((ready) => !ready).length ?? 0)
    : 0;

  const sidebar = (
    <Sidebar
      pathname={pathname}
      badges={badges}
      locked={locked}
      moduleHealth={moduleHealth}
      profile={profile}
      role={currentUser?.roles[0] ? roleLabel(currentUser.roles[0]) : undefined}
      onSignOut={signOut}
    />
  );

  return (
    <div className="min-h-screen bg-transparent">
      <aside className="app-rail fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-[#071611]/65 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="app-rail relative flex h-full w-[min(88vw,20rem)] flex-col bg-sidebar shadow-2xl">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-3 top-3 z-10 text-sidebar-foreground"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </Button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-border/80 bg-background/88 backdrop-blur-xl">
          <div className="flex h-[4.5rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="shrink-0 lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-lg font-semibold tracking-[-0.025em] sm:text-xl">
                    {meta.title}
                  </h1>
                  {locked && (
                    <span className="hidden items-center gap-1 rounded-full bg-brand-danger/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-danger sm:inline-flex">
                      <ShieldAlert className="h-3 w-3" /> Locked
                    </span>
                  )}
                </div>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  {meta.description}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {missingModules > 0 && (
                <div
                  className="hidden items-center gap-1.5 rounded-full border border-brand-yellow/30 bg-brand-yellow/10 px-3 py-1.5 text-[11px] font-semibold text-foreground xl:flex"
                  title="The screens are installed; their Supabase tables still need to be created."
                >
                  <CircleAlert className="h-3.5 w-3.5 text-brand-yellow" />
                  {missingModules} modules awaiting database
                </div>
              )}
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={toggle}
                title="Toggle theme"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <NotificationsBell canSee={active || isOps(currentUser?.roles ?? [])} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  pathname,
  badges,
  locked,
  moduleHealth,
  profile,
  role,
  onSignOut,
}: {
  pathname: string;
  badges: { tasks: number; expenses: number };
  locked: boolean;
  moduleHealth: Record<BusinessModule, boolean> | undefined;
  profile:
    | { id: string; full_name?: string | null; email?: string | null; avatar_url?: string | null }
    | null
    | undefined;
  role: string | undefined;
  onSignOut: () => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.label.toLowerCase().includes(deferredSearch)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
            <BrandLogo kind="mark" className="h-10 w-6" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-[-0.035em] text-white">TNS Opus</div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
              Operations workspace
            </div>
          </div>
        </div>

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a module"
            aria-label="Find a module"
            className="h-9 border-white/10 bg-white/[0.06] pl-9 text-xs text-white placeholder:text-white/35 focus-visible:ring-sidebar-ring"
          />
        </div>
      </div>

      <nav
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-5"
        aria-label="Main navigation"
      >
        {sections.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center text-xs text-white/50">
            No module matches "{search}".
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.label}>
              <div className="px-3 pb-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const selected = pathname === item.to || pathname.startsWith(`${item.to}/`);
                  const disabled = locked && !UNLOCKED_ROUTES.has(item.to);
                  const setupPending =
                    item.businessModule !== undefined &&
                    moduleHealth?.[item.businessModule] === false;
                  const badge =
                    item.badgeKey === "tasks"
                      ? badges.tasks
                      : item.badgeKey === "expenses"
                        ? badges.expenses
                        : 0;
                  const Icon = item.icon;

                  if (disabled) {
                    return (
                      <div
                        key={item.to}
                        className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/25"
                        title="Confirm your matricule in Settings to unlock this module."
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1 truncate">{item.label}</span>
                        <ShieldAlert className="h-3.5 w-3.5" />
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.to}
                      to={item.to as "/home"}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        selected
                          ? "bg-white text-[#153228] shadow-sm"
                          : "text-white/72 hover:bg-white/[0.07] hover:text-white",
                      )}
                    >
                      <Icon className={cn("h-4 w-4", selected && "text-[#1f705e]")} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {setupPending && (
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            selected ? "bg-[#d36a3e]" : "bg-[#efa26c]",
                          )}
                          title="Database setup pending"
                        />
                      )}
                      {badge > 0 && (
                        <span className="min-w-5 rounded-full bg-brand-orange px-1.5 py-0.5 text-center text-[9px] font-bold text-white">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-2.5">
          <UserAvatar profile={profile} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">
              {profile?.full_name || "Your account"}
            </div>
            <div className="truncate text-[10px] text-white/45">
              {role || profile?.email || "Loading..."}
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-white/60 hover:bg-white/10 hover:text-white"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 px-2 text-[9px] font-mono uppercase tracking-wider text-white/25">
          Build {buildSha}
        </div>
      </div>
    </>
  );
}

function NotificationsBell({ canSee }: { canSee: boolean }) {
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ["my-notifications"],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, category, hide_after, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const now = Date.now();
      return (data ?? []).filter(
        (notification) =>
          !notification.hide_after || new Date(notification.hide_after).getTime() > now,
      );
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!canSee) return;
    const channel = supabase
      .channel("opus-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () =>
        queryClient.invalidateQueries({ queryKey: ["my-notifications"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canSee, queryClient]);

  const unread = notifications.filter((notification) => !notification.read_at).length;

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    if (error) return toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="relative"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Notifications</div>
            <div className="text-[10px] text-muted-foreground">{unread} unread</div>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={() =>
                markRead(notifications.filter((item) => !item.read_at).map((item) => item.id))
              }
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              You are all caught up.
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                type="button"
                key={notification.id}
                onClick={() => markRead([notification.id])}
                className={cn(
                  "w-full border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-muted/55",
                  !notification.read_at && "bg-primary/[0.05]",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold">{notification.title}</span>
                  <span className="shrink-0 text-[9px] text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(notification.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                {notification.body && (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {notification.body}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
