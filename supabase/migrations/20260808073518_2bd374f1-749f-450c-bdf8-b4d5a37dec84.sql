
CREATE OR REPLACE FUNCTION public.unit_convert_factor(_from text, _to text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH b(u, dim, base) AS (
    VALUES
      ('gramo','peso',1::numeric), ('kilo','peso',1000), ('libra','peso',453.59237),
      ('onza','peso',28.349523125), ('quintal','peso',45359.237),
      ('mililitro','volumen',1), ('litro','volumen',1000), ('galon','volumen',3785.411784),
      ('centimetro','longitud',1), ('metro','longitud',100),
      ('unidad','conteo',1), ('par','conteo',2), ('docena','conteo',12)
  )
  SELECT f.base / t.base
  FROM b f, b t
  WHERE f.u = lower(coalesce(_from,'')) AND t.u = lower(coalesce(_to,'')) AND f.dim = t.dim;
$$;

REVOKE EXECUTE ON FUNCTION public.unit_convert_factor(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unit_convert_factor(text, text) TO authenticated, service_role;
