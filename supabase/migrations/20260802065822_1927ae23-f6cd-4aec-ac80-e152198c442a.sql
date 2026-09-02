ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sri_status text NOT NULL DEFAULT 'no_aplica',
  ADD COLUMN IF NOT EXISTS sri_message text,
  ADD COLUMN IF NOT EXISTS sri_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sri_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS xml_signed text;

UPDATE public.orders SET sri_status = 'pendiente' WHERE doc_type = 'factura' AND sri_status = 'no_aplica';

DROP POLICY IF EXISTS orders_delete_admin ON public.orders;
DROP POLICY IF EXISTS order_items_delete_staff ON public.order_items;
DROP POLICY IF EXISTS order_items_delete_admin ON public.order_items;

CREATE POLICY order_items_delete_open_orders ON public.order_items
  FOR DELETE TO authenticated
  USING (
    private.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.status IN ('abierto','en_cocina','listo')
    )
  );

REVOKE DELETE ON public.orders FROM authenticated;

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_doc_type_idx ON public.orders (doc_type);