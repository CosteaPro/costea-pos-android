import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const esquemaSesion = z.object({
  access_token: z.string().min(20),
  refresh_token: z.string().min(10),
  expires_at: z.number().int().positive().optional(),
});

/** Guarda la sesión en una cookie HttpOnly tras comprobar que el token es válido. */
export const guardarSesion = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => esquemaSesion.parse(data))
  .handler(async ({ data }) => {
    const { usuarioDeToken } = await import("@/lib/session-verify.server");
    const userId = await usuarioDeToken(data.access_token);
    if (!userId) return { ok: false as const };

    // Solo los roles administrativos caducan por inactividad; caja, mesero y
    // cocina mantienen la pantalla abierta durante todo el turno.
    let administrativo = false;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      administrativo = (roles ?? []).some(
        (r) => r.role === "administrador" || r.role === "admin_operativo",
      );
    } catch {
      /* si no se puede leer el rol se usa la duración corta por seguridad */
      administrativo = true;
    }

    const { guardarSesionCookie, SESION_MAX_AGE, SESION_MAX_AGE_TURNO } = await import(
      "@/lib/session.server"
    );
    await guardarSesionCookie(data, administrativo ? SESION_MAX_AGE : SESION_MAX_AGE_TURNO);
    return { ok: true as const };
  });

/** Devuelve la sesión guardada en la cookie (solo para rehidratar en memoria). */
export const leerSesion = createServerFn({ method: "POST" }).handler(async () => {
  const { leerSesionCookie } = await import("@/lib/session.server");
  return (await leerSesionCookie()) ?? null;
});

/** Borra la cookie de sesión al cerrar sesión. */
export const borrarSesion = createServerFn({ method: "POST" }).handler(async () => {
  const { borrarSesionCookie } = await import("@/lib/session.server");
  await borrarSesionCookie();
  return { ok: true as const };
});
