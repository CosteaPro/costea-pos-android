/**
 * Funciones de servidor para el pre-cálculo de reportes.
 * Solo el personal administrativo puede pedir un cálculo o recálculo.
 *
 * El cálculo se hace con la sesión del propio usuario: así cada empresa ve
 * únicamente sus datos y el reporte se guarda siempre con su identificador.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Db } from "@/lib/db";

async function verificarAdmin(context: { supabase: Db; userId: string }) {
  const { data: roles, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const permitido = (roles ?? []).some((r) =>
    ["administrador", "admin_operativo"].includes(String(r.role)),
  );
  if (!permitido) throw new Error("Solo el administrador puede recalcular los reportes");
}

/** Empresa del usuario conectado; sin ella no se guarda ningún reporte. */
async function empresaDelUsuario(context: { supabase: Db; userId: string }) {
  const { data: perfil } = await context.supabase
    .from("profiles")
    .select("company_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (perfil?.company_id) return perfil.company_id as string;

  const { data: vinculo } = await context.supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", context.userId)
    .eq("active", true)
    .maybeSingle();
  if (vinculo?.company_id) return vinculo.company_id as string;

  throw new Error(
    "Tu usuario no está asignado a una empresa; pide al administrador que lo vincule.",
  );
}

export const recalcularReportes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fecha?: string }) => ({ fecha: input?.fecha }))
  .handler(async ({ data, context }) => {
    await verificarAdmin(context);
    const companyId = await empresaDelUsuario(context);
    const { recalcularSnapshots } = await import("@/lib/reportes-cache.server");
    return recalcularSnapshots(context.supabase, companyId, data.fecha);
  });

/**
 * Calcula un reporte en el servidor (mucho más rápido que hacerlo en el
 * navegador) y lo deja guardado para la próxima apertura.
 */
export const obtenerReporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: "mix" | "pyg" | "dashboard"; from: string; to: string }) => {
    const fecha = /^\d{4}-\d{2}-\d{2}$/;
    if (!["mix", "pyg", "dashboard"].includes(input?.kind)) throw new Error("Reporte inválido");
    if (!fecha.test(input?.from ?? "") || !fecha.test(input?.to ?? ""))
      throw new Error("Fechas inválidas");
    return { kind: input.kind, from: input.from, to: input.to };
  })
  .handler(async ({ data, context }) => {
    await verificarAdmin(context);
    const companyId = await empresaDelUsuario(context);
    const { calcularYGuardar } = await import("@/lib/reportes-cache.server");
    return calcularYGuardar(context.supabase, companyId, data.kind, data.from, data.to);
  });
