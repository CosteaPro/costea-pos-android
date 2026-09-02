ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login_email text;

UPDATE public.profiles p
SET login_email = u.email
FROM auth.users u
WHERE u.id = p.id AND p.login_email IS DISTINCT FROM u.email;

DROP INDEX IF EXISTS public.profiles_username_unique;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_company_username_unique
  ON public.profiles (company_id, lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_email_unique
  ON public.profiles (lower(login_email));