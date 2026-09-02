/**
 * Vistas de impresión de recetas de platos:
 *  • Listado resumido (código, precio neto, costo, % costo, contribución, % contribución).
 *  • Recetas completas con el detalle de ingredientes.
 * Ambas se abren en una pantalla blanca con los botones Imprimir y Regresar.
 */

const money = (n: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n || 0);

const pct = (n: number) =>
  `${new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)} %`;


const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

export type RecipePrintRow = {
  code: string;
  name: string;
  net: number;
  cost: number;
  date: string;
  lines?: { code?: string; name: string; quantity: number; unit: string; subtotal: number }[];
};

const shell = (title: string, negocio: string | undefined, inner: string) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; color:#000; background:#fff; margin:0; padding:24px; }
  h1 { font-size:18px; margin:0 0 2px; }
  p.sub { font-size:11px; color:#333; margin:0 0 14px; }
  table { width:100%; border-collapse:collapse; font-size:11px; table-layout:fixed; }
  th, td { border:1px solid #999; padding:4px 6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  th { background:#f0f0f0; text-align:left; }
  td.r, th.r { text-align:right; font-variant-numeric: tabular-nums; font-feature-settings:"tnum"; }
  td.c, th.c { text-align:center; }
  .card { border:1px solid #000; margin:0 0 14px; page-break-inside:avoid; }
  .card h2 { font-size:13px; margin:0; padding:6px 8px; border-bottom:1px solid #000; }
  .head { display:flex; flex-wrap:wrap; font-size:11px; padding:6px 8px; border-bottom:1px solid #000; }
  .head span { width:25%; font-variant-numeric: tabular-nums; }
  .ing { padding:6px 8px; }
  .ing h3 { font-size:11px; margin:0 0 4px; letter-spacing:1px; }
  .tot td { font-weight:700; background:#f5f5f5; }
  .actions { margin-top:20px; display:flex; gap:10px; }
  .actions button { font-size:13px; padding:8px 16px; cursor:pointer; border:1px solid #333; background:#fff; border-radius:4px; }
  @media print { .actions { display:none; } body { padding:0; } }
</style></head><body>
  <h1>${esc(negocio ?? "Costea POS")} · ${esc(title)}</h1>
  <p class="sub">Impreso ${new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</p>
  ${inner}
  <div class="actions">
    <button onclick="window.print()">🖨️ Imprimir</button>
    <button onclick="window.close()">← Regresar</button>
  </div>
</body></html>`;

function openWindow(html: string) {
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}

const contrib = (r: RecipePrintRow) => r.net - r.cost;
const contribPct = (r: RecipePrintRow) => (r.net > 0 ? (contrib(r) / r.net) * 100 : 0);
const costPct = (r: RecipePrintRow) => (r.net > 0 ? (r.cost / r.net) * 100 : 0);

/** Listado resumido de todas las recetas de platos. */
export function printRecipeList(rows: RecipePrintRow[], negocio?: string) {
  const body = rows
    .map(
      (r) => `<tr>
      <td>${esc(r.code)}</td><td>${esc(r.name)}</td>
      <td class="r">${money(r.net)}</td>
      <td class="r">${money(r.cost)}</td>
      <td class="r">${pct(costPct(r))}</td>
      <td class="r">${money(contrib(r))}</td>
      <td class="r">${pct(contribPct(r))}</td>
      <td>${esc(r.date)}</td>
    </tr>`,
    )
    .join("");

  const inner = `<table><thead><tr>
      <th>Código</th><th>Plato</th><th class="r">Precio neto</th><th class="r">Costo total</th>
      <th class="r">% costo</th><th class="r">Contribución</th><th class="r">% contribución</th><th>Fecha</th>
    </tr></thead><tbody>${body || `<tr><td colspan="8">Sin recetas registradas.</td></tr>`}</tbody></table>`;

  return openWindow(shell("Listado de recetas", negocio, inner));
}

/** Cantidad con exactamente 2 decimales para alinear por el punto decimal. */
const qty2 = (n: number) =>
  new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    n || 0,
  );

/** Recetas completas con el detalle de ingredientes (columnas de ancho fijo). */
export function printRecipesFull(rows: RecipePrintRow[], negocio?: string) {
  const cols = `<colgroup>
    <col style="width:70px" /><col /><col style="width:90px" />
    <col style="width:70px" /><col style="width:90px" />
  </colgroup>`;

  const cards = rows
    .map((r) => {
      const lines = (r.lines ?? [])
        .map(
          (l) => `<tr>
            <td>${esc(l.code ?? "")}</td>
            <td>${esc(l.name)}</td>
            <td class="r">${qty2(l.quantity)}</td>
            <td class="c">${esc(l.unit)}</td>
            <td class="r">${money(l.subtotal)}</td>
          </tr>`,
        )
        .join("");
      return `<div class="card">
        <h2>Código: ${esc(r.code)} — Plato: ${esc(r.name)}</h2>
        <div class="head">
          <span>Precio neto: <strong>${money(r.net)}</strong></span>
          <span>Costo total: <strong>${money(r.cost)}</strong></span>
          <span>% costo: <strong>${pct(costPct(r))}</strong></span>
          <span>Contribución: <strong>${money(contrib(r))}</strong></span>
          <span>% contribución: <strong>${pct(contribPct(r))}</strong></span>
        </div>
        <div class="ing">
          <h3>INGREDIENTES</h3>
          <table>${cols}
            <thead><tr>
              <th>Código</th><th>Ingrediente</th><th class="r">Cantidad</th>
              <th class="c">Unidad</th><th class="r">Costo $</th>
            </tr></thead>
            <tbody>
            ${lines || `<tr><td colspan="5">Sin ingredientes registrados.</td></tr>`}
            <tr class="tot"><td colspan="4">COSTO TOTAL</td><td class="r">${money(r.cost)}</td></tr>
          </tbody></table>
        </div>
      </div>`;
    })
    .join("");

  return openWindow(shell("Recetas completas", negocio, cards || "<p>Sin recetas registradas.</p>"));
}
