-- ============================================================
-- Etapa 1 · Parte 3: aislamiento por empresa (capa restrictiva)
-- ============================================================

-- El cierre definitivo sigue siendo inmodificable, pero la marca de empresa /
-- sucursal es informacion de plataforma, no del cierre.
CREATE OR REPLACE FUNCTION public.protect_final_closure()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.closure_type = 'cierre' THEN
    IF (to_jsonb(NEW) - 'reopened_at' - 'reopened_by' - 'reopened_by_email' - 'updated_at'
                      - 'company_id' - 'branch_id')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'reopened_at' - 'reopened_by' - 'reopened_by_email' - 'updated_at'
                      - 'company_id' - 'branch_id') THEN
      RAISE EXCEPTION 'Un cierre definitivo de caja no puede modificarse.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- ------------------------------------------------------------
-- Muro de empresa: politica RESTRICTIVA sobre toda tabla con company_id.
-- Se combina con AND sobre las politicas de rol ya existentes, de modo que
-- nadie puede leer ni escribir datos de otra empresa aunque su rol lo permita.
-- ------------------------------------------------------------
DO $do$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'company_id'
       AND tb.table_type = 'BASE TABLE'
       AND c.table_name NOT IN ('platform_companies','platform_branches','company_users',
                                'company_modules','audit_log')
     ORDER BY 1
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'muro_empresa_' || t, t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        AS RESTRICTIVE
        FOR ALL
        TO authenticated
        USING (company_id = public.current_company_id() OR public.is_platform_admin())
        WITH CHECK (company_id = public.current_company_id() OR public.is_platform_admin())
    $p$, 'muro_empresa_' || t, t);
  END LOOP;
END
$do$;