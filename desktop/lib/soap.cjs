/**
 * Envío al SRI (recepción y autorización offline) — COPIA EXACTA de
 * src/lib/sri/soap.server.ts del sistema web.
 */

const SRI_ENDPOINTS = {
  produccion: {
    recepcion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
  pruebas: {
    recepcion: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
};

const between = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
};

const allBetween = (xml, tag) =>
  Array.from(xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))).map((m) => m[1].trim());

const post = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`El SRI respondió ${res.status}: ${text.slice(0, 300)}`);
  return text;
};

const base64 = (xml) => Buffer.from(xml, "utf8").toString("base64");

async function enviarRecepcion(url, xmlFirmado) {
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

async function consultarAutorizacion(url, claveAcceso) {
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
    // XML oficial devuelto por el SRI: es el que se distribuye al cliente.
    comprobanteAutorizado,
  };
}

module.exports = { SRI_ENDPOINTS, enviarRecepcion, consultarAutorizacion };
