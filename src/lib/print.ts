/** Impresión de comandas por área (Cocina General / Parrilla). */
import type { PrintArea } from "@/lib/pos";
import { silentPrint } from "@/lib/silent-print";

/** Opción impresa bajo su plato: modificador (sin costo) o agregador (con precio). */
export type ComandaOption = {
  name: string;
  qty: number;
  kind: "modificador" | "agregador";
  price: number;
};

export type ComandaLine = {
  name: string;
  qty: number;
  notes?: string | null;
  print_area: PrintArea;
  options?: ComandaOption[];
};

export type ComandaInfo = {
  negocio?: string;
  orden: string;
  mesa: string;
  canal?: string;
  mesero?: string;
  notas?: string | null;
  printerKitchen?: string;
  printerGrill?: string;
};

const AREA_TITLE: Record<"cocina" | "parrilla", string> = {
  cocina: "COCINA GENERAL",
  parrilla: "PARRILLA",
};

function areaLines(lines: ComandaLine[], area: "cocina" | "parrilla") {
  return lines.filter((l) => l.print_area === area || l.print_area === "ambas");
}

function ticketHtml(area: "cocina" | "parrilla", lines: ComandaLine[], info: ComandaInfo) {
  return `
  <section class="ticket">
    ${info.negocio ? `<p class="small">${info.negocio}</p>` : ""}
    <h1>${AREA_TITLE[area]}</h1>
    <p class="big">ORDEN ${info.orden}</p>
    <p class="big">MESA: ${info.mesa}</p>
    <p class="small">${new Date().toLocaleString("es-EC")}${info.canal ? ` · ${info.canal}` : ""}</p>
    <hr />
    <table>
      ${lines
        .map(
          (l) => `<tr><td class="qty">${l.qty}</td><td><b>${l.name}</b>${(l.options ?? [])
            .map(
              (o) =>
                `<div class="opt ${o.kind}">${o.kind === "agregador" ? "➕" : "•"} ${
                  o.qty > 1 ? `${o.qty}× ` : ""
                }${o.name}${o.kind === "agregador" ? ` — $${(o.price * (o.qty || 1)).toFixed(2)}` : ""}</div>`,
            )
            .join("")}${l.notes ? `<div class="note">📝 ${l.notes}</div>` : ""}</td></tr>`,
        )
        .join("")}
    </table>
    ${info.notas ? `<hr /><p class="note">Nota: ${info.notas}</p>` : ""}
  </section>`;
}

function docHtml(orden: string, body: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>Comanda ${orden}</title>
  <style>
    @page { size: 80mm auto; margin: 0 4mm; }
    body { font-family: "Barlow", Arial, sans-serif; color: #000; background: #fff; }
    .ticket { width: 66mm; max-width: 66mm; page-break-after: always; }
    .ticket:last-child { page-break-after: auto; }
    h1 { font-size: 16px; margin: 0 0 4px; text-align: center; letter-spacing: 1px; }
    p { margin: 2px 0; }
    .big { font-size: 15px; font-weight: 700; }
    .small { font-size: 11px; }
    hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 66mm; max-width: 66mm; table-layout: fixed; border-collapse: collapse; font-size: 14px; }
    td { padding: 3px 0; vertical-align: top; }
    td.qty { width: 26px; font-weight: 700; }
    .note { font-size: 11px; font-style: italic; }
    .opt { font-size: 12px; padding-left: 8px; }
    .opt.agregador { font-weight: 700; }
  </style></head><body>
  ${body}
  </body></html>`;
}

/** Envía cada comanda directo a la impresora de su área, sin diálogo del navegador. */
export function printComanda(lines: ComandaLine[], info: ComandaInfo) {
  const areas: ("cocina" | "parrilla")[] = (["cocina", "parrilla"] as const).filter(
    (a) => areaLines(lines, a).length > 0,
  );
  if (areas.length === 0) return false;

  const printerFor = (a: "cocina" | "parrilla") =>
    a === "cocina" ? info.printerKitchen : info.printerGrill;

  // Con puente de impresión local cada área sale por su propia impresora.
  let ok = true;
  for (const a of areas) {
    const sent = silentPrint(
      docHtml(info.orden, ticketHtml(a, areaLines(lines, a), info)),
      `Comanda ${info.orden} · ${AREA_TITLE[a]}`,
      printerFor(a) || undefined,
    );
    ok = ok && sent;
  }
  return ok;
}
