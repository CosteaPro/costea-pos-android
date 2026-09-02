import { createFileRoute } from "@tanstack/react-router";
import { telegramAnswerCallback, telegramSend } from "@/lib/telegram.server";

/**
 * Webhook del bot de Telegram de Costea.
 * Recibe los botones interactivos (en revisión / evidencia / resuelto) y los
 * comandos básicos: /iniciar, /estado, /alertas, /ayuda.
 */
export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Solo Telegram conoce esta palabra secreta (se envía al registrar el
        // webhook con setWebhook). Sin ella, la petición se descarta.
        const esperado = process.env["TELEGRAM_WEBHOOK_SECRET"];
        const recibido = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!esperado || recibido !== esperado) {
          return json({ ok: false }, 401);
        }

        const update = (await request.json().catch(() => ({}))) as TelegramUpdate;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1) Botones de seguimiento de una acción del tablero.
        const cb = update.callback_query;
        if (cb?.data) {
          const [accion, id] = cb.data.split(":");
          const estados: Record<string, string> = {
            rev: "revision",
            evi: "revision",
            res: "resuelto",
          };
          const estado = estados[accion ?? ""] ?? "leido";
          const nota =
            accion === "evi"
              ? "Se solicitó subir evidencia desde Telegram."
              : accion === "res"
                ? "Marcado como resuelto desde Telegram."
                : "Marcado en revisión desde Telegram.";

          if (id) {
            await supabaseAdmin
              .from("dashboard_actions")
              .update({ status: estado, response_note: nota })
              .eq("id", id);
          }

          await telegramAnswerCallback(
            cb.id,
            accion === "evi"
              ? "Envía la foto o archivo como respuesta a este mensaje."
              : accion === "res"
                ? "Listo: marcado como resuelto."
                : "Listo: marcado en revisión.",
          ).catch(() => undefined);
          return json({ ok: true });
        }

        // 2) Comandos y mensajes.
        const msg = update.message;
        const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
        const texto = (msg?.text ?? "").trim().toLowerCase();
        if (!chatId) return json({ ok: true });

        // Evidencia enviada como foto o documento.
        if (msg?.photo?.length || msg?.document) {
          await supabaseAdmin
            .from("dashboard_actions")
            .update({ status: "revision", response_note: "Evidencia recibida por Telegram." })
            .eq("target_chat_id", chatId)
            .eq("status", "revision");
          await telegramSend({ chatId, message: "📎 Evidencia recibida. Gracias." }).catch(() => undefined);
          return json({ ok: true });
        }

        if (texto.startsWith("/iniciar")) {
          await telegramSend({
            chatId,
            message: `<b>Costea POS</b>\nCuenta vinculada.\nTu chat ID es <code>${chatId}</code>. Pégalo en Configuración › Notificaciones para recibir alertas.`,
          }).catch(() => undefined);
          return json({ ok: true });
        }

        if (texto.startsWith("/estado")) {
          const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
          const { data: orders } = await supabaseAdmin
            .from("orders")
            .select("total")
            .eq("status", "pagado")
            .neq("doc_status", "anulado")
            .gte("created_at", `${hoy}T05:00:00.000Z`);
          const total = (orders ?? []).reduce((s, o) => s + Number(o.total || 0), 0);
          await telegramSend({
            chatId,
            message: `<b>📊 Estado de hoy (${hoy})</b>\nTickets: ${orders?.length ?? 0}\nVenta bruta: $${total.toFixed(2)}`,
          }).catch(() => undefined);
          return json({ ok: true });
        }

        if (texto.startsWith("/alertas")) {
          const { data: acciones } = await supabaseAdmin
            .from("dashboard_actions")
            .select("title, status, created_at")
            .neq("status", "resuelto")
            .order("created_at", { ascending: false })
            .limit(10);
          const lista = (acciones ?? []).map((a) => `• ${a.title} — ${a.status}`).join("\n");
          await telegramSend({
            chatId,
            message: `<b>🚨 Pendientes</b>\n${lista || "No hay pendientes."}`,
          }).catch(() => undefined);
          return json({ ok: true });
        }

        if (texto.startsWith("/ayuda") || texto.startsWith("/start")) {
          await telegramSend({
            chatId,
            message:
              "<b>Comandos de Costea</b>\n/iniciar — vincular esta cuenta\n/estado — resumen rápido del día\n/alertas — pendientes por resolver\n/ayuda — esta lista",
          }).catch(() => undefined);
        }

        return json({ ok: true });
      },
    },
  },
});

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id: number };
    photo?: unknown[];
    document?: unknown;
  };
  callback_query?: { id: string; data?: string };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
