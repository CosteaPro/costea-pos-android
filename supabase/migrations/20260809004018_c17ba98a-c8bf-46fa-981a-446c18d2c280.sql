ALTER TABLE public.orders ALTER COLUMN doc_type DROP DEFAULT;
ALTER TABLE public.orders ALTER COLUMN doc_type TYPE text USING doc_type::text;
ALTER TABLE public.orders ALTER COLUMN doc_type SET DEFAULT 'nota_venta';
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_doc_type_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_doc_type_check
  CHECK (doc_type IN ('factura', 'nota_venta', 'nota_debito', 'nota_credito'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS issued_at_device timestamptz,
  ADD COLUMN IF NOT EXISTS related_doc_number text,
  ADD COLUMN IF NOT EXISTS related_access_key text,
  ADD COLUMN IF NOT EXISTS adjustment_reason text;

CREATE TABLE public.document_sequences (
  doc_type text PRIMARY KEY,
  establishment text NOT NULL,
  emission_point text NOT NULL DEFAULT '001',
  next_sequential bigint NOT NULL DEFAULT 1,
  block_size integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_sequences_establishment_format CHECK (establishment ~ '^\d{3}$'),
  CONSTRAINT document_sequences_emission_point_format CHECK (emission_point ~ '^\d{3}$'),
  CONSTRAINT document_sequences_next_positive CHECK (next_sequential > 0),
  CONSTRAINT document_sequences_block_size_valid CHECK (block_size BETWEEN 10 AND 1000),
  CONSTRAINT document_sequences_doc_type_check CHECK (doc_type IN ('factura', 'nota_debito', 'nota_credito'))
);
GRANT SELECT ON public.document_sequences TO authenticated;
GRANT ALL ON public.document_sequences TO service_role;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read document sequences"
  ON public.document_sequences FOR SELECT TO authenticated USING (true);

INSERT INTO public.document_sequences (doc_type, establishment, emission_point, next_sequential)
SELECT 'factura',
       COALESCE(NULLIF(regexp_replace(establishment, '\D', '', 'g'), ''), '001'),
       COALESCE(NULLIF(regexp_replace(emission_point, '\D', '', 'g'), ''), '001'),
       GREATEST(COALESCE(next_sequential, 1), 1)
FROM public.company_settings
ORDER BY created_at
LIMIT 1
ON CONFLICT (doc_type) DO NOTHING;

INSERT INTO public.document_sequences (doc_type, establishment, emission_point, next_sequential)
VALUES
  ('nota_debito', '002', '001', 1),
  ('nota_credito', '003', '001', 1)
ON CONFLICT (doc_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reserve_document_sequence_block(
  _doc_type text,
  _block_size integer DEFAULT NULL
)
RETURNS TABLE(
  doc_type text,
  establishment text,
  emission_point text,
  first_sequential bigint,
  last_sequential bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_size integer;
  v_first bigint;
  v_last bigint;
  v_est text;
  v_point text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión activa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('administrador'::public.app_role, 'cajero'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Solo caja o administración puede reservar numeración';
  END IF;

  IF _doc_type NOT IN (
    'factura',
    'nota_debito',
    'nota_credito'
  ) THEN
    RAISE EXCEPTION 'Este comprobante no usa bloques de numeración SRI';
  END IF;

  SELECT COALESCE(_block_size, ds.block_size), ds.establishment, ds.emission_point
    INTO v_size, v_est, v_point
    FROM public.document_sequences ds
   WHERE ds.doc_type = _doc_type
   FOR UPDATE;

  IF v_est IS NULL THEN
    RAISE EXCEPTION 'No existe configuración de numeración para el comprobante';
  END IF;
  IF v_size NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'El bloque solicitado no es válido';
  END IF;

  UPDATE public.document_sequences ds
     SET next_sequential = ds.next_sequential + v_size,
         updated_at = now()
   WHERE ds.doc_type = _doc_type
   RETURNING ds.next_sequential - v_size, ds.next_sequential - 1
        INTO v_first, v_last;

  doc_type := _doc_type;
  establishment := v_est;
  emission_point := v_point;
  first_sequential := v_first;
  last_sequential := v_last;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_document_sequence_block(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_document_sequence_block(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_document_sequence_block(text, integer) TO service_role;

CREATE TRIGGER document_sequences_updated_at
BEFORE UPDATE ON public.document_sequences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS orders_sri_doc_number_unique
  ON public.orders (doc_number)
  WHERE doc_type IN ('factura', 'nota_debito', 'nota_credito')
    AND doc_number IS NOT NULL;