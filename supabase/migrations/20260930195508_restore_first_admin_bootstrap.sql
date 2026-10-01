-- An empty workspace must be able to create its first administrator before any
-- matricules exist. This public function reveals only whether setup is open.
CREATE OR REPLACE FUNCTION public.is_admin_bootstrap_available()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM auth.users)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles);
$$;

REVOKE ALL ON FUNCTION public.is_admin_bootstrap_available() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_bootstrap_available() TO anon, authenticated;

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

  -- Serialize concurrent signups. Once the first transaction commits, every
  -- waiting transaction sees that an earlier Auth user already exists.
  PERFORM pg_advisory_xact_lock(hashtext('tns-opus-first-user'));
  SELECT
    NOT EXISTS (SELECT 1 FROM auth.users WHERE id <> NEW.id)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles)
  INTO _first_user;

  IF _first_user OR public.is_trusted_owner(NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'ceo'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
