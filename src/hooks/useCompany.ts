import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CompanySettings } from "@/lib/pos";
import { aplicarConfigLocal, esCajaLocal, leerConfigCajaLocal } from "@/lib/caja-local";

export function useCompany() {
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      // En la caja descargable manda la configuración guardada en esa computadora.
      const local = esCajaLocal() ? await leerConfigCajaLocal() : null;
      if (local) {
        setCompany(aplicarConfigLocal(null, local));
        setLoading(false);
        return;
      }

      // Sin sesión iniciada la configuración no es legible: evitamos llamadas
      // que solo generan errores de permisos en la pantalla de acceso.
      const { data: sesion } = await supabase.auth.getSession();
      if (!sesion?.session) {
        setCompany(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("company_settings")
        .select("*")
        .order("created_at")
        .limit(1)
        .maybeSingle();

      if (data) {
        setCompany(aplicarConfigLocal(data as CompanySettings, local));
        setLoading(false);
        return;
      }

      // Copias nuevas pueden no tener configuración: la operación valida el rol
      // administrador y crea una única fila, incluso ante cargas simultáneas.
      const { data: companyId, error: ensureError } = await supabase.rpc("ensure_company_settings");
      if (ensureError || !companyId) {
        setCompany(null);
        setLoading(false);
        return;
      }
      const { data: created } = await supabase
        .from("company_settings")
        .select("*")
        .eq("id", companyId)
        .maybeSingle();
      setCompany(aplicarConfigLocal((created as CompanySettings) ?? null, local));
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    load();
  }, [load]);

  return { company, loading, reload: load, setCompany };
}
