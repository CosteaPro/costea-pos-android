CREATE TABLE public.pl_manual_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL,
  section text NOT NULL,
  line_key text NOT NULL,
  label text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (year, month, line_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pl_manual_lines TO authenticated;
GRANT ALL ON public.pl_manual_lines TO service_role;

ALTER TABLE public.pl_manual_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados gestionan rubros PyG"
ON public.pl_manual_lines FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_pl_manual_lines_updated_at
BEFORE UPDATE ON public.pl_manual_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();