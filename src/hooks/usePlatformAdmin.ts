import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { soyAdminPlataforma } from "@/lib/plataforma.functions";

/**
 * Indica si el usuario en sesión es administrador de la plataforma.
 * La respuesta viene del servidor; el navegador solo la usa para mostrar u
 * ocultar el menú, nunca para autorizar operaciones.
 */
export function usePlatformAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [esAdminPlataforma, setEs] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setEs(false);
      setLoading(false);
      return;
    }
    let vivo = true;
    setLoading(true);
    soyAdminPlataforma()
      .then((r) => vivo && setEs(Boolean(r?.esAdmin)))
      .catch(() => vivo && setEs(false))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [user, authLoading]);

  return { esAdminPlataforma, loading };
}
