/**
 * Vista de impresión del reporte MIX DE VENTAS.
 * Se abre en una pantalla blanca con los botones Imprimir y Regresar.
 */

export type SalesMixRow = {
  code: string;
  name: string;
  units: number;
  pvn: number;
  net: number;
  mixPct: number;
  unitCost: number;
  totalCost: number;
  costPct: number;
  contrib: number;
  contribPct: number;
};

export type ModifierRow = {
  name: string;
  units: number;
};

export type SalesMixTotals = {
  units: number;
  net: number;
  tax: number;
  gross: number;
  cost: number;
  costPct: number;
  contrib: number;
  contribPct: number;
};

const num = (n: number) =>
  new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
const money = (n: number) => `$${num(n)}`;
const pct = (n: number) => `${num(n)}%`;
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

export function printSalesMix({
  rows,
  totals,
  from,
  to,
  negocio,
}: {
  rows: SalesMixRow[];
  totals: SalesMixTotals;
  from: string;
  to: string;
  negocio?: string;
}) {
  const body = rows
    .map(
      (r) => `<tr>
      <td>${esc(r.code)}</td>
      <td>${esc(r.name)}</td>
      <td class="r">${num(r.units)}</td>
      <td class="r">${money(r.pvn)}</td>
      <td class="r">${money(r.net)}</td>
      <td class="r b">${pct(r.mixPct)}</td>
      <td class="r">${money(r.unitCost)}</td>
      <td class="r">${money(r.totalCost)}</td>
      <td class="r">${pct(r.costPct)}</td>
      <td class="r b">${money(r.contrib)}</td>
      <td class="r b">${pct(r.contribPct)}</td>
    </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><title>Mix de ventas</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  body { font-family: Arial, Helvetica, sans-serif; color:#000; background:#fff; margin:0; padding:16px; max-width:194mm; }
  h1 { font-size:16px; margin:0 0 2px; }
  p.sub { font-size:10px; color:#333; margin:0 0 10px; }
  table { width:100%; border-collapse:collapse; font-size:7.6px; table-layout:fixed; }
  th, td { border:none; border-bottom:1px solid #bbb; padding:2px 3px 2px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  col.c-cod { width:9%; } col.c-nom { width:22%; } col.c-num { width:7.6%; }
  td:nth-child(2) { white-space:normal; }
  thead th { border-top:1.5px solid #000; border-bottom:1.5px solid #000; text-align:left; font-weight:700; }
  td.r, th.r { text-align:right; font-variant-numeric: tabular-nums; }
  .b { font-weight:700; }
  tbody tr:last-child td { border-bottom:1.5px solid #000; }
  .tot-table { margin-top:8px; width:100%; border-collapse:collapse; font-size:7.6px; table-layout:fixed; border-top:1.5px solid #000; }
  .tot-table td { border:none; padding:3px 3px 3px 0; white-space:nowrap; font-size:10px; font-weight:700; }
  .tot-table td.tot-label { white-space:normal; }
  .tot-table td.r { text-align:right; font-variant-numeric: tabular-nums; }
  .tot-table tr:last-child td { border-bottom:1.5px solid #000; }
  .actions { margin-top:20px; display:flex; gap:10px; }
  .actions button { font-size:13px; padding:8px 16px; cursor:pointer; border:1px solid #333; background:#fff; border-radius:4px; }
  @media print { .actions { display:none; } body { padding:0; } }
</style></head><body>
  <h1>${esc(negocio ?? "Costea POS")} · Mix de ventas</h1>
  <p class="sub">Periodo ${esc(from)} a ${esc(to)} · Impreso ${new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</p>
  <table><colgroup>
    <col class="c-cod" /><col class="c-nom" /><col class="c-num" /><col class="c-num" /><col class="c-num" />
    <col class="c-num" /><col class="c-num" /><col class="c-num" /><col class="c-num" /><col class="c-num" /><col class="c-num" />
  </colgroup><thead><tr>
    <th>Código</th><th>Nombre receta</th><th class="r">Cant.</th><th class="r">P.V.N.</th>
    <th class="r">Total</th><th class="r b">Mix %</th><th class="r">Costo U$</th><th class="r">Costo T$</th>
    <th class="r">% Costo</th><th class="r b">Contrib$</th><th class="r b">% Contrib</th>
  </tr></thead><tbody>
    ${body || `<tr><td colspan="11">Sin ventas en el periodo.</td></tr>`}
  </tbody></table>

  <table class="tot-table"><colgroup>
    <col class="c-cod" /><col class="c-nom" /><col class="c-num" /><col class="c-num" /><col class="c-num" />
    <col class="c-num" /><col class="c-num" /><col class="c-num" /><col class="c-num" /><col class="c-num" /><col class="c-num" />
  </colgroup><tbody>
    <tr>
      <td colspan="2" class="tot-label">Venta Neta</td>
      <td colspan="3" class="r">${money(totals.net)}</td>
      <td colspan="2"></td>
      <td class="r">${money(totals.cost)}</td>
      <td class="r">${pct(totals.costPct)}</td>
      <td class="r">${money(totals.contrib)}</td>
      <td class="r">${pct(totals.contribPct)}</td>
    </tr>
    <tr><td colspan="2" class="tot-label">Iva 15%</td><td colspan="3" class="r">${money(totals.tax)}</td><td colspan="6"></td></tr>
    <tr><td colspan="2" class="tot-label">Venta Total</td><td colspan="3" class="r">${money(totals.gross)}</td><td colspan="6"></td></tr>
  </tbody></table>

  <div class="actions">
    <button onclick="window.print()">🖨️ Imprimir</button>
    <button onclick="window.close()">← Regresar</button>
  </div>
</body></html>`;

  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}

/** Vista de impresión del MIX DE MODIFICADORES: solo nombre y cantidad de veces pedido. */
export function printModifiersMix({
  rows,
  from,
  to,
  negocio,
}: {
  rows: ModifierRow[];
  from: string;
  to: string;
  negocio?: string;
}) {
  const total = rows.reduce((s, r) => s + r.units, 0);
  const body = rows
    .map((r) => `<tr><td>${esc(r.name)}</td><td class="r">${num(r.units)}</td></tr>`)
    .join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><title>Mix de modificadores</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; color:#000; background:#fff; margin:0; padding:16px; max-width:190mm; }
  h1 { font-size:16px; margin:0 0 2px; }
  p.sub { font-size:10px; color:#333; margin:0 0 10px; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th, td { border-bottom:1px solid #bbb; padding:3px 4px 3px 0; }
  thead th { border-top:1.5px solid #000; border-bottom:1.5px solid #000; text-align:left; }
  td.r, th.r { text-align:right; font-variant-numeric: tabular-nums; width:28%; }
  tfoot td { font-weight:700; border-top:1.5px solid #000; }
  .actions { margin-top:20px; display:flex; gap:10px; }
  .actions button { font-size:13px; padding:8px 16px; cursor:pointer; border:1px solid #333; background:#fff; border-radius:4px; }
  @media print { .actions { display:none; } body { padding:0; } }
</style></head><body>
  <h1>${esc(negocio ?? "Costea POS")} · Mix de modificadores</h1>
  <p class="sub">Periodo ${esc(from)} a ${esc(to)} · Impreso ${new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</p>
  <table>
    <thead><tr><th>Modificador</th><th class="r">Veces pedido</th></tr></thead>
    <tbody>${body || `<tr><td colspan="2">Sin modificadores en el periodo.</td></tr>`}</tbody>
    <tfoot><tr><td>Total</td><td class="r">${num(total)}</td></tr></tfoot>
  </table>
  <div class="actions">
    <button onclick="window.print()">🖨️ Imprimir</button>
    <button onclick="window.close()">← Regresar</button>
  </div>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=800");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}
