DROP POLICY IF EXISTS item_cost_history_select ON public.item_cost_history;
CREATE POLICY item_cost_history_select ON public.item_cost_history FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS measurement_units_select ON public.measurement_units;
CREATE POLICY measurement_units_select ON public.measurement_units FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));