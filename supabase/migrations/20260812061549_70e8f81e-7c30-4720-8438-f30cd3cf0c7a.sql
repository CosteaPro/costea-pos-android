CREATE TABLE public.pl_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('gastos','mano_obra','arriendos','porcentuales','depreciacion')),
  line_key text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pl_line_items TO authenticated;
GRANT ALL ON public.pl_line_items TO service_role;

ALTER TABLE public.pl_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados gestionan rubros" ON public.pl_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_pl_line_items_updated_at
  BEFORE UPDATE ON public.pl_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pl_line_items (section, line_key, label, sort_order) VALUES
  ('gastos','gg_agua','Agua Potable y Recolección Basura',1),
  ('gastos','gg_luz','Luz Eléctrica',2),
  ('gastos','gg_telefono','Teléfono, Correo, Comunicaciones',3),
  ('gastos','gg_gas','Gas',4),
  ('gastos','gg_mant_local','Mantenimiento y Reparación Local',5),
  ('gastos','gg_mant_equipos','Mantenimiento y Reparación de Equipos',6),
  ('gastos','gg_repuestos','Repuestos y Accesorios',7),
  ('gastos','gg_lunch','Almuerzo / Lunch Personal',8),
  ('gastos','gg_fletes','Fletes, Movilización, Viáticos y Expreso',9),
  ('gastos','gg_limpieza','Limpieza Local',10),
  ('gastos','gg_uniformes','Uniformes',11),
  ('gastos','gg_oficina','Suministros de Oficina',12),
  ('gastos','gg_computacion','Equipo de Computación',13),
  ('gastos','gg_utiles_cocina','Útiles de Cocina',14),
  ('gastos','gg_maquinaria','Maquinaria y Equipo',15),
  ('gastos','gg_otros','Otros Gastos',16),
  ('mano_obra','mo_nomina_local','Nómina Local',1),
  ('mano_obra','mo_horas_extras','Horas Extras',2),
  ('mano_obra','mo_nomina_admin','Nómina Administrativa',3),
  ('mano_obra','mo_iess','Aporte al IESS',4),
  ('arriendos','ar_local','Arriendo Local',1),
  ('arriendos','ar_alicuota','Alícuota / Administración',2),
  ('porcentuales','gp_publicidad','Publicidad',1),
  ('porcentuales','gp_administrativos','Gastos Administrativos',2),
  ('porcentuales','gp_regalias','Regalías / Franquicias',3),
  ('depreciacion','dep_activos','Depreciación de Activos',1);