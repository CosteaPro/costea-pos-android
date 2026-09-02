CREATE SEQUENCE IF NOT EXISTS public.supplier_code_seq;
CREATE SEQUENCE IF NOT EXISTS public.inventory_code_seq;

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  id_number text NOT NULL DEFAULT '',
  name text NOT NULL,
  address text,
  phone text,
  email text,
  category text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_admin_all ON public.suppliers FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'unidad',
  min_stock numeric NOT NULL DEFAULT 0,
  stock numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  location text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_items_admin_all ON public.inventory_items FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL DEFAULT '',
  document_number text NOT NULL DEFAULT '',
  purchased_at timestamptz NOT NULL DEFAULT now(),
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchases_admin_all ON public.purchases FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  item_name text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_items_admin_all ON public.purchase_items FOR ALL TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE INDEX purchase_items_purchase_idx ON public.purchase_items(purchase_id);
CREATE INDEX purchase_items_item_idx ON public.purchase_items(item_id);
CREATE INDEX purchases_date_idx ON public.purchases(purchased_at DESC);

CREATE OR REPLACE FUNCTION public.set_supplier_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    LOOP
      NEW.code := 'PR' || lpad(nextval('public.supplier_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.suppliers WHERE code = NEW.code);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_supplier_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_inventory_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    LOOP
      NEW.code := 'IN' || lpad(nextval('public.inventory_code_seq')::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE code = NEW.code);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_inventory_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_purchase_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    UPDATE public.inventory_items
       SET stock = COALESCE(stock, 0) + COALESCE(NEW.quantity, 0),
           unit_cost = COALESCE(NEW.unit_cost, unit_cost),
           updated_at = now()
     WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_purchase_stock() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER suppliers_set_code BEFORE INSERT ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_code();
CREATE TRIGGER inventory_items_set_code BEFORE INSERT ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_code();
CREATE TRIGGER purchase_items_apply_stock AFTER INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_stock();

CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER purchases_updated_at BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT USAGE ON SEQUENCE public.supplier_code_seq TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.inventory_code_seq TO authenticated, service_role;