import { createFileRoute } from "@tanstack/react-router";
import { autorizarCaja } from "@/lib/caja-auth.server";

/**
 * Catálogo del día para una caja de escritorio.
 * La caja se identifica con establecimiento + punto de emisión + clave de sincronización.
 * El servidor SOLO entrega datos: nunca asigna números de factura.
 */
export const Route = createFileRoute("/api/public/caja/catalogo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await autorizarCaja(request);
        if ("error" in auth) return json({ error: auth.error }, auth.status);
        const caja = auth.caja;

        const url = new URL(request.url);
        const soloResumen = url.searchParams.get("resumen") === "1";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [categorias, productos, mesas, empresa, unidades, recetas, opciones] = await Promise.all([
          supabaseAdmin.from("categories").select("*").order("name"),
          supabaseAdmin
            .from("products")
            .select("id, code, name, price, category_id, image_url, print_area, available")
            .eq("available", true)
            .order("name"),
          supabaseAdmin.from("restaurant_tables").select("*"),
          supabaseAdmin.from("company_settings").select("*").order("created_at").limit(1).maybeSingle(),
          supabaseAdmin.from("measurement_units").select("*").eq("active", true).order("name"),
          supabaseAdmin
            .from("recipes")
            .select("id, code, name, kind, product_id, yield_quantity, yield_unit")
            .order("name"),
          supabaseAdmin
            .from("product_options")
            .select("*")
            .order("sort_order"),
        ]);

        // Huella del menú: cambia si cambian categorías, productos, precios,
        // fotos o disponibilidad. La caja la usa para saber si debe sincronizar.
        const version = await huella([
          ...(categorias.data ?? []).map((c) => `c:${c.id}:${c.name}:${c.sort_order}`),
          ...(opciones.data ?? []).map(
            (o) => `o:${o.product_id}:${o.option_product_id}:${o.kind}:${o.default_selected}`,
          ),
          ...(productos.data ?? []).map(
            (p) =>
              `p:${p.id}:${p.name}:${p.price}:${p.category_id}:${p.image_url ?? ""}:${p.print_area}:${p.available}`,
          ),
        ]);

        if (soloResumen) return json({ version, generadoEn: new Date().toISOString() });

        // Enlaces temporales para que la caja descargue las fotos una sola vez
        // y las guarde en el propio computador.
        const conFoto = (productos.data ?? []).filter((p) => p.image_url);
        const firmadas = new Map<string, string>();
        if (conFoto.length > 0) {
          const { data } = await supabaseAdmin.storage
            .from("productos")
            .createSignedUrls(
              conFoto.map((p) => p.image_url as string),
              60 * 60 * 24 * 7,
            );
          for (const f of data ?? []) if (f.path && f.signedUrl) firmadas.set(f.path, f.signedUrl);
        }

        return json({
          caja,
          version,
          empresa: empresa.data ?? null,
          categorias: categorias.data ?? [],
          productos: (productos.data ?? []).map((p) => ({
            ...p,
            image_signed_url: p.image_url ? (firmadas.get(p.image_url) ?? null) : null,
          })),
          opciones: opciones.data ?? [],
          mesas: mesas.data ?? [],
          unidades: unidades.data ?? [],
          recetas: recetas.data ?? [],
          generadoEn: new Date().toISOString(),
        });
      },

    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Huella corta y estable del menú (SHA-256 de sus datos visibles). */
async function huella(partes: string[]) {
  const datos = new TextEncoder().encode(partes.join("|"));
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
