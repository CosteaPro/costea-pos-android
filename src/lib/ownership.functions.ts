import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Asigna el Propietario/Super Administrador inicial.
 * Solo el servidor puede ejecutar la funcion de base de datos; aqui se valida
 * la sesion del usuario antes de invocarla con privilegios elevados.
 */
export const claimSystemOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("claim_system_ownership_for", {
      _user_id: context.userId,
    });
    if (error) return { claimed: false };
    return { claimed: Boolean(data) };
  });
