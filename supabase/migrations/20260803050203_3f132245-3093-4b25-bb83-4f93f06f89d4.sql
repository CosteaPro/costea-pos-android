-- La contraseña del .p12 nunca debe poder leerse desde el cliente.
REVOKE SELECT ON public.company_signature FROM authenticated;
GRANT SELECT (id, p12_path, created_at, updated_at) ON public.company_signature TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.company_signature TO authenticated;
GRANT ALL ON public.company_signature TO service_role;