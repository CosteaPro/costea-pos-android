/**
 * Impresión de inventario:
 *  • Tirilla térmica 80mm del cierre / conteo físico (con firma del responsable).
 *  • Reporte completo en hoja A4 vertical (o guardar como PDF).
 *  • Listas en blanco para conteo diario y mensual.
 */
import { silentPrint } from "@/lib/silent-print";
import { sfOf, type PhysicalMap, type ReportRow } from "@/lib/inventory.movements";
import { printA4, printReportA4 } from "@/lib/report-print";

export { printA4 };

const money = (n: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n || 0);

const qty = (n: number) =>
  new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

const fecha = (d: string) => d.split("-").reverse().join("/");

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

/* ───────────────────────── 1. Tirilla térmica del conteo ───────────────────────── */

export type CountTicketLine = {
  code: string;
  name: string;
  unit: string;
  fisico: number;
};


export type CountTicketInfo = {
  negocio?: string;
  fecha: string;
  tipo: string;
  responsable?: string;
  notas?: string;
  printer?: string;
};

/** Ticket 80mm: solo lo registrado (producto y cantidad contada) + firma. */
export function printCountTicket(lines: CountTicketLine[], info: CountTicketInfo) {
  const body = lines
    .map(
      (l) => `<tr class="it">
        <td colspan="2">${esc(l.code)} · ${esc(l.name)}</td>
      </tr>
      <tr>
        <td>Cantidad contada</td>
        <td class="r">${qty(l.fisico)} ${esc(l.unit)}</td>
      </tr>`,
    )
    .join("");


  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>Cierre de inventario ${esc(info.fecha)}</title>
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
    .neg { font-weight:700; }
    .tot { font-size:12px; font-weight:700; display:flex; justify-content:space-between; }
    .firma { margin-top:26px; border-top:1px solid #000; text-align:center; font-size:11px; padding-top:2px; }
  </style></head><body>
    ${info.negocio ? `<p style="text-align:center">${esc(info.negocio)}</p>` : ""}
    <h1>CIERRE DE INVENTARIO</h1>
    <p>Fecha: ${esc(fecha(info.fecha))}</p>
    <p>Tipo de conteo: ${esc(info.tipo)}</p>
    ${info.responsable ? `<p>Responsable: ${esc(info.responsable)}</p>` : ""}
    <p>Impreso: ${new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</p>
    <hr />
    <table>${body}</table>
    <hr />
    <p>Ítems contados: ${lines.length}</p>
    ${info.notas ? `<hr /><p>Obs.: ${esc(info.notas)}</p>` : ""}
    <div class="firma">Firma del responsable</div>
  </body></html>`;

  return silentPrint(html, `Cierre de inventario ${info.fecha}`, info.printer);
}

/* ───────────────────── 2. Reporte completo en A4 vertical ───────────────────── */



/** Imprime / exporta a PDF el reporte de inventario completo en A4 vertical. */
export function printInventoryReportA4(
  rows: ReportRow[],
  kind: "costeado" | "items" | "combinado",
  from: string,
  to: string,
  negocio?: string,
  physical: PhysicalMap = {},
) {
  const showQty = kind !== "costeado";
  const showVal = kind !== "items";
  const titulo =
    kind === "costeado"
      ? "Inventario costeado"
      : kind === "items"
        ? "Inventario por ítems"
        : "Inventario combinado";

  const th = (label: string, show: boolean) => (show ? `<th class="r">${label}</th>` : "");
  const head = `<tr>
    <th>Código</th><th>Descripción</th><th>Categoría</th><th>Unidad Inv</th>
    ${th("Inventario Inicial", showQty)}${th("Inv $", showVal)}
    ${th("Compras", showQty)}${th("Costo Unit $", showVal)}${th("Comp $", showVal)}
    ${th("Bajas", showQty)}${th("Bajas $", showVal)}
    ${th("Lunch", showQty)}${th("Lunch $", showVal)}
    ${th("Transf. Positivas", showQty)}${th("Transf. Positivas $", showVal)}
    ${th("Transf. Negativas", showQty)}${th("Transf. Negativas $", showVal)}
    ${th("Ventas", showQty)}${th("Ventas $", showVal)}
    ${th("Inv. Teórico Sistema", showQty)}${th("Inv. Teórico $", showVal)}
    ${th("Inventario Físico", showQty)}${th("Inv. Físico $", showVal)}
    ${th("S/F (Cantidad)", showQty)}${th("S/F (Valor $)", showVal)}
  </tr>`;

  const tdq = (v: number | null, show: boolean) =>
    show ? `<td class="r">${v === null ? "" : qty(v)}</td>` : "";
  const tdv = (v: number | null, show: boolean) =>
    show ? `<td class="r">${v === null ? "" : money(v)}</td>` : "";

  const body = rows
    .map((r) => {
      const sf = sfOf(r, physical[r.item_id]);
      return `<tr${sf.hasDiff ? ' style="background:#fff4d6"' : ""}>
      <td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.category)}</td><td>${esc(r.unit)}</td>
      ${tdq(r.qtyInicial, showQty)}${tdv(r.valInicial, showVal)}
      ${tdq(r.qtyCompras, showQty)}${tdv(r.unitCost, showVal)}${tdv(r.valCompras, showVal)}
      ${tdq(r.qtyBajas, showQty)}${tdv(r.valBajas, showVal)}
      ${tdq(r.qtyLunch, showQty)}${tdv(r.valLunch, showVal)}
      ${tdq(r.qtyTransfPos, showQty)}${tdv(r.valTransfPos, showVal)}
      ${tdq(r.qtyTransfNeg, showQty)}${tdv(r.valTransfNeg, showVal)}
      ${tdq(r.qtyVentas, showQty)}${tdv(r.valVentas, showVal)}
      ${tdq(r.qtyFinal, showQty)}${tdv(r.valFinal, showVal)}
      ${tdq(sf.fisicoQty, showQty)}${tdv(sf.fisicoVal, showVal)}
      ${tdq(sf.sfQty, showQty)}${tdv(sf.sfVal, showVal)}
    </tr>`;
    })
    .join("");

  return printReportA4({
    titulo,
    negocio,
    periodo: `${fecha(from)} al ${fecha(to)}`,
    cuerpo: `<table><thead>${head}</thead><tbody>${body}</tbody></table>`,
    nota: "Valoración al costo de la última compra.",
    fontSize: kind === "combinado" ? "5.4px" : "6.6px",
  });
}


/* ─────────────────── 3. Listas en blanco para conteo físico ─────────────────── */

export type BlankItem = { code: string | null; name: string; unit: string; category?: string | null };

/**
 * Lista para conteo físico (A4): solo código, descripción, unidad y un espacio
 * en blanco para anotar a mano la cantidad contada. Sin datos del sistema.
 */
export function printBlankCountList(
  items: BlankItem[],
  periodo: "diario" | "mensual",
  negocio?: string,
) {
  const body = items
    .map(
      (i) => `<tr>
      <td>${esc(i.code ?? "")}</td><td>${esc(i.name)}</td><td>${esc(i.unit)}</td>
      <td style="width:130px"></td>
    </tr>`,
    )
    .join("");

  return printReportA4({
    titulo: `Lista para conteo físico ${periodo === "mensual" ? "mensual" : "diario"}`,
    negocio,
    periodo: "Fecha: ______________ · Responsable: ____________________ · Área: ____________",
    cuerpo: `<table><thead><tr>
      <th>Código</th><th>Descripción</th><th>Unidad</th><th class="r">Cantidad contada</th>
    </tr></thead><tbody>${body}</tbody></table>`,
    fontSize: "10px",
    firmas: ["Firma del responsable", "Revisado por"],
  });
}

/* ─────────── 4. Lista para conteo físico en tirilla 80mm (caja POS) ─────────── */

export type BlankTicketItem = { code: string | null; name: string; unit: string };

/** Tirilla 80mm con código, descripción, unidad y línea en blanco para anotar. */
export function printBlankCountTicket(
  items: BlankTicketItem[],
  info: { negocio?: string; fecha: string; tipo: string; printer?: string },
) {
  const body = items
    .map(
      (i) => `<tr class="it"><td colspan="2">${esc(i.code ?? "")} · ${esc(i.name)}</td></tr>
      <tr><td>Cantidad (${esc(i.unit)})</td><td class="r linea">&nbsp;</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>Lista para conteo físico ${esc(info.fecha)}</title>
  <style>
    @page { size: 80mm auto; margin: 5mm; }
    body { font-family: "Barlow", Arial, sans-serif; color:#000; background:#fff; width:72mm; }
    h1 { font-size:13px; text-align:center; margin:0 0 2px; letter-spacing:1px; }
    p { margin:1px 0; font-size:11px; }
    hr { border:none; border-top:1px dashed #000; margin:5px 0; }
    table { width:100%; border-collapse:collapse; font-size:11px; }
    td { padding:1px 0; vertical-align:bottom; }
    td.r { text-align:right; width:38%; }
    td.linea { border-bottom:1px solid #000; }
    tr.it td { font-weight:700; padding-top:4px; border-top:1px dotted #999; }
    .firma { margin-top:26px; border-top:1px solid #000; text-align:center; font-size:11px; padding-top:2px; }
  </style></head><body>
    ${info.negocio ? `<p style="text-align:center">${esc(info.negocio)}</p>` : ""}
    <h1>LISTA PARA CONTEO FÍSICO</h1>
    <p>Fecha: ${esc(fecha(info.fecha))}</p>
    <p>Tipo de conteo: ${esc(info.tipo)}</p>
    <p>Responsable: ______________________</p>
    <hr />
    <table>${body}</table>
    <hr />
    <p>Ítems a contar: ${items.length}</p>
    <div class="firma">Firma del responsable</div>
  </body></html>`;

  return silentPrint(html, `Lista para conteo ${info.fecha}`, info.printer);
}
