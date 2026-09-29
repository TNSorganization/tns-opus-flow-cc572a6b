-- Security and data-integrity hardening identified during the release audit.

-- ============================================================
-- 1. STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars',
    'avatars',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'documents',
    'documents',
    false,
    20971520,
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'application/rtf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
  ),
  ('receipts', 'receipts', false, 10485760, NULL),
  ('task-attachments', 'task-attachments', false, 20971520, NULL)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- 2. MATRICULE PRIVACY AND VALIDATION
-- ============================================================
REVOKE SELECT ON public.matricules FROM anon;
DROP POLICY IF EXISTS "public can validate unused matricules" ON public.matricules;
DROP POLICY IF EXISTS "admins manage matricules" ON public.matricules;
DROP POLICY IF EXISTS matricules_manage_leadership ON public.matricules;
DROP POLICY IF EXISTS matricules_read_leadership ON public.matricules;
DROP POLICY IF EXISTS matricules_insert_leadership ON public.matricules;
DROP POLICY IF EXISTS matricules_update_unused ON public.matricules;
DROP POLICY IF EXISTS matricules_delete_unused ON public.matricules;
DROP POLICY IF EXISTS matricules_read_own ON public.matricules;

CREATE POLICY matricules_read_leadership ON public.matricules
  FOR SELECT TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  );

CREATE POLICY matricules_insert_leadership ON public.matricules
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
    AND role <> 'ceo'::public.app_role
  );

CREATE POLICY matricules_update_unused ON public.matricules
  FOR UPDATE TO authenticated
  USING (
    used_by IS NULL
    AND public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  )
  WITH CHECK (
    used_by IS NULL
    AND public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
    AND role <> 'ceo'::public.app_role
  );

CREATE POLICY matricules_delete_unused ON public.matricules
  FOR DELETE TO authenticated
  USING (
    used_by IS NULL
    AND public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  );

CREATE POLICY matricules_read_own ON public.matricules
  FOR SELECT TO authenticated
  USING (used_by = auth.uid());

CREATE OR REPLACE FUNCTION public.validate_matricule(_code text, _email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matricules m
    WHERE m.code = upper(trim(_code))
      AND m.used_by IS NULL
      AND m.revoked_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at >= now())
      AND (m.email IS NULL OR lower(trim(m.email)) = lower(trim(_email)))
      AND m.role <> 'ceo'::public.app_role
  );
$$;

CREATE OR REPLACE FUNCTION public.redeem_matricule(_code text)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.matricules%ROWTYPE;
  _email text := auth.jwt() ->> 'email';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to redeem matricule';
  END IF;
  IF public.is_ceo(auth.uid()) THEN
    RAISE EXCEPTION 'The CEO account cannot redeem a staff matricule';
  END IF;
  IF public.is_active(auth.uid()) THEN
    RAISE EXCEPTION 'Active accounts cannot replace their role with another matricule';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('matricule:' || auth.uid()::text));

  SELECT * INTO _row
  FROM public.matricules
  WHERE code = upper(trim(_code))
    AND used_by IS NULL
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at >= now())
    AND (email IS NULL OR lower(trim(email)) = lower(trim(_email)))
    AND role <> 'ceo'::public.app_role
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired, already-used, or mismatched matricule';
  END IF;

  UPDATE public.matricules
  SET revoked_at = now()
  WHERE used_by = auth.uid()
    AND id <> _row.id
    AND revoked_at IS NULL;

  UPDATE public.matricules
  SET used_by = auth.uid(), used_at = now()
  WHERE id = _row.id;

  DELETE FROM public.user_roles WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), _row.role);
  RETURN _row.role;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_matricule(_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.matricules%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _row
  FROM public.matricules
  WHERE code = upper(trim(_code))
    AND used_by = auth.uid()
    AND revoked_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This matricule does not belong to you or has been revoked';
  END IF;
  IF _row.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'Matricule already confirmed'; END IF;
  UPDATE public.matricules SET confirmed_at = now() WHERE id = _row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_matricule(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_matricule(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_matricule(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_matricule(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_matricule(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_matricule(text) TO authenticated;

-- ============================================================
-- 3. CEO / ADMINISTRATION POLICY ALIGNMENT
-- ============================================================
DROP POLICY IF EXISTS "user_roles_admin_read" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_manage" ON public.user_roles;
DROP POLICY IF EXISTS user_roles_leadership_read ON public.user_roles;
DROP POLICY IF EXISTS user_roles_leadership_manage ON public.user_roles;

CREATE POLICY user_roles_leadership_read ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  );

CREATE POLICY user_roles_leadership_manage ON public.user_roles
  FOR ALL TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;

CREATE OR REPLACE FUNCTION public.protect_ceo_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ceo_count integer;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _ceo_count
  FROM public.user_roles
  WHERE role = 'ceo'::public.app_role;

  IF TG_OP = 'INSERT' AND NEW.role = 'ceo'::public.app_role THEN
    IF _ceo_count > 0 AND NOT public.is_ceo(auth.uid()) THEN
      RAISE EXCEPTION 'Only a CEO can grant the CEO role';
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.role = 'ceo'::public.app_role THEN
    IF NOT public.is_ceo(auth.uid()) THEN
      RAISE EXCEPTION 'Only a CEO can remove the CEO role';
    END IF;
    IF _ceo_count <= 1 THEN
      RAISE EXCEPTION 'The final CEO role cannot be removed';
    END IF;
  ELSIF TG_OP = 'UPDATE'
    AND (OLD.role = 'ceo'::public.app_role OR NEW.role = 'ceo'::public.app_role) THEN
    IF NOT public.is_ceo(auth.uid()) THEN
      RAISE EXCEPTION 'Only a CEO can change the CEO role';
    END IF;
    IF OLD.role = 'ceo'::public.app_role
      AND NEW.role <> 'ceo'::public.app_role
      AND _ceo_count <= 1 THEN
      RAISE EXCEPTION 'The final CEO role cannot be removed';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_ceo_role ON public.user_roles;
CREATE TRIGGER trg_protect_ceo_role
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_ceo_role();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _first_user boolean;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(trim(NEW.raw_user_meta_data ->> 'name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'New user'
    ),
    NEW.email,
    NEW.raw_user_meta_data ->> 'avatar_url'
  );

  -- Serialize the first-user check so concurrent signups cannot create two CEOs.
  PERFORM pg_advisory_xact_lock(hashtext('tns-opus-first-user'));
  SELECT
    (SELECT count(*) FROM public.profiles) = 1
    AND NOT EXISTS (SELECT 1 FROM public.user_roles)
  INTO _first_user;
  IF _first_user THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'ceo'::public.app_role);
  END IF;
  RETURN NEW;
END;
$$;

-- CEOs are permanent bootstrap accounts. Legacy Operations accounts that
-- predate matricules remain usable until a matricule is attached; once one is
-- attached, confirmation and revocation determine activation like every other
-- staff account.
CREATE OR REPLACE FUNCTION public.is_active(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid IS NOT NULL
    AND (
      public.is_ceo(_uid)
      OR EXISTS (
        SELECT 1
        FROM public.matricules m
        WHERE m.used_by = _uid
          AND m.confirmed_at IS NOT NULL
          AND m.revoked_at IS NULL
      )
      OR (
        public.has_role(_uid, 'operations_manager'::public.app_role)
        AND NOT EXISTS (
          SELECT 1 FROM public.matricules m WHERE m.used_by = _uid
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.revoke_matricule(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changed integer;
BEGIN
  IF NOT (public.is_active(auth.uid()) AND public.is_ceo(auth.uid())) THEN
    RAISE EXCEPTION 'Only the active CEO can revoke matricules';
  END IF;
  IF public.is_ceo(_user_id) THEN
    RAISE EXCEPTION 'A CEO account cannot be deactivated through a matricule';
  END IF;

  UPDATE public.matricules
  SET revoked_at = now(), revoked_by = auth.uid()
  WHERE used_by = _user_id AND revoked_at IS NULL;
  GET DIAGNOSTICS _changed = ROW_COUNT;
  IF _changed = 0 THEN RAISE EXCEPTION 'No active matricule found for this user'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (public.is_active(auth.uid()) AND public.is_ceo(auth.uid())) THEN
    RAISE EXCEPTION 'Only the active CEO can deactivate users';
  END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot deactivate your own account'; END IF;
  IF public.is_ceo(_user_id) THEN RAISE EXCEPTION 'A CEO account cannot be deactivated'; END IF;

  UPDATE public.matricules
  SET revoked_at = now(), revoked_by = auth.uid()
  WHERE used_by = _user_id AND revoked_at IS NULL;
  DELETE FROM public.user_roles WHERE user_id = _user_id;

  -- Keep the auth/profile row and historical foreign keys intact. RLS blocks the
  -- deactivated account, while Finance and Operations retain an auditable record.
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (
    auth.uid(),
    'deactivate_user',
    'profiles',
    _user_id,
    jsonb_build_object('deactivated_at', now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_user_role(
  _user_id uuid,
  _role public.app_role,
  _action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'Only the CEO or an administrator can manage roles';
  END IF;
  IF _role = 'ceo'::public.app_role AND NOT public.is_ceo(auth.uid()) THEN
    RAISE EXCEPTION 'Only a CEO can manage the CEO role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF _action = 'add' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF _action = 'remove' THEN
    DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role = _role;
  ELSE
    RAISE EXCEPTION 'Unsupported role action';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_user_role(uuid, public.app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_user_role(uuid, public.app_role, text) TO authenticated;

DROP POLICY IF EXISTS "departments_admin_manage" ON public.departments;
DROP POLICY IF EXISTS departments_leadership_manage ON public.departments;
CREATE POLICY departments_leadership_manage ON public.departments
  FOR ALL TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "audit_read_admin" ON public.audit_log;
DROP POLICY IF EXISTS audit_read_leadership ON public.audit_log;
CREATE POLICY audit_read_leadership ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  );

REVOKE INSERT ON public.audit_log FROM authenticated;

CREATE OR REPLACE FUNCTION public.list_active_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.avatar_url
  FROM public.profiles p
  WHERE public.is_active(auth.uid())
    AND public.is_active(p.id)
  ORDER BY p.full_name NULLS LAST, p.email NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.list_active_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_profiles() TO authenticated;

DROP POLICY IF EXISTS "folders_admin_manage" ON public.document_folders;
DROP POLICY IF EXISTS folders_manager_manage ON public.document_folders;
CREATE POLICY folders_manager_manage ON public.document_folders
  FOR ALL TO authenticated
  USING (public.is_active(auth.uid()) AND public.is_manager(auth.uid()))
  WITH CHECK (public.is_active(auth.uid()) AND public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "docs_update_owner_or_admin" ON public.documents;
DROP POLICY IF EXISTS "docs_delete_owner_or_admin" ON public.documents;
DROP POLICY IF EXISTS "docs_insert_own" ON public.documents;
DROP POLICY IF EXISTS docs_insert_own_path ON public.documents;
DROP POLICY IF EXISTS docs_update_owner_or_manager ON public.documents;
DROP POLICY IF EXISTS docs_delete_owner_or_manager ON public.documents;
CREATE POLICY docs_insert_own_path ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active(auth.uid())
    AND auth.uid() = uploaded_by
    AND file_path LIKE auth.uid()::text || '/%'
  );
CREATE POLICY docs_update_owner_or_manager ON public.documents
  FOR UPDATE TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (auth.uid() = uploaded_by OR public.is_manager(auth.uid()))
  )
  WITH CHECK (
    public.is_active(auth.uid())
    AND (auth.uid() = uploaded_by OR public.is_manager(auth.uid()))
  );
CREATE POLICY docs_delete_owner_or_manager ON public.documents
  FOR DELETE TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (auth.uid() = uploaded_by OR public.is_manager(auth.uid()))
  );

DROP POLICY IF EXISTS "documents_update_owner_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "documents_delete_owner_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "documents_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS documents_insert_own_path ON storage.objects;
DROP POLICY IF EXISTS documents_update_owner_or_manager ON storage.objects;
DROP POLICY IF EXISTS documents_delete_owner_or_manager ON storage.objects;
CREATE POLICY documents_insert_own_path ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.uid() = owner
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY documents_update_owner_or_manager ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.is_active(auth.uid())
    AND (auth.uid() = owner OR public.is_manager(auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND public.is_active(auth.uid())
    AND (auth.uid() = owner OR public.is_manager(auth.uid()))
  );
CREATE POLICY documents_delete_owner_or_manager ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.is_active(auth.uid())
    AND (auth.uid() = owner OR public.is_manager(auth.uid()))
  );

DROP POLICY IF EXISTS "storage_update_own" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete_own_or_finance" ON storage.objects;
DROP POLICY IF EXISTS "storage_read_signed_in" ON storage.objects;
DROP POLICY IF EXISTS "storage_insert_signed_in" ON storage.objects;
DROP POLICY IF EXISTS storage_read_authorized ON storage.objects;
DROP POLICY IF EXISTS storage_insert_own_path ON storage.objects;
CREATE POLICY storage_read_authorized ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('avatars', 'task-attachments')
    OR (
      bucket_id = 'receipts'
      AND (auth.uid() = owner OR public.is_finance(auth.uid()))
    )
  );
CREATE POLICY storage_insert_own_path ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('avatars', 'receipts', 'task-attachments')
    AND auth.uid() = owner
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY storage_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('avatars', 'receipts', 'task-attachments')
    AND auth.uid() = owner
  )
  WITH CHECK (
    bucket_id IN ('avatars', 'receipts', 'task-attachments')
    AND auth.uid() = owner
  );
CREATE POLICY storage_delete_own_or_finance ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('avatars', 'receipts', 'task-attachments')
    AND (
      auth.uid() = owner
      OR (bucket_id = 'receipts' AND public.is_finance(auth.uid()))
    )
  );

-- Profiles are created by the auth trigger. Clients may edit presentation fields,
-- but cannot forge the account email or delete profile rows directly.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, department_id, job_title) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON public.profiles;
DROP POLICY IF EXISTS profiles_read_active ON public.profiles;
DROP POLICY IF EXISTS profiles_read_active_or_self ON public.profiles;
CREATE POLICY profiles_read_active_or_self ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_active(auth.uid()) OR id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_manage" ON public.profiles;
DROP POLICY IF EXISTS profiles_leadership_update ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_leadership_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.is_ceo(auth.uid())
      OR public.has_role(auth.uid(), 'administrator'::public.app_role)
    )
  );

-- Existing table-specific policies still define who may perform each action.
-- These restrictive policies add the platform-wide activation requirement.
DO $$
DECLARE
  _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'departments',
    'attendance_events',
    'tasks',
    'task_checklist_items',
    'task_comments',
    'income_sources',
    'expense_categories',
    'payment_methods',
    'income_entries',
    'expense_entries',
    'notifications',
    'audit_log',
    'document_folders',
    'documents',
    'sops',
    'salaries',
    'salary_payments',
    'work_schedules',
    'absence_excuses'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS active_account_only ON public.%I', _table);
    EXECUTE format(
      'CREATE POLICY active_account_only ON public.%I AS RESTRICTIVE
       FOR ALL TO authenticated
       USING (public.is_active(auth.uid()))
       WITH CHECK (public.is_active(auth.uid()))',
      _table
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS storage_active_account_only ON storage.objects;
CREATE POLICY storage_active_account_only ON storage.objects AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.is_active(auth.uid()))
  WITH CHECK (public.is_active(auth.uid()));

-- ============================================================
-- 4. SERVER-CONTROLLED TASK TRANSITIONS
-- ============================================================
DROP POLICY IF EXISTS tasks_insert_ops ON public.tasks;
DROP POLICY IF EXISTS tasks_update_rules ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_manager ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_ops ON public.tasks;

CREATE POLICY tasks_insert_ops ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_ops(auth.uid())
    AND assigned_by = auth.uid()
    AND (assigned_to IS NULL OR public.is_active(assigned_to))
  );
CREATE POLICY tasks_update_rules ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_ops(auth.uid()))
  WITH CHECK (public.is_ops(auth.uid()));
CREATE POLICY tasks_delete_ops ON public.tasks
  FOR DELETE TO authenticated
  USING (public.is_ops(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_task_status(
  _task_id uuid,
  _status public.task_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task public.tasks%ROWTYPE;
  _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_active(_actor) THEN RAISE EXCEPTION 'Account is not active'; END IF;

  SELECT * INTO _task
  FROM public.tasks
  WHERE id = _task_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  IF NOT public.is_ops(_actor) THEN
    IF _task.assigned_to IS DISTINCT FROM _actor THEN
      RAISE EXCEPTION 'You are not assigned to this task';
    END IF;
    IF NOT (
      (_task.status = 'not_started'::public.task_status AND _status = 'in_progress'::public.task_status)
      OR (_task.status = 'in_progress'::public.task_status AND _status = 'submitted'::public.task_status)
      OR (_task.status IN ('waiting'::public.task_status, 'overdue'::public.task_status)
          AND _status = 'in_progress'::public.task_status)
    ) THEN
      RAISE EXCEPTION 'This task transition is not allowed';
    END IF;
  END IF;

  UPDATE public.tasks
  SET status = _status,
      completed_at = CASE
        WHEN _status = 'completed'::public.task_status THEN now()
        ELSE NULL
      END,
      progress = CASE
        WHEN _status = 'completed'::public.task_status THEN 100
        WHEN _status = 'not_started'::public.task_status OR _task.status = 'completed'::public.task_status THEN 0
        ELSE progress
      END
  WHERE id = _task_id;
END;
$$;

REVOKE UPDATE ON public.tasks FROM authenticated;
REVOKE ALL ON FUNCTION public.set_task_status(uuid, public.task_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_task_status(uuid, public.task_status) TO authenticated;

-- ============================================================
-- 5. SERVER-CONTROLLED ATTENDANCE EVENTS
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_attendance_event(
  _event_type public.attendance_event_type,
  _gps_lat double precision DEFAULT NULL,
  _gps_lng double precision DEFAULT NULL,
  _device text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _last public.attendance_event_type;
  _event_id uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_active(_actor) THEN RAISE EXCEPTION 'Account is not active'; END IF;
  IF (_gps_lat IS NULL) <> (_gps_lng IS NULL) THEN
    RAISE EXCEPTION 'Latitude and longitude must be supplied together';
  END IF;
  IF _gps_lat IS NOT NULL AND (_gps_lat < -90 OR _gps_lat > 90) THEN
    RAISE EXCEPTION 'Invalid latitude';
  END IF;
  IF _gps_lng IS NOT NULL AND (_gps_lng < -180 OR _gps_lng > 180) THEN
    RAISE EXCEPTION 'Invalid longitude';
  END IF;

  -- Keep concurrent taps or requests from observing the same previous event.
  PERFORM pg_advisory_xact_lock(hashtext('attendance:' || _actor::text));

  SELECT event_type INTO _last
  FROM public.attendance_events
  WHERE user_id = _actor
    AND timezone('Africa/Douala', event_at)::date = timezone('Africa/Douala', now())::date
  ORDER BY event_at DESC
  LIMIT 1;

  IF _last IS NULL AND _event_type <> 'check_in'::public.attendance_event_type THEN
    RAISE EXCEPTION 'Check in before recording another attendance event';
  ELSIF _last IN ('check_in'::public.attendance_event_type, 'break_end'::public.attendance_event_type)
    AND _event_type NOT IN ('break_start'::public.attendance_event_type, 'check_out'::public.attendance_event_type) THEN
    RAISE EXCEPTION 'Invalid attendance event sequence';
  ELSIF _last = 'break_start'::public.attendance_event_type
    AND _event_type NOT IN ('break_end'::public.attendance_event_type, 'check_out'::public.attendance_event_type) THEN
    RAISE EXCEPTION 'Invalid attendance event sequence';
  ELSIF _last = 'check_out'::public.attendance_event_type
    AND _event_type <> 'check_in'::public.attendance_event_type THEN
    RAISE EXCEPTION 'Check in to start a new work session';
  END IF;

  INSERT INTO public.attendance_events (
    user_id, event_type, event_at, gps_lat, gps_lng, device
  )
  VALUES (
    _actor, _event_type, now(), _gps_lat, _gps_lng, left(_device, 200)
  )
  RETURNING id INTO _event_id;

  RETURN _event_id;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON public.attendance_events FROM authenticated;
REVOKE ALL ON FUNCTION public.record_attendance_event(
  public.attendance_event_type, double precision, double precision, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_attendance_event(
  public.attendance_event_type, double precision, double precision, text
) TO authenticated;

-- ============================================================
-- 6. FINANCIAL INTEGRITY
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'income_amount_positive'
      AND conrelid = 'public.income_entries'::regclass
  ) THEN
    ALTER TABLE public.income_entries
      ADD CONSTRAINT income_amount_positive CHECK (amount > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expense_amount_positive'
      AND conrelid = 'public.expense_entries'::regclass
  ) THEN
    ALTER TABLE public.expense_entries
      ADD CONSTRAINT expense_amount_positive CHECK (amount > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salary_amount_nonnegative'
      AND conrelid = 'public.salaries'::regclass
  ) THEN
    ALTER TABLE public.salaries
      ADD CONSTRAINT salary_amount_nonnegative CHECK (amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salary_currency_valid'
      AND conrelid = 'public.salaries'::regclass
  ) THEN
    ALTER TABLE public.salaries
      ADD CONSTRAINT salary_currency_valid CHECK (currency IN ('XCFA', 'USD')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salary_payment_amount_positive'
      AND conrelid = 'public.salary_payments'::regclass
  ) THEN
    ALTER TABLE public.salary_payments
      ADD CONSTRAINT salary_payment_amount_positive CHECK (amount > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salary_payment_currency_valid'
      AND conrelid = 'public.salary_payments'::regclass
  ) THEN
    ALTER TABLE public.salary_payments
      ADD CONSTRAINT salary_payment_currency_valid CHECK (currency IN ('XCFA', 'USD')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salary_payment_period_valid'
      AND conrelid = 'public.salary_payments'::regclass
  ) THEN
    ALTER TABLE public.salary_payments
      ADD CONSTRAINT salary_payment_period_valid
      CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$') NOT VALID;
  END IF;
END;
$$;

DROP POLICY IF EXISTS expense_insert_finance_or_request ON public.expense_entries;
CREATE POLICY expense_insert_finance_or_request ON public.expense_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active(auth.uid())
    AND
    auth.uid() = created_by
    AND (
      (
        public.is_finance(auth.uid())
        AND (
          status = 'pending'::public.expense_status
          OR (
            status IN ('approved'::public.expense_status, 'paid'::public.expense_status)
            AND approved_by = auth.uid()
            AND approved_at IS NOT NULL
          )
        )
      )
      OR (
        public.can_request_funds(auth.uid())
        AND status = 'pending'::public.expense_status
        AND approved_by IS NULL
        AND approved_at IS NULL
      )
    )
  );

CREATE OR REPLACE FUNCTION public.set_salary(_user uuid, _amount numeric, _currency text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_active(auth.uid()) AND public.is_finance(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _amount IS NULL OR _amount < 0 THEN RAISE EXCEPTION 'Salary cannot be negative'; END IF;
  IF _currency NOT IN ('XCFA', 'USD') THEN RAISE EXCEPTION 'Unsupported currency'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user) OR NOT public.is_active(_user) THEN
    RAISE EXCEPTION 'Active user not found';
  END IF;

  INSERT INTO public.salaries (user_id, amount, currency, updated_at, updated_by)
  VALUES (_user, _amount, _currency, now(), auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        updated_at = now(),
        updated_by = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.run_payroll(_period text, _note text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sender uuid := auth.uid();
  _paid integer := 0;
  _rec record;
  _payment_id uuid;
BEGIN
  IF NOT (public.is_active(_sender) AND public.is_finance(_sender)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _period IS NULL OR _period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Payroll period must use YYYY-MM';
  END IF;
  IF length(COALESCE(_note, '')) > 200 THEN RAISE EXCEPTION 'Payroll note is too long'; END IF;

  FOR _rec IN
    SELECT s.user_id, s.amount, s.currency
    FROM public.salaries s
    WHERE s.amount > 0
      AND public.is_active(s.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.salary_payments sp
        WHERE sp.user_id = s.user_id AND sp.period = _period
      )
  LOOP
    _payment_id := NULL;
    INSERT INTO public.salary_payments (user_id, amount, currency, period, note, created_by)
    VALUES (_rec.user_id, _rec.amount, _rec.currency, _period, _note, _sender)
    ON CONFLICT (user_id, period) DO NOTHING
    RETURNING id INTO _payment_id;
    IF _payment_id IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.notifications (user_id, title, body, kind, category, hide_after, sent_by)
    VALUES (
      _rec.user_id,
      'Salary paid',
      'Your salary for ' || _period || ' has been paid: ' || _rec.currency || ' ' || _rec.amount::text,
      'salary',
      'salary',
      now() + interval '24 hours',
      _sender
    );
    _paid := _paid + 1;
  END LOOP;
  RETURN _paid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_salary(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_payroll(text, text) FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.salaries FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.salary_payments FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_salary(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_payroll(text, text) TO authenticated;

-- ============================================================
-- 7. NOTIFICATION SENDER INTEGRITY
-- ============================================================
DROP POLICY IF EXISTS notifications_insert_senders ON public.notifications;
CREATE POLICY notifications_insert_senders ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    sent_by = auth.uid()
    AND public.is_active(auth.uid())
    AND (public.can_send_notifications(auth.uid()) OR public.is_finance(auth.uid()))
  );

REVOKE INSERT, UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.send_notification(
  _title text,
  _body text,
  _target text,
  _target_role public.app_role DEFAULT NULL,
  _target_user uuid DEFAULT NULL,
  _category text DEFAULT 'broadcast',
  _hide_after timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sender uuid := auth.uid();
  _count integer := 0;
BEGIN
  IF NOT (
    public.is_active(_sender)
    AND (public.can_send_notifications(_sender) OR public.is_finance(_sender))
  ) THEN
    RAISE EXCEPTION 'Not authorized to send notifications';
  END IF;
  IF trim(COALESCE(_title, '')) = '' OR length(_title) > 200 THEN
    RAISE EXCEPTION 'Notification title is required and must be at most 200 characters';
  END IF;
  IF length(COALESCE(_body, '')) > 2000 THEN RAISE EXCEPTION 'Notification body is too long'; END IF;

  IF _target = 'user' THEN
    IF _target_user IS NULL OR NOT public.is_active(_target_user) THEN
      RAISE EXCEPTION 'Choose a valid notification recipient';
    END IF;
    INSERT INTO public.notifications (user_id, title, body, kind, category, hide_after, sent_by)
    VALUES (
      _target_user,
      trim(_title),
      _body,
      COALESCE(NULLIF(trim(_category), ''), 'broadcast'),
      COALESCE(NULLIF(trim(_category), ''), 'broadcast'),
      _hide_after,
      _sender
    );
    _count := 1;
  ELSIF _target = 'role' THEN
    IF _target_role IS NULL THEN RAISE EXCEPTION 'Choose a notification role'; END IF;
    INSERT INTO public.notifications (user_id, title, body, kind, category, hide_after, sent_by)
    SELECT DISTINCT
      ur.user_id,
      trim(_title),
      _body,
      COALESCE(NULLIF(trim(_category), ''), 'broadcast'),
      COALESCE(NULLIF(trim(_category), ''), 'broadcast'),
      _hide_after,
      _sender
    FROM public.user_roles ur
    WHERE ur.role = _target_role
      AND public.is_active(ur.user_id);
    GET DIAGNOSTICS _count = ROW_COUNT;
  ELSIF _target = 'all' THEN
    INSERT INTO public.notifications (user_id, title, body, kind, category, hide_after, sent_by)
    SELECT
      p.id,
      trim(_title),
      _body,
      COALESCE(NULLIF(trim(_category), ''), 'broadcast'),
      COALESCE(NULLIF(trim(_category), ''), 'broadcast'),
      _hide_after,
      _sender
    FROM public.profiles p
    WHERE public.is_active(p.id);
    GET DIAGNOSTICS _count = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Unsupported notification target';
  END IF;

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.send_notification(
  text, text, text, public.app_role, uuid, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_notification(
  text, text, text, public.app_role, uuid, text, timestamptz
) TO authenticated;

-- ============================================================
-- 8. LIMIT EXECUTION OF PRIVILEGED HELPERS / RPCs
-- ============================================================
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_manager(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_finance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_ceo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_ops(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_request_funds(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_send_notifications(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_matricule(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ceo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ops(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_request_funds(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_notifications(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_matricule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
