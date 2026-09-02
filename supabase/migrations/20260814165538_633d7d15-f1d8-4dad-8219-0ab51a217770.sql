ALTER TABLE public.caja_documentos
  ADD COLUMN IF NOT EXISTS mesa text,
  ADD COLUMN IF NOT EXISTS mesero text,
  ADD COLUMN IF NOT EXISTS orden_numero integer,
  ADD COLUMN IF NOT EXISTS doc_relacionado text,
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_email text;

CREATE INDEX IF NOT EXISTS caja_documentos_order_id_idx ON public.caja_documentos (order_id);