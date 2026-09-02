/**
 * RIDE (Representación Impresa del Documento Electrónico) en formato A4.
 * Se genera en el servidor a partir de la venta autorizada por el SRI.
 * El cliente lo abre desde el enlace del correo y puede guardarlo como PDF.
 */

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const money = (n: number) =>
  new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));

import { leerComprobanteAutorizado } from "./sri/ride-xml.server";

export type RideLine = { product_name: string; quantity: number; unit_price: number };

export type RideInput = {
  company: Record<string, any>;
  order: Record<string, any>;
  items: RideLine[];
};

export function buildRideHtml({ company, order, items }: RideInput): string {
  // El XML autorizado por el SRI manda sobre cualquier dato interno del POS:
  // el RIDE debe decir exactamente lo mismo que el comprobante oficial.
  const sri = leerComprobanteAutorizado(order.xml_authorized ?? order.xml_signed);

  const tarifa = Number(sri?.tarifa ?? order.iva_rate ?? 15);
  const titulo =
    order.doc_type === "nota_credito"
      ? "NOTA DE CRÉDITO"
      : order.doc_type === "nota_debito"
        ? "NOTA DE DÉBITO"
        : "FACTURA";

  const fecha = new Date(order.created_at ?? Date.now()).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "short",
    timeStyle: "short",
  });
  const autorizado = new Date(order.sri_authorized_at ?? order.created_at ?? Date.now()).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "short",
    timeStyle: "medium",
  });

  const lineas = sri && sri.detalles.length ? sri.detalles : items;

  const pagos =
    sri && sri.pagos.length
      ? sri.pagos
      : [{ codigo: "01", descripcion: "SIN UTILIZACIÓN DEL SISTEMA FINANCIERO", total: Number(order.total ?? 0) }];

  const filas = lineas
    .map(
      (l) => `<tr>
        <td class="c">${money(l.quantity)}</td>
        <td>${esc(l.product_name)}</td>
        <td class="r">${money(l.unit_price)}</td>
        <td class="r">${money(Number(l.quantity) * Number(l.unit_price))}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(titulo)} ${esc(order.doc_number ?? "")}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; padding: 16px; background: #f4f6f8; }
  .hoja { background: #fff; max-width: 800px; margin: 0 auto; padding: 24px; }
  .top { display: flex; gap: 16px; }
  .box { border: 1px solid #333; border-radius: 4px; padding: 10px; flex: 1; }
  h1 { font-size: 15px; margin: 0 0 6px; }
  h2 { font-size: 13px; margin: 0 0 4px; }
  p { margin: 2px 0; }
  .key { font-family: "Courier New", monospace; font-size: 11px; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  th, td { border: 1px solid #999; padding: 5px 6px; }
  th { background: #eee; font-size: 11px; text-align: left; }
  .r { text-align: right; } .c { text-align: center; }
  .tot { width: 260px; margin-left: auto; margin-top: 12px; }
  .tot td { border: none; padding: 3px 6px; }
  .grand td { border-top: 1px solid #333; font-weight: bold; font-size: 14px; }
  .pie { margin-top: 18px; font-size: 11px; color: #444; }
  @media print { body { background: #fff; padding: 0; } .hoja { padding: 0; } .noprint { display: none; } }
  .noprint { text-align: center; margin: 0 auto 12px; max-width: 800px; }
  button { background: #e85d3a; color: #fff; border: 0; border-radius: 6px; padding: 10px 18px; font-size: 14px; cursor: pointer; }
</style></head>
<body>
<div class="noprint"><button onclick="window.print()">Imprimir o guardar como PDF</button></div>
<div class="hoja">
  <div class="top">
    <div class="box">
      <h1>${esc(sri?.emisor.razonSocial ?? company.business_name ?? "")}</h1>
      ${(sri?.emisor.nombreComercial ?? company.trade_name) ? `<p>${esc(sri?.emisor.nombreComercial ?? company.trade_name)}</p>` : ""}
      <p>RUC: ${esc(sri?.emisor.ruc ?? company.ruc ?? "")}</p>
      <p>Matriz: ${esc(sri?.emisor.dirMatriz ?? company.address ?? "")}</p>
      ${company.branch_address ? `<p>Sucursal: ${esc(company.branch_address)}</p>` : ""}
      <p>Obligado a llevar contabilidad: ${company.accounting_required ? "SÍ" : "NO"}</p>
    </div>
    <div class="box">
      <h2>${esc(titulo)}</h2>
      <p>Nº ${esc(sri?.docNumber ?? order.doc_number ?? "")}</p>
      <p>NÚMERO DE AUTORIZACIÓN:</p>
      <p class="key">${esc(order.authorization_number ?? order.access_key ?? "")}</p>
      <p>FECHA DE AUTORIZACIÓN: ${esc(autorizado)}</p>
      <p>AMBIENTE: ${(sri?.ambiente ?? company.environment) === "1" ? "PRUEBAS" : "PRODUCCIÓN"} · EMISIÓN: NORMAL</p>
      <p>CLAVE DE ACCESO:</p>
      <p class="key">${esc(sri?.claveAcceso ?? order.access_key ?? "")}</p>
    </div>
  </div>

  <div class="box" style="margin-top:12px">
    <p><strong>Razón social:</strong> ${esc(sri?.comprador.razonSocial ?? order.customer_name ?? "CONSUMIDOR FINAL")}</p>
    <p><strong>Identificación:</strong> ${esc(sri?.comprador.identificacion ?? order.customer_id_number ?? "9999999999999")}</p>
    ${order.customer_address ? `<p><strong>Dirección:</strong> ${esc(order.customer_address)}</p>` : ""}
    <p><strong>Fecha de emisión:</strong> ${esc(sri?.fechaEmision ?? fecha)}</p>
  </div>

  <table>
    <thead><tr><th class="c">Cant.</th><th>Descripción</th><th class="r">P. Unitario</th><th class="r">Total</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>

  <table class="tot">
    <tr><td>Subtotal ${tarifa}%</td><td class="r">$ ${money(sri?.totalSinImpuestos ?? order.subtotal ?? 0)}</td></tr>
    <tr><td>IVA ${tarifa}%</td><td class="r">$ ${money(sri?.valorIva ?? order.tax_amount ?? 0)}</td></tr>
    <tr class="grand"><td>VALOR TOTAL</td><td class="r">$ ${money(sri?.importeTotal ?? order.total ?? 0)}</td></tr>
  </table>

  <p class="pie">Forma de pago: ${pagos
    .map((p) => `${esc(p.codigo)} - ${esc(p.descripcion)}${p.total != null ? ` ($ ${money(p.total)})` : ""}`)
    .join(" · ")}</p>
  <p class="pie">Documento electrónico autorizado por el Servicio de Rentas Internas. Puede verificarlo en el portal del SRI con la clave de acceso.</p>
  <p class="pie">RUC: 1716626484001<br />www.costeapro.com</p>
</div>
</body></html>`;
}
