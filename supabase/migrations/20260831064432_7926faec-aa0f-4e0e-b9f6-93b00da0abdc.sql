CREATE OR REPLACE FUNCTION public.create_platform_company(
  _actor uuid,
  _owner_user_id uuid,
  _trade_name text,
  _legal_name text,
  _ruc text,
  _region text,
  _plan platform_plan,
  _status company_status,
  _slug text,
  _contact_email text,
  _contact_phone text,
  _branch_name text,
  _branch_address text,
  _establishment text,
  _emission_point text,
  _modules text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company uuid;
  _branch uuid;
  _mod text;
  _est text := COALESCE(NULLIF(_establishment,''), '001');
  _pto text := COALESCE(NULLIF(_emission_point,''), '001');
BEGIN
  IF NOT private.is_platform_admin(_actor) THEN
    RAISE EXCEPTION 'Solo un administrador de plataforma puede crear clientes';
  END IF;

  INSERT INTO public.platform_companies
    (trade_name, legal_name, ruc, region, plan, status, slug,
     contact_email, contact_phone, created_by, updated_by)
  VALUES
    (_trade_name, COALESCE(NULLIF(_legal_name,''), _trade_name), _ruc, _region, _plan, _status, _slug,
     COALESCE(_contact_email,''), COALESCE(_contact_phone,''), _actor, _actor)
  RETURNING id INTO _company;

  INSERT INTO public.platform_branches
    (company_id, code, name, address, establishment, emission_point,
     kind, is_primary, active, created_by, updated_by)
  VALUES
    (_company, 'S001', COALESCE(NULLIF(_branch_name,''), 'Matriz'), COALESCE(_branch_address,''),
     _est, _pto, 'local', true, true, _actor, _actor)
  RETURNING id INTO _branch;

  FOREACH _mod IN ARRAY COALESCE(_modules, ARRAY[]::text[]) LOOP
    INSERT INTO public.company_modules (company_id, module_key, enabled)
    VALUES (_company, _mod, true)
    ON CONFLICT (company_id, module_key) DO UPDATE SET enabled = true, updated_at = now();
  END LOOP;

  INSERT INTO public.document_sequences
    (company_id, doc_type, establishment, emission_point, next_sequential)
  VALUES (_company, 'factura', _est, _pto, 1)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.company_settings
    (company_id, business_name, trade_name, ruc, establishment, emission_point)
  VALUES
    (_company, COALESCE(NULLIF(_legal_name,''), _trade_name), _trade_name, _ruc, _est, _pto)
  ON CONFLICT DO NOTHING;

  IF _owner_user_id IS NOT NULL THEN
    INSERT INTO public.company_users
      (company_id, branch_id, user_id, is_company_owner, active, created_by, updated_by)
    VALUES (_company, _branch, _owner_user_id, true, true, _actor, _actor)
    ON CONFLICT (user_id) DO UPDATE
      SET company_id = EXCLUDED.company_id,
          branch_id = EXCLUDED.branch_id,
          is_company_owner = true,
          active = true,
          updated_at = now();
  END IF;

  INSERT INTO public.audit_log (company_id, branch_id, user_id, action, entity, entity_id, changes)
  VALUES (_company, _branch, _actor, 'crear_empresa', 'platform_companies', _company::text,
          jsonb_build_object('trade_name', _trade_name, 'ruc', _ruc, 'plan', _plan, 'status', _status));

  RETURN _company;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_platform_company(uuid,uuid,text,text,text,text,platform_plan,company_status,text,text,text,text,text,text,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_platform_company(uuid,uuid,text,text,text,text,platform_plan,company_status,text,text,text,text,text,text,text,text[]) TO service_role;