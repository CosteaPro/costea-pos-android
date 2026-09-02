/**
 * Tirilla térmica 80 mm de la caja: mismo formato que el sistema web.
 * Imprime los ejemplares seguidos (por defecto 2: cliente y control interno)
 * y limita el ancho útil a 66 mm (4 mm de margen a cada lado) para que
 * ninguna línea se salga del papel.
 */
const almacen = require("./almacen.cjs");

const COPIA_CLIENTE = "COPIA — CLIENTE";
const COPIA_CONTROL = "COPIA — CONTROL INTERNO";

const esc = (v) =>
  String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

const money = (n) =>
  "$" + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

const fila = (etiqueta, valor, fuerte = false) =>
  `<tr${fuerte ? ' class="tot"' : ""}><td colspan="3">${etiqueta}</td><td class="r">${valor}</td></tr>`;

/** Clave de acceso en bloques de 7 para que se lea cómoda en el papel. */
const formatoClave = (clave) => String(clave || "").replace(/(\d{7})(?=\d)/g, "$1 ");

const UNIDADES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE"];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function enteroEnLetras(n) {
  if (n === 0) return "CERO";
  if (n <= 20) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
  }
  if (n === 100) return "CIEN";
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const r = n % 100;
    return r === 0 ? CENTENAS[c] : `${CENTENAS[c]} ${enteroEnLetras(r)}`;
  }
  if (n < 1000000) {
    const miles = Math.floor(n / 1000);
    const r = n % 1000;
    const cabeza = miles === 1 ? "MIL" : `${enteroEnLetras(miles)} MIL`;
    return r === 0 ? cabeza : `${cabeza} ${enteroEnLetras(r)}`;
  }
  return String(n);
}

/** "TRES CON 75/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA" */
function totalEnLetras(total) {
  const valor = Math.round((Number(total) || 0) * 100);
  const entero = Math.floor(valor / 100);
  const centavos = String(valor % 100).padStart(2, "0");
  return `${enteroEnLetras(entero)} CON ${centavos}/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA`;
}

function seccion(t, copia) {
  const esFactura = t.tipo === "factura";
  const filas = (t.items || [])
    .map((i) => {
      const cantidad = Number(i.cantidad ?? i.quantity ?? 1);
      const precio = Number(i.precioUnitario ?? i.precio ?? 0);
      return `<tr><td class="q">${cantidad}</td><td>${esc(i.descripcion || i.nombre || "")}</td><td class="p">${money(precio)}</td><td class="r">${money(precio * cantidad)}</td></tr>`;
    })
    .join("");

  return `
  <section class="ticket">
    <h1>${esc(t.negocio)}</h1>
    ${t.ruc ? `<p class="c">RUC: ${esc(t.ruc)}</p>` : ""}
    ${t.dirMatriz ? `<p class="c">Matriz: ${esc(t.dirMatriz)}</p>` : ""}
    ${t.dirEstablecimiento ? `<p class="c">Establecimiento: ${esc(t.dirEstablecimiento)}</p>` : ""}
    ${t.telefono ? `<p class="c">Tel: ${esc(t.telefono)}</p>` : ""}
    ${t.correo ? `<p class="c">${esc(t.correo)}</p>` : ""}
    ${t.regimen ? `<p class="c">${esc(t.regimen)}</p>` : ""}
    <p class="c">Obligado a llevar contabilidad: ${t.obligadoContabilidad ? "SÍ" : "NO"}</p>
    <hr />
    <h2>${esFactura ? "FACTURA" : "ORDEN"}</h2>
    <p class="c doc-number">Nro. ${esc(t.numero)}</p>
    ${
      esFactura
        ? `<p class="c">Ambiente: ${String(t.ambiente) === "1" ? "PRUEBAS" : "PRODUCCIÓN"}</p>
           <p class="c">Emisión: NORMAL</p>
           ${t.autorizacion ? `<p class="c">Autorización SRI:</p><p class="key">${esc(t.autorizacion)}</p>` : ""}
           ${t.claveAcceso ? `<p class="c">Clave de acceso:</p><p class="key">${esc(formatoClave(t.claveAcceso))}</p>` : ""}`
        : `<p class="c">Documento de control interno · no válido como comprobante de venta autorizado por el SRI</p>`
    }
    <hr />
    <p>Fecha: ${esc(t.fecha)}</p>
    ${t.mesa ? `<p>Mesa: ${esc(t.mesa)}</p>` : ""}
    ${t.mesero ? `<p>Atendió: ${esc(t.mesero)}</p>` : ""}
    <p>Cliente: ${esc(t.cliente || "CONSUMIDOR FINAL")}</p>
    <p>Identificación: ${esc(t.clienteId || "0000000000000")}</p>
    ${t.clienteDireccion ? `<p>Dirección: ${esc(t.clienteDireccion)}</p>` : ""}
    ${t.clienteCorreo ? `<p>Correo: ${esc(t.clienteCorreo)}</p>` : ""}
    <hr />
    <table>
      <tr><td class="q">Cant</td><td>Descripción</td><td class="p">P.Unit</td><td class="r">Subtotal</td></tr>
      ${filas}
    </table>
    <hr />
    <table>
      ${fila("Subtotal sin IVA", money(t.subtotal))}
      ${fila(`IVA ${t.tarifa}%`, money(t.iva))}
      ${fila("TOTAL", money(t.total), true)}
      ${fila("Forma de pago", esc(t.formaPago))}
      ${typeof t.recibido === "number" ? fila("Recibido", money(t.recibido)) : ""}
      ${typeof t.cambio === "number" ? fila("Cambio", money(t.cambio)) : ""}
    </table>
    <hr />
    <p>Son: ${esc(totalEnLetras(t.total))}</p>
    <hr />
    <p class="copia">${esc(copia)}</p>
    <p class="c">${copia === COPIA_CLIENTE ? "¡Gracias por su compra!" : "Documento de control interno"}</p>
    ${
      esFactura
        ? `<p class="c">Verifica la validez y descarga tu comprobante en el portal oficial: www.sri.gob.ec</p>`
        : `<hr /><p class="c"><strong>CONSUMIDOR FINAL</strong></p><p class="c">0999999999</p><hr />`
    }
    
    <p class="c">RUC: 1716626484001</p>
    <p class="c">www.costeapro.com</p>
  </section>`;
}

/** Convierte un comprobante guardado en la caja a los datos del ticket. */
function datosTicket(doc) {
  const c = almacen.leerConfig();
  return {
    tipo: doc.tipo,
    negocio: c.nombreComercial || c.razonSocial || "Costea POS",
    ruc: c.ruc,
    dirMatriz: c.dirMatriz,
    dirEstablecimiento: c.dirEstablecimiento || c.dirMatriz,
    telefono: c.telefono,
    correo: c.correo,
    regimen: c.regimen || "",
    obligadoContabilidad: Boolean(c.obligadoContabilidad),
    ambiente: c.ambiente,
    numero: doc.docNumber,
    claveAcceso: doc.claveAcceso || null,
    autorizacion: doc.numeroAutorizacion || null,
    fecha: new Date(doc.fechaEmision).toLocaleString("es-EC", { timeZone: "America/Guayaquil" }),
    cliente: doc.cliente ? doc.cliente.razonSocial : null,
    clienteId: doc.cliente ? doc.cliente.identificacion : null,
    clienteDireccion: doc.cliente ? doc.cliente.direccion : null,
    clienteCorreo: doc.cliente ? doc.cliente.email : null,
    mesa: doc.mesa || null,
    mesero: doc.mesero || null,
    items: doc.items || [],
    subtotal: doc.subtotal,
    tarifa: Number(c.tarifaIva ?? 15),
    iva: doc.iva,
    total: doc.total,
    formaPago: doc.formaPago || "efectivo",
    recibido: typeof doc.recibido === "number" ? doc.recibido : null,
    cambio: typeof doc.cambio === "number" ? doc.cambio : null,
  };
}

/** HTML completo con todos los ejemplares configurados. */
function ticketHtml(doc, copiasConfiguradas) {
  const t = datosTicket(doc);
  const copias = Math.min(
    Math.max(Math.floor(Number(copiasConfiguradas ?? almacen.leerConfig().copiasTicket ?? 2) || 2), 1),
    5,
  );
  const cuerpo = Array.from({ length: copias }, (_, i) =>
    seccion(t, i === 0 ? COPIA_CLIENTE : COPIA_CONTROL),
  ).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>${esc(t.tipo === "factura" ? "FACTURA" : "ORDEN")} ${esc(t.numero)}</title>
  <style>
    @page { size: 80mm auto; margin: 0 4mm; }
    html, body { margin: 0; padding: 0; width: 66mm; max-width: 66mm; overflow-x: hidden; }
    body { font-family: "Segoe UI", Arial, sans-serif; color:#000; background:#fff; width: 66mm; margin: 0 auto; overflow-wrap: anywhere; }
    * { max-width: 66mm; overflow-wrap: anywhere; word-break: break-word; }
    .ticket { width: 66mm; max-width: 66mm; }
    .ticket + .ticket { border-top: 1px dashed #000; margin-top: 6mm; padding-top: 4mm; page-break-before: always; }
    h1 { font-size: 13px; margin: 0 0 2px; text-align:center; letter-spacing:.3px; }
    h2 { font-size: 11px; margin: 5px 0 2px; text-transform: uppercase; text-align:center; }
    p { margin: 1px 0; font-size: 10px; }
    p.c { text-align:center; }
    p.doc-number { font-size: 15px; font-weight: 700; text-align:center; margin: 4px 0; }
    p.copia { text-align:center; font-weight:700; font-size:10px; letter-spacing:.5px; }
    table { width:66mm; max-width:66mm; table-layout: fixed; border-collapse: collapse; font-size: 10px; }
    td { padding: 1px 0; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
    /* Los importes tienen su propio ancho: nunca empujan la línea fuera del papel. */
    td.r { width: 17mm; text-align: right; white-space: nowrap; }
    td.q { width: 7mm; }
    td.p { width: 13mm; text-align: right; white-space: nowrap; }
    hr { border:none; border-top:1px dashed #000; margin:4px 0; }
    .tot td { font-weight:700; font-size: 12px; }
    .key { font-size: 9px; word-break: break-all; text-align:center; }
  </style></head><body>
  ${cuerpo}
  </body></html>`;
}

/**
 * Reporte impreso en papel térmico de 80 mm.
 * modo "cuadre" = verificación del turno (sin firmas ni anuladas).
 * modo "cierre" = cierre definitivo (con anuladas y firma del responsable).
 */
function cierreHtml(c, modo = "cierre") {
  const esCuadre = modo === "cuadre";
  const fh = (iso) => new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil" });
  const ETIQUETAS = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia",
    apps: "Apps / Delivery",
    credito: "Crédito",
    otros: "Otros",
  };
  const pagos = Object.keys(ETIQUETAS)
    .map((k) => {
      const monto = Number((c.formasPago || {})[k] || 0);
      // Si la forma de pago no tuvo movimientos se deja en blanco (no imprime $0.00).
      return fila(ETIQUETAS[k], monto ? money(monto) : "");
    })
    .join("");
  // Cuadre completo: lo que dice el sistema frente a lo que el cajero contó.
  const contados = c.contado || { efectivo: Number(c.efectivoContado) || 0 };
  const totalContado =
    c.contadoTotal != null
      ? Number(c.contadoTotal)
      : Math.round(Object.keys(ETIQUETAS).reduce((s2, k) => s2 + (Number(contados[k]) || 0), 0) * 100) / 100;
  const diferencia = Math.round((totalContado - (Number(c.total) || 0)) * 100) / 100;
  const cuadre = Object.keys(ETIQUETAS)
    .map((k) => {
      const sistema = Number((c.formasPago || {})[k] || 0);
      const contado = Number(contados[k] || 0);
      if (!sistema && !contado) return "";
      const d = Math.round((contado - sistema) * 100) / 100;
      return fila(`${ETIQUETAS[k]} (sist. ${money(sistema)})`, `${money(contado)} / ${money(d)}`);
    })
    .join("");
  const anuladas =
    !esCuadre && (c.detalleAnuladas || []).length > 0
      ? `<hr /><h2>Facturas anuladas</h2><table>${c.detalleAnuladas
          .map((a) => fila(esc(a.numero), money(a.total)))
          .join("")}</table>`
      : "";

  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>${esCuadre ? "Cuadre de caja" : "Cierre de caja"}</title>
  <style>
    @page { size: 80mm auto; margin: 0 4mm; }
    html, body { margin:0; padding:0; width:66mm; max-width:66mm; overflow-x:hidden; }
    body { font-family: "Segoe UI", Arial, sans-serif; color:#000; background:#fff; width:66mm; margin:0 auto; }
    h1 { font-size:13px; margin:0 0 2px; text-align:center; }
    h2 { font-size:11px; margin:5px 0 2px; text-transform:uppercase; text-align:center; }
    p { margin:1px 0; font-size:10px; }
    p.c { text-align:center; }
    table { width:66mm; max-width:66mm; table-layout:fixed; border-collapse:collapse; font-size:10px; }
    td { padding:1px 0; vertical-align:bottom; overflow-wrap:anywhere; word-break:break-word; }
    td.r { width:19mm; text-align:right; white-space:nowrap; }
    /* Líneas punteadas alineadas entre la etiqueta y el monto. */
    tr td { border-bottom:1px dotted #999; }
    hr { border:none; border-top:1px dashed #000; margin:4px 0; }
    .tot td { font-weight:700; font-size:12px; border-bottom:none; }
    .firma { margin-top:12mm; border-top:1px solid #000; text-align:center; font-size:10px; padding-top:2px; }
  </style></head><body>
    <h1>${esc(c.negocio.nombre)}</h1>
    <p class="c">${esc(c.negocio.razonSocial)}</p>
    <p class="c">RUC: ${esc(c.negocio.ruc)}</p>
    <p class="c">${esc(c.negocio.direccion)}</p>
    <hr />
    <h2>${esCuadre ? "Cuadre de caja" : "Cierre de caja definitivo"}</h2>
    <p>Caja: ${esc(c.caja.codigo || "—")} (${esc(c.caja.establecimiento)}-${esc(c.caja.punto)})</p>
    <p>Fecha: ${esc(c.fecha)}</p>
    <p>Desde: ${esc(fh(c.desde))}</p>
    <p>Hasta: ${esc(fh(c.hasta))}</p>
    <hr />
    <table>
      ${fila("Órdenes del día", String(c.ordenes))}
      ${fila("Facturas emitidas", String(c.facturas))}
      ${fila("Facturas anuladas", String(c.anuladas))}
    </table>
    <hr />
    <h2>Ventas por forma de pago</h2>
    <table>${pagos}</table>
    <hr />
    <table>
      ${fila("Subtotal sin IVA", money(c.subtotal))}
      ${fila(`IVA ${c.tarifaIva}%`, money(c.iva))}
      ${fila("TOTAL DEL DÍA", money(c.total), true)}
    </table>
    <hr />
    <h2>Cuadre por medio de pago</h2>
    <table>${cuadre}</table>
    <table>
      ${fila("Total sistema", money(c.total))}
      ${fila("Total contado", money(totalContado))}
      ${fila(diferencia < 0 ? "FALTANTE" : diferencia > 0 ? "SOBRANTE" : "CUADRADO", money(Math.abs(diferencia)), true)}
    </table>
    ${c.notas ? `<hr /><p>Observaciones: ${esc(c.notas)}</p>` : ""}
    ${anuladas}
    ${esCuadre ? "" : '<div class="firma">Firma del responsable</div>'}
    <p class="c">Costea POS | ${esCuadre ? "Cuadre de caja" : "Cierre de caja"}</p>
  </body></html>`;
}

/** Comprobante interno de control: "ORDEN ANULADA" en grande. */
function ordenAnuladaHtml(doc) {
  const c = almacen.leerConfig();
  const fh = (iso) => {
    try {
      return new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil" });
    } catch {
      return String(iso || "");
    }
  };
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>ORDEN ANULADA ${esc(doc.docNumber)}</title>
  <style>
    @page { size: 80mm auto; margin: 0 4mm; }
    html, body { margin:0; padding:0; width:66mm; max-width:66mm; overflow-x:hidden; }
    body { font-family:"Segoe UI", Arial, sans-serif; color:#000; background:#fff; width:66mm; margin:0 auto; text-align:center; }
    h1 { font-size:20px; margin:6px 0; letter-spacing:1px; border:2px solid #000; padding:4px 0; }
    p { margin:2px 0; font-size:11px; text-align:left; overflow-wrap:anywhere; }
    p.c { text-align:center; }
    hr { border:none; border-top:1px dashed #000; margin:5px 0; }
    .n { font-size:16px; font-weight:700; text-align:center; margin:4px 0; }
    .firma { margin-top:12mm; border-top:1px solid #000; font-size:10px; padding-top:2px; }
  </style></head><body>
    <p class="c"><strong>${esc(c.nombreComercial || c.razonSocial || "Costea POS")}</strong></p>
    <p class="c">RUC: ${esc(c.ruc || "")}</p>
    <hr />
    <h1>ORDEN ANULADA</h1>
    <div class="n">${esc(doc.docNumber || "")}</div>
    <hr />
    <p>Fecha de la orden: ${esc(fh(doc.fechaEmision))}</p>
    <p>Fecha de anulación: ${esc(fh(doc.fechaAnulacion))}</p>
    <p>Mesa / etiqueta: ${esc(doc.mesa || "—")}</p>
    <p>Total anulado: ${money(doc.total)}</p>
    <p>Anulada por: ${esc(doc.usuarioAnulacion || "—")}</p>
    <p>Motivo: ${esc(doc.motivoAnulacion || "—")}</p>
    <hr />
    <p class="c">Comprobante de control interno.<br />Grapar junto al ticket original.</p>
    <div class="firma">Firma del responsable</div>
  </body></html>`;
}

module.exports = { ticketHtml, totalEnLetras, cierreHtml, ordenAnuladaHtml };

