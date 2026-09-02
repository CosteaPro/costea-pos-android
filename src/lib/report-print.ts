/**
 * Formato único de impresión de reportes: A4 VERTICAL, hoja blanca limpia.
 * Encabezado (reporte + local + período + fecha de impresión) → tabla → pie de firmas.
 * Todo el contenido se ajusta al ancho de la hoja: no se cortan columnas ni datos.
 */
/** Imprime un documento A4 (o PDF) mediante un marco oculto del navegador. */
export function printA4(html: string, jobName = "Costea POS") {
  if (typeof document === "undefined") return false;
  const frame = document.createElement("iframe");
  frame.title = jobName;
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      setTimeout(() => frame.remove(), 2000);
    }
  };
  if (doc.readyState === "complete") setTimeout(run, 120);
  else frame.onload = () => setTimeout(run, 120);
  return true;
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

export const impresoEC = () =>
  new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" });

export type ReportDocOptions = {
  /** Nombre del reporte, p. ej. "Estado de pérdidas y ganancias". */
  titulo: string;
  /** Nombre del local. */
  negocio?: string;
  /** Período cubierto, p. ej. "Agosto 2026" o "01/08/2026 al 09/08/2026". */
  periodo?: string;
  /** Contenido central (tabla u otro bloque ya formateado). */
  cuerpo: string;
  /** Nota u observaciones del pie (opcional). */
  nota?: string;
  /** Firmas del pie. Vacío para ocultarlas. */
  firmas?: string[];
  /** Tamaño base de la tabla; útil cuando hay muchas columnas. */
  fontSize?: string;
  /** Columnas ajustadas al contenido (tabla compacta y centrada). */
  compacto?: boolean;
};

/** Documento HTML estándar A4 vertical listo para imprimir. */
export function reportDocA4({
  titulo,
  negocio,
  periodo,
  cuerpo,
  nota,
  firmas = ["Elaborado por", "Revisado por", "Administrador"],
  fontSize = "9px",
  compacto = false,
}: ReportDocOptions) {
  const firmasHtml = firmas.length
    ? `<div class="firmas">${firmas.map((f) => `<span>${esc(f)}</span>`).join("")}</div>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
<title>${esc(titulo)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { background:#fff; color:#000; margin:0; padding:0; }
  body { font-family: Arial, Helvetica, sans-serif; width:190mm; max-width:190mm; }
  header { border-bottom:1.5px solid #000; padding-bottom:8px; margin-bottom:12px; text-align:center; }
  h1 { font-size:20px; letter-spacing:.3px; margin:0 0 4px; text-transform:uppercase; }
  h2 { font-size:13px; font-weight:600; margin:0 0 2px; color:#222; }
  p.sub { font-size:10px; color:#333; margin:0; }
  table { ${
    compacto
      ? "width:auto; max-width:100%; margin:0 auto; table-layout:auto;"
      : "width:100%; max-width:100%; table-layout:fixed;"
  } border-collapse:collapse; font-size:${fontSize}; }
  th, td { border:1px solid #999; padding:2px 3px; overflow-wrap:anywhere; word-break:break-word; }
  th { background:#eee; text-align:left; font-weight:700; }
  td.r, th.r { text-align:right; font-variant-numeric: tabular-nums; }
  tfoot td, tfoot th { font-weight:700; background:#f2f2f2; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .nota { margin-top:10px; font-size:10px; color:#222; }
  .firmas { margin-top:34mm; display:flex; gap:24px; font-size:10px; page-break-inside:avoid; }
  .firmas span { flex:1; border-top:1px solid #000; padding-top:4px; text-align:center; }

</style></head><body>
  <header>
    <h1>${esc(titulo)}</h1>
    <h2>${esc(negocio ?? "Costea POS")}</h2>
    <p class="sub">${periodo ? `Período: ${esc(periodo)} · ` : ""}Impreso: ${esc(impresoEC())}</p>
  </header>
  ${cuerpo}
  ${nota ? `<p class="nota">Observaciones: ${esc(nota)}</p>` : ""}
  ${firmasHtml}
</body></html>`;
}

/** Imprime el reporte con el formato estándar A4 vertical. */
export function printReportA4(options: ReportDocOptions) {
  return printA4(reportDocA4(options), options.titulo);
}
