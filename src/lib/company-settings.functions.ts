import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { companySettingsSchema } from "@/lib/company-settings.schema";

export type ValorAuditoria = string | number | boolean | null;
export type CambioAuditoria = { campo: string; antes: ValorAuditoria; despues: ValorAuditoria };

function valorPlano(valor: unknown): ValorAuditoria {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") return valor;
  return JSON.stringify(valor);
}

export type RegistroAuditoria = {
  id: string;
  created_at: string;
  user_email: string;
  user_role: string;
  ip: string | null;
  user_agent: string | null;
  changes: CambioAuditoria[];
};

const ROLES_ADMIN = ["administrador", "admin_operativo"];

/** Guarda la configuración de la empresa revalidando en el servidor y dejando bitácora. */
export const updateCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; values: unknown }) => {
    if (!input?.id || typeof input.id !== "string") throw new Error("Configuración inválida");
    const parsed = companySettingsSchema.safeParse(input.values);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(first ? `${first.path.join(".")}: ${first.message}` : "Datos inválidos");
    }
    return { id: input.id, values: parsed.data };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const rolesUsuario = (roles ?? []).map((r) => String(r.role));
    const rolAdmin = rolesUsuario.find((r) => ROLES_ADMIN.includes(r));
    if (!rolAdmin) throw new Error("Solo un administrador puede modificar la configuración de la empresa");

    const { data: actual, error: readError } = await supabase
      .from("company_settings")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!actual) throw new Error("No se encontró la configuración de la empresa");

    const { error: updateError } = await supabase
      .from("company_settings")
      .update(data.values)
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    const cambios: CambioAuditoria[] = Object.entries(data.values)
      .filter(([campo, valor]) => {
        const previo = (actual as Record<string, unknown>)[campo];
        return JSON.stringify(previo ?? null) !== JSON.stringify(valor ?? null);
      })
      .map(([campo, valor]) => ({
        campo,
        antes: valorPlano((actual as Record<string, unknown>)[campo]),
        despues: valorPlano(valor),
      }));

    if (cambios.length > 0) {
      const ip =
        getRequestHeader("cf-connecting-ip") ??
        getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
        null;
      const userAgent = getRequestHeader("user-agent") ?? null;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("company_settings_audit").insert({
        settings_id: data.id,
        user_id: userId,
        user_email: String(context.claims?.["email"] ?? ""),
        user_role: rolAdmin,
        changes: cambios,
        ip,
        user_agent: userAgent,
      });
    }

    return { ok: true, cambios: cambios.length };
  });

/** Historial de cambios (solo administradores, protegido además por RLS). */
export const listCompanySettingsAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number; offset?: number } | undefined) => ({
    limit: Math.min(Math.max(Number(input?.limit ?? 20), 1), 100),
    offset: Math.max(Number(input?.offset ?? 0), 0),
  }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("company_settings_audit")
      .select("id, created_at, user_email, user_role, ip, user_agent, changes")
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as RegistroAuditoria[];
  });

export type PruebaRls = { nombre: string; ok: boolean; detalle: string };

/** Verificación en caliente de las reglas de seguridad de la base de datos. */
export const runRlsSelfTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const esAdmin = (roles ?? []).some((r) => ROLES_ADMIN.includes(String(r.role)));
    if (!esAdmin) throw new Error("Solo un administrador puede ejecutar la prueba de seguridad");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pruebas: PruebaRls[] = [];

    const revisar = async (tabla: string, esperado: { insert: boolean; update: boolean; delete: boolean }) => {
      const { data, error } = await supabaseAdmin.rpc("rls_policy_report", { _table: tabla });
      if (error) {
        pruebas.push({ nombre: tabla, ok: false, detalle: error.message });
        return;
      }
      const info = (data ?? {}) as {
        rls_enabled?: boolean;
        select?: number;
        insert?: number;
        update?: number;
        delete?: number;
        anon_grants?: number;
      };
      pruebas.push({
        nombre: `${tabla}: protección activa`,
        ok: Boolean(info.rls_enabled),
        detalle: info.rls_enabled ? "RLS habilitada" : "RLS DESHABILITADA",
      });
      pruebas.push({
        nombre: `${tabla}: sin acceso público`,
        ok: (info.anon_grants ?? 0) === 0,
        detalle: (info.anon_grants ?? 0) === 0 ? "El rol anónimo no tiene permisos" : "El rol anónimo tiene permisos",
      });
      pruebas.push({
        nombre: `${tabla}: lectura restringida por política`,
        ok: (info.select ?? 0) > 0,
        detalle: `${info.select ?? 0} política(s) de lectura`,
      });
      for (const accion of ["insert", "update", "delete"] as const) {
        const cantidad = info[accion] ?? 0;
        const permitido = esperado[accion];
        pruebas.push({
          nombre: `${tabla}: escritura (${accion})`,
          ok: permitido ? cantidad > 0 : cantidad === 0,
          detalle: permitido
            ? `${cantidad} política(s) para administradores`
            : cantidad === 0
              ? "Bloqueada para todos los usuarios"
              : `${cantidad} política(s) inesperada(s)`,
        });
      }
    };

    await revisar("company_settings", { insert: true, update: true, delete: false });
    await revisar("company_settings_audit", { insert: false, update: false, delete: false });

    return { pruebas, ok: pruebas.every((p) => p.ok), fecha: new Date().toISOString() };
  });
