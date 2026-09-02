import { createFileRoute } from "@tanstack/react-router";
import { autorizarCaja } from "@/lib/caja-auth.server";

/**
 * Verificación de credenciales de una caja de escritorio.
 * Devuelve un token de sesión (informativo) y los datos de la caja autorizada.
 */
export const Route = createFileRoute("/api/public/caja/autorizar")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});

async function handler({ request }: { request: Request }) {
  const auth = await autorizarCaja(request);
  if ("error" in auth) return json({ autorizado: false, error: auth.error }, auth.status);
  return json({
    autorizado: true,
    caja: auth.caja,
    token: `${auth.caja.codigo}.${Date.now().toString(36)}`,
    verificadoEn: new Date().toISOString(),
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
