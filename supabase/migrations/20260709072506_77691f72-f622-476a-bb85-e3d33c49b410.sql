
CREATE TABLE public.matricules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  full_name TEXT,
  email TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matricules TO authenticated;
GRANT SELECT ON public.matricules TO anon;
GRANT ALL ON public.matricules TO service_role;

ALTER TABLE public.matricules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage matricules" ON public.matricules
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'administrator'))
WITH CHECK (public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "public can validate unused matricules" ON public.matricules
FOR SELECT TO anon, authenticated
USING (used_by IS NULL AND (expires_at IS NULL OR expires_at > now()));

CREATE TRIGGER trg_matricules_updated
BEFORE UPDATE ON public.matricules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.redeem_matricule(_code TEXT)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.matricules%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to redeem matricule';
  END IF;
  SELECT * INTO _row FROM public.matricules
  WHERE code = _code AND used_by IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already-used matricule';
  END IF;
  UPDATE public.matricules SET used_by = auth.uid(), used_at = now() WHERE id = _row.id;
  DELETE FROM public.user_roles WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), _row.role);
  RETURN _row.role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_matricule(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF first_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'administrator'::public.app_role);
  END IF;
  RETURN NEW;
END;
$$;

-- Enable realtime (idempotent)
ALTER TABLE public.attendance_events REPLICA IDENTITY FULL;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.task_checklist_items REPLICA IDENTITY FULL;
ALTER TABLE public.expense_entries REPLICA IDENTITY FULL;
ALTER TABLE public.income_entries REPLICA IDENTITY FULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_events','tasks','task_checklist_items','expense_entries','income_entries']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
