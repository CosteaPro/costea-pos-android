DROP POLICY IF EXISTS signature_admin_select ON public.company_signature;
REVOKE SELECT ON public.company_signature FROM authenticated;
REVOKE SELECT ON public.company_signature FROM anon;
GRANT INSERT, UPDATE, DELETE ON public.company_signature TO authenticated;
GRANT ALL ON public.company_signature TO service_role;