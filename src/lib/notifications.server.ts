/**
 * Helper server-only para enviar alertas por Telegram.
 * Usa el connector gateway de Lovable; nunca expone el token al cliente.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export type NotificationPayload = {
  botToken: string;
  chatId: string;
  message: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
};

export async function sendTelegramAlert(payload: NotificationPayload) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];

  if (!lovableKey || !telegramKey) {
    throw new Error("El conector de Telegram no está configurado en el proyecto.");
  }
  if (!payload.botToken || !payload.chatId) {
    throw new Error("Falta configurar el token del bot o el chat ID de Telegram.");
  }

  const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: payload.chatId,
      text: payload.message,
      parse_mode: payload.parseMode ?? "HTML",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram respondió ${response.status}: ${body}`);
  }

  return (await response.json()) as { ok: boolean; result?: { message_id: number } };
}
