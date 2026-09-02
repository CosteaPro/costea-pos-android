UPDATE public.company_settings c
SET next_sequential = GREATEST(
  COALESCE(c.next_sequential, 1),
  COALESCE((
    SELECT MAX(NULLIF(regexp_replace(split_part(o.doc_number, '-', 3), '\D', '', 'g'), ''))::bigint
    FROM public.orders o WHERE o.doc_type = 'factura'
  ), 0) + 1
), updated_at = now();