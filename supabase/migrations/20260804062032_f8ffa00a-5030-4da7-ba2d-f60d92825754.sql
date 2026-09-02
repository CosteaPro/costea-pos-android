REVOKE ALL ON FUNCTION public.claim_system_ownership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_system_ownership() TO authenticated;
REVOKE ALL ON FUNCTION public.protect_owner_role() FROM PUBLIC, anon, authenticated;