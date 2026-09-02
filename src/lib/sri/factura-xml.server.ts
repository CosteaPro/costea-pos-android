/**
 * Construcción del XML de factura electrónica (esquema SRI versión 1.1.0).
 * Solo se ejecuta en el servidor.
 */

export type FacturaEmisor = {
  ambiente: string; // Catálogo oficial SRI: 1 pruebas · 2 producción
  tipoEmision: string;
  razonSocial: string;
  nombreComercial: string;
  ruc: string;
  claveAcceso: string;
  estab: string;
  ptoEmi: string;
  secuencial: string; // 9 dígitos
  dirMatriz: string;
  dirEstablecimiento: string;
  obligadoContabilidad: boolean;
  contribuyenteEspecial?: string | null;
};

export type FacturaComprador = {
  tipoIdentificacion: string; // cedula | ruc | pasaporte | consumidor_final
  identificacion: string;
  razonSocial: string;
  direccion?: string | null;
  email?: string | null;
  telefono?: string | null;
};

export type FacturaDetalle = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  precioTotalSinImpuesto: number;
  tarifa: number;
  baseImponible: number;
  valorIva: number;
};

export type FacturaTotales = {
  fechaEmision: Date;
  totalSinImpuestos: number;
  totalDescuento: number;
  baseImponible: number;
  tarifa: number;
  valorIva: number;
  propina: number;
  importeTotal: number;
  formaPago: string;
};

const n2 = (v: number) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);

const esc = (v: string) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Declaración XML obligatoria como primera línea de todo comprobante. */
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/** Código SRI del tipo de identificación del comprador. */
export const codigoIdentificacion = (tipo: string, identificacion: string) => {
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

/** Identificación tal como la exige el SRI: solo dígitos salvo pasaporte (06). */
export const identificacionSri = (codigo: string, identificacion: string) => {
  const raw = String(identificacion ?? "").trim();
  const value = codigo === "06" ? raw.toUpperCase() : raw.replace(/\D/g, "");
  if (codigo === "04" && value.length !== 13)
    throw new Error("El RUC del comprador debe tener 13 dígitos numéricos");
  if (codigo === "05" && value.length !== 10)
    throw new Error("La cédula del comprador debe tener 10 dígitos numéricos");
  if (!value) throw new Error("Falta la identificación del comprador");
  return value;
};


/** Código SRI de forma de pago (tabla 24). */
export const codigoFormaPago = (metodo: string | null | undefined) => {
  switch (metodo) {
    case "tarjeta":
    case "tarjeta_credito":
      return "19";
    case "tarjeta_debito":
      return "16";
    case "transferencia":
    // El SRI no distingue si la transferencia ya se acreditó: mismo código oficial.
    case "transferencia_credito":
      return "20";
    case "efectivo":
      return "01";
    default:
      return "01";
  }
};

/** Descripción oficial del catálogo SRI (tabla 24) para la forma de pago. */
export const descripcionFormaPago = (codigo: string) => {
  switch (codigo) {
    case "16":
      return "TARJETA DE DÉBITO";
    case "19":
      return "TARJETA DE CRÉDITO";
    case "20":
      return "OTROS CON UTILIZACIÓN DEL SISTEMA FINANCIERO";
    case "01":
    default:
      return "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO";
  }
};

/**
 * Código de porcentaje de IVA (tabla 18).
 * El SRI tiene parametrizada la tarifa 15% con el código 4 (el código 6 está
 * parametrizado en 0.0 y provoca el rechazo "La tarifa impuesto 15.0 no coincide
 * con la parametrizada 0.0"). IVA 0% => código 0.
 */
export const codigoPorcentajeIva = (tarifa: number) => {
  if (tarifa === 0) return "0";
  if (tarifa === 12) return "2";
  return "4"; // 15% (y cualquier tarifa vigente distinta de 0/12)
};

/** Validación previa: cuadre de bases, IVA y total del comprobante. */
function validarTotales(detalles: FacturaDetalle[], totales: FacturaTotales) {
  const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
  const esperadoIva = r2((r2(totales.baseImponible) * totales.tarifa) / 100);
  if (Math.abs(esperadoIva - r2(totales.valorIva)) > 0.01) {
    throw new Error(
      `El IVA calculado (${esperadoIva.toFixed(2)}) no coincide con el declarado (${r2(totales.valorIva).toFixed(2)})`,
    );
  }
  const esperadoTotal = r2(r2(totales.totalSinImpuestos) + r2(totales.valorIva) + r2(totales.propina));
  if (Math.abs(esperadoTotal - r2(totales.importeTotal)) > 0.01) {
    throw new Error(
      `Subtotal + IVA (${esperadoTotal.toFixed(2)}) no coincide con el importe total (${r2(totales.importeTotal).toFixed(2)})`,
    );
  }
  const sumaBases = r2(detalles.reduce((acc, d) => acc + (Number(d.baseImponible) || 0), 0));
  if (Math.abs(sumaBases - r2(totales.baseImponible)) > 0.05) {
    throw new Error("La suma de las bases imponibles de los detalles no coincide con el total");
  }
  if (totales.tarifa !== 0 && codigoPorcentajeIva(totales.tarifa) === "0") {
    throw new Error("El código de porcentaje de IVA no corresponde a la tarifa");
  }
}


const fechaSri = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.day}/${value.month}/${value.year}`;
};

export function buildFacturaXml({
  emisor,
  comprador,
  detalles,
  totales,
}: {
  emisor: FacturaEmisor;
  comprador: FacturaComprador;
  detalles: FacturaDetalle[];
  totales: FacturaTotales;
}): string {
  if (emisor.ambiente !== "1" && emisor.ambiente !== "2") {
    throw new Error("El ambiente SRI debe ser 1 (Pruebas) o 2 (Producción)");
  }
  if (emisor.claveAcceso.slice(23, 24) !== emisor.ambiente) {
    throw new Error("El ambiente del XML no coincide con el dígito de ambiente de la clave de acceso");
  }

  validarTotales(detalles, totales);
  const codPorc = codigoPorcentajeIva(totales.tarifa);
  const codIdent = codigoIdentificacion(comprador.tipoIdentificacion, comprador.identificacion);
  const identComprador = identificacionSri(codIdent, comprador.identificacion);

  // El SRI exige secuencial de 9 dígitos y serie de 3 dígitos, siempre con ceros a la izquierda.
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

  // El comprobante autorizado por el SRI solo lleva el correo del comprador en infoAdicional.
  const infoAdicional: string[] = [];
  if (comprador.email) infoAdicional.push(`<campoAdicional nombre="Email">${esc(comprador.email)}</campoAdicional>`);
  // Datos discretos del proveedor del sistema (solo dos líneas).
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
    codIdent === "04" && comprador.direccion?.trim()
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
</detalles>${
    infoAdicional.length > 0 ? `\n<infoAdicional>\n${infoAdicional.join("\n")}\n</infoAdicional>` : ""
  }
</factura>`;
}

export function buildNotaCreditoXml({
  emisor, comprador, detalles, totales, documentoModificado, motivo,
}: {
  emisor: FacturaEmisor; comprador: FacturaComprador; detalles: FacturaDetalle[]; totales: FacturaTotales;
  documentoModificado: string; motivo: string;
}) {
  const codIdent = codigoIdentificacion(comprador.tipoIdentificacion, comprador.identificacion);
  const ident = identificacionSri(codIdent, comprador.identificacion);
  const codPorc = codigoPorcentajeIva(totales.tarifa);
  const detalleXml = detalles.map((d) => `<detalle><codigoInterno>${esc(d.codigo)}</codigoInterno><descripcion>${esc(d.descripcion)}</descripcion><cantidad>${n2(d.cantidad)}</cantidad><precioUnitario>${n2(d.precioUnitario)}</precioUnitario><descuento>${n2(d.descuento)}</descuento><precioTotalSinImpuesto>${n2(d.precioTotalSinImpuesto)}</precioTotalSinImpuesto><impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>${codPorc}</codigoPorcentaje><tarifa>${n2(totales.tarifa)}</tarifa><baseImponible>${n2(d.baseImponible)}</baseImponible><valor>${n2(d.valorIva)}</valor></impuesto></impuestos></detalle>`).join("\n");
  const sec = String(emisor.secuencial).replace(/\D/g, "").padStart(9, "0").slice(-9);
  return `${XML_DECLARATION}\n<notaCredito id="comprobante" version="1.1.0"><infoTributaria><ambiente>${emisor.ambiente}</ambiente><tipoEmision>${emisor.tipoEmision}</tipoEmision><razonSocial>${esc(emisor.razonSocial)}</razonSocial><nombreComercial>${esc(emisor.nombreComercial)}</nombreComercial><ruc>${esc(emisor.ruc)}</ruc><claveAcceso>${emisor.claveAcceso}</claveAcceso><codDoc>04</codDoc><estab>${emisor.estab}</estab><ptoEmi>${emisor.ptoEmi}</ptoEmi><secuencial>${sec}</secuencial><dirMatriz>${esc(emisor.dirMatriz)}</dirMatriz></infoTributaria><infoNotaCredito><fechaEmision>${fechaSri(totales.fechaEmision)}</fechaEmision><dirEstablecimiento>${esc(emisor.dirEstablecimiento)}</dirEstablecimiento><tipoIdentificacionComprador>${codIdent}</tipoIdentificacionComprador><razonSocialComprador>${esc(comprador.razonSocial)}</razonSocialComprador><identificacionComprador>${esc(ident)}</identificacionComprador><codDocModificado>01</codDocModificado><numDocModificado>${esc(documentoModificado)}</numDocModificado><fechaEmisionDocSustento>${fechaSri(totales.fechaEmision)}</fechaEmisionDocSustento><totalSinImpuestos>${n2(totales.totalSinImpuestos)}</totalSinImpuestos><valorModificacion>${n2(totales.importeTotal)}</valorModificacion><moneda>DOLAR</moneda><totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>${codPorc}</codigoPorcentaje><baseImponible>${n2(totales.baseImponible)}</baseImponible><valor>${n2(totales.valorIva)}</valor></totalImpuesto></totalConImpuestos><motivo>${esc(motivo)}</motivo></infoNotaCredito><detalles>${detalleXml}</detalles></notaCredito>`;
}

export function buildNotaDebitoXml({ emisor, comprador, totales, documentoModificado, motivo }: {
  emisor: FacturaEmisor; comprador: FacturaComprador; totales: FacturaTotales; documentoModificado: string; motivo: string;
}) {
  const codIdent = codigoIdentificacion(comprador.tipoIdentificacion, comprador.identificacion);
  const ident = identificacionSri(codIdent, comprador.identificacion);
  const codPorc = codigoPorcentajeIva(totales.tarifa);
  const sec = String(emisor.secuencial).replace(/\D/g, "").padStart(9, "0").slice(-9);
  return `${XML_DECLARATION}\n<notaDebito id="comprobante" version="1.0.0"><infoTributaria><ambiente>${emisor.ambiente}</ambiente><tipoEmision>${emisor.tipoEmision}</tipoEmision><razonSocial>${esc(emisor.razonSocial)}</razonSocial><nombreComercial>${esc(emisor.nombreComercial)}</nombreComercial><ruc>${esc(emisor.ruc)}</ruc><claveAcceso>${emisor.claveAcceso}</claveAcceso><codDoc>05</codDoc><estab>${emisor.estab}</estab><ptoEmi>${emisor.ptoEmi}</ptoEmi><secuencial>${sec}</secuencial><dirMatriz>${esc(emisor.dirMatriz)}</dirMatriz></infoTributaria><infoNotaDebito><fechaEmision>${fechaSri(totales.fechaEmision)}</fechaEmision><dirEstablecimiento>${esc(emisor.dirEstablecimiento)}</dirEstablecimiento><tipoIdentificacionComprador>${codIdent}</tipoIdentificacionComprador><razonSocialComprador>${esc(comprador.razonSocial)}</razonSocialComprador><identificacionComprador>${esc(ident)}</identificacionComprador><codDocModificado>01</codDocModificado><numDocModificado>${esc(documentoModificado)}</numDocModificado><fechaEmisionDocSustento>${fechaSri(totales.fechaEmision)}</fechaEmisionDocSustento><totalSinImpuestos>${n2(totales.totalSinImpuestos)}</totalSinImpuestos><impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>${codPorc}</codigoPorcentaje><tarifa>${n2(totales.tarifa)}</tarifa><baseImponible>${n2(totales.baseImponible)}</baseImponible><valor>${n2(totales.valorIva)}</valor></impuesto></impuestos><valorTotal>${n2(totales.importeTotal)}</valorTotal><pagos><pago><formaPago>${codigoFormaPago(totales.formaPago)}</formaPago><total>${n2(totales.importeTotal)}</total></pago></pagos></infoNotaDebito><motivos><motivo><razon>${esc(motivo)}</razon><valor>${n2(totales.totalSinImpuestos)}</valor></motivo></motivos></notaDebito>`;
}
