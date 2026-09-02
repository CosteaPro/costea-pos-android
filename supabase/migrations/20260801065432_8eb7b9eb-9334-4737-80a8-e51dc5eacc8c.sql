CREATE TABLE public.delay_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  folio bigint NOT NULL DEFAULT 0,
  table_id uuid,
  table_name text NOT NULL DEFAULT '',
  guests integer NOT NULL DEFAULT 0,
  service_type text NOT NULL DEFAULT 'mesa',
  area text NOT NULL DEFAULT 'cocina',
  items_summary text NOT NULL DEFAULT '',
  total numeric NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NOT NULL DEFAULT now(),
  limit_minutes integer NOT NULL DEFAULT 0,
  actual_minutes integer NOT NULL DEFAULT 0,
  over_minutes integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX delay_logs_order_unique ON public.delay_logs(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX delay_logs_delivered_idx ON public.delay_logs(delivered_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delay_logs TO authenticated;
GRANT ALL ON public.delay_logs TO service_role;

ALTER TABLE public.delay_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY delay_logs_select_caja ON public.delay_logs FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(), 'cajero'::app_role));

CREATE POLICY delay_logs_insert_staff ON public.delay_logs FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY delay_logs_update_admin ON public.delay_logs FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY delay_logs_delete_admin ON public.delay_logs FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()));

CREATE TRIGGER update_delay_logs_updated_at BEFORE UPDATE ON public.delay_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();