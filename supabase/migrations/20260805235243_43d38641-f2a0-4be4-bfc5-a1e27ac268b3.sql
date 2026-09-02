CREATE TABLE public.inventory_physical_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date date NOT NULL,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_date, item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_physical_counts TO authenticated;
GRANT ALL ON public.inventory_physical_counts TO service_role;

ALTER TABLE public.inventory_physical_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physical_counts_auth_all" ON public.inventory_physical_counts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER inventory_physical_counts_updated_at
  BEFORE UPDATE ON public.inventory_physical_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_physical_counts;