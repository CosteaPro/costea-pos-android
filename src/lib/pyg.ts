/**
 * Estado de Pérdidas y Ganancias (mensual) + catálogo de Gastos generales.
 *
 * Automático:
 *   • Ventas brutas = facturas + notas de venta cobradas (sin anuladas)
 *   • IVA           = impuesto de esas ventas
 *   • Ventas netas  = brutas − IVA
 *   • Costo de producción = consumo de inventario del mes, por categoría
 *
 * Manual (pantalla "Gastos generales"):
 *   • Pestaña 1: GRUPOS (pl_groups) y RUBROS (pl_line_items), 100% editables.
 *   • Pestaña 2: GASTOS (pl_expenses) con fecha, rubro, factura, proveedor,
 *     base imponible, IVA automático y total.
 * El P&G SOLO LEE estos datos.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/utils";
import type { Db } from "@/lib/db";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import {
  consumoOf,
  loadInventoryReport,
  loadPhysicalCounts,
} from "@/lib/inventory.movements";

/** Tasa de IVA por defecto en Ecuador. */
export const IVA_RATE = 15;

export type GroupKind = "fijo" | "porcentual";

export type Group = {
  id: string;
  key: string;
  label: string;
  kind: GroupKind;
  sort_order: number;
};

export type LineItem = {
  id: string;
  section: string;
  line_key: string;
  label: string;
  sort_order: number;
};

const r2 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const slug = (s: string) =>
  norm(s)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28) || "rubro";

/** Primer y último día del mes (AAAA-MM-DD). */
export function monthRange(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

/* ------------------------------------------------------------------ */
/* Grupos (editables por el usuario)                                   */
/* ------------------------------------------------------------------ */

export async function loadGroups(): Promise<Group[]> {
  const { data, error } = await supabase
    .from("pl_groups")
    .select("id, key, label, kind, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Group[];
}

export async function addGroup(label: string, kind: GroupKind, sortOrder: number) {
  const key = `${slug(label)}_${Date.now().toString(36).slice(-4)}`;
  const { error } = await supabase
    .from("pl_groups")
    .insert({ key, label: label.trim(), kind, sort_order: sortOrder });
  if (error) throw new Error(error.message);
}

export async function renameGroup(id: string, label: string) {
  const { error } = await supabase.from("pl_groups").update({ label: label.trim() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Elimina el grupo, sus rubros y todos los gastos registrados en ellos. */
export async function deleteGroup(group: Group) {
  const rubros = await supabase.from("pl_line_items").select("line_key").eq("section", group.key);
  if (rubros.error) throw new Error(rubros.error.message);
  const keys = (rubros.data ?? []).map((r) => r.line_key);
  if (keys.length) {
    const del = await supabase.from("pl_expenses").delete().in("line_key", keys);
    if (del.error) throw new Error(del.error.message);
  }
  const delItems = await supabase.from("pl_line_items").delete().eq("section", group.key);
  if (delItems.error) throw new Error(delItems.error.message);
  const { error } = await supabase.from("pl_groups").delete().eq("id", group.id);
  if (error) throw new Error(error.message);
}

/** ¿El grupo se ingresa como porcentaje sobre ventas brutas? */
export const isPercentGroup = (g?: Group | null) => g?.kind === "porcentual";

/* ------------------------------------------------------------------ */
/* Rubros (editables por el usuario)                                   */
/* ------------------------------------------------------------------ */

export async function loadLineItems(): Promise<LineItem[]> {
  const { data, error } = await supabase
    .from("pl_line_items")
    .select("id, section, line_key, label, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LineItem[];
}

/** Agrupa los rubros por clave de grupo. */
export function groupItems(groups: Group[], items: LineItem[]) {
  const map = new Map<string, LineItem[]>();
  for (const g of groups) map.set(g.key, []);
  for (const it of items) map.get(it.section)?.push(it);
  return map;
}

export async function addLineItem(groupKey: string, label: string, sortOrder: number) {
  const key = `${groupKey.slice(0, 6)}_${slug(label)}_${Date.now().toString(36).slice(-4)}`;
  const { error } = await supabase
    .from("pl_line_items")
    .insert({ section: groupKey, line_key: key, label: label.trim(), sort_order: sortOrder });
  if (error) throw new Error(error.message);
}

export async function renameLineItem(id: string, label: string) {
  const { error } = await supabase.from("pl_line_items").update({ label: label.trim() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Elimina el rubro y todos los gastos registrados con él. */
export async function deleteLineItem(id: string, lineKey: string) {
  const del = await supabase.from("pl_expenses").delete().eq("line_key", lineKey);
  if (del.error) throw new Error(del.error.message);
  const { error } = await supabase.from("pl_line_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Gastos registrados por mes (con factura, proveedor e IVA)           */
/* ------------------------------------------------------------------ */

export type ExpenseRow = {
  id: string;
  line_item_id: string | null;
  line_key: string;
  label: string;
  section: string;
  year: number;
  month: number;
  expense_date: string;
  invoice_number: string;
  supplier_name: string;
  base_amount: number;
  iva_rate: number;
  tax_amount: number;
  amount: number;
  notes: string | null;
};

const SELECT_EXPENSE =
  "id, line_item_id, line_key, label, section, year, month, expense_date, invoice_number, supplier_name, base_amount, iva_rate, tax_amount, amount, notes";

const mapExpense = (r: Record<string, unknown>): ExpenseRow => ({
  ...(r as ExpenseRow),
  base_amount: Number(r["base_amount"]) || 0,
  iva_rate: Number(r["iva_rate"]) || 0,
  tax_amount: Number(r["tax_amount"]) || 0,
  amount: Number(r["amount"]) || 0,
});

/** Todos los gastos del mes, del más reciente al más antiguo. */
export async function loadExpenses(year: number, month: number): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from("pl_expenses")
    .select(SELECT_EXPENSE)
    .eq("year", year)
    .eq("month", month)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapExpense);
}

/** Gastos de un rango de meses (reporte por período). */
export async function loadExpensesRange(
  year: number,
  fromMonth: number,
  toMonth: number,
): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from("pl_expenses")
    .select(SELECT_EXPENSE)
    .eq("year", year)
    .gte("month", fromMonth)
    .lte("month", toMonth)
    .order("expense_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapExpense);
}

export type ExpenseInput = {
  item: LineItem;
  expense_date: string;
  invoice_number: string;
  supplier_name: string;
  /** Base imponible en $ (o el porcentaje si el grupo es porcentual). */
  base_amount: number;
  iva_rate: number;
  notes?: string;
};

/** IVA = base × tasa ÷ 100. */
export const ivaDe = (base: number, rate: number) => r2(((base || 0) * (rate || 0)) / 100);

const expensePayload = (year: number, month: number, e: ExpenseInput) => {
  const base = r2(e.base_amount || 0);
  const tax = ivaDe(base, e.iva_rate);
  return {
    line_item_id: e.item.id,
    line_key: e.item.line_key,
    label: e.item.label,
    section: e.item.section,
    year,
    month,
    expense_date: e.expense_date,
    invoice_number: e.invoice_number.trim(),
    supplier_name: e.supplier_name.trim(),
    base_amount: base,
    iva_rate: e.iva_rate || 0,
    tax_amount: tax,
    amount: r2(base + tax),
    notes: e.notes?.trim() || null,
  };
};

export async function addExpense(year: number, month: number, e: ExpenseInput) {
  const { error } = await supabase.from("pl_expenses").insert(expensePayload(year, month, e));
  if (error) throw new Error(error.message);
}

export async function updateExpense(id: string, year: number, month: number, e: ExpenseInput) {
  const { error } = await supabase
    .from("pl_expenses")
    .update(expensePayload(year, month, e))
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from("pl_expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Totales del mes agrupados por rubro: { line_key: suma }.
 * En los grupos porcentuales la suma corresponde al % acumulado.
 * El P&G solo lee esto.
 */
export async function loadManualLines(year: number, month: number): Promise<Record<string, number>> {
  const rows = await loadExpenses(year, month);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.line_key] = r2((map[r.line_key] ?? 0) + r.amount);
  return map;
}

/** Monto en $: los grupos porcentuales se calculan sobre ventas brutas. */
export function lineAmount(value: number, ventasBrutas: number, percent: boolean) {
  return percent ? r2((ventasBrutas * (value || 0)) / 100) : r2(value || 0);
}

/* ------------------------------------------------------------------ */
/* Datos automáticos                                                   */
/* ------------------------------------------------------------------ */

/** Orden preferido de las categorías del costo de producción. */
export const COST_CATEGORY_ORDER = [
  "Bebidas",
  "Material de Empaque",
  "Legumbres",
  "Cárnicos",
  "Pollos",
  "Embutidos",
  "Víveres",
  "Mariscos",
  "Lácteos",
];

/**
 * Útiles de limpieza NO son costo de producción: son gasto general.
 * Lo consumido del inventario en el mes se carga automáticamente al rubro
 * "Útiles de limpieza" dentro de Gastos generales del P&G.
 */
export const CLEANING_CATEGORY = "Útiles de Limpieza";

/** ¿El texto corresponde a útiles de limpieza? (categoría o rubro). */
export const isCleaning = (s: string) => {
  const n = norm(s || "");
  return n.includes("limpieza") || n.includes("aseo");
};

export type CostLine = { name: string; amount: number };

export type PygData = {
  ventasBrutas: number;
  iva: number;
  /** IVA cobrado en facturas electrónicas del período. */
  ivaFacturas: number;
  /** IVA cobrado en órdenes / notas de venta del período. */
  ivaSinFacturas: number;
  ventasNetas: number;
  costoCategorias: CostLine[];
  costoTotal: number;
  /** Consumo de útiles de limpieza del mes (gasto general automático). */
  utilesLimpieza: number;
};

/** Consumo $ total del rango (misma columna del Reporte de inventario). */
async function consumoTotal(from: string, to: string, db: Db = supabase) {
  const [rows, physical] = await Promise.all([
    loadInventoryReport(from, to, db),
    loadPhysicalCounts(to, db),
  ]);
  return r2(rows.reduce((s, r) => s + consumoOf(r, physical[r.item_id]).val, 0));
}

/**
 * Recalcular = actualizar el consumo de las ventas cobradas del mes y devolver
 * el Consumo $ acumulado hasta la fecha de corte, que es lo que muestra el P&G.
 * No reconstruye saldos: la regla del costo sigue siendo la columna "Consumo $".
 */
export async function recalcularMes(year: number, month: number, hasta: string) {
  const { from, to } = monthRange(year, month);
  const corte = hasta && hasta >= from && hasta <= to ? hasta : to;

  const ventas = await supabase.rpc("recalc_sales_consumption", { _desde: from });
  if (ventas.error) throw new Error(ventas.error.message);
  const vRow = Array.isArray(ventas.data) ? ventas.data[0] : ventas.data;

  return {
    desde: from,
    hasta: corte,
    pedidos: Number((vRow as { pedidos?: number } | null)?.pedidos ?? 0),
    movimientos: Number((vRow as { movimientos?: number } | null)?.movimientos ?? 0),
    consumo: await consumoTotal(from, corte),
  };
}

/**
 * Carga ventas y costo de producción del mes.
 * `hasta` (YYYY-MM-DD) limita el período al día de corte elegido al recalcular.
 */
export async function loadPyg(
  year: number,
  month: number,
  hasta?: string,
  db: Db = supabase,
): Promise<PygData> {

  const { from, to: finMes } = monthRange(year, month);
  const to = hasta && hasta >= from && hasta <= finMes ? hasta : finMes;

  // El costo de producción es SIEMPRE la columna "Consumo $" del reporte de
  // inventario del período (día 1 → fecha de corte), igual que en Reportes.
  const [ventasData, rows, physical] = await Promise.all([
    fetchAllRows<{
      total: number | null;
      tax_amount: number | null;
      iva_rate: number | null;
      status: string;
      doc_status: string;
      doc_type: string;
    }>((a, b) =>
      db
        .from("orders")
        .select("total, tax_amount, iva_rate, status, doc_status, doc_type")
        .eq("status", "pagado")
        .gte("paid_at", desdeEc(from))
        .lte("paid_at", hastaEc(to))
        .range(a, b),
    ),
    loadInventoryReport(from, to, db),
    loadPhysicalCounts(to, db),
  ]);

  let ventasBrutas = 0;
  let ivaFacturas = 0;
  let ivaSinFacturas = 0;
  for (const o of ventasData) {
    if (o.doc_status === "anulado") continue;
    const total = Number(o.total) || 0;
    const rate = Number(o["iva_rate"]) || IVA_RATE;
    // El IVA siempre se deriva del total vendido para que cuadre con la venta bruta.
    const impuesto = r2((total * rate) / (100 + rate));
    ventasBrutas += total;
    if (o["doc_type"] === "factura") ivaFacturas += impuesto;
    else ivaSinFacturas += impuesto;
  }


  const porCategoria = new Map<string, number>();
  for (const r of rows) {
    const cat = (r.category || "Sin categoría").trim();
    porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + consumoOf(r, physical[r.item_id]).val);
  }

  // Útiles de limpieza salen del costo de producción y se van a gastos generales.
  let utilesLimpieza = 0;
  for (const [name, amount] of [...porCategoria.entries()]) {
    if (isCleaning(name)) {
      utilesLimpieza += amount;
      porCategoria.delete(name);
    }
  }

  const orden = COST_CATEGORY_ORDER.map(norm);
  const costoCategorias: CostLine[] = [...porCategoria.entries()]
    .map(([name, amount]) => ({ name, amount: r2(amount) }))
    .sort((a, b) => {
      const ia = orden.indexOf(norm(a.name));
      const ib = orden.indexOf(norm(b.name));
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.name.localeCompare(b.name, "es");
    });

  return {
    ventasBrutas: r2(ventasBrutas),
    iva: r2(ivaFacturas + ivaSinFacturas),
    ivaFacturas: r2(ivaFacturas),
    ivaSinFacturas: r2(ivaSinFacturas),
    ventasNetas: r2(ventasBrutas - r2(ivaFacturas + ivaSinFacturas)),
    costoCategorias,
    costoTotal: r2(costoCategorias.reduce((s, c) => s + c.amount, 0)),
    utilesLimpieza: r2(utilesLimpieza),
    
  };
}

