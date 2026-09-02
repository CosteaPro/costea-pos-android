REVOKE ALL ON public.company_settings FROM anon, PUBLIC;
REVOKE ALL ON public.company_settings_audit FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
GRANT SELECT ON public.company_settings_audit TO authenticated;
GRANT ALL ON public.company_settings_audit TO service_role;

CREATE OR REPLACE FUNCTION public.rls_policy_report(_table text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'rls_enabled', COALESCE((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = _table), false),
    'select', (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = _table AND p.cmd IN ('SELECT','ALL')),
    'insert', (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = _table AND p.cmd IN ('INSERT','ALL')),
    'update', (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = _table AND p.cmd IN ('UPDATE','ALL')),
    'delete', (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = _table AND p.cmd IN ('DELETE','ALL')),
    'anon_grants', (
      SELECT count(*) FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) AS priv(name)
      WHERE has_table_privilege('anon', format('public.%I', _table), priv.name)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.rls_policy_report(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_policy_report(text) TO service_role;