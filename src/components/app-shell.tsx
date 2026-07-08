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
  Search,
  Moon,
  Sun,
  Users2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "@/hooks/use-theme";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  badgeKey?: "tasks" | "expenses";
};

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutGrid }],
  },
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
    label: "System",
    items: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
];

function useBadges() {
  const { data: tasks = 0 } = useQuery({
    queryKey: ["badge-tasks-overdue"],
    queryFn: async () => {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .lt("deadline", new Date().toISOString())
        .not("status", "in", "(completed,cancelled)");
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
  const { data: expenses = 0 } = useQuery({
    queryKey: ["badge-expenses-pending"],
    queryFn: async () => {
      const { count } = await supabase
        .from("expense_entries")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
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
  const badges = useBadges();

  const { data: profile } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("id", u.user.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const pageTitle = titleFor(pathname);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarInner pathname={pathname} badges={badges} />
        <SidebarFooter profile={profile} initials={initials} onSignOut={signOut} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-sidebar">
            <div className="flex items-center justify-end p-2">
              <Button size="icon" variant="ghost" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarInner pathname={pathname} badges={badges} />
            <SidebarFooter profile={profile} initials={initials} onSignOut={signOut} />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search staff, tasks, transactions…"
                className="h-9 w-72 rounded-md border border-border bg-muted/40 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <Button size="icon" variant="outline" onClick={toggle} title="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="outline" className="relative" title="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main>
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function titleFor(path: string): string {
  if (path.startsWith("/dashboard")) return "Dashboard";
  if (path.startsWith("/home")) return "Attendance";
  if (path.startsWith("/board")) return "Live Board";
  if (path.startsWith("/tasks")) return "Productivity";
  if (path.startsWith("/performance")) return "Performance";
  if (path.startsWith("/income")) return "Income";
  if (path.startsWith("/expenses")) return "Expenses";
  if (path.startsWith("/reports")) return "Reports";
  if (path.startsWith("/documents")) return "Documents";
  if (path.startsWith("/sops")) return "SOPs & Policies";
  if (path.startsWith("/settings")) return "Settings";
  return "TNS Operations";
}

function SidebarInner({
  pathname,
  badges,
}: {
  pathname: string;
  badges: { tasks: number; expenses: number };
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="gradient-brand flex h-10 w-10 items-center justify-center rounded-md text-lg font-extrabold text-white">
          T
        </div>
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
              const Icon = item.icon;
              const badge =
                item.badgeKey === "tasks"
                  ? badges.tasks
                  : item.badgeKey === "expenses"
                    ? badges.expenses
                    : 0;
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
  profile: { full_name?: string | null; email?: string | null; avatar_url?: string | null } | null | undefined;
  initials: string;
  onSignOut: () => void;
}) {
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-md px-2 py-2">
        <Avatar className="h-9 w-9">
          <AvatarImage src={profile?.avatar_url ?? undefined} />
          <AvatarFallback className="gradient-brand text-xs font-bold text-white">{initials}</AvatarFallback>
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
