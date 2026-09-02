CREATE TABLE IF NOT EXISTS public.caja_admin_pin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_hash text NOT NULL,
  updated_by uuid,
  updated_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT, UPDATE ON public.caja_admin_pin TO authenticated;
GRANT ALL ON public.caja_admin_pin TO service_role;

ALTER TABLE public.caja_admin_pin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo administradores registran la clave de caja" ON public.caja_admin_pin;
CREATE POLICY "Solo administradores registran la clave de caja"
  ON public.caja_admin_pin FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND (ur.is_owner OR ur.role = 'administrador'::public.app_role)
  ));

DROP POLICY IF EXISTS "Solo administradores cambian la clave de caja" ON public.caja_admin_pin;
CREATE POLICY "Solo administradores cambian la clave de caja"
  ON public.caja_admin_pin FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND (ur.is_owner OR ur.role = 'administrador'::public.app_role)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND (ur.is_owner OR ur.role = 'administrador'::public.app_role)
  ));

DROP TRIGGER IF EXISTS set_caja_admin_pin_updated_at ON public.caja_admin_pin;
CREATE TRIGGER set_caja_admin_pin_updated_at
  BEFORE UPDATE ON public.caja_admin_pin
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON FUNCTION public.repropagate_item_cost(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_purchase_order_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_inventory_movement(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.edit_inventory_movement(uuid, uuid, numeric, date, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_inventory_period(date, date) FROM authenticated;