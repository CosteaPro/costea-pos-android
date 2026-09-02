import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Confirma que quien anula es realmente un administrador: se vuelve a pedir su
 * clave y se valida contra el servidor central (nunca se guarda en el equipo).
 */
export const verificarClaveAdministrativa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { clave: string }) => {
    if (!data?.clave) throw new Error("Ingrese su clave para confirmar la anulación");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role, is_owner")
      .eq("user_id", context.userId);
    const permitido = (roles ?? []).some(
      (r) => r.is_owner || r.role === "administrador" || r.role === "admin_operativo",
    );
    if (!permitido) throw new Error("Solo un Administrador o Superadministrador puede anular");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usuario } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const correo = usuario?.user?.email;
    if (!correo) throw new Error("Su usuario no tiene un correo registrado");

    const { createClient } = await import("@supabase/supabase-js");
    const publica = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: sesion, error } = await publica.auth.signInWithPassword({
      email: correo,
      password: data.clave,
    });
    await publica.auth.signOut();
    if (error || !sesion?.user) throw new Error("Clave incorrecta");

    return { ok: true as const, email: correo };
  });
