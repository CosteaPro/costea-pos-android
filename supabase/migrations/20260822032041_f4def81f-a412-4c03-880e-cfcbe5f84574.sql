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
    'anon_grants', (SELECT count(*) FROM information_schema.role_table_grants g WHERE g.table_schema = 'public' AND g.table_name = _table AND g.grantee = 'anon')
  );
$$;

REVOKE ALL ON FUNCTION public.rls_policy_report(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_policy_report(text) TO service_role;