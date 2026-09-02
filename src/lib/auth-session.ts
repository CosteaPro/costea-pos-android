import { supabase } from "@/integrations/supabase/client";
import {
  clearLegacyAuthStorage,
  clearMemoryAuthStorage,
  setSigningOut,
} from "@/integrations/supabase/auth-storage";
import { borrarSesion } from "@/lib/session.functions";

/** Cierra la sesión tanto en memoria como en la cookie HttpOnly. */
export async function cerrarSesionSegura() {
  setSigningOut(true);
  try {
    // Se borra primero la persistencia para impedir que otro hook la rehidrate.
    await borrarSesion();
    await supabase.auth.signOut();
    clearMemoryAuthStorage();
    clearLegacyAuthStorage();
  } finally {
    setSigningOut(false);
  }
}