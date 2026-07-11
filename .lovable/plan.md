
# TNS Platform Overhaul

This is a large change — grouped into one migration + a coordinated frontend pass so nothing ships half-built.

## 1. Roles & permissions

New `app_role` values: `ceo`, `programs_officer`. Keep `administrator`, `operations_manager`, `finance_officer`, `department_head`, `staff`. The first user to sign up becomes `ceo` (not administrator).

Helper SQL functions:
- `is_ceo(uid)` — CEO only, can do everything.
- `is_admin_or_ceo(uid)` — administrator or CEO (view-all + some actions).
- `is_ops(uid)` — operations_manager or CEO.
- `is_finance(uid)` — finance_officer or CEO.
- `can_request_funds(uid)` — dept_head, administrator, ops, ceo.
- `can_send_notifications(uid)` — programs_officer, ops, ceo.
- `is_active(uid)` — has a redeemed, non-revoked matricule OR is ceo/ops (gate exemption).

## 2. Matricule: signup + re-confirm + revoke

- Signup still requires a matricule (as today).
- New column `matricules.revoked_at`. When CEO fires a user or revokes their matricule, `is_active(uid)` returns false → app locks to Settings only.
- New concept **matricule confirmation**: after signup, user must go to Settings → "Confirm my matricule" and re-enter the code once. Sets `matricules.confirmed_at`. Until then, `is_active()` is false. Once confirmed, it can never be re-confirmed.
- If a user is fired: matricule is revoked, all their data access zeros out via RLS + client-side gate. CEO can issue a new matricule; user re-confirms to unlock.
- CEO and operations_manager are always active (never gated).

Frontend: `AppShell` reads `is_active` — if false, sidebar shows only "Settings"; every other route redirects to `/settings` with a "Confirm your matricule" panel.

## 3. 6-digit numeric PIN

Signup + reset forms accept only 6 digits (numeric input, `pattern="\d{6}"`, maxLength 6). Stored via Supabase Auth normally (6 chars satisfies Supabase's min).

## 4. Live board visibility fix

Current `attendance_events` SELECT policy likely restricts to `user_id = auth.uid()`. Change to: any authenticated + active user can SELECT all attendance rows (needed to see the org's live status). Insert stays self-only.

## 5. Finance & expenses

- `income_entries` DELETE policy → finance_officer + CEO only.
- Expenses "Request funds" button visible to `can_request_funds` roles → inserts row with `status='pending'`, `kind='fund_request'` (new column). Only finance/CEO can `approve`/`reject`/`delete`.
- Approvals list highlights pending fund requests.

## 6. Private salary box

New table `salary_ledger` (user_id, amount, currency, period, paid_at, note). RLS: SELECT for owner + finance + ceo; INSERT/UPDATE/DELETE for finance + ceo only. Salary amount set by CEO/finance.

Payday flow: finance clicks "Mark payroll paid" → inserts a `salary_ledger` row per active staff + creates one personal notification per user ("Your salary of X was paid"). Notification auto-hides after 24 h (client-side filter `created_at > now() - 24h` for the payday type, or a `hide_after` column).

New page: `/salary` (self view of own current balance/last payment). Finance sees the full ledger and a "Run payroll" action.

## 7. Attendance & schedules

New table `work_schedules` (user_id, weekday 0–6, is_working_day bool). Ops sets who works which days. Default: Mon–Fri working.

New table `absence_excuses` (user_id, date, reason, granted_by). Only ops can insert/delete.

Live board and performance derive absence from:
`is_working_day AND no check_in for date AND no excuse` → flagged red. Ops has an "Excuse" button per row.

## 8. Notifications

- `notifications` INSERT policy: `can_send_notifications`.
- New notification composer for programs_officer/ops/ceo (target: everyone, a role, or a specific user).
- Bell in header shows unread count; auto-invalidate via realtime.

## 9. Profile customization

`/profile` page (accessible to any authenticated + active user):
- Edit full name, avatar (upload to `avatars` bucket).
- Change password (6-digit PIN).
- Read-only: email, role, department.

## 10. Performance fix

Actual root cause: current query counts only `status='completed'`, but new flow ends at `submitted → validated`. Also denominators are wrong.

Rewrite metric to:
- **Attendance score** = present days / (working days per schedule − excused).
- **Task score** = validated tasks / assigned tasks (window: last 30 days).
- **Punctuality** = on-time check-ins / present days.
- Composite ranking with sensible weights (40/40/20).

## 11. Departments seed

Seed `departments`: Administration, Finance, Operations, Programs, Systems & Tech, Marketing. Profiles get a `department_id` FK + `job_title` text (already present or added). Settings gets a "Team roster" grid where CEO assigns department + title per user.

---

## Technical notes

- One migration file with all schema + policy changes, ordered so grants/policies exist before frontend hits them.
- Realtime publications extended to: `matricules`, `salary_ledger`, `absence_excuses`, `work_schedules`, `notifications`.
- Existing `administrator` users are preserved; user (you) manually promotes self to `ceo` via a seed statement in the migration (the sole existing admin).
- Client gate lives in `app-shell.tsx` reading a `useIsActive()` hook (queries `is_active` RPC).
- Files touched: ~15 route/component files + 1 migration + 2 new hooks + 2 new pages (`/profile`, `/salary`) + `types.ts` regeneration.

## Out of scope for this turn

- Logistics module (inventory, POs, equipment, missions) — still pending from earlier; will follow after this lands.
- Email delivery of matricules (still manual copy/paste).

Confirm and I'll ship it.
