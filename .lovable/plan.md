# Match the Prototype: Full TOS v2

Adopts the uploaded prototype's look and structure, then wires real backend for every page. Keeps existing Attendance/Tasks/Finance data but reshapes UI, splits pages, and adds three new modules.

## Visual System (prototype-faithful)

- Indigo→purple gradients on primary actions, avatars, logo tile.
- Card style: soft rounded (16px), 1px translucent border, hover lift + shadow.
- Colored icon tiles per KPI (green/red/blue/purple/orange/teal/pink/yellow).
- Staff cards with colored 3px top-border by status (present/break/absent/off).
- Sidebar sections: Overview · Workforce · Finance · Knowledge.
- Theme toggle: dark (default) + light, persisted in localStorage.
- Global search box in top bar (staff / tasks / transactions).
- Toast pattern via existing sonner.
- Keep Geist typography.

## Navigation restructure

Split current pages and add new ones:

```
/dashboard        Executive overview (dual-currency, Who's In, Pending Tasks)
/attendance      Self actions + Today grid + Weekly chart
/board           Live status board (keep)
/tasks           Productivity + KPIs + filters
/performance     Rankings, breakdown table, ring scores (NEW)
/income          Split from finance (NEW page)
/expenses        Split from finance + Pending approvals (NEW page)
/reports         Daily/Weekly/Monthly/Annual cards + summary chart
/documents       File library w/ folder tree (NEW)
/sops            SOPs + Policies (NEW)
/settings        Keep
```

## Backend changes (one migration)

New / altered tables:

- `income_entries` + `expense_entries`: add `currency TEXT NOT NULL DEFAULT 'XCFA'` (CHECK in {'XCFA','USD'}).
- `documents` — id, folder, name, description, file_path (storage), mime, size, uploaded_by, timestamps. RLS: authenticated read/insert; delete by uploader or admin.
- `document_folders` — seeded: Contracts, Meeting Minutes, Receipts, Staff Files, Organization.
- `sops` — id, kind ('sop'|'policy'), title, content (markdown), version, status ('draft'|'active'|'archived'), owner_id, timestamps. RLS: authenticated read; managers write.
- Storage bucket `documents` (private) with policies mirroring receipts bucket.
- Performance view: SQL view `staff_performance_v` combining attendance %, task completion %, deadline accuracy over trailing 30 days, per user — read directly by /performance page.

Existing tables untouched otherwise. GRANTs + RLS included for every new table.

## Page-by-page implementation

**Dashboard** — 4 KPI cards (Staff Present, Tasks Completed, Cash XCFA, Cash USD), two doughnut charts (attendance status, task completion), "Who's In" staff grid (live from `attendance_events`), "Pending Tasks" list.

**Attendance** — Existing 4 buttons + staff grid + Recharts weekly bar chart from `attendance_events`.

**Tasks** — Existing kanban replaced with the prototype's task-list rows: checkbox, title, meta (assignee, department, deadline, priority tag). Filter tabs (All/Pending/Progress/Overdue/Completed).

**Performance** — Reads `staff_performance_v`. Top / bottom performer cards, horizontal bar chart of scores, breakdown table with per-metric ring scores.

**Income** — KPIs (today/week/month, top source), Recharts (source doughnut, 14-day line), transactions table, currency toggle filters by `currency`.

**Expenses** — KPIs, dept doughnut, cash-flow line (income vs expense), pending approvals table with Approve/Reject buttons (managers only, updates `status`).

**Reports** — Four period cards → open a summary sheet, existing CSV export kept, Recharts monthly summary bars.

**Documents** — Folder tree left, doc grid right; upload → Supabase Storage (`documents` bucket) + row in `documents`. Click to download signed URL.

**SOPs** — Two sections (SOPs / Policies) as list rows. Create/edit modal with markdown textarea; render with simple `react-markdown`.

## Technical notes

- Currency toggle stored per-page in local state; DB column drives filter.
- All new queries via `supabase` client + TanStack Query.
- Recharts already in stack; add `react-markdown` for SOPs.
- Performance view uses `SECURITY INVOKER` so RLS on underlying tables applies.
- Global search: client-side across cached queries for v1.

## Order

1. Migration (currency + documents + sops + performance view + bucket).
2. Restyle tokens (styles.css) + app-shell (sidebar sections, top bar search, theme toggle).
3. Split finance → income.tsx + expenses.tsx (+ approval action).
4. Restyle dashboard, attendance, tasks pages to prototype cards/lists.
5. New pages: performance, documents, sops.
6. Reports page tweaks.

Ships as one large change set. Existing data preserved.
