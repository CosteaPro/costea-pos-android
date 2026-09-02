import { createFileRoute } from "@tanstack/react-router";

/**
 * Consulta pública de datos del contribuyente en el SRI.
 * La usan el panel central y la caja descargable al escribir la cédula o RUC.
 * Solo lee información pública del catastro; no expone datos del sistema.
 */
export const Route = createFileRoute("/api/public/sri/contribuyente")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const identificacion = (url.searchParams.get("identificacion") ?? "").trim();
        if (!/^\d{10}$|^\d{13}$/.test(identificacion.replace(/\D/g, ""))) {
          return Response.json(
            { encontrado: false, error: "La identificación debe tener 10 o 13 dígitos" },
            { status: 400 },
          );
        }
        const { consultarContribuyenteSri } = await import("@/lib/sri-contribuyente.server");
        const datos = await consultarContribuyenteSri(identificacion);
        return Response.json(
          { encontrado: Boolean(datos), contribuyente: datos },
          { headers: { "Cache-Control": "public, max-age=3600" } },
        );
      },
    },
  },
});
