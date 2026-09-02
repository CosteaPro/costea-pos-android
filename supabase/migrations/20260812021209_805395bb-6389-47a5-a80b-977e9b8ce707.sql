DELETE FROM public.inventory_movements
 WHERE movement_type = 'venta' AND business_date >= DATE '2026-08-01';

SELECT public.apply_sales_consumption(o.id)
  FROM public.orders o
 WHERE o.status = 'pagado'
   AND COALESCE((o.paid_at AT TIME ZONE 'America/Guayaquil')::date,
                (o.created_at AT TIME ZONE 'America/Guayaquil')::date) >= DATE '2026-08-01';

SELECT * FROM public.recalc_inventory_period(DATE '2026-08-01', public.ec_business_date());