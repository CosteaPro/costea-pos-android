import { createFileRoute } from "@tanstack/react-router";
import { autorizarCaja } from "@/lib/caja-auth.server";
import { verificarPin } from "@/lib/caja-admin-pin.server";

/**
 * Verifica la CLAVE DE ADMINISTRADOR para entrar a la configuración de una caja.
 * Es una clave propia del sistema de cajas, guardada cifrada en el servidor
 * central: NO es la contraseña personal de ningún administrador, así que esta
 * pantalla nunca puede usarse para adivinar contraseñas de las cuentas.
 */
export const Route = createFileRoute("/api/public/caja/clave-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await autorizarCaja(request);
        if ("error" in auth) return json({ ok: false, error: auth.error }, auth.status);

        const cuerpo = (await request.json().catch(() => ({}))) as { clave?: string };
        const clave = String(cuerpo.clave ?? "");
        if (!clave) return json({ ok: false, error: "Ingrese la clave de administrador" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: registro } = await supabaseAdmin
          .from("caja_admin_pin")
          .select("pin_hash")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!registro?.pin_hash)
          return json(
            {
              ok: false,
              error:
                "Aún no se define la clave de cajas. El Administrador debe crearla en Cajas autorizadas.",
            },
            409,
          );

        if (!verificarPin(clave, registro.pin_hash))
          return json({ ok: false, error: "Clave de administrador incorrecta" }, 401);

        return json({ ok: true });
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
