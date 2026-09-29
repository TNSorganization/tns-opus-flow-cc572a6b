import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Clock,
  ListChecks,
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
  FolderOpen,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Moon,
  Sun,
  Users2,
  User,
  Wallet,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "@/hooks/use-theme";
import { useIsActive, useCurrentRoles, isOps } from "@/hooks/use-current-role";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { getSessionUser } from "@/lib/auth-session";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  badgeKey?: "tasks" | "expenses";
};

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutGrid }] },
  {
    label: "Workforce",
    items: [
      { to: "/home", label: "Attendance", icon: Clock },
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
      { to: "/salary", label: "My Salary", icon: Wallet },
      { to: "/reports", label: "Reports", icon: FileText },
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

// Routes always accessible even when locked.
const UNLOCKED_ROUTES = new Set<string>(["/settings", "/profile"]);

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();
  const { data: isActive } = useIsActive();
  const { data: me } = useCurrentRoles();
  const active = !!isActive;
  const locked = isActive === false;
  const badges = useBadges(active);

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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Redirect to /settings when locked and trying to access a restricted route.
  useEffect(() => {
    if (isActive === undefined) return;
    if (locked && !UNLOCKED_ROUTES.has(pathname)) {
      navigate({ to: "/settings", replace: true });
    }
  }, [isActive, locked, pathname, navigate]);

  async function signOut() {
    await qc.cancelQueries();
    const { error } = await supabase.auth.signOut();
    if (error) return toast.error(error.message);
    qc.clear();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarInner pathname={pathname} badges={badges} locked={locked} />
        <SidebarFooter profile={profile} initials={initials} onSignOut={signOut} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-sidebar">
            <div className="flex items-center justify-end p-2">
              <Button size="icon" variant="ghost" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarInner pathname={pathname} badges={badges} locked={locked} />
            <SidebarFooter profile={profile} initials={initials} onSignOut={signOut} />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              {titleFor(pathname)}
            </h1>
            {locked && (
              <span className="hidden items-center gap-1 rounded-full bg-brand-danger/15 px-2 py-0.5 text-[11px] font-bold text-brand-danger sm:inline-flex">
                <ShieldAlert className="h-3 w-3" /> Locked
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={toggle} title="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <NotificationsBell canSee={active || isOps(me?.roles ?? [])} />
          </div>
        </header>
        <main>
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NotificationsBell({ canSee }: { canSee: boolean }) {
  const qc = useQueryClient();
  const { data: notes = [] } = useQuery({
    queryKey: ["my-notifications"],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, category, hide_after, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const now = new Date();
      return (data ?? []).filter((n) => !n.hide_after || new Date(n.hide_after) > now);
    },
    refetchInterval: 30_000,
  });
  useEffect(() => {
    if (!canSee) return;
    const ch = supabase
      .channel("notif-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () =>
        qc.invalidateQueries({ queryKey: ["my-notifications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, canSee]);
  const unread = notes.filter((n) => !n.read_at).length;
  async function markRead(id: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["my-notifications"] });
  }
  async function markAllRead() {
    const ids = notes.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["my-notifications"] });
    toast.success("Marked all as read");
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="outline" className="relative" title="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-danger px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="text-sm font-semibold">Notifications</div>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-[11px] text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notes.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            notes.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={cn(
                  "w-full border-b border-border/60 px-3 py-2.5 text-left text-sm hover:bg-muted/40",
                  !n.read_at && "bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-medium">{n.title}</div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: false })}
                  </span>
                </div>
                {n.body && (
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                )}
                {n.category === "salary" && (
                  <div className="mt-1 inline-flex rounded-full bg-brand-success/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-success">
                    Salary · auto-hides in 24h
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function titleFor(path: string): string {
  const map: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/home": "Attendance",
    "/board": "Live Board",
    "/tasks": "Productivity",
    "/performance": "Performance",
    "/income": "Income",
    "/expenses": "Expenses",
    "/salary": "My Salary",
    "/reports": "Reports",
    "/documents": "Documents",
    "/sops": "SOPs & Policies",
    "/settings": "Settings",
    "/profile": "My Profile",
  };
  for (const k in map) if (path.startsWith(k)) return map[k];
  return "TNS Operations";
}

function SidebarInner({
  pathname,
  badges,
  locked,
}: {
  pathname: string;
  badges: { tasks: number; expenses: number };
  locked: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-6">
        <BrandLogo kind="mark" className="h-11 w-7 shrink-0" />
        <div>
          <div className="text-sm font-bold leading-tight tracking-tight">TNS Operations</div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Management System
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="space-y-0.5">
            <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.to || pathname.startsWith(item.to + "/");
              const disabled = locked && !UNLOCKED_ROUTES.has(item.to);
              const Icon = item.icon;
              const badge = disabled
                ? 0
                : item.badgeKey === "tasks"
                  ? badges.tasks
                  : item.badgeKey === "expenses"
                    ? badges.expenses
                    : 0;
              if (disabled) {
                return (
                  <div
                    key={item.to}
                    className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/30"
                    title="Confirm your matricule in Settings to unlock"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1 truncate">{item.label}</span>
                    <ShieldAlert className="h-3 w-3 opacity-60" />
                  </div>
                );
              }
              return (
                <Link
                  key={item.to}
                  to={item.to as "/home"}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-gradient-to-r from-primary/20 to-brand-purple/10 text-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge > 0 && (
                    <span className="ml-auto rounded-full bg-brand-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}

function SidebarFooter({
  profile,
  initials,
  onSignOut,
}: {
  profile:
    | { full_name?: string | null; email?: string | null; avatar_url?: string | null }
    | null
    | undefined;
  initials: string;
  onSignOut: () => void;
}) {
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-md px-2 py-2">
        <Avatar className="h-9 w-9">
          <AvatarImage src={profile?.avatar_url ?? undefined} />
          <AvatarFallback className="gradient-brand text-xs font-bold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{profile?.full_name || "Loading…"}</div>
          <div className="truncate text-xs text-muted-foreground">{profile?.email}</div>
        </div>
        <Button size="icon" variant="ghost" onClick={onSignOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
