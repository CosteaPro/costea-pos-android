/**
 * Envío automático de la factura autorizada al correo del cliente.
 * Adjunta enlaces seguros al RIDE (PDF imprimible) y al XML autorizado.
 * Es idempotente: el mismo comprobante nunca genera dos correos.
 */
export async function enviarFacturaAutorizada(orderId: string, baseUrl: string): Promise<
  { enviado: boolean; motivo?: string }
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { enviado: false, motivo: "No se encontró la venta" };
  if (order.sri_status !== "autorizado") return { enviado: false, motivo: "La factura no está autorizada" };

  const correo = String(order.customer_email ?? "").trim();
  if (!correo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo))
    return { enviado: false, motivo: "El cliente no tiene un correo válido registrado" };

  const { data: company } = await supabaseAdmin
    .from("company_settings")
    .select("business_name, trade_name")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const clave = order.access_key as string;
  const origen = baseUrl.replace(/\/+$/, "");
  const rideUrl = `${origen}/api/public/comprobante/${clave}`;
  const xmlUrl = `${rideUrl}?formato=xml`;

  const total = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(order.total ?? 0));
  const fecha = new Date(order.created_at ?? Date.now()).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "short",
    timeStyle: "short",
  });

  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const result = await sendTemplateEmail("factura-autorizada", correo, {
    idempotencyKey: `factura-autorizada-${clave}`,
    templateData: {
      negocio: company?.trade_name || company?.business_name || "Costea POS",
      cliente: order.customer_name ?? null,
      numero: order.doc_number ?? "",
      fecha,
      total,
      autorizacion: order.authorization_number ?? clave,
      claveAcceso: clave,
      rideUrl,
      xmlUrl,
    },
  });

  if (!result.sent) return { enviado: false, motivo: "El destinatario está bloqueado para recibir correos" };
  return { enviado: true };
}
