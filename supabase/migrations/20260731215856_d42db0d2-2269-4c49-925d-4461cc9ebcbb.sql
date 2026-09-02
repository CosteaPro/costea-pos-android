CREATE OR REPLACE FUNCTION public.next_invoice_sequential()
 RETURNS TABLE(establishment text, emission_point text, sequential integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_est text;
  v_pt text;
  v_seq integer;
  v_id uuid;
BEGIN
  SELECT c.id INTO v_id FROM public.company_settings c ORDER BY c.created_at LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No hay configuracion de empresa registrada';
  END IF;

  UPDATE public.company_settings c
     SET next_sequential = GREATEST(COALESCE(c.next_sequential, 1), 1) + 1,
         updated_at = now()
   WHERE c.id = v_id
  RETURNING c.establishment, c.emission_point, c.next_sequential - 1
       INTO v_est, v_pt, v_seq;

  establishment := v_est;
  emission_point := v_pt;
  sequential := v_seq;
  RETURN NEXT;
END; $function$;