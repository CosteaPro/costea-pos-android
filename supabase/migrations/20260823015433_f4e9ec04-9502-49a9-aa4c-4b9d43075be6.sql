ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS home_path text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_home_path_valido
  CHECK (home_path IS NULL OR home_path IN ('/admin/dashboard', '/caja', '/', '/cocina'));