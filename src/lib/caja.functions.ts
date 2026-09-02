import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reabre el día que fue cerrado con un cierre definitivo.
 * Solo puede hacerlo el propio Super Administrador que ya tiene la sesión
 * abierta, confirmando SU contraseña. Nunca se prueban claves de otras
 * cuentas: así nadie puede usar esta pantalla para adivinar contraseñas ajenas.
 */
export const reopenBusinessDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string; businessDate: string }) => {
    if (!input?.password) throw new Error("Ingresa tu contraseña para reabrir el día");
    if (!input?.businessDate) throw new Error("Falta la fecha del día a reabrir");
    return input;
  })
  .handler(async ({ data, context }) => {
    // 1) Primero el permiso: quien no es Super Administrador ni siquiera llega
    //    a la comprobación de contraseña.
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role, is_owner")
      .eq("user_id", context.userId);
    const esSuper = (roles ?? []).some((r) => r.is_owner || r.role === "administrador");
    if (!esSuper) throw new Error("Solo el Super Administrador puede reabrir el día");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cuenta } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const correo = cuenta?.user?.email;
    if (!correo) throw new Error("Tu usuario no tiene un correo registrado");

    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

    const authClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    // 2) Se confirma únicamente la contraseña de quien está usando el sistema.
    const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
      email: correo,
      password: data.password,
    });
    if (signInError || !signIn.user) throw new Error("Contraseña incorrecta");


    const { error } = await supabaseAdmin
      .from("cash_closures")
      .update({
        reopened_at: new Date().toISOString(),
        reopened_by: signIn.user.id,
        reopened_by_email: signIn.user.email ?? correo,
      })
      .eq("closure_type", "cierre")
      .eq("business_date", data.businessDate)
      .is("reopened_at", null);
    if (error) throw new Error(error.message);

    await authClient.auth.signOut();
    return { ok: true as const };
  });
