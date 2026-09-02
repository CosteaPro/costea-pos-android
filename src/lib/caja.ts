/** Cierre y cuadre de caja (Ecuador, USD, zona horaria America/Guayaquil). */
import { currency, splitTax } from "@/lib/pos";
import { silentPrint } from "@/lib/silent-print";

export const TZ = "America/Guayaquil";

export const SHIFTS = [
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" },
  { value: "nocturno", label: "Nocturno" },
  { value: "completo", label: "Día completo" },
] as const;

export const shiftLabel = (v: string) => SHIFTS.find((s) => s.value === v)?.label ?? v;

export const ecDateTime = (d: Date | string) =>
  new Intl.DateTimeFormat("es-EC", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(typeof d === "string" ? new Date(d) : d);

export const ecDate = (d: Date | string) =>
  new Intl.DateTimeFormat("es-EC", { timeZone: TZ, dateStyle: "medium" }).format(
    typeof d === "string" ? new Date(d) : d,
  );

/** Fecha contable (YYYY-MM-DD) en hora de Ecuador. */
export const ecBusinessDate = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

export type PaidOrder = {
  id: string;
  status: string;
  payment_method: string | null;
  total: number;
  subtotal: number;
  tax_amount: number;
  iva_rate: number;
  paid_at: string | null;
  created_at: string;
  doc_status?: string | null;
  doc_number?: string | null;
  folio?: number | null;
  voided_at?: string | null;
};

/** Periodo del cierre (ISO con offset -05:00) para contar solo lo anulado HOY. */
export type Periodo = { start: string; end: string };

/** Comprobante dado de baja: no suma en ventas, pero se lista en el cierre. */
export type VoidedDoc = { numero: string; total: number };

export type CashTotals = {
  cash: number;
  card: number;
  transfer: number;
  voucher: number;
  other: number;
  tickets: number;
  voidedCount: number;
  voidedTotal: number;
  voided: VoidedDoc[];
  subtotal: number;
  tax: number;
  total: number;
};

/**
 * Agrupa las ventas cobradas por forma de pago y calcula anulaciones.
 * Si se pasa `periodo`, solo se cuentan como anuladas las que se dieron de baja
 * DENTRO de ese periodo (el cierre de caja es solo del día actual).
 */
export function computeTotals(orders: PaidOrder[], ivaRate: number, periodo?: Periodo): CashTotals {
  const t: CashTotals = {
    cash: 0,
    card: 0,
    transfer: 0,
    voucher: 0,
    other: 0,
    tickets: 0,
    voidedCount: 0,
    voidedTotal: 0,
    voided: [],
    subtotal: 0,
    tax: 0,
    total: 0,
  };

  const desde = periodo ? new Date(periodo.start).getTime() : null;
  const hasta = periodo ? new Date(periodo.end).getTime() : null;
  const anuladaHoy = (o: PaidOrder) => {
    if (desde == null || hasta == null) return true;
    const ts = new Date(o.voided_at ?? o.created_at).getTime();
    return Number.isFinite(ts) && ts >= desde && ts <= hasta;
  };
  const enPeriodo = (iso?: string | null) => {
    if (desde == null || hasta == null || !iso) return true;
    const ts = new Date(iso).getTime();
    return Number.isFinite(ts) && ts >= desde && ts <= hasta;
  };

  for (const o of orders) {
    // Anulado / dado de baja o cancelado: nunca suma a las ventas.
    if (o.status === "cancelado" || o.doc_status === "anulado") {
      if (!anuladaHoy(o)) continue;
      t.voidedCount += 1;
      t.voidedTotal += Number(o.total) || 0;
      t.voided.push({
        numero: o.doc_number ?? (o.folio != null ? `NV-${String(o.folio).padStart(8, "0")}` : "—"),
        total: Number(o.total) || 0,
      });
      continue;
    }

    if (!enPeriodo(o.created_at)) continue;


    if (o.status !== "pagado") continue;
    const amount = Number(o.total) || 0;
    t.tickets += 1;
    t.total += amount;
    const tax = Number(o.tax_amount) || 0;
    const base = Number(o.subtotal) || 0;
    if (tax > 0 || base > 0) {
      t.tax += tax;
      t.subtotal += base;
    } else {
      const s = splitTax(amount, Number(o.iva_rate) || ivaRate);
      t.subtotal += s.base;
      t.tax += s.tax;
    }
    switch (o.payment_method) {
      case "efectivo":
        t.cash += amount;
        break;
      case "tarjeta":
        t.card += amount;
        break;
      case "transferencia":
        t.transfer += amount;
        break;
      case "credito":
      case "transferencia_credito":
        t.voucher += amount;
        break;
      default:
        t.other += amount;
    }
  }

  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    ...t,
    cash: r(t.cash),
    card: r(t.card),
    transfer: r(t.transfer),
    voucher: r(t.voucher),
    other: r(t.other),
    voidedTotal: r(t.voidedTotal),
    subtotal: r(t.subtotal),
    tax: r(t.tax),
    total: r(t.total),
  };
}

export type ClosureTicket = {
  negocio: string;
  ruc?: string;
  usuario: string;
  turno: string;
  fecha: string;
  desde: string;
  hasta: string;
  fondo: number;
  sistema: { efectivo: number; tarjeta: number; transferencia: number; vales: number; otros: number };
  contado: { efectivo: number; tarjeta: number; transferencia: number; vales: number; otros: number };
  tickets: number;
  anulados: number;
  anuladoTotal: number;
  anuladas?: VoidedDoc[];

  subtotal: number;
  ivaRate: number;
  iva: number;
  total: number;
  esperado: number;
  contadoTotal: number;
  diferencia: number;
  observaciones?: string | null;
  impresora?: string;
};

const row = (label: string, value: string) =>
  `<tr><td>${label}</td><td class="r">${value}</td></tr>`;

export function closureTicketHtml(t: ClosureTicket) {
  const diffLabel = t.diferencia === 0 ? "CUADRADO" : t.diferencia > 0 ? "SOBRANTE" : "FALTANTE";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
  <title>Cierre de caja ${t.fecha}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    body { font-family: "Barlow", Arial, sans-serif; color:#000; background:#fff; }
    .ticket { width: 72mm; }
    h1 { font-size: 15px; margin: 0 0 2px; text-align:center; letter-spacing:1px; }
    h2 { font-size: 12px; margin: 8px 0 2px; text-transform: uppercase; }
    p { margin: 1px 0; font-size: 11px; }
    table { width:100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 1px 0; }
    td.r { text-align: right; }
    hr { border:none; border-top:1px dashed #000; margin:5px 0; }
    .tot { font-weight:700; font-size: 13px; }
  </style></head><body>
  <section class="ticket">
    <h1>${t.negocio}</h1>
    ${t.ruc ? `<p style="text-align:center">RUC: ${t.ruc}</p>` : ""}
    <h1>CIERRE Y CUADRE DE CAJA</h1>
    <p>Fecha: ${t.fecha}</p>
    <p>Turno: ${t.turno}</p>
    <p>Usuario: ${t.usuario}</p>
    <p>Periodo: ${t.desde} — ${t.hasta}</p>
    <hr />
    <h2>Ventas por forma de pago</h2>
    <table>
      ${row("Efectivo", currency(t.sistema.efectivo))}
      ${row("Tarjetas", currency(t.sistema.tarjeta))}
      ${row("Transferencias", currency(t.sistema.transferencia))}
      ${row("Recibos / Vales", currency(t.sistema.vales))}
      ${row("Otros", currency(t.sistema.otros))}
    </table>
    <hr />
    <table>
      ${row("Tickets emitidos", String(t.tickets))}
      ${row("Tickets anulados", String(t.anulados))}
      ${row("Valor total anulado", currency(t.anuladoTotal))}
    </table>
    <hr />
    <table>
      ${row("Subtotal ventas", currency(t.subtotal))}
      ${row(`IVA ${t.ivaRate}%`, currency(t.iva))}
      ${row("TOTAL GENERAL", `<b>${currency(t.total)}</b>`)}
    </table>
    <hr />
    <h2>Cuadre</h2>
    <table>
      ${row("Fondo de caja inicial", currency(t.fondo))}
      ${row("Total esperado sistema", currency(t.esperado))}
      ${row("Efectivo contado", currency(t.contado.efectivo))}
      ${row("Tarjetas contadas", currency(t.contado.tarjeta))}
      ${row("Transferencias", currency(t.contado.transferencia))}
      ${row("Vales / recibos", currency(t.contado.vales))}
      ${row("Otros", currency(t.contado.otros))}
      ${row("Total contado", currency(t.contadoTotal))}
      <tr class="tot"><td>${diffLabel}</td><td class="r">${currency(Math.abs(t.diferencia))}</td></tr>
    </table>
    ${
      (t.anuladas?.length ?? 0) > 0
        ? `<hr /><h2>Facturas anuladas / dadas de baja</h2>
    <table>
      ${(t.anuladas ?? []).map((a) => row(a.numero, currency(a.total))).join("")}
      <tr class="tot"><td>TOTAL ANULADO</td><td class="r">${currency(
        (t.anuladas ?? []).reduce((s, a) => s + a.total, 0),
      )}</td></tr>
    </table>`
        : ""
    }

    ${t.observaciones ? `<hr /><p><b>Observaciones:</b> ${t.observaciones}</p>` : ""}
    <hr />
    <p>_______________________________</p>
    <p>Firma responsable de caja</p>
    <p style="text-align:center">Costea POS · ${ecDateTime(new Date())}</p>
  </section>
  </body></html>`;
}

/** Envía el ticket de cierre directo a la impresora de cobro, sin diálogo del navegador. */
export function printClosure(t: ClosureTicket) {
  return silentPrint(closureTicketHtml(t), `Cierre de caja ${t.fecha}`, t.impresora);
}
