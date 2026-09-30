import type { ReactNode } from "react";
import { CheckCircle2, LockKeyhole, RadioTower } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const buildSha = import.meta.env.VITE_BUILD_SHA?.slice(0, 7) || "local";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="auth-canvas">
      <div className="auth-orbit auth-orbit-one" />
      <div className="auth-orbit auth-orbit-two" />

      <section className="auth-frame">
        <aside className="auth-story">
          <BrandLogo kind="logo" className="w-48" />
          <div className="mt-auto max-w-lg">
            <p className="auth-kicker">One organization. One source of truth.</p>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-white xl:text-5xl">
              Run the work. See the whole circle.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/65">
              Attendance, delivery, finance, programs, and institutional knowledge in one calm
              operating space.
            </p>
          </div>
          <div className="mt-10 grid gap-3 text-xs text-white/70 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <div className="auth-proof">
              <LockKeyhole className="h-4 w-4" /> Secure access
            </div>
            <div className="auth-proof">
              <RadioTower className="h-4 w-4" /> Live operations
            </div>
            <div className="auth-proof">
              <CheckCircle2 className="h-4 w-4" /> One workspace
            </div>
          </div>
        </aside>

        <div className="auth-panel">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <BrandLogo kind="logo" className="w-36" />
            <span className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
              v{buildSha}
            </span>
          </div>

          <div className="min-w-0 w-full max-w-md">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6">{footer}</div>}
          </div>

          <div className="mt-10 hidden min-w-0 w-full max-w-md items-center justify-between text-[11px] text-muted-foreground lg:flex">
            <span>TNS Opus</span>
            <span className="font-mono">build {buildSha}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
