ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'recibida',
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS voided_by_email text,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS order_number text;

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_status_check CHECK (status IN ('pendiente','recibida','anulada'));

CREATE SEQUENCE IF NOT EXISTS public.purchase_order_seq START 1;

CREATE OR REPLACE FUNCTION public.set_purchase_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'OC-' || lpad(nextval('public.purchase_order_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchases_order_number ON public.purchases;
CREATE TRIGGER purchases_order_number
  BEFORE INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_purchase_order_number();

UPDATE public.purchases
SET order_number = 'OC-' || lpad(nextval('public.purchase_order_seq')::text, 6, '0')
WHERE order_number IS NULL OR order_number = '';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS replaces_doc_number text;

CREATE INDEX IF NOT EXISTS purchases_status_idx ON public.purchases (status);
CREATE INDEX IF NOT EXISTS orders_doc_type_idx ON public.orders (doc_type, created_at DESC);