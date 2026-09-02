/**
 * Envío al SRI: recepción y autorización de comprobantes (web services offline).
 */

export const SRI_ENDPOINTS = {
  produccion: {
    recepcion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
  pruebas: {
    recepcion: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
} as const;

const between = (xml: string, tag: string) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1]!.trim() : null;
};

const allBetween = (xml: string, tag: string) =>
  Array.from(xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))).map((m) => m[1]!.trim());

const post = async (url: string, body: string) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`El SRI respondió ${res.status}: ${text.slice(0, 300)}`);
  return text;
};

const base64 = (xml: string) => {
  const bytes = new TextEncoder().encode(xml);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};

export type RecepcionResult = { estado: string; mensajes: string[] };

/** Paso 1: envía el XML firmado a Recepción. */
export async function enviarRecepcion(url: string, xmlFirmado: string): Promise<RecepcionResult> {
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion"><soapenv:Header/><soapenv:Body><ec:validarComprobante><xml>${base64(
    xmlFirmado,
  )}</xml></ec:validarComprobante></soapenv:Body></soapenv:Envelope>`;
  const text = await post(url, envelope);
  const estado = between(text, "estado") ?? "DESCONOCIDO";
  const mensajes = allBetween(text, "mensaje").map((m, i) => {
    const info = allBetween(text, "informacionAdicional")[i];
    return info ? `${m}: ${info}` : m;
  });
  return { estado, mensajes };
}

export type AutorizacionResult = {
  estado: string;
  numeroAutorizacion: string | null;
  fechaAutorizacion: string | null;
  mensajes: string[];
  /** Comprobante XML tal como lo devuelve el SRI (fuente única del RIDE). */
  comprobanteAutorizado: string | null;
};

/** Paso 2: consulta la autorización por clave de acceso. */
export async function consultarAutorizacion(url: string, claveAcceso: string): Promise<AutorizacionResult> {
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion"><soapenv:Header/><soapenv:Body><ec:autorizacionComprobante><claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante></ec:autorizacionComprobante></soapenv:Body></soapenv:Envelope>`;
  const text = await post(url, envelope);
  const estado = between(text, "estado") ?? "DESCONOCIDO";
  const mensajes = allBetween(text, "mensaje").map((m, i) => {
    const info = allBetween(text, "informacionAdicional")[i];
    return info ? `${m}: ${info}` : m;
  });
  const bruto = between(text, "comprobante");
  const comprobanteAutorizado = bruto
    ? bruto
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
    : null;

  return {
    estado,
    numeroAutorizacion: between(text, "numeroAutorizacion"),
    fechaAutorizacion: between(text, "fechaAutorizacion"),
    mensajes,
    comprobanteAutorizado,
  };
}
