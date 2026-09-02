import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Indica si ya existe una clave de administrador de cajas definida. */
export const hayClaveCajas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role, is_owner")
      .eq("user_id", context.userId);
    const esAdmin = (roles ?? []).some(
      (r) => r.is_owner || r.role === "administrador" || r.role === "admin_operativo",
    );
    if (!esAdmin) throw new Error("Solo un Administrador puede consultar esta información");

    const { count } = await supabaseAdmin
      .from("caja_admin_pin")
      .select("id", { count: "exact", head: true });
    return { definida: (count ?? 0) > 0 };
  });

/** Crea o cambia la clave de administrador que piden las cajas. */
export const guardarClaveCajas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clave: string }) => {
    const clave = String(input?.clave ?? "");
    if (clave.length < 8) throw new Error("La clave debe tener al menos 8 caracteres");
    return { clave };
  })
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role, is_owner")
      .eq("user_id", context.userId);
    const esSuper = (roles ?? []).some((r) => r.is_owner || r.role === "administrador");
    if (!esSuper) throw new Error("Solo el Administrador puede definir la clave de cajas");

    const { cifrarPin } = await import("@/lib/caja-admin-pin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cuenta } = await supabaseAdmin.auth.admin.getUserById(context.userId);

    const payload = {
      pin_hash: cifrarPin(data.clave),
      updated_by: context.userId,
      updated_by_email: cuenta?.user?.email ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: actual } = await supabaseAdmin
      .from("caja_admin_pin")
      .select("id")
      .limit(1)
      .maybeSingle();

    const { error } = actual
      ? await supabaseAdmin.from("caja_admin_pin").update(payload).eq("id", actual.id)
      : await supabaseAdmin.from("caja_admin_pin").insert(payload);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });
