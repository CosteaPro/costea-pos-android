/**
 * Módulo de inventario — fórmulas oficiales Costea Pro.
 *
 * Inv. Sistema (cant) = Inicial + Compras + Transf.Pos − Bajas − Lunch − Transf.Neg − Ventas
 * Inv. Sistema $      = igual, pero con las columnas en dólares
 * S/F                 = Físico − Sistema   (+ sobrante | − faltante)
 * Consumo $           = Inicial$ + Compras$ + Transf.Pos$ − Transf.Neg$ − Lunch$ − Físico$
 * Costo Real Total    = suma de la columna Consumo $
 * % Costo             = Costo Real ÷ Venta Neta × 100
 */
import * as XLSX from "xlsx";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import { supabase } from "@/integrations/supabase/client";
import { ecBusinessDate } from "@/lib/caja";
import { montoEC } from "@/lib/costeaExcel";
import type { Db } from "@/lib/db";
import { fetchAllRows } from "@/lib/utils";


export type MovementType =
  | "baja"
  | "lunch"
  | "transferencia"
  | "venta"
  | "ajuste"
  | "consumo_produccion"
  | "entrada_produccion";

export const MOVEMENT_TYPES: { value: MovementType; label: string }[] = [
  { value: "baja", label: "🗑️ Baja / merma" },
  { value: "lunch", label: "🍽️ Lunch / consumo de personal" },
  { value: "transferencia", label: "🔁 Transferencia" },
  { value: "venta", label: "🧾 Salida por venta" },
  
  { value: "entrada_produccion", label: "📥 Entrada por producción" },
  { value: "ajuste", label: "⚖️ Ajuste por conteo físico" },
];

/**
 * Movimientos que se pueden registrar A MANO. Lo automático (ventas y
 * producción) no aparece: se genera solo desde el POS o desde producción.
 * La transferencia positiva suma y la negativa resta, cada una a su columna.
 */
export type ManualMovementKey = "baja" | "lunch" | "transf_pos" | "transf_neg";

export const MANUAL_MOVEMENTS: {
  value: ManualMovementKey;
  label: string;
  type: MovementType;
  sign: 1 | -1;
}[] = [
  { value: "baja", label: "🗑️ Baja / merma", type: "baja", sign: 1 },
  { value: "lunch", label: "🍽️ Lunch / consumo de personal", type: "lunch", sign: 1 },
  {
    value: "transf_pos",
    label: "📥 Transferencia positiva (ingreso)",
    type: "transferencia",
    sign: 1,
  },
  {
    value: "transf_neg",
    label: "📤 Transferencia negativa (salida)",
    type: "transferencia",
    sign: -1,
  },
];

export const movementLabel = (t: string) => MOVEMENT_TYPES.find((m) => m.value === t)?.label ?? t;

/** Etiqueta del historial: la transferencia distingue ingreso y salida. */
export function movementLabelFor(type: string, quantity: number) {
  if (type === "transferencia")
    return quantity >= 0
      ? "📥 Transferencia positiva (ingreso)"
      : "📤 Transferencia negativa (salida)";
  return movementLabel(type);
}

export type Movement = {
  id: string;
  item_id: string;
  item_code: string | null;
  item_name: string;
  category: string | null;
  movement_type: MovementType;
  business_date: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_value: number;
  reason: string | null;
  created_at: string;
  deleted_at?: string | null;
  deleted_by_email?: string | null;
  edited_at?: string | null;
  edited_by_email?: string | null;
};

/** Solo lo ingresado a mano se puede corregir o anular. */
export const isManualMovement = (type: string) =>
  type === "baja" || type === "lunch" || type === "transferencia";

export type ReportRow = {
  item_id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  qtyInicial: number;
  qtyCompras: number;
  qtyBajas: number;
  qtyLunch: number;
  qtyTransfPos: number;
  qtyTransfNeg: number;
  qtyVentas: number;
  /** Inv. Sistema (cant) — auto-calculado */
  qtyFinal: number;
  valInicial: number;
  valCompras: number;
  valBajas: number;
  valLunch: number;
  valTransfPos: number;
  valTransfNeg: number;
  valVentas: number;
  /** Inv. Sistema $ — auto-calculado */
  valFinal: number;
};

/** Conteo físico capturado por ítem (cantidad y valor total en dólares). */
export type PhysicalEntry = { qty: number | null; val: number | null };
export type PhysicalMap = Record<string, PhysicalEntry>;

export const hoyEC = () => ecBusinessDate(new Date());

const r2 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;
const r6 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 1e6) / 1e6;

/**
 * Disponible del ítem al cierre del período:
 * si hay conteo físico manda el físico, si no manda el inventario del sistema.
 */
export function disponibleOf(r: ReportRow, phys?: PhysicalEntry) {
  const tieneFisico = phys != null && phys.qty != null;
  const qty = r6(tieneFisico ? Number(phys?.qty ?? 0) : r.qtyFinal);
  const unitCost =
    Math.abs(r.qtyFinal) > 1e-9
      ? r2(r.valFinal / r.qtyFinal)
      : r2(
          tieneFisico && Number(phys?.qty ?? 0) !== 0
            ? Number(phys?.val ?? 0) / Number(phys?.qty)
            : 0,
        );
  return { qty, unitCost, total: r2(qty * unitCost) };
}

/** S/F = Físico − Sistema. Si no hay conteo, el físico se toma como CERO. */
export function sfOf(r: ReportRow, phys?: PhysicalEntry) {
  const qty = phys?.qty ?? 0;
  const val = phys?.val ?? 0;
  return {
    fisicoQty: qty,
    fisicoVal: val,
    sfQty: r6(qty - r.qtyFinal),
    sfVal: r2(val - r.valFinal),
    hasDiff: Math.abs(qty - r.qtyFinal) > 1e-9 || Math.abs(val - r.valFinal) > 0.005,
  };
}

/** Consumo $ = Inicial$ + Compras$ + Transf.Pos$ − Transf.Neg$ − Lunch$ − Físico$ */
export function consumoOf(r: ReportRow, phys?: PhysicalEntry) {
  const fisicoQty = phys?.qty ?? 0;
  const fisicoVal = phys?.val ?? 0;
  return {
    qty: r6(r.qtyInicial + r.qtyCompras + r.qtyTransfPos - r.qtyTransfNeg - r.qtyLunch - fisicoQty),
    val: r2(r.valInicial + r.valCompras + r.valTransfPos - r.valTransfNeg - r.valLunch - fisicoVal),
  };
}

/** Costo Real Total = suma de toda la columna Consumo $ */
export function costoRealOf(rows: ReportRow[], physical: PhysicalMap = {}) {
  let total = 0;
  for (const r of rows) total += consumoOf(r, physical[r.item_id]).val;
  return r2(total);
}

/* ─────────────────────────── Inventario físico ─────────────────────────── */

/** Carga el conteo físico guardado para la fecha indicada. */
export async function loadPhysicalCounts(
  businessDate: string,
  db: Db = supabase,
): Promise<PhysicalMap> {
  const data = await fetchAllRows<{ item_id: string; quantity: number; total_value: number }>(
    (a, b) =>
      db
        .from("inventory_physical_counts")
        .select("item_id, quantity, total_value")
        .eq("business_date", businessDate)
        .range(a, b),
  );
  const map: PhysicalMap = {};
  for (const r of data ?? []) {
    map[r.item_id as string] = {
      qty: Number(r.quantity) || 0,
      val: Number(r.total_value) || 0,
    };
  }
  return map;
}


/** Guarda (o actualiza) el conteo físico de un ítem para una fecha. */
export async function savePhysicalCount(
  businessDate: string,
  itemId: string,
  qty: number,
  val: number,
) {
  const { error } = await supabase.from("inventory_physical_counts").upsert(
    {
      business_date: businessDate,
      item_id: itemId,
      quantity: qty,
      total_value: r2(val),
    },
    // Un conteo por empresa, sucursal, fecha e ítem: al repetirlo se actualiza.
    { onConflict: "company_id,branch_id,business_date,item_id" },
  );
  if (error) throw new Error(error.message);
}

/* ──────────────────────────── Reporte por rango ─────────────────────────── */

/**
 * Último costo unitario conocido por ítem con fecha ANTERIOR o igual al fin del
 * rango. Solo viaja el NÚMERO: no se heredan cantidades ni movimientos.
 * No caduca: si la última compra fue hace meses, ese costo sigue mandando.
 */
/** Trocea los ids para no exceder el largo de la URL y pagina cada trozo. */
async function lineasDeCompras<T>(ids: string[], columnas: string, db: Db = supabase): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const trozo = ids.slice(i, i + 300);
    const filas = await fetchAllRows<T>(
      (a, b) =>
        db
          .from("purchase_items")
          .select(columnas)
          .in("purchase_id", trozo)
          .range(a, b) as unknown as PromiseLike<{
          data: T[] | null;
          error: { message: string } | null;
        }>,
    );

    out.push(...filas);
  }
  return out;
}

async function costoHeredadoPorItem(hasta: string, db: Db = supabase): Promise<Map<string, number>> {
  const heredado = new Map<string, number>();

  const compras = await fetchAllRows<{ id: string; purchased_at: string }>((a, b) =>
    db
      .from("purchases")
      .select("id, purchased_at")
      .lte("purchased_at", hastaEc(hasta))
      .order("purchased_at", { ascending: true })
      .range(a, b),
  );
  const ids = compras.map((p) => p.id as string);
  if (!ids.length) return heredado;

  // Orden ascendente por fecha: la última compra sobrescribe a las anteriores.
  const orden = new Map(ids.map((id, i) => [id, i]));
  const lineas = await lineasDeCompras<{
    purchase_id: string;
    item_id: string | null;
    unit_cost_inventory: number;
  }>(ids, "purchase_id, item_id, unit_cost_inventory", db);

  const ultimo = new Map<string, number>();
  for (const l of lineas ?? []) {
    const itemId = l.item_id as string | null;
    if (!itemId) continue;
    const pos = orden.get(l.purchase_id as string) ?? -1;
    const costo = Number(l.unit_cost_inventory) || 0;
    if (costo <= 0) continue;
    if (pos >= (ultimo.get(itemId) ?? -1)) {
      ultimo.set(itemId, pos);
      heredado.set(itemId, costo);
    }
  }
  return heredado;
}

/** Arma el reporte consolidado por ítem para el rango de fechas indicado. */
export async function loadInventoryReport(
  from: string,
  to: string,
  db: Db = supabase,
): Promise<ReportRow[]> {
  // Las compras se filtran en dos pasos para garantizar que SOLO entren
  // documentos con fecha dentro del rango (hora Ecuador UTC-5).
  const purchases = await fetchAllRows<{ id: string }>((a, b) =>
    db
      .from("purchases")
      .select("id")
      .gte("purchased_at", desdeEc(from))
      .lte("purchased_at", hastaEc(to))
      .range(a, b),
  );
  const purchaseIds = purchases.map((p) => p.id as string);
  const heredado = await costoHeredadoPorItem(to, db);

  // Todas las lecturas se paginan: un rango con miles de movimientos ya no se
  // corta en 1.000 filas (era la causa de ventas incompletas en el reporte).
  const [items, openings, movimientos, compraLineas] = await Promise.all([
    fetchAllRows<Record<string, unknown>>((a, b) =>
      db.from("inventory_items").select("*").order("name").range(a, b),
    ),
    fetchAllRows<{ item_id: string; quantity: number; total_value: number }>((a, b) =>
      db
        .from("inventory_opening_balances")
        .select("*")
        .eq("business_date", from)
        .range(a, b),
    ),
    fetchAllRows<Record<string, unknown>>((a, b) =>
      db
        .from("inventory_movements")
        .select("*")
        .is("deleted_at", null)
        .gte("business_date", from)
        .lte("business_date", to)
        .range(a, b),
    ),
    purchaseIds.length
      ? lineasDeCompras<Record<string, unknown>>(
          purchaseIds,
          "item_id, quantity_inventory, unit_cost_inventory",
          db,
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);


  const opening = new Map<string, { quantity: number; total_value: number }>();
  for (const o of openings) {
    opening.set(o.item_id as string, {
      quantity: Number(o.quantity),
      total_value: Number(o.total_value),
    });
  }

  // Los ítems eliminados siguen apareciendo en los reportes del período en el
  // que estuvieron activos; desaparecen de los períodos posteriores a su baja.
  const activeAtPeriod = items.filter((i) => {
    const del = i.deleted_at as string | null;
    return !del || del >= desdeEc(from);
  });

  const rows: ReportRow[] = activeAtPeriod.map((i) => {
    const op = opening.get(i.id as string);

    return {
      item_id: i.id as string,
      code: (i.code as string) ?? "",
      name: i.name as string,
      category: (i.category as string) ?? "",
      unit: i.unit as string,
      unitCost: Number(i.unit_cost) || 0,
      qtyInicial: op?.quantity ?? 0,
      qtyCompras: 0,
      qtyBajas: 0,
      qtyLunch: 0,
      qtyTransfPos: 0,
      qtyTransfNeg: 0,
      qtyVentas: 0,
      qtyFinal: 0,
      valInicial: op?.total_value ?? 0,
      valCompras: 0,
      valBajas: 0,
      valLunch: 0,
      valTransfPos: 0,
      valTransfNeg: 0,
      valVentas: 0,
      valFinal: 0,
    };
  });
  const byId = new Map(rows.map((r) => [r.item_id, r]));

  for (const p of compraLineas) {
    const row = byId.get(p["item_id"] as string);
    if (!row) continue;
    const qty = Number(p["quantity_inventory"]) || 0;
    row.qtyCompras += qty;
    row.valCompras += qty * (Number(p["unit_cost_inventory"]) || 0);
  }

  for (const m of movimientos as unknown as Movement[]) {
    const row = byId.get(m.item_id);
    if (!row) continue;
    const qty = Number(m.quantity) || 0;
    const val = Number(m.total_value) || 0;
    if (m.movement_type === "baja") {
      row.qtyBajas += Math.abs(qty);
      row.valBajas += Math.abs(val);
    } else if (m.movement_type === "lunch") {
      row.qtyLunch += Math.abs(qty);
      row.valLunch += Math.abs(val);
    } else if (m.movement_type === "entrada_produccion") {
      // Produccion terminada: entra igual que una compra.
      row.qtyCompras += Math.abs(qty);
      row.valCompras += Math.abs(val);
    } else if (m.movement_type === "transferencia") {
      // Solo mover entre locales: positiva entra, negativa sale.
      if (qty >= 0) {
        row.qtyTransfPos += qty;
        row.valTransfPos += Math.abs(val);
      } else {
        row.qtyTransfNeg += Math.abs(qty);
        row.valTransfNeg += Math.abs(val);
      }
    } else if (m.movement_type === "venta") {
      row.qtyVentas += Math.abs(qty);
      row.valVentas += Math.abs(val);
    }
  }

  for (const row of rows) {
    row.valInicial = r2(row.valInicial);
    row.valCompras = r2(row.valCompras);
    row.valBajas = r2(row.valBajas);
    row.valLunch = r2(row.valLunch);
    row.valTransfPos = r2(row.valTransfPos);
    row.valTransfNeg = r2(row.valTransfNeg);
    row.valVentas = r2(row.valVentas);
    // Costo Unitario del período: si hubo compras manda el promedio de esas
    // compras; si no hubo, se hereda SOLO el número del último costo anterior.
    row.unitCost =
      row.qtyCompras > 1e-9
        ? r6(row.valCompras / row.qtyCompras)
        : (heredado.get(row.item_id) ?? row.unitCost);

    row.qtyFinal = r6(
      row.qtyInicial +
        row.qtyCompras +
        row.qtyTransfPos -
        row.qtyBajas -
        row.qtyLunch -
        row.qtyTransfNeg -
        row.qtyVentas,
    );
    row.valFinal = r2(
      row.valInicial +
        row.valCompras +
        row.valTransfPos -
        row.valBajas -
        row.valLunch -
        row.valTransfNeg -
        row.valVentas,
    );
  }

  return rows;
}

const download = (wb: XLSX.WorkBook, name: string) => XLSX.writeFile(wb, name);

/** Exporta el reporte con las columnas oficiales, en orden fijo. */
export function exportInventoryReport(
  rows: ReportRow[],
  from: string,
  to: string,
  physical: PhysicalMap = {},
  opts: { hideMoney?: boolean; fileName?: string; sheet?: string } = {},
) {
  const data = rows.map((r) => {
    const sf = sfOf(r, physical[r.item_id]);
    const c = consumoOf(r, physical[r.item_id]);
    const full: Record<string, string | number> = {
      Código: r.code,
      Descripción: r.name,
      Categoría: r.category,
      "Unidad Inv": r.unit,
      "Inv. Inicial": r.qtyInicial,
      "Inv. Inicial $": montoEC(r.valInicial),
      "Costo Unit.": r.unitCost > 0 ? montoEC(r.unitCost) : "—",
      Compras: r.qtyCompras,
      "Compras $": montoEC(r.valCompras),
      Bajas: r.qtyBajas,
      "Bajas $": montoEC(r.valBajas),
      Lunch: r.qtyLunch,
      "Lunch $": montoEC(r.valLunch),
      "Transf. Pos": r.qtyTransfPos,
      "Transf. Pos $": montoEC(r.valTransfPos),
      "Transf. Neg": r.qtyTransfNeg,
      "Transf. Neg $": montoEC(r.valTransfNeg),
      Ventas: r.qtyVentas,
      "Ventas $": montoEC(r.valVentas),
      "Inv. Sistema": r.qtyFinal,
      "Inv. Sistema $": montoEC(r.valFinal),
      "Inv. Físico": sf.fisicoQty,
      "Inv. Físico $": montoEC(sf.fisicoVal),
      "S/F Cant": sf.sfQty,
      "S/F $": montoEC(sf.sfVal),
      "Consumo $": montoEC(c.val),
    };
    if (!opts.hideMoney) return full;
    const solo: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(full)) {
      if (k.includes("$") || k === "Costo Unit.") continue;
      solo[k] = v;
    }
    return solo;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), opts.sheet ?? "Inventario");
  download(wb, opts.fileName ?? `Inventario-${from}_a_${to}.xlsx`);
}

/** Exporta el histórico de bajas y consumos de personal. */
export function exportMovementsHistory(rows: Movement[], from: string, to: string) {
  const data = rows.map((m) => ({
    Fecha: m.business_date.split("-").reverse().join("/"),
    Código: m.item_code ?? "",
    Descripción: m.item_name,
    Categoría: m.category ?? "",
    Tipo: movementLabelFor(m.movement_type, Number(m.quantity)).replace(/^[^\w]+\s*/u, ""),
    Cantidad: Number(m.quantity),
    Unidad: m.unit,
    "Motivo / Observación": m.reason ?? "",
    Estado: m.deleted_at ? `ELIMINADO ${m.deleted_by_email ?? ""}`.trim() : "Vigente",
    "Valor Total $": montoEC(Number(m.total_value)),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "BajasConsumos");
  download(wb, `Bajas-y-consumos-${from}_a_${to}.xlsx`);
}

/** Inventario por ítem: mismo reporte, sin columnas en dólares ni Costo Unit. */
export function exportInventoryByItem(
  rows: ReportRow[],
  from: string,
  to: string,
  physical: PhysicalMap = {},
) {
  exportInventoryReport(rows, from, to, physical, {
    hideMoney: true,
    sheet: "InventarioItems",
    fileName: `Inventario-por-item-${from}_a_${to}.xlsx`,
  });
}

/** Inventario costeado: mismo reporte con todas las columnas de valores. */
export function exportInventoryCosted(
  rows: ReportRow[],
  from: string,
  to: string,
  physical: PhysicalMap = {},
) {
  exportInventoryReport(rows, from, to, physical, {
    sheet: "InventarioCosteado",
    fileName: `Inventario-costeado-${from}_a_${to}.xlsx`,
  });
}
