-- ============================================================
-- COSTEA PRO SAAS · Etapa 1 · Parte 1: fundación de plataforma
-- ============================================================

CREATE TYPE public.platform_plan AS ENUM ('junior', 'pro', 'premium');
CREATE TYPE public.company_status AS ENUM ('activa', 'prueba', 'suspendida');
CREATE TYPE public.branch_kind AS ENUM ('local', 'bodega');

-- ---------- Empresas ----------
CREATE TABLE public.platform_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  trade_name text NOT NULL,
  legal_name text NOT NULL DEFAULT '',
  ruc text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT 'quito',
  plan public.platform_plan NOT NULL DEFAULT 'junior',
  status public.company_status NOT NULL DEFAULT 'prueba',
  contact_email text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  onboarded_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_platform_companies_region ON public.platform_companies (region) WHERE deleted_at IS NULL;
CREATE INDEX idx_platform_companies_status ON public.platform_companies (status) WHERE deleted_at IS NULL;

GRANT SELECT ON public.platform_companies TO authenticated;
GRANT ALL ON public.platform_companies TO service_role;
ALTER TABLE public.platform_companies ENABLE ROW LEVEL SECURITY;

-- ---------- Sucursales ----------
CREATE TABLE public.platform_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.platform_companies(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  kind public.branch_kind NOT NULL DEFAULT 'local',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  establishment text NOT NULL DEFAULT '001',
  emission_point text NOT NULL DEFAULT '001',
  is_primary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX idx_platform_branches_company ON public.platform_branches (company_id) WHERE deleted_at IS NULL;

GRANT SELECT ON public.platform_branches TO authenticated;
GRANT ALL ON public.platform_branches TO service_role;
ALTER TABLE public.platform_branches ENABLE ROW LEVEL SECURITY;

-- ---------- Administradores de plataforma ----------
CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY,
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- ---------- Vínculo usuario ↔ empresa ----------
CREATE TABLE public.company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.platform_companies(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  branch_id uuid REFERENCES public.platform_branches(id),
  is_company_owner boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX idx_company_users_company ON public.company_users (company_id) WHERE deleted_at IS NULL;

GRANT SELECT ON public.company_users TO authenticated;
GRANT ALL ON public.company_users TO service_role;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

-- ---------- Módulos por empresa ----------
CREATE TABLE public.company_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.platform_companies(id) ON DELETE RESTRICT,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, module_key)
);
CREATE INDEX idx_company_modules_company ON public.company_modules (company_id);

GRANT SELECT ON public.company_modules TO authenticated;
GRANT ALL ON public.company_modules TO service_role;
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

-- ---------- Bitácora global ----------
CREATE TABLE public.audit_log (
  id bigserial PRIMARY KEY,
  company_id uuid,
  branch_id uuid,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_company_date ON public.audit_log (company_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log (entity, entity_id);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Funciones de contexto (security definer, sin recursión de RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION private.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION private.company_of(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cu.company_id
    FROM public.company_users cu
   WHERE cu.user_id = _user_id
     AND cu.active
     AND cu.deleted_at IS NULL
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.company_of(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_platform_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.company_has_module(_module_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT cm.enabled
      FROM public.company_modules cm
     WHERE cm.company_id = private.company_of(auth.uid())
       AND cm.module_key = _module_key
  ), false);
$$;

REVOKE EXECUTE ON FUNCTION private.is_platform_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.company_of(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.company_has_module(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_has_module(text) TO authenticated;

-- ============================================================
-- Políticas de acceso
-- ============================================================

CREATE POLICY "Cada quien ve su empresa" ON public.platform_companies
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR id = public.current_company_id());

CREATE POLICY "Solo plataforma administra empresas" ON public.platform_companies
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Sucursales de mi empresa" ON public.platform_branches
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR company_id = public.current_company_id());

CREATE POLICY "Solo plataforma administra sucursales" ON public.platform_branches
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Ver administradores de plataforma" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR user_id = auth.uid());

CREATE POLICY "Usuarios de mi empresa" ON public.company_users
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR company_id = public.current_company_id());

CREATE POLICY "Solo plataforma administra vinculos" ON public.company_users
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Modulos de mi empresa" ON public.company_modules
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR company_id = public.current_company_id());

CREATE POLICY "Solo plataforma administra modulos" ON public.company_modules
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- La bitácora se lee dentro de la empresa y solo se puede agregar: jamás editar ni borrar.
CREATE POLICY "Bitacora de mi empresa" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR company_id = public.current_company_id());

CREATE POLICY "Registrar en bitacora" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated, anon;

-- ---------- updated_at ----------
CREATE TRIGGER trg_platform_companies_updated BEFORE UPDATE ON public.platform_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_platform_branches_updated BEFORE UPDATE ON public.platform_branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_company_users_updated BEFORE UPDATE ON public.company_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_company_modules_updated BEFORE UPDATE ON public.company_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_platform_admins_updated BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();