/**
 * Envío automático de la factura autorizada emitida por una caja de escritorio.
 * Usa la misma plantilla y el mismo servicio de correo del sistema web.
 * Es idempotente: la misma clave de acceso nunca genera dos correos.
 */
export type FacturaCaja = {
  claveAcceso: string;
  docNumber: string;
  fechaEmision: string;
  total: number;
  clienteNombre?: string | null;
  clienteEmail?: string | null;
  numeroAutorizacion?: string | null;
};

export async function enviarFacturaCajaAutorizada(
  factura: FacturaCaja,
  baseUrl: string,
): Promise<{ enviado: boolean; motivo?: string }> {
  const correo = String(factura.clienteEmail ?? "").trim();
  if (!correo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo))
    return { enviado: false, motivo: "El cliente no tiene un correo válido registrado" };
  if (!factura.claveAcceso) return { enviado: false, motivo: "La factura no tiene clave de acceso" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: company } = await supabaseAdmin
    .from("company_settings")
    .select("business_name, trade_name")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const origen = baseUrl.replace(/\/+$/, "");
  const rideUrl = `${origen}/api/public/comprobante/${factura.claveAcceso}`;
  const total = new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(factura.total ?? 0));
  const fecha = new Date(factura.fechaEmision ?? Date.now()).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "short",
    timeStyle: "short",
  });

  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const result = await sendTemplateEmail("factura-autorizada", correo, {
    idempotencyKey: `factura-autorizada-${factura.claveAcceso}`,
    templateData: {
      negocio: company?.trade_name || company?.business_name || "Costea POS",
      cliente: factura.clienteNombre ?? null,
      numero: factura.docNumber ?? "",
      fecha,
      total,
      autorizacion: factura.numeroAutorizacion ?? factura.claveAcceso,
      claveAcceso: factura.claveAcceso,
      rideUrl,
      xmlUrl: `${rideUrl}?formato=xml`,
    },
  });

  if (!result.sent) return { enviado: false, motivo: "El destinatario está bloqueado para recibir correos" };
  return { enviado: true };
}
