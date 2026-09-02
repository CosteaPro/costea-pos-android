-- ============================================================
-- Etapa 1 · Parte 2: empresa y sucursal en todas las tablas
-- ============================================================

CREATE OR REPLACE FUNCTION public.default_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    private.company_of(auth.uid()),
    -- Mientras exista una sola empresa (Chusin Chuzon), los procesos
    -- automaticos sin sesion siguen operando sin cambios.
    (SELECT (array_agg(c.id))[1] FROM public.platform_companies c
      WHERE c.deleted_at IS NULL
      HAVING count(*) = 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.default_branch_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT cu.branch_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.active AND cu.deleted_at IS NULL LIMIT 1),
    (SELECT b.id FROM public.platform_branches b
      WHERE b.company_id = public.default_company_id()
        AND b.deleted_at IS NULL AND b.is_primary
      LIMIT 1)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.default_company_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.default_branch_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.default_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.default_branch_id() TO authenticated;

-- Los disparadores de proteccion (cierre definitivo, dia bloqueado, propietario)
-- deben quedar en pausa mientras se etiquetan los registros historicos: se esta
-- agregando la marca de empresa, no modificando la informacion del negocio.
-- La bitacora de configuracion ya usaba "company_id" para apuntar a la ficha de
-- la empresa; se renombra para dejar libre el nombre de la nueva marca de empresa.
ALTER TABLE public.company_settings_audit RENAME COLUMN company_id TO settings_id;

SET session_replication_role = replica;

DO $do$
DECLARE
  v_company uuid;
  v_branch uuid;
  t text;
  con_branch text[] := ARRAY[
    'orders','order_items','cash_closures','caja_documentos','caja_totales_diarios','cajas',
    'inventory_movements','inventory_items','inventory_opening_balances','inventory_physical_counts',
    'inventory_day_closures','purchases','purchase_items','production_entries','production_entry_items',
    'expenses','delay_logs','report_snapshots','restaurant_tables','cash_flow_manual',
    'pl_expenses','pl_manual_lines','item_cost_history'
  ];
  solo_empresa text[] := ARRAY[
    'categories','products','product_options','product_channel_prices','product_recipe_variants',
    'recipes','recipe_items','customers','suppliers','inventory_categories','measurement_units',
    'sales_channels','expense_categories','pl_groups','pl_line_items','company_settings',
    'company_signature','document_sequences','notification_settings','dashboard_actions',
    'login_sessions','company_settings_audit','purchase_audit_log','sri_emission_logs',
    'caja_admin_pin','user_roles','profiles'
  ];
  fecha_col text;
BEGIN
  SELECT id INTO v_company FROM public.platform_companies WHERE slug = 'chusin-chuzon';
  SELECT id INTO v_branch FROM public.platform_branches WHERE company_id = v_company AND is_primary;
  IF v_company IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'No se encontro la empresa base Chusin Chuzon';
  END IF;

  FOREACH t IN ARRAY (con_branch || solo_empresa) LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id uuid', t);
    EXECUTE format('UPDATE public.%I SET company_id = %L WHERE company_id IS NULL', t, v_company);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT public.default_company_id()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.platform_companies(id)',
      t, t || '_company_fk');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id)', 'idx_' || t || '_company', t);

    -- Indice compuesto para los reportes por periodo
    SELECT c.column_name INTO fecha_col
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = t
       AND c.column_name IN ('business_date','purchased_at','created_at')
     ORDER BY array_position(ARRAY['business_date','purchased_at','created_at'], c.column_name)
     LIMIT 1;
    IF fecha_col IS NOT NULL THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id, %I)',
                     'idx_' || t || '_company_fecha', t, fecha_col);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY con_branch LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS branch_id uuid', t);
    EXECUTE format('UPDATE public.%I SET branch_id = %L WHERE branch_id IS NULL', t, v_branch);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN branch_id SET DEFAULT public.default_branch_id()', t);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (branch_id) REFERENCES public.platform_branches(id)',
      t, t || '_branch_fk');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (company_id, branch_id)',
                   'idx_' || t || '_branch', t);
  END LOOP;
END
$do$;

SET session_replication_role = origin;

-- ============================================================
-- Unicidad ahora por empresa
-- ============================================================

ALTER TABLE public.cajas DROP CONSTRAINT IF EXISTS cajas_codigo_key;
DROP INDEX IF EXISTS public.cajas_estab_punto_unico;
CREATE UNIQUE INDEX cajas_codigo_empresa ON public.cajas (company_id, codigo);
CREATE UNIQUE INDEX cajas_estab_punto_empresa ON public.cajas (company_id, establishment, emission_point);

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_id_number_key;
CREATE UNIQUE INDEX customers_id_number_empresa ON public.customers (company_id, id_number);

ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_key;
CREATE UNIQUE INDEX expense_categories_name_empresa ON public.expense_categories (company_id, name);

ALTER TABLE public.measurement_units DROP CONSTRAINT IF EXISTS measurement_units_name_key;
CREATE UNIQUE INDEX measurement_units_name_empresa ON public.measurement_units (company_id, name);

ALTER TABLE public.sales_channels DROP CONSTRAINT IF EXISTS sales_channels_value_key;
CREATE UNIQUE INDEX sales_channels_value_empresa ON public.sales_channels (company_id, value);

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_code_key;
CREATE UNIQUE INDEX suppliers_code_empresa ON public.suppliers (company_id, code) WHERE code IS NOT NULL;

ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_code_key;
CREATE UNIQUE INDEX inventory_items_code_empresa ON public.inventory_items (company_id, code) WHERE code IS NOT NULL;

DROP INDEX IF EXISTS public.products_code_unique;
CREATE UNIQUE INDEX products_code_empresa ON public.products (company_id, code) WHERE code IS NOT NULL;

ALTER TABLE public.pl_groups DROP CONSTRAINT IF EXISTS pl_groups_key_key;
CREATE UNIQUE INDEX pl_groups_key_empresa ON public.pl_groups (company_id, key);

ALTER TABLE public.pl_line_items DROP CONSTRAINT IF EXISTS pl_line_items_line_key_key;
CREATE UNIQUE INDEX pl_line_items_key_empresa ON public.pl_line_items (company_id, line_key);

ALTER TABLE public.pl_manual_lines DROP CONSTRAINT IF EXISTS pl_manual_lines_year_month_line_key_key;
CREATE UNIQUE INDEX pl_manual_lines_empresa ON public.pl_manual_lines (company_id, branch_id, year, month, line_key);

ALTER TABLE public.cash_flow_manual DROP CONSTRAINT IF EXISTS cash_flow_manual_business_date_key;
CREATE UNIQUE INDEX cash_flow_manual_empresa ON public.cash_flow_manual (company_id, branch_id, business_date);

ALTER TABLE public.inventory_day_closures DROP CONSTRAINT IF EXISTS inventory_day_closures_business_date_key;
CREATE UNIQUE INDEX inventory_day_closures_empresa ON public.inventory_day_closures (company_id, branch_id, business_date);

ALTER TABLE public.inventory_opening_balances DROP CONSTRAINT IF EXISTS inventory_opening_balances_business_date_item_id_key;
CREATE UNIQUE INDEX inventory_opening_balances_empresa ON public.inventory_opening_balances (company_id, branch_id, business_date, item_id);

ALTER TABLE public.inventory_physical_counts DROP CONSTRAINT IF EXISTS inventory_physical_counts_business_date_item_id_key;
CREATE UNIQUE INDEX inventory_physical_counts_empresa ON public.inventory_physical_counts (company_id, branch_id, business_date, item_id);

ALTER TABLE public.caja_documentos DROP CONSTRAINT IF EXISTS caja_documentos_caja_codigo_tipo_doc_number_key;
CREATE UNIQUE INDEX caja_documentos_empresa ON public.caja_documentos (company_id, caja_codigo, tipo, doc_number);

ALTER TABLE public.caja_totales_diarios DROP CONSTRAINT IF EXISTS caja_totales_diarios_caja_codigo_fecha_key;
CREATE UNIQUE INDEX caja_totales_diarios_empresa ON public.caja_totales_diarios (company_id, caja_codigo, fecha);

DROP INDEX IF EXISTS public.orders_sri_doc_number_unique;
CREATE UNIQUE INDEX orders_sri_doc_number_empresa ON public.orders (company_id, doc_number)
  WHERE doc_type = ANY (ARRAY['factura','nota_debito','nota_credito']) AND doc_number IS NOT NULL;

DROP INDEX IF EXISTS public.orders_client_uid_key;
CREATE UNIQUE INDEX orders_client_uid_empresa ON public.orders (company_id, client_uid) WHERE client_uid IS NOT NULL;

ALTER TABLE public.report_snapshots DROP CONSTRAINT IF EXISTS report_snapshots_kind_scope_period_from_period_to_key;
CREATE UNIQUE INDEX report_snapshots_empresa ON public.report_snapshots (company_id, branch_id, kind, scope, period_from, period_to);

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
CREATE UNIQUE INDEX user_roles_empresa ON public.user_roles (company_id, user_id, role);

-- Numeracion SRI: una serie por empresa
ALTER TABLE public.document_sequences DROP CONSTRAINT IF EXISTS document_sequences_pkey;
ALTER TABLE public.document_sequences ADD PRIMARY KEY (company_id, doc_type);