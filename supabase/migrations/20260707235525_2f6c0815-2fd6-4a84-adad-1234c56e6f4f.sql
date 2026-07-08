
-- ==========================================================
-- ENUMS
-- ==========================================================
CREATE TYPE public.app_role AS ENUM ('administrator','operations_manager','finance_officer','department_head','staff');
CREATE TYPE public.attendance_event_type AS ENUM ('check_in','break_start','break_end','check_out');
CREATE TYPE public.task_status AS ENUM ('not_started','in_progress','waiting','completed','cancelled','overdue');
CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.expense_status AS ENUM ('pending','approved','paid','rejected');

-- ==========================================================
-- UPDATED_AT HELPER
-- ==========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ==========================================================
-- DEPARTMENTS
-- ==========================================================
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================================
-- PROFILES
-- ==========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  work_start_time TIME NOT NULL DEFAULT '09:00',
  work_end_time TIME NOT NULL DEFAULT '17:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================================
-- USER ROLES (separate table — required for security)
-- ==========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id
                   AND role IN ('administrator','operations_manager'));
$$;

CREATE OR REPLACE FUNCTION public.is_finance(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id
                   AND role IN ('administrator','finance_officer'));
$$;

-- ==========================================================
-- AUTO-CREATE PROFILE + DEFAULT ROLE ON SIGNUP
-- ==========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  SELECT NOT EXISTS(SELECT 1 FROM public.user_roles) INTO first_user;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN first_user THEN 'administrator'::public.app_role ELSE 'staff'::public.app_role END);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================================
-- PROFILES / DEPARTMENTS / ROLES POLICIES
-- ==========================================================
CREATE POLICY "profiles_select_all_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_admin_manage" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "departments_read_all" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments_admin_manage" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles_admin_read" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'administrator'));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

-- ==========================================================
-- ATTENDANCE
-- ==========================================================
CREATE TABLE public.attendance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type public.attendance_event_type NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  device TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attendance_user_time ON public.attendance_events (user_id, event_at DESC);
CREATE INDEX idx_attendance_time ON public.attendance_events (event_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_events TO authenticated;
GRANT ALL ON public.attendance_events TO service_role;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_read_own" ON public.attendance_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "attendance_read_manager" ON public.attendance_events FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
CREATE POLICY "attendance_insert_own" ON public.attendance_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "attendance_manager_manage" ON public.attendance_events FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- ==========================================================
-- TASKS
-- ==========================================================
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  deadline TIMESTAMPTZ,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.task_status NOT NULL DEFAULT 'not_started',
  progress INT NOT NULL DEFAULT 0,
  time_spent_minutes INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_assignee ON public.tasks (assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks (status);
CREATE INDEX idx_tasks_deadline ON public.tasks (deadline);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "tasks_read_participant" ON public.tasks FOR SELECT TO authenticated
  USING (auth.uid() = assigned_to OR auth.uid() = assigned_by OR public.is_manager(auth.uid()));
CREATE POLICY "tasks_insert_authenticated" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = assigned_by OR public.is_manager(auth.uid()));
CREATE POLICY "tasks_update_participant" ON public.tasks FOR UPDATE TO authenticated
  USING (auth.uid() = assigned_to OR auth.uid() = assigned_by OR public.is_manager(auth.uid()));
CREATE POLICY "tasks_delete_manager" ON public.tasks FOR DELETE TO authenticated
  USING (auth.uid() = assigned_by OR public.is_manager(auth.uid()));

CREATE TABLE public.task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_checklist_items TO authenticated;
GRANT ALL ON public.task_checklist_items TO service_role;
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_via_task" ON public.task_checklist_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id
    AND (auth.uid() = t.assigned_to OR auth.uid() = t.assigned_by OR public.is_manager(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id
    AND (auth.uid() = t.assigned_to OR auth.uid() = t.assigned_by OR public.is_manager(auth.uid()))));

CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_via_task" ON public.task_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id
    AND (auth.uid() = t.assigned_to OR auth.uid() = t.assigned_by OR public.is_manager(auth.uid()))));
CREATE POLICY "comments_insert_author" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id
      AND (auth.uid() = t.assigned_to OR auth.uid() = t.assigned_by OR public.is_manager(auth.uid()))));
CREATE POLICY "comments_update_author" ON public.task_comments FOR UPDATE TO authenticated USING (auth.uid() = author_id);
CREATE POLICY "comments_delete_author" ON public.task_comments FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.is_manager(auth.uid()));

-- ==========================================================
-- FINANCE MASTER LISTS
-- ==========================================================
CREATE TABLE public.income_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_sources TO authenticated;
GRANT ALL ON public.income_sources TO service_role;
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "income_sources_read_all" ON public.income_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "income_sources_finance_manage" ON public.income_sources FOR ALL TO authenticated
  USING (public.is_finance(auth.uid())) WITH CHECK (public.is_finance(auth.uid()));

CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  budget_monthly NUMERIC(14,2),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expense_categories_read_all" ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "expense_categories_finance_manage" ON public.expense_categories FOR ALL TO authenticated
  USING (public.is_finance(auth.uid())) WITH CHECK (public.is_finance(auth.uid()));

CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_methods_read_all" ON public.payment_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY "payment_methods_finance_manage" ON public.payment_methods FOR ALL TO authenticated
  USING (public.is_finance(auth.uid())) WITH CHECK (public.is_finance(auth.uid()));

-- ==========================================================
-- INCOME
-- ==========================================================
CREATE TABLE public.income_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  source_id UUID REFERENCES public.income_sources(id) ON DELETE SET NULL,
  description TEXT,
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  reference TEXT,
  house TEXT,
  initiative TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  attachment_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_income_date ON public.income_entries (entry_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_entries TO authenticated;
GRANT ALL ON public.income_entries TO service_role;
ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_income_updated BEFORE UPDATE ON public.income_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "income_read_finance_or_manager" ON public.income_entries FOR SELECT TO authenticated
  USING (public.is_finance(auth.uid()) OR public.is_manager(auth.uid()) OR auth.uid() = created_by);
CREATE POLICY "income_insert_authenticated" ON public.income_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "income_update_finance" ON public.income_entries FOR UPDATE TO authenticated
  USING (public.is_finance(auth.uid())) WITH CHECK (public.is_finance(auth.uid()));
CREATE POLICY "income_delete_finance" ON public.income_entries FOR DELETE TO authenticated
  USING (public.is_finance(auth.uid()));

-- ==========================================================
-- EXPENSES
-- ==========================================================
CREATE TABLE public.expense_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  reference TEXT,
  receipt_url TEXT,
  status public.expense_status NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expense_date ON public.expense_entries (entry_date DESC);
CREATE INDEX idx_expense_status ON public.expense_entries (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_entries TO authenticated;
GRANT ALL ON public.expense_entries TO service_role;
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_expense_updated BEFORE UPDATE ON public.expense_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "expense_read_finance_or_manager" ON public.expense_entries FOR SELECT TO authenticated
  USING (public.is_finance(auth.uid()) OR public.is_manager(auth.uid()) OR auth.uid() = created_by);
CREATE POLICY "expense_insert_authenticated" ON public.expense_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "expense_update_finance_or_owner_pending" ON public.expense_entries FOR UPDATE TO authenticated
  USING (public.is_finance(auth.uid()) OR (auth.uid() = created_by AND status = 'pending'))
  WITH CHECK (public.is_finance(auth.uid()) OR (auth.uid() = created_by AND status = 'pending'));
CREATE POLICY "expense_delete_finance" ON public.expense_entries FOR DELETE TO authenticated
  USING (public.is_finance(auth.uid()));

-- ==========================================================
-- NOTIFICATIONS
-- ==========================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ==========================================================
-- AUDIT LOG
-- ==========================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read_admin" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'administrator'));
CREATE POLICY "audit_insert_self" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);

-- ==========================================================
-- REALTIME
-- ==========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
