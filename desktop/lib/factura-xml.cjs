/**
 * XML de factura electrónica (esquema SRI 1.1.0) — COPIA EXACTA de
 * src/lib/sri/factura-xml.server.ts del sistema web.
 */

const n2 = (v) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

const codigoIdentificacion = (tipo, identificacion) => {
  if (identificacion === "9999999999999") return "07";
  switch (tipo) {
    case "ruc":
      return "04";
    case "cedula":
      return "05";
    case "pasaporte":
      return "06";
    case "consumidor_final":
      return "07";
    default:
      return "05";
  }
};

const identificacionSri = (codigo, identificacion) => {
  const raw = String(identificacion ?? "").trim();
  const value = codigo === "06" ? raw.toUpperCase() : raw.replace(/\D/g, "");
  if (codigo === "04" && value.length !== 13) throw new Error("El RUC del comprador debe tener 13 dígitos numéricos");
  if (codigo === "05" && value.length !== 10) throw new Error("La cédula del comprador debe tener 10 dígitos numéricos");
  if (!value) throw new Error("Falta la identificación del comprador");
  return value;
};

const codigoFormaPago = (metodo) => {
  switch (metodo) {
    case "tarjeta":
    case "tarjeta_credito":
      return "19";
    case "tarjeta_debito":
      return "16";
    case "transferencia":
    case "transferencia_credito":
      return "20";
    case "efectivo":
      return "01";
    default:
      return "01";
  }
};

/** IVA 15% = código 4 (el 6 está parametrizado en 0.0 y el SRI lo rechaza). */
const codigoPorcentajeIva = (tarifa) => {
  if (tarifa === 0) return "0";
  if (tarifa === 12) return "2";
  return "4";
};

function validarTotales(detalles, totales) {
  const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const esperadoIva = r2((r2(totales.baseImponible) * totales.tarifa) / 100);
  if (Math.abs(esperadoIva - r2(totales.valorIva)) > 0.01)
    throw new Error(
      `El IVA calculado (${esperadoIva.toFixed(2)}) no coincide con el declarado (${r2(totales.valorIva).toFixed(2)})`,
    );
  const esperadoTotal = r2(r2(totales.totalSinImpuestos) + r2(totales.valorIva) + r2(totales.propina));
  if (Math.abs(esperadoTotal - r2(totales.importeTotal)) > 0.01)
    throw new Error(
      `Subtotal + IVA (${esperadoTotal.toFixed(2)}) no coincide con el importe total (${r2(totales.importeTotal).toFixed(2)})`,
    );
  const sumaBases = r2(detalles.reduce((acc, d) => acc + (Number(d.baseImponible) || 0), 0));
  if (Math.abs(sumaBases - r2(totales.baseImponible)) > 0.05)
    throw new Error("La suma de las bases imponibles de los detalles no coincide con el total");
  if (totales.tarifa !== 0 && codigoPorcentajeIva(totales.tarifa) === "0")
    throw new Error("El código de porcentaje de IVA no corresponde a la tarifa");
}

const fechaSri = (d) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.day}/${value.month}/${value.year}`;
};

function buildFacturaXml({ emisor, comprador, detalles, totales }) {
  if (emisor.ambiente !== "1" && emisor.ambiente !== "2")
    throw new Error("El ambiente SRI debe ser 1 (Pruebas) o 2 (Producción)");
  if (emisor.claveAcceso.slice(23, 24) !== emisor.ambiente)
    throw new Error("El ambiente del XML no coincide con el dígito de ambiente de la clave de acceso");

  validarTotales(detalles, totales);
  const codPorc = codigoPorcentajeIva(totales.tarifa);
  const codIdent = codigoIdentificacion(comprador.tipoIdentificacion, comprador.identificacion);
  const identComprador = identificacionSri(codIdent, comprador.identificacion);

  const secuencial9 = String(emisor.secuencial).replace(/\D/g, "").padStart(9, "0").slice(-9);
  const estab3 = String(emisor.estab).replace(/\D/g, "").padStart(3, "0").slice(-3);
  const ptoEmi3 = String(emisor.ptoEmi).replace(/\D/g, "").padStart(3, "0").slice(-3);

  const detalleXml = detalles
    .map(
      (d) => `<detalle>
<codigoPrincipal>${esc(d.codigo)}</codigoPrincipal>
<descripcion>${esc(d.descripcion)}</descripcion>
<cantidad>${n2(d.cantidad)}</cantidad>
<precioUnitario>${n2(d.precioUnitario)}</precioUnitario>
<descuento>${n2(d.descuento)}</descuento>
<precioTotalSinImpuesto>${n2(d.precioTotalSinImpuesto)}</precioTotalSinImpuesto>
<impuestos>
<impuesto>
<codigo>2</codigo>
<codigoPorcentaje>${codPorc}</codigoPorcentaje>
<tarifa>${n2(totales.tarifa)}</tarifa>
<baseImponible>${n2(d.baseImponible)}</baseImponible>
<valor>${n2(d.valorIva)}</valor>
</impuesto>
</impuestos>
</detalle>`,
    )
    .join("\n");

  const infoAdicional = [];
  if (comprador.email) infoAdicional.push(`<campoAdicional nombre="Email">${esc(comprador.email)}</campoAdicional>`);
  infoAdicional.push(`<campoAdicional nombre="Proveedor RUC">1716626484001</campoAdicional>`);
  infoAdicional.push(`<campoAdicional nombre="Proveedor Web">www.costeapro.com</campoAdicional>`);

  return `${XML_DECLARATION}
<factura id="comprobante" version="1.1.0">
<infoTributaria>
<ambiente>${emisor.ambiente}</ambiente>
<tipoEmision>${emisor.tipoEmision}</tipoEmision>
<razonSocial>${esc(emisor.razonSocial)}</razonSocial>
<nombreComercial>${esc(emisor.nombreComercial || emisor.razonSocial)}</nombreComercial>
<ruc>${esc(emisor.ruc)}</ruc>
<claveAcceso>${emisor.claveAcceso}</claveAcceso>
<codDoc>01</codDoc>
<estab>${estab3}</estab>
<ptoEmi>${ptoEmi3}</ptoEmi>
<secuencial>${secuencial9}</secuencial>
<dirMatriz>${esc(emisor.dirMatriz)}</dirMatriz>
</infoTributaria>
<infoFactura>
<fechaEmision>${fechaSri(totales.fechaEmision)}</fechaEmision>
<dirEstablecimiento>${esc(emisor.dirEstablecimiento || emisor.dirMatriz)}</dirEstablecimiento>${
    emisor.contribuyenteEspecial
      ? `\n<contribuyenteEspecial>${esc(emisor.contribuyenteEspecial)}</contribuyenteEspecial>`
      : ""
  }
<obligadoContabilidad>${emisor.obligadoContabilidad ? "SI" : "NO"}</obligadoContabilidad>
<tipoIdentificacionComprador>${codIdent}</tipoIdentificacionComprador>
<razonSocialComprador>${esc(comprador.razonSocial)}</razonSocialComprador>
<identificacionComprador>${esc(identComprador)}</identificacionComprador>${
    codIdent === "04" && comprador.direccion && comprador.direccion.trim()
      ? `\n<direccionComprador>${esc(comprador.direccion.trim())}</direccionComprador>`
      : ""
  }

<totalSinImpuestos>${n2(totales.totalSinImpuestos)}</totalSinImpuestos>
<totalDescuento>${n2(totales.totalDescuento)}</totalDescuento>
<totalConImpuestos>
<totalImpuesto>
<codigo>2</codigo>
<codigoPorcentaje>${codPorc}</codigoPorcentaje>
<baseImponible>${n2(totales.baseImponible)}</baseImponible>
<valor>${n2(totales.valorIva)}</valor>
</totalImpuesto>
</totalConImpuestos>
<propina>${n2(totales.propina)}</propina>
<importeTotal>${n2(totales.importeTotal)}</importeTotal>
<moneda>DOLAR</moneda>
<pagos>
<pago>
<formaPago>${codigoFormaPago(totales.formaPago)}</formaPago>
<total>${n2(totales.importeTotal)}</total>
</pago>
</pagos>
</infoFactura>
<detalles>
${detalleXml}
</detalles>${infoAdicional.length > 0 ? `\n<infoAdicional>\n${infoAdicional.join("\n")}\n</infoAdicional>` : ""}
</factura>`;
}

module.exports = { buildFacturaXml, codigoIdentificacion, identificacionSri, codigoFormaPago, codigoPorcentajeIva };
