REVOKE EXECUTE ON FUNCTION public.apply_sales_consumption(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalc_sales_consumption(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reserve_document_sequence_block(text, integer) FROM PUBLIC, anon;

ALTER FUNCTION public.apply_sales_consumption(uuid) SECURITY INVOKER;
ALTER FUNCTION public.recalc_sales_consumption(date) SECURITY INVOKER;
ALTER FUNCTION public.is_system_owner(uuid) SECURITY INVOKER;
ALTER FUNCTION public.reserve_document_sequence_block(text, integer) SECURITY INVOKER;

GRANT UPDATE ON public.document_sequences TO authenticated;
CREATE POLICY "Cashiers can reserve document sequences"
  ON public.document_sequences FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('administrador'::public.app_role, 'cajero'::public.app_role)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('administrador'::public.app_role, 'cajero'::public.app_role)
  ));