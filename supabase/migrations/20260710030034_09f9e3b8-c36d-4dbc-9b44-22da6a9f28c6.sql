
-- Add 'submitted' status (before completion, awaiting validation).
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'submitted';

-- ============ TASKS: only Operations/CEO create, only they validate ============
DROP POLICY IF EXISTS tasks_insert_authenticated ON public.tasks;
DROP POLICY IF EXISTS tasks_update_participant ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_manager ON public.tasks;
DROP POLICY IF EXISTS tasks_read_participant ON public.tasks;

CREATE POLICY tasks_read_all ON public.tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY tasks_insert_ops ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()) AND auth.uid() = assigned_by);

-- Assignee can move task through statuses but cannot set 'completed'.
-- Only ops/CEO can set 'completed'. Anyone with edit access can revert.
CREATE POLICY tasks_update_rules ON public.tasks FOR UPDATE TO authenticated
  USING (auth.uid() = assigned_to OR auth.uid() = assigned_by OR public.is_manager(auth.uid()))
  WITH CHECK (
    public.is_manager(auth.uid())
    OR status <> 'completed'::task_status
  );

CREATE POLICY tasks_delete_manager ON public.tasks FOR DELETE TO authenticated
  USING (public.is_manager(auth.uid()));

-- ============ INCOME: only Finance/CEO enter ============
DROP POLICY IF EXISTS income_insert_authenticated ON public.income_entries;
DROP POLICY IF EXISTS income_read_finance_or_manager ON public.income_entries;

CREATE POLICY income_read_all ON public.income_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY income_insert_finance ON public.income_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_finance(auth.uid()) AND auth.uid() = created_by);

-- ============ EXPENSES: Finance/CEO enter, Dept Heads may request (pending) ============
DROP POLICY IF EXISTS expense_insert_authenticated ON public.expense_entries;
DROP POLICY IF EXISTS expense_read_finance_or_manager ON public.expense_entries;

CREATE POLICY expense_read_all ON public.expense_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY expense_insert_finance_or_head ON public.expense_entries FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND (
      public.is_finance(auth.uid())
      OR (public.has_role(auth.uid(), 'department_head'::app_role) AND status = 'pending'::expense_status)
    )
  );

-- ============ DELETE USER (fire staff) — CEO only ============
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrator'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can delete users';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.matricules WHERE used_by = _user_id;
  UPDATE public.tasks SET assigned_to = NULL WHERE assigned_to = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
