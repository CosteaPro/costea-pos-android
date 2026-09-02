import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTelegramAlert } from "@/lib/notifications.server";
import type { Database } from "@/integrations/supabase/types";

type NotificationSettingsRow = Database["public"]["Tables"]["notification_settings"]["Row"];

const getSettings = async (supabase: { from: (t: string) => any }) => {
  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as NotificationSettingsRow | null;
};

export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const settings = await getSettings(context.supabase);
    if (!settings) {
      const { data, error } = await context.supabase
        .from("notification_settings")
        .insert({})
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? {}) as NotificationSettingsRow;
    }
    return settings;
  });

export type NotificationSettingsInput = {
  telegram_bot_token?: string | null;
  telegram_chat_id?: string | null;
  alert_order_ready?: boolean;
  alert_cash_closure?: boolean;
  alert_low_stock?: boolean;
};

export const saveNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NotificationSettingsInput) => input)
  .handler(async ({ data, context }) => {
    const current = await getSettings(context.supabase);
    const payload = {
      telegram_bot_token: data.telegram_bot_token ?? current?.telegram_bot_token ?? null,
      telegram_chat_id: data.telegram_chat_id ?? current?.telegram_chat_id ?? null,
      alert_order_ready: data.alert_order_ready ?? current?.alert_order_ready ?? false,
      alert_cash_closure: data.alert_cash_closure ?? current?.alert_cash_closure ?? false,
      alert_low_stock: data.alert_low_stock ?? current?.alert_low_stock ?? false,
    };

    if (current) {
      const { error } = await context.supabase
        .from("notification_settings")
        .update(payload)
        .eq("id", current.id);
      if (error) throw new Error(error.message);
      return { ok: true as const };
    }

    const { error } = await context.supabase.from("notification_settings").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const testTelegramConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { message?: string }) => input)
  .handler(async ({ data, context }) => {
    const settings = await getSettings(context.supabase);
    if (!settings?.telegram_bot_token || !settings.telegram_chat_id) {
      throw new Error("Configura primero el token del bot y el chat ID en Ajustes > Notificaciones.");
    }

    await sendTelegramAlert({
      botToken: settings.telegram_bot_token,
      chatId: settings.telegram_chat_id,
      message:
        data.message ??
        "<b>Costea POS</b>\n✅ Conexión con Telegram activa. Recibirás alertas operativas aquí.",
    });

    return { ok: true as const };
  });

/**
 * Registra el webhook del bot con una palabra secreta.
 * Telegram devolverá esa palabra en cada aviso y el servidor rechaza todo lo
 * que no la traiga, así nadie de afuera puede fingir mensajes del bot.
 */
export const registrarWebhookTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => {
    if (!input?.url?.startsWith("https://")) throw new Error("La dirección debe empezar con https");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role, is_owner")
      .eq("user_id", context.userId);
    const esAdmin = (roles ?? []).some(
      (r: { role: string; is_owner: boolean }) =>
        r.is_owner || r.role === "administrador" || r.role === "admin_operativo",
    );
    if (!esAdmin) throw new Error("Solo un Administrador puede configurar el bot");

    const secreto = process.env["TELEGRAM_WEBHOOK_SECRET"];
    if (!secreto) throw new Error("Falta la palabra secreta del webhook en el servidor");

    const { telegramCall } = await import("@/lib/telegram.server");
    await telegramCall("setWebhook", {
      url: `${data.url.replace(/\/$/, "")}/api/public/telegram/webhook`,
      secret_token: secreto,
      allowed_updates: ["message", "callback_query"],
    });
    return { ok: true as const };
  });



export const notifyOrderReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { folio: number; orderLabel?: string | null; tableName?: string | null }) => input,
  )
  .handler(async ({ data, context }) => {
    const settings = await getSettings(context.supabase);
    if (!settings?.alert_order_ready || !settings.telegram_bot_token || !settings.telegram_chat_id) {
      return { sent: false as const, reason: "Notificación desactivada o sin configurar" };
    }

    const label = data.orderLabel ?? data.tableName ?? `Pedido #${data.folio}`;
    await sendTelegramAlert({
      botToken: settings.telegram_bot_token,
      chatId: settings.telegram_chat_id,
      message: `<b>🍽️ Pedido listo</b>\n${label} (#${data.folio}) está listo para entregar.`,
    });
    return { sent: true as const };
  });

export const notifyCashClosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      businessDate: string;
      shift: string;
      total: number;
      difference: number;
      tickets: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const settings = await getSettings(context.supabase);
    if (!settings?.alert_cash_closure || !settings.telegram_bot_token || !settings.telegram_chat_id) {
      return { sent: false as const, reason: "Notificación desactivada o sin configurar" };
    }

    const money = (n: number) =>
      new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n);
    const diffLabel =
      data.difference === 0 ? "CUADRADO" : data.difference > 0 ? "SOBRANTE" : "FALTANTE";

    await sendTelegramAlert({
      botToken: settings.telegram_bot_token,
      chatId: settings.telegram_chat_id,
      message: `<b>🧾 Cierre de caja</b>\nFecha: ${data.businessDate}\nTurno: ${data.shift}\nTickets: ${data.tickets}\nTotal: ${money(data.total)}\nCuadre: ${diffLabel} ${money(Math.abs(data.difference))}`,
    });
    return { sent: true as const };
  });

export const notifyLowStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemName: string; currentStock: number; minStock: number; unit: string }) => input)
  .handler(async ({ data, context }) => {
    const settings = await getSettings(context.supabase);
    if (!settings?.alert_low_stock || !settings.telegram_bot_token || !settings.telegram_chat_id) {
      return { sent: false as const, reason: "Notificación desactivada o sin configurar" };
    }

    await sendTelegramAlert({
      botToken: settings.telegram_bot_token,
      chatId: settings.telegram_chat_id,
      message: `<b>⚠️ Stock bajo</b>\n${data.itemName}\nStock actual: ${data.currentStock} ${data.unit}\nMínimo: ${data.minStock} ${data.unit}`,
    });
    return { sent: true as const };
  });

export const checkAndNotifyLowStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const settings = await getSettings(context.supabase);
    if (!settings?.alert_low_stock || !settings.telegram_bot_token || !settings.telegram_chat_id) {
      return { sent: 0 as const };
    }

    const { data: items, error } = await context.supabase
      .from("inventory_items")
      .select("id, name, stock, min_stock, unit")
      .in("id", data.itemIds);
    if (error) throw new Error(error.message);

    let sent = 0;
    for (const item of items ?? []) {
      const stock = Number(item.stock ?? 0);
      const min = Number(item.min_stock ?? 0);
      if (min > 0 && stock <= min) {
        await sendTelegramAlert({
          botToken: settings.telegram_bot_token,
          chatId: settings.telegram_chat_id,
          message: `<b>⚠️ Stock bajo</b>\n${item.name}\nStock actual: ${stock} ${item.unit ?? ""}\nMínimo: ${min} ${item.unit ?? ""}`,
        });
        sent++;
      }
    }
    return { sent };
  });
