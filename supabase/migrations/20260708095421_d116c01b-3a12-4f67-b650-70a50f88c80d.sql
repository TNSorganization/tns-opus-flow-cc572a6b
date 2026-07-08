
ALTER TABLE public.income_entries
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'XCFA'
  CHECK (currency IN ('XCFA','USD'));
ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'XCFA'
  CHECK (currency IN ('XCFA','USD'));

CREATE TABLE IF NOT EXISTS public.document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  color TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_folders TO authenticated;
GRANT ALL ON public.document_folders TO service_role;
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folders_read_all" ON public.document_folders FOR SELECT TO authenticated USING (true);
CREATE POLICY "folders_admin_manage" ON public.document_folders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrator')) WITH CHECK (public.has_role(auth.uid(),'administrator'));

INSERT INTO public.document_folders (name, icon, color, sort_order) VALUES
  ('Contracts','file-contract','accent',1),
  ('Meeting Minutes','file-alt','info',2),
  ('Receipts','receipt','success',3),
  ('Staff Files','user-tie','purple',4),
  ('Organization','building','orange',5)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES public.document_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docs_read_all" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "docs_insert_own" ON public.documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "docs_update_owner_or_admin" ON public.documents FOR UPDATE TO authenticated
  USING (auth.uid() = uploaded_by OR public.has_role(auth.uid(),'administrator'))
  WITH CHECK (auth.uid() = uploaded_by OR public.has_role(auth.uid(),'administrator'));
CREATE POLICY "docs_delete_owner_or_admin" ON public.documents FOR DELETE TO authenticated
  USING (auth.uid() = uploaded_by OR public.has_role(auth.uid(),'administrator'));
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('sop','policy')),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sops TO authenticated;
GRANT ALL ON public.sops TO service_role;
ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sops_read_all" ON public.sops FOR SELECT TO authenticated USING (true);
CREATE POLICY "sops_manager_manage" ON public.sops FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE TRIGGER trg_sops_updated BEFORE UPDATE ON public.sops FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
