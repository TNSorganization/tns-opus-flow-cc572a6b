import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type IconTone =
  | "primary"
  | "purple"
  | "pink"
  | "teal"
  | "orange"
  | "yellow"
  | "info"
  | "success"
  | "danger";

const TONE_BG: Record<IconTone, string> = {
  primary: "bg-primary/15 text-primary",
  purple: "bg-brand-purple/15 text-brand-purple",
  pink: "bg-brand-pink/15 text-brand-pink",
  teal: "bg-brand-teal/15 text-brand-teal",
  orange: "bg-brand-orange/15 text-brand-orange",
  yellow: "bg-brand-yellow/15 text-brand-yellow",
  info: "bg-brand-info/15 text-brand-info",
  success: "bg-brand-success/15 text-brand-success",
  danger: "bg-brand-danger/15 text-brand-danger",
};

export function KpiCard({
  icon,
  tone = "primary",
  value,
  label,
  change,
  changeTone,
  suffix,
}: {
  icon: ReactNode;
  tone?: IconTone;
  value: ReactNode;
  label: string;
  change?: string;
  changeTone?: "up" | "down";
  suffix?: ReactNode;
}) {
  return (
    <div className="tos-card">
      <div className="mb-4 flex items-center justify-between">
        <div className={cn("icon-tile", TONE_BG[tone])}>{icon}</div>
      </div>
      <div className="text-3xl font-extrabold tracking-tight kpi-number">
        {value}
        {suffix && <span className="ml-1 text-lg text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-1 text-sm font-medium text-muted-foreground">{label}</div>
      {change && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
            changeTone === "down"
              ? "bg-brand-danger/10 text-brand-danger"
              : "bg-brand-success/10 text-brand-success",
          )}
        >
          {change}
        </div>
      )}
    </div>
  );
}

export function SectionHeader({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      {children ?? (action && <div className="text-sm font-semibold text-primary">{action}</div>)}
    </div>
  );
}
