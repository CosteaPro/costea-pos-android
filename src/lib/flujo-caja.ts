/**
 * Flujo de caja diario.
 *
 * Automático (no editable):
 *   • Ventas cobradas del día por forma de pago (efectivo, tarjeta, transferencia)
 *   • Compras de inventario / pagos a proveedores (módulo de compras)
 *   • Gastos generales y Nómina / sueldos (módulo de gastos)
 *
 * Manual (editable):
 *   • Otros ingresos y Otros egresos (tabla cash_flow_manual)
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/utils";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import { ecBusinessDate } from "@/lib/caja";

export type DayFlow = {
  fecha: string;
  saldoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransferencia: number;
  cobrosCredito: number;
  otrosIngresos: number;
  totalEntradas: number;
  compras: number;
  gastosGenerales: number;
  nomina: number;
  otrosEgresos: number;
  totalSalidas: number;
  flujoNeto: number;
  saldoFinal: number;
};

export type ManualFlow = { otrosIngresos: number; otrosEgresos: number };

const r2 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** ¿El rubro del gasto corresponde a nómina / sueldos? */
export const esNomina = (label: string, section: string) => {
  const s = `${norm(label)} ${norm(section)}`;
  return /nomina|sueldo|salario|rol de pago|personal|mano de obra/.test(s);
};

/** Lista de días (AAAA-MM-DD) entre dos fechas, inclusive. */
export function rangoDias(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function loadManualFlow(from: string, to: string) {
  const { data, error } = await supabase
    .from("cash_flow_manual")
    .select("business_date, other_income, other_expense")
    .gte("business_date", from)
    .lte("business_date", to);
  if (error) throw new Error(error.message);
  const map: Record<string, ManualFlow> = {};
  for (const r of data ?? []) {
    map[r.business_date] = {
      otrosIngresos: Number(r.other_income) || 0,
      otrosEgresos: Number(r.other_expense) || 0,
    };
  }
  return map;
}

export async function saveManualFlow(fecha: string, valores: ManualFlow) {
  const { error } = await supabase.from("cash_flow_manual").upsert(
    {
      business_date: fecha,
      other_income: r2(valores.otrosIngresos),
      other_expense: r2(valores.otrosEgresos),
    },
    // Una fila por empresa, sucursal y fecha.
    { onConflict: "company_id,branch_id,business_date" },
  );
  if (error) throw new Error(error.message);
}

type Acc = {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  compras: number;
  gastos: number;
  nomina: number;
  cobros: number;
};

const emptyAcc = (): Acc => ({
  efectivo: 0,
  tarjeta: 0,
  transferencia: 0,
  compras: 0,
  gastos: 0,
  nomina: 0,
  cobros: 0,
});

/** Construye el flujo de caja día por día del período. */
export async function loadCashFlow(
  from: string,
  to: string,
  saldoInicialPeriodo = 0,
): Promise<DayFlow[]> {
  const acc: Record<string, Acc> = {};
  const get = (f: string) => (acc[f] ??= emptyAcc());

  const [ventas, cobros, compras, gastos, manual] = await Promise.all([
    fetchAllRows<{ created_at: string; total: number | null; payment_method: string | null }>((a, b) =>
      supabase
        .from("orders")
        .select("created_at, total, payment_method")
        .gte("created_at", desdeEc(from))
        .lte("created_at", hastaEc(to))
        .eq("status", "pagado")
        .neq("doc_status", "anulado")
        .range(a, b),
    ),
    // Cobros de ventas a crédito (incluye Transferencia Crédito): entran el día
    // en que el dinero se recibe realmente, no el día de la venta.
    fetchAllRows<{
      credit_paid_at: string | null;
      total: number | null;
      payment_method: string | null;
      credit_status: string | null;
    }>((a, b) =>
      supabase
        .from("orders")
        .select("credit_paid_at, total, payment_method, credit_status")
        .in("payment_method", ["credito", "transferencia_credito"])
        .eq("credit_status", "cobrado")
        .not("credit_paid_at", "is", null)
        .gte("credit_paid_at", desdeEc(from))
        .lte("credit_paid_at", hastaEc(to))
        .neq("doc_status", "anulado")
        .range(a, b),
    ),
    fetchAllRows<{ purchased_at: string; total: number | null }>((a, b) =>
      supabase
        .from("purchases")
        .select("purchased_at, total")
        .gte("purchased_at", desdeEc(from))
        .lte("purchased_at", hastaEc(to))
        .range(a, b),
    ),
    fetchAllRows<{ expense_date: string; amount: number | null; label: string; section: string }>(
      (a, b) =>
        supabase
          .from("pl_expenses")
          .select("expense_date, amount, label, section")
          .gte("expense_date", from)
          .lte("expense_date", to)
          .range(a, b),
    ),
    loadManualFlow(from, to),
  ]);

  for (const o of ventas) {

    const t = get(ecBusinessDate(new Date(o.created_at)));
    const monto = Number(o.total) || 0;
    if (o.payment_method === "efectivo") t.efectivo += monto;
    else if (o.payment_method === "tarjeta") t.tarjeta += monto;
    else if (o.payment_method === "transferencia") t.transferencia += monto;
  }

  for (const c of cobros) {
    get(ecBusinessDate(new Date(c.credit_paid_at as string))).cobros += Number(c.total) || 0;
  }

  for (const c of compras) {
    get(ecBusinessDate(new Date(c.purchased_at))).compras += Number(c.total) || 0;
  }

  for (const g of gastos) {
    const t = get(String(g.expense_date).slice(0, 10));
    const monto = Number(g.amount) || 0;
    if (esNomina(String(g.label ?? ""), String(g.section ?? ""))) t.nomina += monto;
    else t.gastos += monto;
  }

  let saldo = saldoInicialPeriodo;
  return rangoDias(from, to).map((fecha) => {
    const a = acc[fecha] ?? emptyAcc();
    const m = manual[fecha] ?? { otrosIngresos: 0, otrosEgresos: 0 };
    // Transferencia Crédito NO entra aquí: solo se registra como cuenta por cobrar.
    const totalEntradas = r2(a.efectivo + a.tarjeta + a.transferencia + a.cobros + m.otrosIngresos);
    const totalSalidas = r2(a.compras + a.gastos + a.nomina + m.otrosEgresos);
    const flujoNeto = r2(totalEntradas - totalSalidas);
    const saldoInicial = r2(saldo);
    const saldoFinal = r2(saldoInicial + flujoNeto);
    saldo = saldoFinal;
    return {
      fecha,
      saldoInicial,
      ventasEfectivo: r2(a.efectivo),
      ventasTarjeta: r2(a.tarjeta),
      ventasTransferencia: r2(a.transferencia),
      cobrosCredito: r2(a.cobros),
      otrosIngresos: r2(m.otrosIngresos),
      totalEntradas,
      compras: r2(a.compras),
      gastosGenerales: r2(a.gastos),
      nomina: r2(a.nomina),
      otrosEgresos: r2(m.otrosEgresos),
      totalSalidas,
      flujoNeto,
      saldoFinal,
    };
  });
}
