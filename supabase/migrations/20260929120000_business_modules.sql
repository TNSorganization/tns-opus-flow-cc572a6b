-- Restore the business modules that were built in the Replit continuation.
-- This migration is safe for a fresh database and for a database where the
-- earlier draft migration was only partially applied.

CREATE TABLE IF NOT EXISTS public.logistics_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  item_category text NOT NULL CHECK (item_category IN ('owned', 'needed', 'rented')),
  state text CHECK (state IN ('good', 'fair', 'poor', 'broken')),
  quantity integer DEFAULT 1 CHECK (quantity >= 0),
  model text,
  location text,
  image_url text,
  wear_tear_days integer,
  wear_tear_reset_at timestamptz DEFAULT now(),
  contact_info text,
  displacement_days integer CHECK (displacement_days >= 0),
  rent_amount numeric(12, 2) CHECK (rent_amount >= 0),
  rent_start_at timestamptz,
  rent_end_at timestamptz,
  responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'development'
    CHECK (status IN ('development', 'review', 'deployed', 'dormant', 'decommissioned')),
  description text,
  build_cost numeric(12, 2) CHECK (build_cost >= 0),
  build_start_at date,
  build_end_at date,
  unit_price numeric(12, 2) CHECK (unit_price >= 0),
  registered_count integer NOT NULL DEFAULT 0 CHECK (registered_count >= 0),
  orders_placed integer NOT NULL DEFAULT 0 CHECK (orders_placed >= 0),
  orders_delivered integer NOT NULL DEFAULT 0 CHECK (orders_delivered >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  program_type text NOT NULL
    CHECK (program_type IN ('campaign', 'experience', 'development', 'mentorship')),
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'running', 'paused', 'stopped', 'decommissioned')),
  frequency text
    CHECK (frequency IN ('one-time', 'weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly')),
  money_in numeric(12, 2) NOT NULL DEFAULT 0 CHECK (money_in >= 0),
  money_out numeric(12, 2) NOT NULL DEFAULT 0 CHECK (money_out >= 0),
  description text,
  responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.program_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  frequency text,
  cost_in numeric(12, 2) NOT NULL DEFAULT 0 CHECK (cost_in >= 0),
  cost_out numeric(12, 2) NOT NULL DEFAULT 0 CHECK (cost_out >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.program_activities(id) ON DELETE CASCADE,
  period text NOT NULL,
  report_text text,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  house text NOT NULL CHECK (house IN ('maja', 'yon', 'nuru', 'meyana', 'lomari')),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (
      status IN (
        'submitted',
        'validated',
        'selected',
        'running',
        'rejected',
        'completed',
        'resubmitted'
      )
    ),
  document_url text,
  start_date date,
  end_date date,
  description text,
  responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.media_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  page_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  followers integer NOT NULL DEFAULT 0 CHECK (followers >= 0),
  total_interactions integer NOT NULL DEFAULT 0 CHECK (total_interactions >= 0),
  total_views integer NOT NULL DEFAULT 0 CHECK (total_views >= 0),
  total_likes integer NOT NULL DEFAULT 0 CHECK (total_likes >= 0),
  total_comments integer NOT NULL DEFAULT 0 CHECK (total_comments >= 0),
  total_reshares integer NOT NULL DEFAULT 0 CHECK (total_reshares >= 0),
  total_saves integer NOT NULL DEFAULT 0 CHECK (total_saves >= 0),
  new_followers integer NOT NULL DEFAULT 0 CHECK (new_followers >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.media_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_type text NOT NULL DEFAULT 'individual'
    CHECK (service_type IN ('individual', 'application')),
  cost numeric(12, 2) CHECK (cost >= 0),
  contact_or_link text,
  efficiency_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  what_they_do text,
  what_they_do_best text,
  worked_before boolean NOT NULL DEFAULT false,
  recommendation text
    CHECK (recommendation IN ('contract', 'try_again', 'not_recommended', 'never')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The first draft omitted these fields even though its frontend used them.
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_info text;

ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_info text;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS logistics_items_category_idx
  ON public.logistics_items(item_category);
CREATE INDEX IF NOT EXISTS logistics_items_responsible_idx
  ON public.logistics_items(responsible_user_id);
CREATE INDEX IF NOT EXISTS products_status_idx ON public.products(status);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products(category_id);
CREATE INDEX IF NOT EXISTS programs_status_idx ON public.programs(status);
CREATE INDEX IF NOT EXISTS programs_responsible_idx ON public.programs(responsible_user_id);
CREATE INDEX IF NOT EXISTS program_activities_program_idx
  ON public.program_activities(program_id);
CREATE INDEX IF NOT EXISTS activity_reports_activity_idx
  ON public.activity_reports(activity_id);
CREATE INDEX IF NOT EXISTS initiatives_house_status_idx
  ON public.initiatives(house, status);
CREATE INDEX IF NOT EXISTS initiatives_responsible_idx
  ON public.initiatives(responsible_user_id);
CREATE INDEX IF NOT EXISTS media_platforms_status_idx
  ON public.media_platforms(status);

DROP TRIGGER IF EXISTS trg_logistics_items_updated ON public.logistics_items;
CREATE TRIGGER trg_logistics_items_updated
  BEFORE UPDATE ON public.logistics_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated ON public.products;
CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_programs_updated ON public.programs;
CREATE TRIGGER trg_programs_updated
  BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_initiatives_updated ON public.initiatives;
CREATE TRIGGER trg_initiatives_updated
  BEFORE UPDATE ON public.initiatives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_media_platforms_updated ON public.media_platforms;
CREATE TRIGGER trg_media_platforms_updated
  BEFORE UPDATE ON public.media_platforms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.logistics_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_services ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.logistics_items FROM anon, authenticated;
REVOKE ALL ON public.product_categories FROM anon, authenticated;
REVOKE ALL ON public.products FROM anon, authenticated;
REVOKE ALL ON public.programs FROM anon, authenticated;
REVOKE ALL ON public.program_activities FROM anon, authenticated;
REVOKE ALL ON public.activity_reports FROM anon, authenticated;
REVOKE ALL ON public.initiatives FROM anon, authenticated;
REVOKE ALL ON public.media_platforms FROM anon, authenticated;
REVOKE ALL ON public.media_services FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistics_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_activities TO authenticated;
GRANT SELECT, INSERT ON public.activity_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.initiatives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_platforms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_services TO authenticated;

GRANT ALL ON public.logistics_items TO service_role;
GRANT ALL ON public.product_categories TO service_role;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.programs TO service_role;
GRANT ALL ON public.program_activities TO service_role;
GRANT ALL ON public.activity_reports TO service_role;
GRANT ALL ON public.initiatives TO service_role;
GRANT ALL ON public.media_platforms TO service_role;
GRANT ALL ON public.media_services TO service_role;

DROP POLICY IF EXISTS "Authenticated users can view logistics" ON public.logistics_items;
DROP POLICY IF EXISTS "Ops/Admin can manage logistics" ON public.logistics_items;
DROP POLICY IF EXISTS business_logistics_read ON public.logistics_items;
DROP POLICY IF EXISTS business_logistics_manage ON public.logistics_items;
CREATE POLICY business_logistics_read ON public.logistics_items
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY business_logistics_manage ON public.logistics_items
  FOR ALL TO authenticated
  USING (public.is_active(auth.uid()) AND public.is_manager(auth.uid()))
  WITH CHECK (public.is_active(auth.uid()) AND public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view product categories" ON public.product_categories;
DROP POLICY IF EXISTS "Ops/Admin can manage product categories" ON public.product_categories;
DROP POLICY IF EXISTS business_product_categories_read ON public.product_categories;
DROP POLICY IF EXISTS business_product_categories_manage ON public.product_categories;
CREATE POLICY business_product_categories_read ON public.product_categories
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY business_product_categories_manage ON public.product_categories
  FOR ALL TO authenticated
  USING (public.is_active(auth.uid()) AND public.is_manager(auth.uid()))
  WITH CHECK (public.is_active(auth.uid()) AND public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Ops/Admin can manage products" ON public.products;
DROP POLICY IF EXISTS business_products_read ON public.products;
DROP POLICY IF EXISTS business_products_manage ON public.products;
CREATE POLICY business_products_read ON public.products
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY business_products_manage ON public.products
  FOR ALL TO authenticated
  USING (public.is_active(auth.uid()) AND public.is_manager(auth.uid()))
  WITH CHECK (public.is_active(auth.uid()) AND public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view programs" ON public.programs;
DROP POLICY IF EXISTS "Ops/Admin/Programs can manage programs" ON public.programs;
DROP POLICY IF EXISTS business_programs_read ON public.programs;
DROP POLICY IF EXISTS business_programs_manage ON public.programs;
CREATE POLICY business_programs_read ON public.programs
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY business_programs_manage ON public.programs
  FOR ALL TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  );
DROP POLICY IF EXISTS "Authenticated users can view program activities" ON public.program_activities;
DROP POLICY IF EXISTS "Ops/Admin/Programs can manage program activities" ON public.program_activities;
DROP POLICY IF EXISTS business_program_activities_read ON public.program_activities;
DROP POLICY IF EXISTS business_program_activities_manage ON public.program_activities;
CREATE POLICY business_program_activities_read ON public.program_activities
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY business_program_activities_manage ON public.program_activities
  FOR ALL TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view activity reports" ON public.activity_reports;
DROP POLICY IF EXISTS "Authenticated users can submit activity reports" ON public.activity_reports;
DROP POLICY IF EXISTS business_activity_reports_read ON public.activity_reports;
DROP POLICY IF EXISTS business_activity_reports_insert ON public.activity_reports;
CREATE POLICY business_activity_reports_read ON public.activity_reports
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY business_activity_reports_insert ON public.activity_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active(auth.uid())
    AND submitted_by = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated users can view initiatives" ON public.initiatives;
DROP POLICY IF EXISTS "Authenticated users can submit initiatives" ON public.initiatives;
DROP POLICY IF EXISTS "Ops/Admin/Programs can update initiatives" ON public.initiatives;
DROP POLICY IF EXISTS "Ops/Admin can delete initiatives" ON public.initiatives;
DROP POLICY IF EXISTS business_initiatives_read ON public.initiatives;
DROP POLICY IF EXISTS business_initiatives_insert ON public.initiatives;
DROP POLICY IF EXISTS business_initiatives_update ON public.initiatives;
DROP POLICY IF EXISTS business_initiatives_delete ON public.initiatives;
CREATE POLICY business_initiatives_read ON public.initiatives
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY business_initiatives_insert ON public.initiatives
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  );
CREATE POLICY business_initiatives_update ON public.initiatives
  FOR UPDATE TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  );
CREATE POLICY business_initiatives_delete ON public.initiatives
  FOR DELETE TO authenticated
  USING (public.is_active(auth.uid()) AND public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view media platforms" ON public.media_platforms;
DROP POLICY IF EXISTS "Ops/Admin/Programs can manage media platforms" ON public.media_platforms;
DROP POLICY IF EXISTS business_media_platforms_read ON public.media_platforms;
DROP POLICY IF EXISTS business_media_platforms_manage ON public.media_platforms;
CREATE POLICY business_media_platforms_read ON public.media_platforms
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY business_media_platforms_manage ON public.media_platforms
  FOR ALL TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view media services" ON public.media_services;
DROP POLICY IF EXISTS "Ops/Admin/Programs can manage media services" ON public.media_services;
DROP POLICY IF EXISTS business_media_services_read ON public.media_services;
DROP POLICY IF EXISTS business_media_services_manage ON public.media_services;
CREATE POLICY business_media_services_read ON public.media_services
  FOR SELECT TO authenticated USING (public.is_active(auth.uid()));
CREATE POLICY business_media_services_manage ON public.media_services
  FOR ALL TO authenticated
  USING (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  )
  WITH CHECK (
    public.is_active(auth.uid())
    AND (
      public.is_manager(auth.uid())
      OR public.has_role(auth.uid(), 'programs_officer'::public.app_role)
    )
  );
