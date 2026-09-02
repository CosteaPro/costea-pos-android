CREATE TABLE public.cajas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL DEFAULT '',
  local text NOT NULL DEFAULT '',
  sync_key text NOT NULL,
  establishment text NOT NULL DEFAULT '001',
  emission_point text NOT NULL DEFAULT '001',
  last_seen_at timestamptz,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cajas TO authenticated;
GRANT ALL ON public.cajas TO service_role;
ALTER TABLE public.cajas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cajas_select_staff" ON public.cajas
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "cajas_write_admin" ON public.cajas
  FOR ALL TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

CREATE TABLE public.caja_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_codigo text NOT NULL,
  tipo text NOT NULL DEFAULT 'factura',
  doc_number text NOT NULL,
  clave_acceso text,
  fecha_emision timestamptz NOT NULL DEFAULT now(),
  cliente_identificacion text,
  cliente_nombre text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  iva numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  forma_pago text,
  estado_sri text NOT NULL DEFAULT 'pendiente',
  numero_autorizacion text,
  fecha_autorizacion text,
  mensajes_sri text,
  xml_firmado text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (caja_codigo, tipo, doc_number)
);

GRANT SELECT ON public.caja_documentos TO authenticated;
GRANT ALL ON public.caja_documentos TO service_role;
ALTER TABLE public.caja_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caja_documentos_select_staff" ON public.caja_documentos
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE TABLE public.caja_totales_diarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_codigo text NOT NULL,
  fecha date NOT NULL,
  ventas numeric(14,2) NOT NULL DEFAULT 0,
  transacciones integer NOT NULL DEFAULT 0,
  formas_pago jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (caja_codigo, fecha)
);

GRANT SELECT ON public.caja_totales_diarios TO authenticated;
GRANT ALL ON public.caja_totales_diarios TO service_role;
ALTER TABLE public.caja_totales_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caja_totales_select_staff" ON public.caja_totales_diarios
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE TRIGGER update_cajas_updated_at BEFORE UPDATE ON public.cajas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_caja_documentos_updated_at BEFORE UPDATE ON public.caja_documentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_caja_totales_updated_at BEFORE UPDATE ON public.caja_totales_diarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();