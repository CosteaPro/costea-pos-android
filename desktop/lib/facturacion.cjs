/**
 * Orquestación de la facturación en la caja:
 *   numerar → clave de acceso → XML → firmar → (si hay internet) enviar al SRI.
 *
 * Reglas fijas:
 *  · El número se consume al EMITIR, con o sin internet: nunca se repite ni se salta.
 *  · Sin internet la factura queda firmada y guardada como "pendiente de envío".
 *  · En cuanto vuelve la conexión, la caja sola envía las pendientes.
 */
const { randomUUID } = require("node:crypto");
const almacen = require("./almacen.cjs");
const { buildAccessKey, docNumber, buildInvoiceAmounts, round2 } = require("./sri-clave.cjs");
const { buildFacturaXml } = require("./factura-xml.cjs");
const { signXmlXades } = require("./firma.cjs");
const { SRI_ENDPOINTS, enviarRecepcion, consultarAutorizacion } = require("./soap.cjs");
const sincronizacion = require("./sincronizacion.cjs");

const endpoints = (ambiente) => (String(ambiente) === "1" ? SRI_ENDPOINTS.pruebas : SRI_ENDPOINTS.produccion);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function validarConfig(config) {
  const faltan = [];
  if (!/^\d{13}$/.test(String(config.ruc || "").replace(/\D/g, ""))) faltan.push("RUC");
  if (!config.razonSocial) faltan.push("Razón social");
  if (!config.dirMatriz) faltan.push("Dirección matriz");
  if (!config.firmaArchivo) faltan.push("Archivo de firma (.p12)");
  if (!config.firmaPassword) faltan.push("Contraseña de la firma");
  if (faltan.length) throw new Error(`Configuración incompleta de la caja: ${faltan.join(", ")}`);
}

/**
 * Emite una factura electrónica en esta caja.
 * payload = { cliente:{tipoIdentificacion,identificacion,razonSocial,direccion,email,telefono},
 *             items:[{codigo,descripcion,cantidad,precioUnitario}],
 *             formaPago, propina, totalConIva?, mesa?, ordenId? }
 */
async function emitirFactura(payload) {
  const config = almacen.leerConfig();
  validarConfig(config);

  const tarifa = Number(config.tarifaIva ?? 15);
  const items = (payload.items ?? []).map((i) => ({
    codigo: String(i.codigo ?? ""),
    descripcion: String(i.descripcion ?? ""),
    cantidad: Number(i.cantidad ?? 0),
    precioUnitario: Number(i.precioUnitario ?? 0),
  }));
  if (items.length === 0) throw new Error("La factura no tiene productos");

  const totalConIva = round2(
    payload.totalConIva ?? items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0),
  );
  const { detalles, baseTotal, ivaTotal, importeTotal } = buildInvoiceAmounts(items, tarifa, totalConIva);

  // 1) El número es de esta caja y avanza de inmediato.
  const secuencial = almacen.consumirSecuencial();
  const fecha = new Date();

  const claveAcceso = buildAccessKey({
    date: fecha,
    ruc: config.ruc,
    environment: String(config.ambiente),
    establishment: config.establishment,
    emissionPoint: config.emissionPoint,
    sequential: secuencial,
  });

  const xml = buildFacturaXml({
    emisor: {
      ambiente: String(config.ambiente),
      tipoEmision: "1",
      razonSocial: config.razonSocial,
      nombreComercial: config.nombreComercial || config.razonSocial,
      ruc: String(config.ruc).replace(/\D/g, ""),
      claveAcceso,
      estab: config.establishment,
      ptoEmi: config.emissionPoint,
      secuencial: String(secuencial),
      dirMatriz: config.dirMatriz,
      dirEstablecimiento: config.dirEstablecimiento || config.dirMatriz,
      obligadoContabilidad: Boolean(config.obligadoContabilidad),
      contribuyenteEspecial: config.contribuyenteEspecial || null,
    },
    comprador: {
      tipoIdentificacion: payload.cliente?.tipoIdentificacion || "consumidor_final",
      identificacion: payload.cliente?.identificacion || "9999999999999",
      razonSocial: payload.cliente?.razonSocial || "CONSUMIDOR FINAL",
      direccion: payload.cliente?.direccion || null,
      email: payload.cliente?.email || null,
      telefono: payload.cliente?.telefono || null,
    },
    detalles,
    totales: {
      fechaEmision: fecha,
      totalSinImpuestos: baseTotal,
      totalDescuento: 0,
      baseImponible: baseTotal,
      tarifa,
      valorIva: ivaTotal,
      propina: round2(payload.propina ?? 0),
      importeTotal,
      formaPago: payload.formaPago || "efectivo",
    },
  });

  // 2) Firma local: no necesita internet.
  const { xml: xmlFirmado } = signXmlXades(almacen.leerFirmaBinaria(), config.firmaPassword, xml, fecha);

  // 3) Toda venta facturada genera TAMBIÉN su orden de venta:
  //    la orden alimenta el inventario y la factura la contabilidad.
  const ventaId = randomUUID();
  const docNumeroFactura = docNumber(config.establishment, config.emissionPoint, secuencial);
  const orden = guardarOrden({
    ...payload,
    subtotal: baseTotal,
    iva: ivaTotal,
    total: importeTotal,
    items,
    ventaId,
    docRelacionado: docNumeroFactura,
    sinSubir: true,
  });

  const doc = almacen.guardarComprobante({
    id: randomUUID(),
    tipo: "factura",
    ventaId,
    docRelacionado: orden.docNumber,
    cajaCodigo: config.codigoCaja || "",
    docNumber: docNumeroFactura,
    secuencial,
    claveAcceso,
    fechaEmision: fecha.toISOString(),
    cliente: payload.cliente ?? null,
    items,
    subtotal: baseTotal,
    iva: ivaTotal,
    total: importeTotal,
    formaPago: payload.formaPago || "efectivo",
    mesa: payload.mesa ?? null,
    mesero: payload.mesero ?? null,
    estadoSri: "firmada_pendiente",
    mensajesSri: [],
    numeroAutorizacion: null,
    fechaAutorizacion: null,
    xmlFirmado,
    sincronizado: false,
  });

  // Enlaza la orden con la factura ya creada.
  almacen.guardarComprobante({ ...orden, docRelacionado: doc.docNumber });

  // 4) Con internet se envía al instante; sin internet queda pendiente.
  const resultado = await enviarAlSri(doc.id).catch((e) => ({ error: String(e.message || e) }));
  const final = almacen.buscarComprobante(doc.id);
  const subida = await sincronizacion.subirPendientes().catch((e) => ({ error: String(e.message || e) }));
  return {
    ...final,
    orden: almacen.buscarComprobante(orden.id),
    sincronizado: Boolean(almacen.buscarComprobante(doc.id)?.sincronizado),
    avisoSincronizacion: subida && subida.error ? subida.error : null,
    aviso: resultado && resultado.error ? resultado.error : null,
  };
}


/** Envía al SRI una factura ya firmada y guarda el resultado. */
async function enviarAlSri(id) {
  const doc = almacen.buscarComprobante(id);
  if (!doc) throw new Error("Comprobante no encontrado en esta caja");
  if (doc.estadoSri === "autorizado") return doc;

  const config = almacen.leerConfig();
  const url = endpoints(config.ambiente);

  const recepcion = await enviarRecepcion(url.recepcion, doc.xmlFirmado);
  if (recepcion.estado !== "RECIBIDA") {
    const devuelta = recepcion.mensajes.join(" · ");
    // "ya registrado" significa que el SRI ya lo tiene: se consulta igual.
    if (!/registrad/i.test(devuelta)) {
      return almacen.guardarComprobante({
        ...doc,
        estadoSri: /error|no autoriz|rechaz/i.test(devuelta) ? "devuelta" : "firmada_pendiente",
        mensajesSri: recepcion.mensajes,
        sincronizado: false,
      });
    }
  }

  let autorizacion = null;
  for (let intento = 0; intento < 4; intento++) {
    await esperar(intento === 0 ? 1500 : 3000);
    autorizacion = await consultarAutorizacion(url.autorizacion, doc.claveAcceso);
    if (autorizacion.estado === "AUTORIZADO" || autorizacion.estado === "NO AUTORIZADO") break;
  }

  const estadoSri =
    autorizacion && autorizacion.estado === "AUTORIZADO"
      ? "autorizado"
      : autorizacion && autorizacion.estado === "NO AUTORIZADO"
        ? "rechazado"
        : "firmada_pendiente";

  const actualizado = almacen.guardarComprobante({
    ...doc,
    estadoSri,
    numeroAutorizacion: autorizacion ? autorizacion.numeroAutorizacion : null,
    fechaAutorizacion: autorizacion ? autorizacion.fechaAutorizacion : null,
    mensajesSri: autorizacion ? autorizacion.mensajes : [],
    xmlAutorizado: autorizacion ? (autorizacion.comprobanteAutorizado ?? null) : null,
    sincronizado: false,
  });
  sincronizacion.subirPendientes().catch(() => {});
  return actualizado;
}

/** Reintenta todas las facturas firmadas que aún no tienen respuesta del SRI. */
async function procesarPendientes() {
  const pendientes = almacen.pendientesSri();
  const resultados = [];
  for (const doc of pendientes) {
    try {
      resultados.push(await enviarAlSri(doc.id));
    } catch (e) {
      resultados.push({ ...doc, error: String(e.message || e) });
    }
  }
  return resultados;
}

/** Guarda una orden / nota de venta interna (no va al SRI, sí al servidor central). */
function guardarOrden(payload) {
  const config = almacen.leerConfig();
  // El número de orden es local y reinicia a 1 cada día.
  const numeroOrden = almacen.consumirSecuencialOrden();
  const doc = almacen.guardarComprobante({
    id: randomUUID(),
    tipo: "orden",
    ventaId: payload.ventaId || randomUUID(),
    docRelacionado: payload.docRelacionado ?? null,
    cajaCodigo: config.codigoCaja || "",
    docNumber: `ORD-${config.establishment || "001"}-${config.emissionPoint || "001"}-${String(numeroOrden).padStart(4, "0")}`,
    ordenNumero: numeroOrden,
    ordenFecha: almacen.fechaEcuador(),
    claveAcceso: null,
    fechaEmision: new Date().toISOString(),
    cliente: payload.cliente ?? null,
    items: payload.items ?? [],
    subtotal: round2(payload.subtotal ?? 0),
    iva: round2(payload.iva ?? 0),
    total: round2(payload.total ?? 0),
    formaPago: payload.formaPago || "efectivo",
    mesa: payload.mesa ?? null,
    mesero: payload.mesero ?? null,
    estadoSri: "no_aplica",
    mensajesSri: [],
    sincronizado: false,
  });
  if (!payload.sinSubir) sincronizacion.subirPendientes().catch(() => {});
  return doc;
}


module.exports = { emitirFactura, enviarAlSri, procesarPendientes, guardarOrden };
