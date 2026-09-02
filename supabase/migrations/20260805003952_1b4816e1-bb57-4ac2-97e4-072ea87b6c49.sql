DROP POLICY IF EXISTS "Usuarios autenticados gestionan recetas" ON public.recipes;
DROP POLICY IF EXISTS "Usuarios autenticados gestionan ingredientes" ON public.recipe_items;

CREATE POLICY "Solo administradores gestionan recetas"
ON public.recipes FOR ALL TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "Solo administradores gestionan ingredientes"
ON public.recipe_items FOR ALL TO authenticated
USING (private.is_admin(auth.uid()))
WITH CHECK (private.is_admin(auth.uid()));