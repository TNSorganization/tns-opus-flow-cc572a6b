-- The organization mailbox is the durable bootstrap owner. This check uses the
-- protected Auth email, never user-editable metadata or a public profile field.
CREATE OR REPLACE FUNCTION public.is_trusted_owner(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS users
    WHERE users.id = _uid
      AND lower(trim(COALESCE(users.email, ''))) = 'tnsorganization@gmail.com'
  );
$$;

REVOKE ALL ON FUNCTION public.is_trusted_owner(uuid) FROM PUBLIC, anon, authenticated;

-- Treat the verified organization mailbox as CEO even while its role row is
-- being bootstrapped by the Auth trigger.
CREATE OR REPLACE FUNCTION public.is_ceo(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_trusted_owner(_uid)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _uid
        AND role = 'ceo'::public.app_role
    );
$$;

REVOKE ALL ON FUNCTION public.is_ceo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_ceo(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_ceo_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _ceo_count integer;
  _target_user_id uuid;
  _target_is_trusted_owner boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    _target_user_id := OLD.user_id;
  ELSE
    _target_user_id := NEW.user_id;
  END IF;
  _target_is_trusted_owner := public.is_trusted_owner(_target_user_id);

  SELECT count(*) INTO _ceo_count
  FROM public.user_roles
  WHERE role = 'ceo'::public.app_role;

  IF TG_OP = 'INSERT' AND NEW.role = 'ceo'::public.app_role THEN
    IF _ceo_count > 0
      AND NOT _target_is_trusted_owner
      AND NOT public.is_ceo(auth.uid()) THEN
      RAISE EXCEPTION 'Only a CEO can grant the CEO role';
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.role = 'ceo'::public.app_role THEN
    IF _target_is_trusted_owner THEN
      RAISE EXCEPTION 'The TNS owner role cannot be removed';
    END IF;
    IF NOT public.is_ceo(auth.uid()) THEN
      RAISE EXCEPTION 'Only a CEO can remove the CEO role';
    END IF;
    IF _ceo_count <= 1 THEN
      RAISE EXCEPTION 'The final CEO role cannot be removed';
    END IF;
  ELSIF TG_OP = 'UPDATE'
    AND (OLD.role = 'ceo'::public.app_role OR NEW.role = 'ceo'::public.app_role) THEN
    IF OLD.role = 'ceo'::public.app_role
      AND public.is_trusted_owner(OLD.user_id)
      AND (NEW.role <> 'ceo'::public.app_role OR NEW.user_id <> OLD.user_id) THEN
      RAISE EXCEPTION 'The TNS owner role cannot be changed';
    END IF;
    IF NOT public.is_ceo(auth.uid())
      AND NOT (NEW.role = 'ceo'::public.app_role AND _target_is_trusted_owner) THEN
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

REVOKE ALL ON FUNCTION public.protect_ceo_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_ceo_role ON public.user_roles;
CREATE TRIGGER trg_protect_ceo_role
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_ceo_role();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

  -- Serialize role bootstrapping so concurrent signups cannot race.
  PERFORM pg_advisory_xact_lock(hashtext('tns-opus-first-user'));
  IF public.is_trusted_owner(NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'ceo'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    SELECT
      (SELECT count(*) FROM public.profiles) = 1
      AND NOT EXISTS (SELECT 1 FROM public.user_roles)
    INTO _first_user;
    IF _first_user THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'ceo'::public.app_role);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Repair an owner account that was created before this migration.
INSERT INTO public.user_roles (user_id, role)
SELECT users.id, 'ceo'::public.app_role
FROM auth.users AS users
WHERE lower(trim(COALESCE(users.email, ''))) = 'tnsorganization@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
