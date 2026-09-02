DROP TRIGGER IF EXISTS orders_set_folio ON public.orders;
CREATE TRIGGER orders_set_folio
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_folio();

DROP TRIGGER IF EXISTS orders_day_lock ON public.orders;
CREATE TRIGGER orders_day_lock
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_day_lock();

DROP TRIGGER IF EXISTS order_items_day_lock ON public.order_items;
CREATE TRIGGER order_items_day_lock
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_day_lock();

DROP TRIGGER IF EXISTS products_set_code ON public.products;
CREATE TRIGGER products_set_code
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_product_code();

DROP TRIGGER IF EXISTS cash_closures_protect ON public.cash_closures;
CREATE TRIGGER cash_closures_protect
BEFORE UPDATE ON public.cash_closures
FOR EACH ROW EXECUTE FUNCTION public.protect_final_closure();

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS company_settings_updated_at ON public.company_settings;
CREATE TRIGGER company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS customers_updated_at ON public.customers;
CREATE TRIGGER customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS cash_closures_updated_at ON public.cash_closures;
CREATE TRIGGER cash_closures_updated_at
BEFORE UPDATE ON public.cash_closures
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS delay_logs_updated_at ON public.delay_logs;
CREATE TRIGGER delay_logs_updated_at
BEFORE UPDATE ON public.delay_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();