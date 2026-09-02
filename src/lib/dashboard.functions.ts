import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actionButtons, telegramSend } from "@/lib/telegram.server";

export type AsistenteInput = { question: string; contexto: string };

/** Asistente de Costea: responde en lenguaje natural sobre los datos del tablero. */
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AsistenteInput) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("La IA no está disponible en este proyecto.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Eres el Asistente de Costea, analista de un restaurante en Ecuador. Respondes SIEMPRE en español claro y breve, en dólares. " +
              "Usa únicamente los datos entregados; si algo no está, dilo. " +
              "Cuando te pidan un informe, entrega: resumen ejecutivo, puntos positivos, puntos de atención y recomendaciones concretas. " +
              "No uses tablas markdown, usa viñetas cortas.",
          },
          { role: "user", content: `DATOS DEL TABLERO:\n${data.contexto}\n\nPREGUNTA: ${data.question}` },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Se alcanzó el límite de consultas a la IA. Intenta en un momento.");
    if (res.status === 402) throw new Error("Se agotaron los créditos de IA del proyecto.");
    if (!res.ok) throw new Error(`La IA respondió ${res.status}`);

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { answer: json.choices?.[0]?.message?.content ?? "No pude generar una respuesta." };
  });

export type TargetRole = "owner" | "admin" | "inventory" | "kitchen";

const CHAT_FIELD: Record<TargetRole, string> = {
  owner: "chat_id_owner",
  admin: "chat_id_admin",
  inventory: "chat_id_inventory",
  kitchen: "chat_id_kitchen",
};

export const ROLE_LABEL: Record<TargetRole, string> = {
  owner: "Dueño",
  admin: "Administrador",
  inventory: "Encargado de inventario",
  kitchen: "Jefe de cocina",
};

export type AccionInput = {
  kind: "reporte" | "orden_compra" | "aviso_cocina";
  title: string;
  detail: string;
  targetRole: TargetRole;
};

/** Registra la acción propuesta por la IA y la envía por Telegram con botones. */
export const sendDashboardAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AccionInput) => input)
  .handler(async ({ data, context }) => {
    const { data: settings, error } = await context.supabase
      .from("notification_settings")
      .select("*")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const chatId =
      ((settings as Record<string, unknown> | null)?.[CHAT_FIELD[data.targetRole]] as
        | string
        | null
        | undefined) ??
      (settings?.telegram_chat_id ?? null);
    if (!chatId)
      throw new Error(
        `Configura el chat de Telegram de "${ROLE_LABEL[data.targetRole]}" en Configuración > Notificaciones.`,
      );

    const { data: row, error: insErr } = await context.supabase
      .from("dashboard_actions")
      .insert({
        kind: data.kind,
        title: data.title,
        detail: data.detail,
        target_role: data.targetRole,
        target_chat_id: chatId,
        status: "enviado",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const detalle = data.detail.length > 3200 ? `${data.detail.slice(0, 3200)}…` : data.detail;
    const sent = await telegramSend({
      chatId,
      message: `<b>${data.title}</b>\n\n<pre>${detalle.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)}</pre>`,
      buttons: actionButtons(row.id as string),
    });

    if (sent.result?.message_id) {
      await context.supabase
        .from("dashboard_actions")
        .update({ telegram_message_id: sent.result.message_id })
        .eq("id", row.id);
    }

    return { ok: true as const, id: row.id as string, destinatario: ROLE_LABEL[data.targetRole] };
  });
