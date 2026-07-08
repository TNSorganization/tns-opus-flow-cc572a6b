
# TNS Operations System (TOS) — v1 Build Plan

One system, one login, four surfaces: **Attendance · Tasks · Finance · Dashboard/Reports**. Built for ~10 staff with room to grow. Knowledge/Documents deferred.

## Design direction
- Aesthetic: Linear/Stripe/Notion — minimal, fast, mobile-first, dark mode by default with light toggle.
- Type: **Geist Sans** (UI) + **Geist Mono** (numbers/timestamps). Tight tracking, generous whitespace.
- Palette: near-black surfaces, off-white text, one accent (electric indigo), semantic status colors (green/yellow/blue/red/grey per your spec).
- Motion: subtle — 150ms ease transitions, no bounces.
- Almost no tables. Cards, KPIs, sparklines, progress rings, bar/area charts (Recharts).

## Modules

### 1. Attendance
- Home = 4 giant buttons: Check In / Start Break / End Break / Check Out. State-aware (only shows next valid action).
- Each event stamps: timestamp, GPS (if granted), user-agent, user.
- Auto-derived per day: arrival, departure, total hours, break minutes, productive minutes, lateness, overtime.
- **Live board** (Ops Manager): grid of staff chips color-coded Green/Yellow/Blue/Red/Grey with current status + time-in-status.
- Weekly/monthly attendance %, avg arrival, avg departure.

### 2. Productivity (Tasks)
- Task fields: title, description, department, priority, deadline, assigner, assignee, status, progress %, time spent, checklist, comments, attachments.
- Statuses: Not Started, In Progress, Waiting, Completed, Cancelled, Overdue (auto-flip past deadline).
- Views: My Tasks (kanban), All Tasks (filterable), per-employee page.
- Per-staff **Performance Index** = weighted(Attendance, Completion, Deadline Accuracy, Consistency). Recomputed nightly + on write.

### 3. Finance
- **Flexible** income sources and expense categories — user creates/edits them; nothing hard-coded. Seeded with sensible defaults (Membership, Coaching, Gifts, Loans, Sales, Funding / Salaries, Rent, Utilities, Supplies, Transport, etc.) that can be renamed or deleted.
- Income entry: date, amount, source, description, received-by, payment method, reference, house, initiative, category, tags, attachment.
- Expense entry: date, amount, department, purpose, approved-by, paid-by, method, reference, receipt upload, status (Pending → Approved → Paid → Rejected).
- Auto-computed: today/week/month totals, cash balance, net cash flow, largest income/expense, top source, top spending dept, most-used method, avg transaction, txn count, MoM comparison.
- Charts: cash-flow area, income vs expense bars, category pie.
- **Alerts** (rule engine): expense > 2× 30-day avg, income drop > 40%, duplicate ref within 7d, budget exceeded per category.

### 4. Executive Dashboard
- Today: present/absent/on-break counts, tasks done/pending, money in/out, cash balance.
- Week: attendance %, completion %, revenue, expenses, profit, top/lowest performer, most overdue.
- Month: attendance graph, productivity graph, cash-flow graph, performance ranking, dept summary.

### 5. Reports
- Daily / Weekly / Monthly (Quarterly/Annual scaffolded).
- Export **PDF, Excel, CSV**. Generated on-demand server-side.

## Roles
Administrator · Operations Manager · Finance Officer · Department Head · Staff. Enforced via Postgres RLS + `has_role()` security-definer function. Route-level gates in `_authenticated/`.

## Notifications
In-app notification center + toast. Triggers: late arrival, missing checkout (nightly cron), task overdue, income logged, large expense, approval pending, deadline tomorrow, budget exceeded.

## Search
Global ⌘K palette: employees, tasks, departments, dates, methods, sources, amounts, categories.

## Technical

**Stack:** TanStack Start (already scaffolded) + Lovable Cloud (Supabase) for auth, Postgres, Storage, RLS, realtime.

**Schema (high-level):**
- `profiles` (id → auth.users, name, department_id, avatar)
- `user_roles` (user_id, role enum) + `has_role()` SECURITY DEFINER
- `departments`
- `attendance_events` (user, type, ts, gps, device) → view `attendance_daily`
- `tasks` + `task_comments` + `task_attachments` + `task_checklist_items`
- `income_sources`, `expense_categories`, `payment_methods` (user-editable)
- `income_entries`, `expense_entries` (+ receipts in Storage)
- `performance_scores` (materialized nightly)
- `notifications`
- `audit_log`

**Realtime:** Attendance board + dashboard KPIs subscribe to changes.

**Server functions** for: performance recompute, alert evaluation, report generation (PDF via server-side render, XLSX via `exceljs`).

**Files:** Supabase Storage buckets `receipts` (private), `avatars` (public), `task-attachments` (private).

## Build order (this turn + next)
1. Enable Lovable Cloud, create schema + RLS + seeds.
2. Design system (Geist, tokens, dark default, shadcn variants).
3. Auth + role gate + shell (sidebar nav, top bar, ⌘K).
4. Attendance module + live board.
5. Tasks module + kanban.
6. Finance module + charts + alerts.
7. Executive Dashboard.
8. Reports + exports.
9. Notifications + cron (missing checkout, overdue tasks).

This is a large build — I'll ship it in staged, working slices so you can use each module the moment it lands rather than waiting for the whole thing.

## Approve to start?
Reply **go** and I'll enable Cloud, ship the schema + design system + shell + Attendance in the first slice, then move through Tasks → Finance → Dashboard → Reports.
