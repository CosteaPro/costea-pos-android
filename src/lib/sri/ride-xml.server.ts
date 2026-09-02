/**
 * Lectura del comprobante ELECTRÓNICO AUTORIZADO (el XML que el SRI aprueba).
 *
 * El SRI no devuelve un PDF: el RIDE lo emite el contribuyente, pero DEBE
 * reflejar exactamente el contenido del XML autorizado. Por eso el RIDE del
 * sistema se arma a partir de este XML y nunca de etiquetas internas del POS
 * (por ejemplo "Transferencia Crédito", que no existe en el catálogo del SRI).
 */

import { descripcionFormaPago } from "./factura-xml.server";

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1].trim()) : null;
};

const blocks = (xml: string, name: string): string[] =>
  Array.from(xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "gi"))).map((m) => m[1]);

const decodeEntities = (v: string) =>
  v
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const num = (v: string | null) => (v == null || v === "" ? null : Number(v));

export type PagoAutorizado = { codigo: string; descripcion: string; total: number | null };

export type ComprobanteAutorizado = {
  claveAcceso: string | null;
  ambiente: string | null;
  docNumber: string | null;
  fechaEmision: string | null;
  emisor: {
    razonSocial: string | null;
    nombreComercial: string | null;
    ruc: string | null;
    dirMatriz: string | null;
    dirEstablecimiento: string | null;
    obligadoContabilidad: boolean | null;
  };
  comprador: { razonSocial: string | null; identificacion: string | null; direccion: string | null };
  detalles: { product_name: string; quantity: number; unit_price: number }[];
  totalSinImpuestos: number | null;
  valorIva: number | null;
  tarifa: number | null;
  propina: number | null;
  importeTotal: number | null;
  pagos: PagoAutorizado[];
};

/**
 * Extrae del XML autorizado (o firmado) todo lo que el RIDE debe mostrar.
 * Devuelve null si el XML no contiene una factura legible.
 */
export function leerComprobanteAutorizado(xmlEntrada: string | null | undefined): ComprobanteAutorizado | null {
  if (!xmlEntrada) return null;
  // Respuesta de autorización: el comprobante viene anidado y escapado.
  let xml = String(xmlEntrada);
  const anidado = xml.match(/<comprobante>([\s\S]*?)<\/comprobante>/i);
  if (anidado) xml = decodeEntities(anidado[1]);
  if (!/<factura[\s>]/i.test(xml)) return null;

  const trib = xml.match(/<infoTributaria>([\s\S]*?)<\/infoTributaria>/i)?.[1] ?? "";
  const info = xml.match(/<infoFactura>([\s\S]*?)<\/infoFactura>/i)?.[1] ?? "";

  const estab = tag(trib, "estab");
  const pto = tag(trib, "ptoEmi");
  const sec = tag(trib, "secuencial");

  const impuesto = info.match(/<totalImpuesto>([\s\S]*?)<\/totalImpuesto>/i)?.[1] ?? "";

  const detalles = blocks(xml, "detalle").map((d) => ({
    product_name: tag(d, "descripcion") ?? "",
    quantity: num(tag(d, "cantidad")) ?? 0,
    unit_price: num(tag(d, "precioUnitario")) ?? 0,
  }));

  const pagos = blocks(info, "pago").map((p) => {
    const codigo = (tag(p, "formaPago") ?? "01").padStart(2, "0");
    return { codigo, descripcion: descripcionFormaPago(codigo), total: num(tag(p, "total")) };
  });

  return {
    claveAcceso: tag(trib, "claveAcceso"),
    ambiente: tag(trib, "ambiente"),
    docNumber: estab && pto && sec ? `${estab}-${pto}-${sec}` : null,
    fechaEmision: tag(info, "fechaEmision"),
    emisor: {
      razonSocial: tag(trib, "razonSocial"),
      nombreComercial: tag(trib, "nombreComercial"),
      ruc: tag(trib, "ruc"),
      dirMatriz: tag(trib, "dirMatriz"),
      dirEstablecimiento: tag(info, "dirEstablecimiento"),
      obligadoContabilidad: (tag(info, "obligadoContabilidad") ?? "").toUpperCase() === "SI",
    },
    comprador: {
      razonSocial: tag(info, "razonSocialComprador"),
      identificacion: tag(info, "identificacionComprador"),
      direccion: tag(info, "direccionComprador"),
    },
    detalles,
    totalSinImpuestos: num(tag(info, "totalSinImpuestos")),
    valorIva: num(tag(impuesto, "valor")),
    tarifa: num(tag(impuesto, "tarifa")),
    propina: num(tag(info, "propina")),
    importeTotal: num(tag(info, "importeTotal")),
    pagos,
  };
}
