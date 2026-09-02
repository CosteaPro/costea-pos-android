import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  clearLegacyAuthStorage,
  clearMemoryAuthStorage,
  isSigningOut,
} from "@/integrations/supabase/auth-storage";
import { borrarSesion, guardarSesion, leerSesion } from "@/lib/session.functions";

/** Copia la sesión activa a la cookie HttpOnly (nunca queda en Local Storage). */
async function persistir(session: Session | null) {
  try {
    if (!session?.access_token || !session.refresh_token) return;
    await guardarSesion({
      data: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
      },
    });
  } catch {
    /* la sesión sigue viva en memoria aunque falle el guardado */
  }
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clearLegacyAuthStorage();
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === "SIGNED_OUT") {
        clearMemoryAuthStorage();
        clearLegacyAuthStorage();
        void borrarSesion().catch(() => undefined);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        void persistir(next);
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSession(data.session);
        setLoading(false);
        void persistir(data.session);
        return;
      }
      // Sin sesión en memoria: se rehidrata desde la cookie HttpOnly.
      try {
        if (isSigningOut()) return;
        const guardada = await leerSesion();
        if (guardada && !isSigningOut()) {
          const { data: restaurada } = await supabase.auth.setSession({
            access_token: guardada.access_token,
            refresh_token: guardada.refresh_token,
          });
          setSession(restaurada.session ?? null);
        }
      } catch {
        /* sin cookie válida se muestra la pantalla de acceso */
      }
      setLoading(false);
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}
