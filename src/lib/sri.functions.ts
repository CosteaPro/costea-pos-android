import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EmisionResult = {
  sri_status: "pendiente" | "enviado" | "autorizado" | "rechazado";
  message: string;
  authorization_number: string | null;
  access_key: string;
};

/**
 * Emite la factura ante el SRI en el mismo instante de la venta:
 * genera el XML, lo firma con el .p12 del contribuyente, lo envía a Recepción
 * y consulta Autorización. El XML firmado siempre queda guardado en la orden.
 */
export const emitirFacturaSri = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; issuedAtDevice: string }) => {
    if (!data?.orderId) throw new Error("Falta el identificador del pedido");
    if (!data?.issuedAtDevice || !Number.isFinite(new Date(data.issuedAtDevice).getTime()))
      throw new Error("La fecha y hora del dispositivo no son válidas");
    return data;
  })
  .handler(async ({ data, context }): Promise<EmisionResult> => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const allowed = (roles ?? []).some((r) => r.role === "administrador" || r.role === "cajero");
    if (!allowed) throw new Error("Solo caja o administración puede emitir facturas electrónicas");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildFacturaXml, buildNotaCreditoXml, buildNotaDebitoXml } = await import("./sri/factura-xml.server");
    const { signXmlXades } = await import("./sri/sign.server");
    const { SRI_ENDPOINTS, enviarRecepcion, consultarAutorizacion } = await import("./sri/soap.server");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("No se encontró la venta");
    if (!['factura', 'nota_credito', 'nota_debito'].includes(order.doc_type)) throw new Error("La venta no es un comprobante electrónico SRI");
    if (!order.access_key || !order.doc_number) throw new Error("La factura no tiene clave de acceso ni numeración");
    // Nunca se reenvía un comprobante ya autorizado: evita duplicados ante el SRI.
    if (order.sri_status === "autorizado")
      throw new Error("La factura ya está AUTORIZADA por el SRI; no puede reenviarse");

    /** Bitácora obligatoria: cada etapa del proceso queda registrada con fecha y hora. */
    const bitacora = async (stage: string, status: string, detail?: string | null) => {
      await supabaseAdmin.from("sri_emission_logs").insert({
        order_id: order.id,
        doc_number: order.doc_number,
        access_key: order.access_key,
        stage,
        status,
        detail: detail ?? null,
        created_by: context.userId,
      });
    };
    await bitacora("validacion", "pendiente_procesamiento", "Datos del comprobante validados");

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("*")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!company) throw new Error("Falta la configuración de la empresa");

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_id, product_name, unit_price, quantity")
      .eq("order_id", order.id);
    const lines = items ?? [];
    if (lines.length === 0) throw new Error("La factura no tiene productos");

    const codes = new Map<string, string>();
    const ids = lines.map((l) => l.product_id).filter((v): v is string => Boolean(v));
    if (ids.length > 0) {
      const { data: prods } = await supabaseAdmin.from("products").select("id, code").in("id", ids);
      (prods ?? []).forEach((p) => codes.set(p.id, p.code ?? ""));
    }

    const tarifa = Number(order.iva_rate ?? 15);

    // Misma fuente y misma regla de redondeo que la pantalla y la base de datos:
    // el total con IVA guardado en la orden manda, y de ahí se derivan base e IVA.
    const { buildInvoiceAmounts, round2 } = await import("./sri");
    const totalOrden = round2(Number(order.total ?? 0));
    const { detalles, baseTotal, ivaTotal, importeTotal } = buildInvoiceAmounts(
      lines.map((l, i) => ({
        codigo: codes.get(l.product_id ?? "") || `ITEM${String(i + 1).padStart(4, "0")}`,
        descripcion: l.product_name,
        cantidad: Number(l.quantity),
        precioUnitario: Number(l.unit_price),
      })),
      tarifa,
      totalOrden,
    );

    // Si por cualquier motivo la base/IVA guardados difieren, se sincronizan:
    // nunca puede haber un centavo de diferencia entre pantalla, base de datos y SRI.
    if (round2(Number(order.tax_amount ?? 0)) !== ivaTotal || round2(Number(order.subtotal ?? 0)) !== baseTotal) {
      await supabaseAdmin
        .from("orders")
        .update({ subtotal: baseTotal, tax_amount: ivaTotal, total: importeTotal })
        .eq("id", order.id);
    }


    const pad = (v: string | number, n: number) =>
      String(v).replace(/\D/g, "").padStart(n, "0").slice(-n);
    const [rawEstab, rawPto, rawSec] = order.doc_number.split("-");
    const estab = pad(rawEstab ?? company.establishment, 3);
    const ptoEmi = pad(rawPto ?? company.emission_point, 3);
    const secuencial = pad(rawSec ?? "1", 9);
    const ambiente = company.environment === "1" ? "1" : "2";
    // Una sola fuente temporal: instante capturado por el dispositivo que emite.
    // Se convierte a America/Guayaquil tanto para fechaEmision como para SigningTime.
    const fechaEmision = new Date(data.issuedAtDevice);

    // La clave de acceso debe coincidir 100 % con fecha, RUC, serie y secuencial del documento.
    const { buildAccessKey } = await import("./sri");
    const codigoNumerico = order.access_key.slice(40, 48);
    const claveAcceso = buildAccessKey({
      date: fechaEmision,
      ruc: company.ruc,
      environment: ambiente,
      establishment: estab,
      emissionPoint: ptoEmi,
      sequential: Number(secuencial),
      numericCode: /^\d{8}$/.test(codigoNumerico) ? codigoNumerico : undefined,
      emissionType: company.emission_type || "1",
      docCode: order.doc_type === "factura" ? "01" : order.doc_type === "nota_credito" ? "04" : "05",
    });
    if (claveAcceso.slice(23, 24) !== ambiente) {
      throw new Error("La clave de acceso no coincide con el ambiente SRI configurado");
    }
    if (claveAcceso !== order.access_key) {
      // Si algún dato cambió, se corrige la clave y el XML se vuelve a firmar más abajo.
      await supabaseAdmin.from("orders").update({ access_key: claveAcceso }).eq("id", order.id);
      order.access_key = claveAcceso;
    }

    const xmlInput = {
      emisor: {
        ambiente,
        tipoEmision: company.emission_type || "1",
        razonSocial: company.business_name,
        nombreComercial: company.trade_name || company.business_name,
        ruc: company.ruc,
        claveAcceso: order.access_key,
        estab,
        ptoEmi,
        secuencial,
        dirMatriz: company.address,
        dirEstablecimiento: company.branch_address || company.address,
        obligadoContabilidad: Boolean(company.accounting_required),
        contribuyenteEspecial: company.special_taxpayer,
      },
      comprador: {
        tipoIdentificacion: order.customer_id_type ?? "cedula",
        identificacion: order.customer_id_number ?? "9999999999999",
        razonSocial: order.customer_name ?? "CONSUMIDOR FINAL",
        direccion: order.customer_address,
        email: order.customer_email,
        telefono: order.customer_phone,
      },
      detalles,
      totales: {
        fechaEmision,
        totalSinImpuestos: baseTotal,
        totalDescuento: Number(order.discount ?? 0),
        baseImponible: baseTotal,
        tarifa,
        valorIva: ivaTotal,
        propina: 0,
        importeTotal,
        formaPago: order.payment_method ?? "efectivo",
      },
    };
    const xml = order.doc_type === "nota_credito"
      ? buildNotaCreditoXml({ ...xmlInput, documentoModificado: order.related_doc_number ?? "", motivo: order.notes ?? "Ajuste de comprobante" })
      : order.doc_type === "nota_debito"
        ? buildNotaDebitoXml({ ...xmlInput, documentoModificado: order.related_doc_number ?? "", motivo: order.notes ?? "Ajuste de comprobante" })
        : buildFacturaXml(xmlInput);

    await bitacora("xml", "xml_generado", "XML generado según esquema SRI 1.1.0");

    // 1) Firma electrónica con el .p12 del contribuyente.
    const { data: firma } = await supabaseAdmin
      .from("company_signature")
      .select("p12_path, p12_password")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!firma?.p12_path || !firma.p12_password)
      throw new Error("Falta la firma electrónica .p12 o su contraseña en Configuración");

    const { data: file, error: fileErr } = await supabaseAdmin.storage.from("firmas").download(firma.p12_path);
    if (fileErr || !file) throw new Error("No se pudo leer el archivo de firma electrónica");
    const p12Der = new Uint8Array(await file.arrayBuffer());

    let xmlFirmado: string;
    try {
      xmlFirmado = signXmlXades(p12Der, firma.p12_password, xml, fechaEmision).xml;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al firmar";
      await supabaseAdmin
        .from("orders")
        .update({ sri_status: "pendiente", sri_message: `Firma: ${msg}`, xml_signed: xml })
        .eq("id", order.id);
      await bitacora("firma", "error", msg);
      throw new Error(`No se pudo firmar el XML: ${msg}`);
    }

    // El XML firmado se guarda SIEMPRE antes de intentar el envío.
    await supabaseAdmin
      .from("orders")
      .update({ xml_signed: xmlFirmado, sri_status: "pendiente", sri_message: null })
      .eq("id", order.id);

    await bitacora("firma", "firmado", "XML firmado electrónicamente (XAdES-BES)");

    /**
     * Paso obligatorio: apenas el SRI acepta el comprobante, Configuración
     * queda en "emitido + 1". Nunca retrocede y nunca se repite un número.
     */
    const avanzarSecuencial = async () => {
      if (order.doc_type !== "factura") return;
      const siguiente = Number(secuencial) + 1;
      const { data: cfg } = await supabaseAdmin
        .from("company_settings")
        .select("id, next_sequential")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (cfg && Number(cfg.next_sequential ?? 0) < siguiente) {
        await supabaseAdmin
          .from("company_settings")
          .update({ next_sequential: siguiente })
          .eq("id", cfg.id);
      }
      const { data: seqRow } = await supabaseAdmin
        .from("document_sequences")
        .select("next_sequential")
        .eq("doc_type", "factura")
        .maybeSingle();
      if (seqRow && Number(seqRow.next_sequential ?? 0) < siguiente) {
        await supabaseAdmin
          .from("document_sequences")
          .update({ next_sequential: siguiente })
          .eq("doc_type", "factura");
      }
      await bitacora("numeracion", "avanzada", `Siguiente secuencial = ${siguiente}`);
    };

    // REGLA SRI: el número se consume al EMITIR. Se avanza AHORA, antes de
    // conocer la respuesta del SRI. Aprobada o rechazada, nunca se reutiliza.
    await avanzarSecuencial();

    // Catálogo oficial SRI: 1 = Pruebas, 2 = Producción.
    const env = ambiente === "1" ? SRI_ENDPOINTS.pruebas : SRI_ENDPOINTS.produccion;


    // 2) Recepción
    let recepcion: Awaited<ReturnType<typeof enviarRecepcion>>;
    try {
      recepcion = await enviarRecepcion(env.recepcion, xmlFirmado);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de red con el SRI";
      await supabaseAdmin.from("orders").update({ sri_status: "pendiente", sri_message: msg }).eq("id", order.id);
      await bitacora("recepcion", "error", msg);
      return { sri_status: "pendiente", message: msg, authorization_number: null, access_key: order.access_key };
    }

    if (recepcion.estado !== "RECIBIDA") {
      const msg = recepcion.mensajes.join(" · ") || `Recepción: ${recepcion.estado}`;
      await supabaseAdmin
        .from("orders")
        .update({ sri_status: "rechazado", sri_message: msg, sri_sent_at: new Date().toISOString() })
        .eq("id", order.id);
      await bitacora("recepcion", "rechazado", msg);
      return { sri_status: "rechazado", message: msg, authorization_number: null, access_key: order.access_key };
    }

    await supabaseAdmin
      .from("orders")
      .update({ sri_status: "enviado", sri_sent_at: new Date().toISOString(), sri_message: null })
      .eq("id", order.id);

    await bitacora("recepcion", "enviado_al_sri", "Comprobante RECIBIDO por el SRI");




    // 3) Autorización inmediata (con reintentos cortos: el SRI tarda unos segundos)
    let auth = await consultarAutorizacion(env.autorizacion, order.access_key);
    for (let i = 0; i < 4 && auth.estado !== "AUTORIZADO" && auth.estado !== "NO AUTORIZADO"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      auth = await consultarAutorizacion(env.autorizacion, order.access_key);
    }

    if (auth.estado === "AUTORIZADO") {
      await supabaseAdmin
        .from("orders")
        .update({
          sri_status: "autorizado",
          authorization_number: auth.numeroAutorizacion ?? order.access_key,
          sri_authorized_at: auth.fechaAutorizacion ?? new Date().toISOString(),
          sri_message: null,
          // El XML que devuelve el SRI es la única versión oficial del comprobante.
          xml_authorized: auth.comprobanteAutorizado ?? null,
        })
        .eq("id", order.id);
      await bitacora("autorizacion", "autorizado", auth.numeroAutorizacion ?? order.access_key);

      // Envío automático al cliente: RIDE (PDF) y XML autorizado.
      try {
        const { getRequest } = await import("@tanstack/react-start/server");
        const { enviarFacturaAutorizada } = await import("./factura-email.server");
        const baseUrl = new URL(getRequest().url).origin;
        const envio = await enviarFacturaAutorizada(order.id, baseUrl);
        await bitacora("correo", envio.enviado ? "enviado" : "omitido", envio.motivo ?? order.customer_email);
      } catch (e) {
        await bitacora("correo", "error", e instanceof Error ? e.message : "No se pudo enviar el correo");
      }

      return {
        sri_status: "autorizado",
        message: "Factura autorizada por el SRI",
        authorization_number: auth.numeroAutorizacion ?? order.access_key,
        access_key: order.access_key,
      };
    }

    const msg = auth.mensajes.join(" · ") || `Estado SRI: ${auth.estado}`;
    const estado = auth.estado === "NO AUTORIZADO" ? "rechazado" : "enviado";
    await supabaseAdmin.from("orders").update({ sri_status: estado, sri_message: msg }).eq("id", order.id);
    await bitacora("autorizacion", estado, msg);
    return { sri_status: estado, message: msg, authorization_number: null, access_key: order.access_key };
  });

/**
 * Consulta el estado real del comprobante en el portal del SRI y actualiza la venta.
 * No genera ni reenvía XML: solo refleja lo que indica el SRI.
 */
export const sincronizarEstadoSri = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderIds: string[] }) => {
    if (!Array.isArray(data?.orderIds) || data.orderIds.length === 0)
      throw new Error("Selecciona al menos un comprobante");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const allowed = (roles ?? []).some((r) => r.role === "administrador");
    if (!allowed) throw new Error("Solo el Super Administrador puede sincronizar comprobantes con el SRI");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { SRI_ENDPOINTS, consultarAutorizacion } = await import("./sri/soap.server");

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("environment")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    const env = (company?.environment === "1" ? SRI_ENDPOINTS.pruebas : SRI_ENDPOINTS.produccion);

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, doc_number, access_key, doc_type")
      .in("id", data.orderIds);

    let autorizados = 0;
    let rechazados = 0;
    let pendientes = 0;

    for (const order of orders ?? []) {
      if (order.doc_type !== "factura" || !order.access_key) continue;
      const auth = await consultarAutorizacion(env.autorizacion, order.access_key);
      const msg = auth.mensajes.join(" · ") || `Estado SRI: ${auth.estado}`;
      if (auth.estado === "AUTORIZADO") {
        autorizados++;
        await supabaseAdmin
          .from("orders")
          .update({
            sri_status: "autorizado",
            authorization_number: auth.numeroAutorizacion ?? order.access_key,
            sri_authorized_at: auth.fechaAutorizacion ?? new Date().toISOString(),
            sri_message: null,
            xml_authorized: auth.comprobanteAutorizado ?? null,
          })
          .eq("id", order.id);
        try {
          const { getRequest } = await import("@tanstack/react-start/server");
          const { enviarFacturaAutorizada } = await import("./factura-email.server");
          await enviarFacturaAutorizada(order.id, new URL(getRequest().url).origin);
        } catch { /* el correo nunca bloquea la sincronización con el SRI */ }
      } else if (auth.estado === "NO AUTORIZADO") {
        rechazados++;
        await supabaseAdmin.from("orders").update({ sri_status: "rechazado", sri_message: msg }).eq("id", order.id);
      } else {
        pendientes++;
        await supabaseAdmin.from("orders").update({ sri_message: msg }).eq("id", order.id);
      }
      await supabaseAdmin.from("sri_emission_logs").insert({
        order_id: order.id,
        doc_number: order.doc_number,
        access_key: order.access_key,
        stage: "sincronizacion",
        status: auth.estado.toLowerCase(),
        detail: msg,
        created_by: context.userId,
      });
    }

    return { autorizados, rechazados, pendientes, total: (orders ?? []).length };
  });

/**
 * Reenvía manualmente la factura autorizada (RIDE + XML) al correo del cliente.
 */
export const reenviarFacturaCorreo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; email?: string }) => {
    if (!data?.orderId) throw new Error("Falta el identificador del pedido");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const allowed = (roles ?? []).some((r) => r.role === "administrador" || r.role === "cajero");
    if (!allowed) throw new Error("Solo caja o administración puede reenviar comprobantes");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const correo = data.email?.trim();
    if (correo) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new Error("El correo no es válido");
      await supabaseAdmin.from("orders").update({ customer_email: correo }).eq("id", data.orderId);
    }

    const { getRequest } = await import("@tanstack/react-start/server");
    const { enviarFacturaAutorizada } = await import("./factura-email.server");
    const envio = await enviarFacturaAutorizada(data.orderId, new URL(getRequest().url).origin);

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("doc_number, access_key, customer_email")
      .eq("id", data.orderId)
      .maybeSingle();
    await supabaseAdmin.from("sri_emission_logs").insert({
      order_id: data.orderId,
      doc_number: order?.doc_number ?? null,
      access_key: order?.access_key ?? null,
      stage: "correo",
      status: envio.enviado ? "enviado" : "omitido",
      detail: envio.motivo ?? order?.customer_email ?? null,
      created_by: context.userId,
    });

    if (!envio.enviado) throw new Error(envio.motivo ?? "No se pudo enviar el correo");
    return { enviado: true, email: order?.customer_email ?? null };
  });
