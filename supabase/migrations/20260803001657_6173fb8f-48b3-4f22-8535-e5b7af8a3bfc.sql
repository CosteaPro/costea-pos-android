-- Restablecer GRANTs de la Data API (RLS sigue controlando el acceso real)
GRANT SELECT ON public.user_roles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;
GRANT ALL ON public.restaurant_tables TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_closures TO authenticated;
GRANT ALL ON public.cash_closures TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delay_logs TO authenticated;
GRANT ALL ON public.delay_logs TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_signature TO authenticated;
GRANT ALL ON public.company_signature TO service_role;

-- Secuencia usada por el disparador de códigos de producto
GRANT USAGE, SELECT ON SEQUENCE public.product_code_seq TO authenticated, service_role;