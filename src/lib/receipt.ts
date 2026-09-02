/** Impresión de tickets de cobro en papel térmico de 80 mm (POS-80). */
import { currency } from "@/lib/pos";
import { silentPrint } from "@/lib/silent-print";
import { esMovil, getMetodoMovil, imprimirEnMovil, ticketEscPos } from "@/lib/bluetooth-print";
import { imprimirNativo, soportaBluetoothNativo } from "@/lib/native-print";
import { formatAccessKey } from "@/lib/sri";


export type ReceiptOption = {
  name: string;
  qty: number;
  kind: "modificador" | "agregador";
  price: number;
};

export type ReceiptLine = {
  name: string;
  qty: number;
  unit_price: number;
  notes?: string | null;
  /** Modificadores y agregadores del plato (solo se imprimen en la copia de control interno). */
  options?: ReceiptOption[];
};

export type ReceiptData = {
  docType: "factura" | "nota_venta" | "nota_debito" | "nota_credito";
  negocio: string;
  ruc?: string | null;
  direccion?: string | null;
  sucursal?: string | null;
  telefono?: string | null;
  correo?: string | null;
  regimen?: string | null;
  obligadoContabilidad?: boolean;
  ambiente?: string | null;
  tipoEmision?: string | null;
  /** Número de control interno (nota de venta) o número de comprobante SRI. */
  numero: string;
  claveAcceso?: string | null;
  autorizacion?: string | null;
  fecha: string;
  cliente?: string | null;
  clienteId?: string | null;
  clienteDireccion?: string | null;
  clienteCorreo?: string | null;
  lines: ReceiptLine[];
  subtotal: number;
  ivaRate: number;
  iva: number;
  total: number;
  formaPago: string;
  recibido?: number | null;
  cambio?: number | null;
  totalEnLetras?: string | null;
  mesa?: string | null;
  atendio?: string | null;
  anulado?: boolean;
  motivoAnulacion?: string | null;
  /** Nombre de la impresora POS-80 de cobro (para el puente de impresión local). */
  impresora?: string | null;
  /** Cuántos ejemplares se imprimen seguidos (por defecto 2: cliente y control interno). */
  copias?: number | null;
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

const COPIA_CLIENTE = "COPIA — CLIENTE";
const COPIA_CONTROL = "COPIA — CONTROL INTERNO";

/** Ejemplares seguidos: por defecto cliente y control interno. */
function copias(t: ReceiptData) {
  const total = Math.min(Math.max(Math.floor(Number(t.copias ?? 2) || 2), 1), 5);
  return Array.from({ length: total }, (_, i) =>
    ticketSection(t, i === 0 ? COPIA_CLIENTE : COPIA_CONTROL),
  ).join("");
}

const row = (label: string, value: string, bold = false) =>
  `<tr${bold ? ' class="tot"' : ""}><td>${label}</td><td class="r">${value}</td></tr>`;

/** Filas de una línea: el plato y sus opciones según el destino de la copia. */
function lineRows(l: ReceiptLine, interno: boolean) {
  const opciones = (l.options ?? []).filter((o) =>
    interno ? true : o.kind === "agregador" && Number(o.price) > 0,
  );
  const filas = opciones
    .map((o) => {
      const cant = l.qty * (o.qty || 1);
      const esAgregador = o.kind === "agregador" && Number(o.price) > 0;
      return `<tr><td class="q">${esAgregador ? cant : ""}</td><td class="opt">${
        esAgregador ? "+ " : "• "
      }${esc(o.name)}${!esAgregador && (o.qty || 1) > 1 ? ` (${o.qty})` : ""}</td><td class="p">${
        esAgregador ? currency(o.price) : ""
      }</td><td class="r">${esAgregador ? currency(o.price * cant) : ""}</td></tr>`;
    })
    .join("");
  const nota =
    interno && l.notes
      ? `<tr><td class="q"></td><td class="opt" colspan="3">📝 ${esc(l.notes)}</td></tr>`
      : "";
  return `<tr><td class="q">${l.qty}</td><td>${esc(l.name)}</td><td class="p">${currency(
    l.unit_price,
  )}</td><td class="r">${currency(l.unit_price * l.qty)}</td></tr>${filas}${nota}`;
}

function ticketSection(t: ReceiptData, copia: string) {
  const esSri = t.docType !== "nota_venta";
  const interno = copia === COPIA_CONTROL;
  const titulo = t.docType === "factura" ? "FACTURA" : t.docType === "nota_debito" ? "NOTA DE DÉBITO" : t.docType === "nota_credito" ? "NOTA DE CRÉDITO" : "ORDEN";

  // La copia de control interno ahorra papel: sin datos del negocio ni cabecera SRI.
  const cabecera = interno
    ? ""
    : `
    <h1>${esc(t.negocio)}</h1>
    ${t.ruc ? `<p class="c">RUC: ${esc(t.ruc)}</p>` : ""}
    ${t.direccion ? `<p class="c">Matriz: ${esc(t.direccion)}</p>` : ""}
    ${t.sucursal ? `<p class="c">Establecimiento: ${esc(t.sucursal)}</p>` : ""}
    ${t.telefono ? `<p class="c">Tel: ${esc(t.telefono)}</p>` : ""}
    ${t.correo ? `<p class="c">${esc(t.correo)}</p>` : ""}
    ${t.regimen ? `<p class="c">${esc(t.regimen)}</p>` : ""}
    <p class="c">Obligado a llevar contabilidad: ${t.obligadoContabilidad ? "SÍ" : "NO"}</p>
    <hr />`;

  const datosSri = interno
    ? ""
    : esSri
      ? `${t.ambiente ? `<p class="c">Ambiente: ${t.ambiente === "1" ? "PRUEBAS" : "PRODUCCIÓN"}</p>` : ""}
         <p class="c">Emisión: ${t.tipoEmision === "2" ? "CONTINGENCIA" : "NORMAL"}</p>
         ${t.autorizacion ? `<p class="c">Autorización SRI:</p><p class="key">${esc(t.autorizacion)}</p>` : ""}
         ${t.claveAcceso ? `<p class="c">Clave de acceso:</p><p class="key">${esc(formatAccessKey(t.claveAcceso))}</p>` : ""}`
      : `<p class="c">Documento de control interno · no válido como comprobante de venta autorizado por el SRI</p>`;

  return `
  <section class="ticket">
    ${cabecera}
    <h2>${esc(titulo)}</h2>
    <p class="c doc-number">Nro. ${esc(t.numero)}</p>
    ${datosSri}
    ${t.anulado ? `<p class="anul">ANULADO</p>${t.motivoAnulacion ? `<p class="c">Motivo: ${esc(t.motivoAnulacion)}</p>` : ""}` : ""}
    <hr />
    <p>Fecha: ${esc(t.fecha)}</p>
    ${t.mesa ? `<p>Mesa: ${esc(t.mesa)}</p>` : ""}
    ${t.atendio ? `<p>Atendió: ${esc(t.atendio)}</p>` : ""}
    ${t.cliente ? `<p>Cliente: ${esc(t.cliente)}</p>` : ""}
    <p>Identificación: ${esc(t.clienteId || "0000000000000")}</p>
    ${t.clienteDireccion ? `<p>Dirección: ${esc(t.clienteDireccion)}</p>` : ""}
    ${t.clienteCorreo ? `<p>Correo: ${esc(t.clienteCorreo)}</p>` : ""}
    <hr />
    <table>
      <tr><td class="q">Cant</td><td>Descripción</td><td class="p">P.Unit</td><td class="r">Subtotal</td></tr>
      ${t.lines.map((l) => lineRows(l, interno)).join("")}
    </table>
    <hr />
    <table>
      ${row("Subtotal sin IVA", currency(t.subtotal))}
      ${row(`IVA ${t.ivaRate}%`, currency(t.iva))}
      ${row("TOTAL", currency(t.total), true)}
      ${row("Forma de pago", esc(t.formaPago))}
      ${typeof t.recibido === "number" ? row("Recibido", currency(t.recibido)) : ""}
      ${typeof t.cambio === "number" ? row("Cambio", currency(t.cambio)) : ""}
    </table>
    ${t.totalEnLetras ? `<hr /><p>Son: ${esc(t.totalEnLetras)}</p>` : ""}
    <hr />
    <p class="copia">${esc(copia)}</p>
    ${
      interno
        ? `<p class="c">Documento de control interno</p>`
        : esSri
          ? `<p class="c">¡Gracias por su compra!</p>
             <p class="c">Verifica la validez y descarga tu comprobante en el portal oficial: www.sri.gob.ec</p>`
          : `<p class="c">¡Gracias por su compra!</p>
             <hr />
             <p class="c"><strong>CONSUMIDOR FINAL</strong></p>
             <p class="c">0999999999</p>
             <hr />`
    }
    <p class="c">RUC: 1716626484001</p>
    <p class="c">www.costeapro.com</p>


  </section>`;
}

export function receiptHtml(t: ReceiptData) {
  const esFactura = t.docType === "factura";
  const titulo = esFactura ? "FACTURA" : "ORDEN";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>${esc(titulo)} ${esc(t.numero)}</title>
  <style>
    @page { size: 80mm auto; margin: 0 4mm; }
    html, body { margin: 0; padding: 0; width: 66mm; }
    body { font-family: "Barlow", Arial, sans-serif; color:#000; background:#fff; width: 66mm; overflow-wrap: anywhere; word-wrap: break-word; }
    .ticket { width: 66mm; max-width: 66mm; }
    * { max-width: 66mm; overflow-wrap: anywhere; }
    .ticket + .ticket { border-top: 1px dashed #000; margin-top: 6mm; padding-top: 4mm; page-break-before: always; }
    h1 { font-size: 15px; margin: 0 0 2px; text-align:center; letter-spacing:.5px; }
    h2 { font-size: 12px; margin: 6px 0 2px; text-transform: uppercase; text-align:center; }
    p { margin: 1px 0; font-size: 11px; }
    p.c { text-align:center; }
    p.doc-number { font-size: 17px; font-weight: 700; text-align: center; margin: 4px 0; letter-spacing: 0.5px; }
    p.copia { text-align:center; font-weight:700; font-size:11px; letter-spacing:.5px; }
    table { width:66mm; max-width: 66mm; table-layout: fixed; border-collapse: collapse; font-size: 11px; }
    td { padding: 1px 0; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
    /* Anchos fijos: los importes quedan dentro del papel, se ajusta la descripción. */
    td.q { width: 7mm; text-align: left; }
    td.opt { font-size: 10px; padding-left: 3mm; }
    td.p { width: 13mm; text-align: right; white-space: nowrap; }
    td.r { width: 17mm; text-align: right; white-space: nowrap; }
    hr { border:none; border-top:1px dashed #000; margin:4px 0; }
    .tot td { font-weight:700; font-size: 13px; }
    .key { font-size: 9px; word-break: break-all; text-align:center; }
    .anul { text-align:center; font-weight:700; font-size:14px; border:2px solid #000; padding:2px; margin:4px 0; }
  </style></head><body>
  ${copias(t)}
  </body></html>`;
}

/** Envía el ticket 80 mm directo a la impresora de cobro, sin diálogo del navegador. */
export function printReceipt(data: ReceiptData) {
  const respaldo = () =>
    silentPrint(receiptHtml(data), `Ticket ${data.numero}`, data.impresora ?? undefined);

  // 1) App nativa de celular: Bluetooth clásico directo a la impresora térmica.
  if (soportaBluetoothNativo()) {
    void imprimirNativo(ticketEscPos(data)).catch(() => {
      if (esMovil() && getMetodoMovil()) void imprimirEnMovil(data).then((ok) => { if (!ok) respaldo(); });
      else respaldo();
    });
    return true;
  }

  // 2) Navegador en celular: el método elegido por el usuario.
  if (esMovil() && getMetodoMovil()) {
    void imprimirEnMovil(data).then((ok) => {
      if (!ok) respaldo();
    });
    return true;
  }

  // 3) Tablet y computadora: agente local / diálogo de impresión, como siempre.
  return respaldo();
}


