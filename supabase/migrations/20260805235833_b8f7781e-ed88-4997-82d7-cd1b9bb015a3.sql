DROP POLICY IF EXISTS physical_counts_auth_all ON public.inventory_physical_counts;

CREATE POLICY "Solo administrador gestiona conteos fisicos"
ON public.inventory_physical_counts
FOR ALL
TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));