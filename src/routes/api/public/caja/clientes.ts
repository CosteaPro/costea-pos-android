import { createFileRoute } from "@tanstack/react-router";
import { autorizarCaja } from "@/lib/caja-auth.server";

/**
 * Base de datos de clientes compartida por todas las cajas.
 *  · GET  → lista completa para que la caja guarde su copia local.
 *  · POST → registra o actualiza clientes (la identificación es única).
 * Los clientes viven una sola vez en el servidor central: al registrarlos en
 * cualquier caja quedan disponibles al instante para todas las demás.
 */
export const Route = createFileRoute("/api/public/caja/clientes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await autorizarCaja(request);
        if ("error" in auth) return json({ error: auth.error }, auth.status);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("customers")
          .select("id_type, id_number, name, address, email, phone, tax_regime, updated_at")
          // Cada caja sólo ve los clientes de su propia empresa.
          .eq("company_id", auth.caja.company_id)
          .order("updated_at", { ascending: false })
          .limit(5000);

        if (error) return json({ error: error.message }, 500);
        return json({ clientes: data ?? [], generadoEn: new Date().toISOString() });
      },

      POST: async ({ request }) => {
        const auth = await autorizarCaja(request);
        if ("error" in auth) return json({ error: auth.error }, auth.status);

        const cuerpo = (await request.json().catch(() => ({}))) as {
          clientes?: unknown;
        };
        const entrada = Array.isArray(cuerpo.clientes) ? cuerpo.clientes : [];
        const filas = entrada
          .map((c) => c as Record<string, unknown>)
          .map((c) => ({
            company_id: auth.caja.company_id,
            id_type: String(c["id_type"] ?? "cedula"),
            id_number: String(c["id_number"] ?? "").trim(),
            name: String(c["name"] ?? "").trim(),
            address: c["address"] ? String(c["address"]) : null,
            email: c["email"] ? String(c["email"]) : null,
            phone: c["phone"] ? String(c["phone"]) : null,
            tax_regime: c["tax_regime"] ? String(c["tax_regime"]) : null,
            updated_at: new Date().toISOString(),
          }))
          .filter((c) => c.id_number.length >= 5 && c.name.length > 0);

        if (filas.length === 0) return json({ guardados: 0, clientes: [] });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("customers")
          .upsert(filas, { onConflict: "company_id,id_number" });

        if (error) return json({ error: error.message }, 500);
        return json({ guardados: filas.length, identificaciones: filas.map((f) => f.id_number) });
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
