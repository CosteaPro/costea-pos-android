import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { puenteCaja } from "@/lib/caja-local";

/**
 * Indica si el día de trabajo actual (Ecuador) tiene un cierre definitivo vigente.
 * El bloqueo se desactiva solo al cambiar de fecha o si un Administrador reabre el día.
 */
export function useDayLock() {
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const puente = puenteCaja();
      if (puente?.estadoTurno) {
        const estado = await puente.estadoTurno();
        setLocked(Boolean(estado.cerrado));
        return;
      }
      const { data } = await supabase.rpc("day_is_locked");
      setLocked(Boolean(data));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { locked, loading, refresh };
}
