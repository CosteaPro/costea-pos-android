-- 1) Nuevo rol operativo (el rol 'administrador' pasa a significar Super Administrador / Propietario)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin_operativo';

-- 2) Bitácora de emisión electrónica
CREATE TABLE IF NOT EXISTS public.sri_emission_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  doc_number text,
  access_key text,
  stage text NOT NULL,
  status text NOT NULL,
  detail text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sri_emission_logs TO authenticated;
GRANT ALL ON public.sri_emission_logs TO service_role;

ALTER TABLE public.sri_emission_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo el propietario consulta la bitacora SRI"
ON public.sri_emission_logs FOR SELECT TO authenticated
USING (private.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS sri_emission_logs_order_idx ON public.sri_emission_logs(order_id, created_at DESC);

CREATE TRIGGER sri_emission_logs_updated_at
BEFORE UPDATE ON public.sri_emission_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();