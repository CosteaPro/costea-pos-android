import { createFileRoute } from "@tanstack/react-router";

/**
 * Entrega pública del comprobante autorizado a partir de su clave de acceso
 * (49 dígitos, imposible de adivinar). Es el enlace que recibe el cliente
 * por correo:  ?formato=xml  → XML autorizado ·  ?formato=ride → RIDE A4.
 */
export const Route = createFileRoute("/api/public/comprobante/$claveAcceso")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const clave = String(params.claveAcceso ?? "");
        if (!/^\d{49}$/.test(clave)) return new Response("Clave de acceso no válida", { status: 400 });

        const formato = new URL(request.url).searchParams.get("formato") === "xml" ? "xml" : "ride";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("*")
          .eq("access_key", clave)
          .maybeSingle();

        if (!order || order.sri_status !== "autorizado")
          return new Response("Comprobante no disponible", { status: 404 });

        if (formato === "xml") {
          // Siempre el XML oficial autorizado por el SRI; el firmado es solo respaldo.
          const xmlOficial = (order as Record<string, any>).xml_authorized ?? order.xml_signed;
          if (!xmlOficial) return new Response("El XML no está disponible", { status: 404 });
          return new Response(xmlOficial, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Content-Disposition": `attachment; filename="${clave}.xml"`,
              "Cache-Control": "private, no-store",
            },
          });
        }

        const [{ data: company }, { data: items }] = await Promise.all([
          supabaseAdmin.from("company_settings").select("*").order("created_at").limit(1).maybeSingle(),
          supabaseAdmin
            .from("order_items")
            .select("product_name, quantity, unit_price")
            .eq("order_id", order.id),
        ]);
        if (!company) return new Response("Comprobante no disponible", { status: 404 });

        const { buildRideHtml } = await import("@/lib/ride.server");
        const html = buildRideHtml({ company, order, items: items ?? [] });
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
        });
      },
    },
  },
});
