
-- ============================================================
-- 1. MATRICULE: confirmation + revocation
-- ============================================================
ALTER TABLE public.matricules
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id);

-- ============================================================
-- 2. ROLE HELPERS — updated to include CEO
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_ceo(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'ceo'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id
                   AND role IN ('ceo'::public.app_role, 'administrator'::public.app_role, 'operations_manager'::public.app_role));
$$;

CREATE OR REPLACE FUNCTION public.is_finance(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id
                   AND role IN ('ceo'::public.app_role, 'administrator'::public.app_role, 'finance_officer'::public.app_role));
$$;

CREATE OR REPLACE FUNCTION public.is_ops(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _uid
                   AND role IN ('ceo'::public.app_role, 'operations_manager'::public.app_role));
$$;

CREATE OR REPLACE FUNCTION public.can_request_funds(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _uid
                   AND role IN ('ceo'::public.app_role, 'administrator'::public.app_role,
                                'operations_manager'::public.app_role, 'department_head'::public.app_role));
$$;

CREATE OR REPLACE FUNCTION public.can_send_notifications(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _uid
                   AND role IN ('ceo'::public.app_role, 'operations_manager'::public.app_role,
                                'programs_officer'::public.app_role));
$$;

-- is_active: CEO and Operations are always active; everyone else needs a
-- confirmed, non-revoked matricule.
CREATE OR REPLACE FUNCTION public.is_active(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _uid IS NOT NULL AND (
      public.is_ops(_uid)
      OR EXISTS (
        SELECT 1 FROM public.matricules
        WHERE used_by = _uid
          AND confirmed_at IS NOT NULL
          AND revoked_at IS NULL
      )
    );
$$;

-- ============================================================
-- 3. PROMOTE EXISTING ADMIN(S) → CEO
-- ============================================================
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'ceo'::public.app_role FROM public.user_roles
WHERE role = 'administrator'::public.app_role
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. NEW-USER TRIGGER: first user becomes CEO (not administrator)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  SELECT NOT EXISTS(SELECT 1 FROM public.user_roles) INTO first_user;
  IF first_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'ceo'::public.app_role);
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. MATRICULE RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_matricule(_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.matricules%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _row FROM public.matricules
  WHERE code = _code AND used_by = auth.uid() AND revoked_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This matricule does not belong to you or has been revoked'; END IF;
  IF _row.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'Matricule already confirmed'; END IF;
  UPDATE public.matricules SET confirmed_at = now() WHERE id = _row.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_matricule(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_ceo(auth.uid()) THEN RAISE EXCEPTION 'Only the CEO can revoke matricules'; END IF;
  UPDATE public.matricules
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE used_by = _user_id AND revoked_at IS NULL;
END;
$$;

-- ============================================================
-- 6. FIRE USER (updated): also revoke matricule; CEO-only
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT (public.is_ceo(auth.uid()) OR public.has_role(auth.uid(), 'administrator'::app_role)) THEN
    RAISE EXCEPTION 'Only CEO / Administrator can delete users';
  END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot delete your own account'; END IF;
  UPDATE public.matricules SET revoked_at = now(), revoked_by = auth.uid()
    WHERE used_by = _user_id AND revoked_at IS NULL;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  UPDATE public.tasks SET assigned_to = NULL WHERE assigned_to = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

-- ============================================================
-- 7. ATTENDANCE VISIBILITY FIX — active users see the whole board
-- ============================================================
DROP POLICY IF EXISTS attendance_read_own ON public.attendance_events;
DROP POLICY IF EXISTS attendance_read_manager ON public.attendance_events;
CREATE POLICY attendance_read_active ON public.attendance_events
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()) OR auth.uid() = user_id);

-- profiles: same treatment so the Live Board can show names for everyone
DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
DROP POLICY IF EXISTS profiles_read_all ON public.profiles;
DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read_active ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 8. INCOME: finance/CEO delete only (already exists; ensure)
-- ============================================================
-- income_delete_finance already scoped to is_finance which now includes CEO.

-- ============================================================
-- 9. EXPENSES: broaden fund requesters (dept_head OR admin OR ops OR ceo)
-- ============================================================
DROP POLICY IF EXISTS expense_insert_finance_or_head ON public.expense_entries;
CREATE POLICY expense_insert_finance_or_request ON public.expense_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND (
      public.is_finance(auth.uid())
      OR (public.can_request_funds(auth.uid()) AND status = 'pending'::expense_status)
    )
  );

-- ============================================================
-- 10. NOTIFICATIONS: sender permissions + salary category
-- ============================================================
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS hide_after timestamptz,
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES auth.users(id);

DROP POLICY IF EXISTS notifications_own ON public.notifications;
CREATE POLICY notifications_read_own ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY notifications_insert_senders ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.can_send_notifications(auth.uid()) OR public.is_finance(auth.uid()));

-- Broadcast RPC: create one notification row per targeted user
CREATE OR REPLACE FUNCTION public.send_notification(
  _title text, _body text, _target text, _target_role public.app_role DEFAULT NULL,
  _target_user uuid DEFAULT NULL, _category text DEFAULT 'broadcast', _hide_after timestamptz DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sender uuid := auth.uid(); _count integer := 0;
BEGIN
  IF NOT (public.can_send_notifications(_sender) OR public.is_finance(_sender)) THEN
    RAISE EXCEPTION 'Not authorized to send notifications';
  END IF;
  IF _target = 'user' AND _target_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, category, hide_after, sent_by)
      VALUES (_target_user, _title, _body, _category, _hide_after, _sender);
    _count := 1;
  ELSIF _target = 'role' AND _target_role IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, category, hide_after, sent_by)
      SELECT DISTINCT ur.user_id, _title, _body, _category, _hide_after, _sender
      FROM public.user_roles ur WHERE ur.role = _target_role;
    GET DIAGNOSTICS _count = ROW_COUNT;
  ELSE
    INSERT INTO public.notifications (user_id, title, body, category, hide_after, sent_by)
      SELECT p.id, _title, _body, _category, _hide_after, _sender FROM public.profiles p;
    GET DIAGNOSTICS _count = ROW_COUNT;
  END IF;
  RETURN _count;
END;
$$;

-- ============================================================
-- 11. SALARY LEDGER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.salaries (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'XCFA',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salaries TO authenticated;
GRANT ALL ON public.salaries TO service_role;
ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY salaries_read_owner_finance ON public.salaries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_finance(auth.uid()));
CREATE POLICY salaries_write_finance ON public.salaries
  FOR ALL TO authenticated
  USING (public.is_finance(auth.uid())) WITH CHECK (public.is_finance(auth.uid()));

CREATE TABLE IF NOT EXISTS public.salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'XCFA',
  period text NOT NULL,          -- e.g. '2026-07'
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (user_id, period)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_payments TO authenticated;
GRANT ALL ON public.salary_payments TO service_role;
ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_read_owner_finance ON public.salary_payments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_finance(auth.uid()));
CREATE POLICY sp_write_finance ON public.salary_payments
  FOR ALL TO authenticated
  USING (public.is_finance(auth.uid())) WITH CHECK (public.is_finance(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_salary(_user uuid, _amount numeric, _currency text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_finance(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.salaries (user_id, amount, currency, updated_at, updated_by)
    VALUES (_user, _amount, COALESCE(_currency, 'XCFA'), now(), auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET amount = EXCLUDED.amount, currency = EXCLUDED.currency,
        updated_at = now(), updated_by = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.run_payroll(_period text, _note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sender uuid := auth.uid(); _paid integer := 0; _rec record;
BEGIN
  IF NOT public.is_finance(_sender) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  FOR _rec IN SELECT s.user_id, s.amount, s.currency FROM public.salaries s
              WHERE s.amount > 0
                AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.user_id)
                AND NOT EXISTS (SELECT 1 FROM public.salary_payments sp
                                WHERE sp.user_id = s.user_id AND sp.period = _period)
  LOOP
    INSERT INTO public.salary_payments (user_id, amount, currency, period, note, created_by)
      VALUES (_rec.user_id, _rec.amount, _rec.currency, _period, _note, _sender);
    INSERT INTO public.notifications (user_id, title, body, category, hide_after, sent_by)
      VALUES (_rec.user_id, 'Salary paid',
              'Your salary for ' || _period || ' has been paid: ' ||
              _rec.currency || ' ' || _rec.amount::text,
              'salary', now() + interval '24 hours', _sender);
    _paid := _paid + 1;
  END LOOP;
  RETURN _paid;
END;
$$;

-- ============================================================
-- 12. WORK SCHEDULES + ABSENCE EXCUSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.work_schedules (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  monday boolean NOT NULL DEFAULT true,
  tuesday boolean NOT NULL DEFAULT true,
  wednesday boolean NOT NULL DEFAULT true,
  thursday boolean NOT NULL DEFAULT true,
  friday boolean NOT NULL DEFAULT true,
  saturday boolean NOT NULL DEFAULT false,
  sunday boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_schedules TO authenticated;
GRANT ALL ON public.work_schedules TO service_role;
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY ws_read_all ON public.work_schedules
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()) OR auth.uid() = user_id);
CREATE POLICY ws_write_ops ON public.work_schedules
  FOR ALL TO authenticated
  USING (public.is_ops(auth.uid())) WITH CHECK (public.is_ops(auth.uid()));

CREATE TABLE IF NOT EXISTS public.absence_excuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  excuse_date date NOT NULL,
  reason text,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, excuse_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absence_excuses TO authenticated;
GRANT ALL ON public.absence_excuses TO service_role;
ALTER TABLE public.absence_excuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY ae_read_all ON public.absence_excuses
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()) OR auth.uid() = user_id);
CREATE POLICY ae_write_ops ON public.absence_excuses
  FOR ALL TO authenticated
  USING (public.is_ops(auth.uid())) WITH CHECK (public.is_ops(auth.uid()));

-- ============================================================
-- 13. PROFILES: add avatar upload path, dept/title already fine
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS job_title text;

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_ceo(auth.uid()))
  WITH CHECK (auth.uid() = id OR public.is_ceo(auth.uid()));

-- ============================================================
-- 14. REALTIME publication
-- ============================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.matricules;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.salary_payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.work_schedules;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.absence_excuses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 15. SEED default departments (if empty)
-- ============================================================
INSERT INTO public.departments (name)
SELECT x FROM (VALUES ('Administration'),('Finance'),('Operations'),('Programs'),
                     ('Systems & Tech'),('Marketing')) AS t(x)
WHERE NOT EXISTS (SELECT 1 FROM public.departments WHERE name = t.x);

-- ============================================================
-- 16. Update triggers for new tables
-- ============================================================
DROP TRIGGER IF EXISTS trg_salaries_updated ON public.salaries;
CREATE TRIGGER trg_salaries_updated BEFORE UPDATE ON public.salaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_ws_updated ON public.work_schedules;
CREATE TRIGGER trg_ws_updated BEFORE UPDATE ON public.work_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
