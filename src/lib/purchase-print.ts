/**
 * Comprobante interno de compra:
 *  • Tirilla térmica 80mm (tira corta).
 *  • Hoja A4 / PDF.
 * Ambos formatos muestran proveedor, código, descripción, costo unitario,
 * cantidad, total por ítem y el total general de la compra.
 */
import { silentPrint } from "@/lib/silent-print";
import { printA4 } from "@/lib/inventory-print";

export type PurchasePrintLine = {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  total: number;
};

export type PurchasePrintInfo = {
  negocio?: string;
  proveedor: string;
  documento: string;
  fecha: string;
  base: number;
  iva: number;
  total: number;
  notas?: string | null;
  printer?: string;
};

const money = (n: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n || 0);

const qty = (n: number) =>
  new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

/** Tirilla térmica 80mm del comprobante de compra. */
export function printPurchaseTicket(lines: PurchasePrintLine[], info: PurchasePrintInfo) {
  const body = lines
    .map(
      (l) => `<tr class="it"><td colspan="2">${esc(l.code)} · ${esc(l.name)}</td></tr>
      <tr><td>${qty(l.quantity)} ${esc(l.unit)} × ${money(l.unitCost)}</td>
      <td class="r">${money(l.total)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>Compra ${esc(info.documento)}</title>
  <style>
    @page { size: 80mm auto; margin: 5mm; }
    body { font-family: "Barlow", Arial, sans-serif; color:#000; background:#fff; width:72mm; }
    h1 { font-size:14px; text-align:center; margin:0 0 2px; letter-spacing:1px; }
    p { margin:1px 0; font-size:11px; }
    hr { border:none; border-top:1px dashed #000; margin:5px 0; }
    table { width:100%; border-collapse:collapse; font-size:11px; }
    td { padding:1px 0; vertical-align:top; }
    td.r { text-align:right; }
    tr.it td { font-weight:700; padding-top:3px; border-top:1px dotted #999; }
    .tot { font-size:12px; font-weight:700; display:flex; justify-content:space-between; }
    .firma { margin-top:26px; border-top:1px solid #000; text-align:center; font-size:11px; padding-top:2px; }
  </style></head><body>
    ${info.negocio ? `<p style="text-align:center">${esc(info.negocio)}</p>` : ""}
    <h1>COMPROBANTE DE COMPRA</h1>
    <p>Proveedor: ${esc(info.proveedor)}</p>
    <p>Comprobante: ${esc(info.documento || "—")}</p>
    <p>Fecha: ${esc(info.fecha)}</p>
    <hr />
    <table>${body}</table>
    <hr />
    <div class="tot"><span>Base imponible</span><span>${money(info.base)}</span></div>
    <div class="tot"><span>IVA</span><span>${money(info.iva)}</span></div>
    <div class="tot"><span>TOTAL GENERAL</span><span>${money(info.total)}</span></div>
    <p>Ítems: ${lines.length}</p>
    ${info.notas ? `<hr /><p>Obs.: ${esc(info.notas)}</p>` : ""}
    <div class="firma">Recibido por</div>
  </body></html>`;

  return silentPrint(html, `Compra ${info.documento}`, info.printer);
}

/** Comprobante de compra en hoja A4 (o guardar como PDF). */
export function printPurchaseA4(lines: PurchasePrintLine[], info: PurchasePrintInfo) {
  const body = lines
    .map(
      (l) => `<tr>
        <td>${esc(l.code)}</td>
        <td>${esc(l.name)}</td>
        <td class="r">${money(l.unitCost)}</td>
        <td class="r">${qty(l.quantity)} ${esc(l.unit)}</td>
        <td class="r">${money(l.total)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>Compra ${esc(info.documento)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color:#000; background:#fff; }
    h1 { font-size:18px; margin:0 0 2px; }
    p.sub { font-size:12px; margin:0 0 10px; color:#333; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th, td { border:1px solid #999; padding:5px 6px; }
    th { background:#eee; text-align:left; }
    td.r, th.r { text-align:right; }
    tfoot td { font-weight:700; background:#f2f2f2; }
    .firma { margin-top:40px; display:flex; gap:60px; font-size:12px; }
    .firma span { border-top:1px solid #000; padding-top:3px; min-width:220px; text-align:center; }
  </style></head><body>
    ${info.negocio ? `<p class="sub">${esc(info.negocio)}</p>` : ""}
    <h1>Comprobante de compra</h1>
    <p class="sub">Proveedor: <strong>${esc(info.proveedor)}</strong> · Comprobante: ${esc(info.documento || "—")} · Fecha: ${esc(info.fecha)}</p>
    <table>
      <thead><tr>
        <th>Código</th><th>Descripción</th><th class="r">Costo unitario</th>
        <th class="r">Cantidad</th><th class="r">Total ítem</th>
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr><td colspan="4" class="r">Base imponible</td><td class="r">${money(info.base)}</td></tr>
        <tr><td colspan="4" class="r">IVA</td><td class="r">${money(info.iva)}</td></tr>
        <tr><td colspan="4" class="r">TOTAL GENERAL</td><td class="r">${money(info.total)}</td></tr>
      </tfoot>
    </table>
    ${info.notas ? `<p class="sub" style="margin-top:10px">Observaciones: ${esc(info.notas)}</p>` : ""}
    <div class="firma"><span>Entregado por</span><span>Recibido por</span></div>
  </body></html>`;

  return printA4(html, `Compra ${info.documento}`);
}
