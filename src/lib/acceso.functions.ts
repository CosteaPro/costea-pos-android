import { createServerFn } from "@tanstack/react-start";
import { normalizeUsername } from "@/lib/usernames";

export type EmpresaAcceso = { slug: string; nombre: string };

/** Datos públicos mínimos de la empresa para su pantalla de acceso propia. */
export const empresaPorSlug = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => ({
    slug: (input?.slug ?? "").trim().toLowerCase().slice(0, 80),
  }))
  .handler(async ({ data }): Promise<EmpresaAcceso | null> => {
    if (!data.slug) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fila } = await supabaseAdmin
      .from("platform_companies")
      .select("slug, trade_name, status, deleted_at")
      .eq("slug", data.slug)
      .is("deleted_at", null)
      .maybeSingle();
    if (!fila || fila.status === "suspendida") return null;
    return { slug: fila.slug, nombre: fila.trade_name };
  });

export type ResolucionAcceso =
  | { tipo: "unico"; loginEmail: string }
  | { tipo: "varias"; empresas: EmpresaAcceso[] }
  | { tipo: "ninguno" };

/**
 * Traduce el nombre de usuario al correo interno con el que se autentica.
 * Si el mismo usuario existe en varias empresas, devuelve la lista para elegir.
 */
export const resolverAcceso = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; slug?: string }) => ({
    username: normalizeUsername(input?.username ?? "").slice(0, 60),
    slug: (input?.slug ?? "").trim().toLowerCase().slice(0, 80),
  }))
  .handler(async ({ data }): Promise<ResolucionAcceso> => {
    if (data.username.length < 3) return { tipo: "ninguno" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: perfiles } = await supabaseAdmin
      .from("profiles")
      .select("login_email, company_id")
      .ilike("username", data.username);

    const filas = (perfiles ?? []).filter((p) => Boolean(p.login_email));
    if (filas.length === 0) return { tipo: "ninguno" };

    const ids = Array.from(new Set(filas.map((p) => p.company_id).filter(Boolean))) as string[];
    const { data: empresas } = ids.length
      ? await supabaseAdmin
          .from("platform_companies")
          .select("id, slug, trade_name")
          .in("id", ids)
          .is("deleted_at", null)
      : { data: [] as { id: string; slug: string; trade_name: string }[] };

    if (data.slug) {
      const empresa = (empresas ?? []).find((e) => e.slug === data.slug);
      const fila = empresa ? filas.find((p) => p.company_id === empresa.id) : undefined;
      return fila ? { tipo: "unico", loginEmail: fila.login_email! } : { tipo: "ninguno" };
    }

    if (filas.length === 1) return { tipo: "unico", loginEmail: filas[0]!.login_email! };

    return {
      tipo: "varias",
      empresas: (empresas ?? []).map((e) => ({ slug: e.slug, nombre: e.trade_name })),
    };
  });
