/**
 * Puente server-only con la API de Telegram (a través del conector de Lovable).
 * Nunca se expone el token al navegador.
 */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export type InlineButton = { text: string; callback_data: string };

export async function telegramCall<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey || !telegramKey) {
    throw new Error("El conector de Telegram no está configurado en el proyecto.");
  }

  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram respondió ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

/** Envía un mensaje con botones interactivos opcionales. */
export async function telegramSend(opts: {
  chatId: string;
  message: string;
  buttons?: InlineButton[][];
}) {
  return telegramCall<{ ok: boolean; result?: { message_id: number } }>("sendMessage", {
    chat_id: opts.chatId,
    text: opts.message,
    parse_mode: "HTML",
    ...(opts.buttons ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
  });
}

export async function telegramAnswerCallback(callbackId: string, text: string) {
  return telegramCall("answerCallbackQuery", { callback_query_id: callbackId, text });
}

/** Botones estándar de seguimiento de una acción del tablero. */
export const actionButtons = (id: string): InlineButton[][] => [
  [
    { text: "🔘 En revisión", callback_data: `rev:${id}` },
    { text: "📎 Subir evidencia", callback_data: `evi:${id}` },
  ],
  [{ text: "✅ Marcar como resuelto", callback_data: `res:${id}` }],
];
