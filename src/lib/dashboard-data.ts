/**
 * Datos del tablero de mando ejecutivo.
 *
 * Todo se devuelve en una estructura plana y legible para que además de
 * pintarse en pantalla pueda enviarse tal cual a la IA o al bot de Telegram.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/utils";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import type { Db } from "@/lib/db";
import { ecBusinessDate } from "@/lib/caja";
import {
  consumoOf,
  loadInventoryReport,
  loadPhysicalCounts,
  type PhysicalMap,
} from "@/lib/inventory.movements";

export type Kpis = {
  ventaBruta: number;
  ventaNeta: number;
  costoReal: number;
  utilidad: number;
};

export type MixRow = {
  code: string;
  name: string;
  units: number;
  net: number;
  cost: number;
  profit: number;
  marginPct: number;
};

export type AlertLevel = "rojo" | "amarillo" | "verde";

export type InventoryAlert = {
  itemId: string;
  name: string;
  unit: string;
  level: AlertLevel;
  /** Texto corto con la magnitud del problema. */
  magnitud: string;
  /** Comparación contra lo normal / esperado. */
  comparacion: string;
  /** Explicación breve en lenguaje natural. */
  explicacion: string;
  desviacionPct: number;
};

export type DashboardData = {
  from: string;
  to: string;
  kpis: Kpis;
  previo: Kpis;
  porDia: Array<{ dia: string; ventas: number; costo: number }>;
  mix: MixRow[];
  alertas: InventoryAlert[];
  composicion: Array<{ nombre: string; valor: number }>;
};

export const hoyEc = () => ecBusinessDate(new Date());

const dias = (from: string, to: string) =>
  Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);

/** Devuelve el período inmediatamente anterior, del mismo largo. */
export function periodoPrevio(from: string, to: string) {
  const n = dias(from, to);
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (n - 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export const variacion = (actual: number, previo: number) =>
  previo > 0 ? ((actual - previo) / previo) * 100 : actual > 0 ? 100 : 0;

async function loadVentas(from: string, to: string, db: Db) {
  const rows = await fetchAllRows<{ total: number | null; subtotal: number | null; created_at: string }>(
    (a, b) =>
      db
        .from("orders")
        .select("total, subtotal, created_at")
        .eq("status", "pagado")
        .neq("doc_status", "anulado")
        .gte("created_at", desdeEc(from))
        .lte("created_at", hastaEc(to))
        .range(a, b),
  );
  return {
    bruta: rows.reduce((s, o) => s + Number(o.total || 0), 0),
    neta: rows.reduce((s, o) => s + Number(o.subtotal || 0), 0),
    rows,
  };
}

async function loadMix(from: string, to: string, db: Db): Promise<MixRow[]> {
  const [ordersData, productsRes, recipesRes] = await Promise.all([
    fetchAllRows<{
      id: string;
      iva_rate: number | null;
      doc_status: string;
      order_items: {
        product_id: string | null;
        product_name: string;
        unit_price: number;
        quantity: number;
        option_kind: string | null;
      }[];
    }>((a, b) =>
      db
        .from("orders")
        .select(
          "id, iva_rate, doc_status, order_items(product_id, product_name, unit_price, quantity, option_kind)",
        )
        .eq("status", "pagado")
        .gte("created_at", desdeEc(from))
        .lte("created_at", hastaEc(to))
        .range(a, b),
    ),
    db.from("products").select("id, code, name"),
    db.from("recipes").select("id, code, name, product_id, kind, yield_quantity"),
  ]);


  const recipes = (recipesRes.data ?? []).filter((r) => r.kind !== "subreceta");
  const costByRecipe: Record<string, number> = {};
  const recipeIds = recipes.map((r) => r.id);
  if (recipeIds.length) {
    const { data: items } = await db
      .from("recipe_items")
      .select("recipe_id, subtotal")
      .in("recipe_id", recipeIds);
    for (const it of items ?? [])
      costByRecipe[it.recipe_id] = (costByRecipe[it.recipe_id] ?? 0) + Number(it.subtotal || 0);
  }

  const prodById = new Map((productsRes.data ?? []).map((p) => [p.id, p]));
  const recipeByProduct = new Map(
    recipes.filter((r) => r.product_id).map((r) => [r.product_id as string, r]),
  );
  const costByProduct: Record<string, number> = {};
  for (const [productId, r] of recipeByProduct) {
    const y = Number(r.yield_quantity) || 1;
    costByProduct[productId] = (costByRecipe[r.id] ?? 0) / (y > 0 ? y : 1);
  }

  const map = new Map<string, MixRow>();
  for (const o of ordersData) {
    if (o.doc_status === "anulado") continue;
    const rate = Number(o.iva_rate ?? 15);
    for (const it of o.order_items ?? []) {
      if (it.option_kind === "modificador") continue;
      const key = it.product_id ?? `n:${it.product_name.trim().toLowerCase()}`;
      const qty = Number(it.quantity || 0);
      const net = (Number(it.unit_price || 0) * qty) / (1 + rate / 100);
      const prod = it.product_id ? prodById.get(it.product_id) : undefined;
      const recipe = it.product_id ? recipeByProduct.get(it.product_id) : undefined;
      const cur = map.get(key) ?? {
        code: recipe?.code ?? prod?.code ?? "S/C",
        name: recipe?.name ?? it.product_name,
        units: 0,
        net: 0,
        cost: 0,
        profit: 0,
        marginPct: 0,
      };
      cur.units += qty;
      cur.net += net;
      cur.cost += (it.product_id ? (costByProduct[it.product_id] ?? 0) : 0) * qty;
      map.set(key, cur);
    }
  }

  return [...map.values()].map((r) => ({
    ...r,
    profit: r.net - r.cost,
    marginPct: r.net > 0 ? ((r.net - r.cost) / r.net) * 100 : 0,
  }));
}

/** Carga completa del tablero: KPIs, comparativo, mix, alertas y series. */
export async function loadDashboardData(
  from: string,
  to: string,
  db: Db = supabase,
): Promise<DashboardData> {
  const prev = periodoPrevio(from, to);
  const nDias = dias(from, to);

  const [ventas, ventasPrev, reporte, fisico, mix, itemsRes, prevReporte] = await Promise.all([
    loadVentas(from, to, db),
    loadVentas(prev.from, prev.to, db),
    loadInventoryReport(from, to, db).catch(() => []),
    loadPhysicalCounts(to, db).catch(() => ({}) as PhysicalMap),
    loadMix(from, to, db).catch(() => [] as MixRow[]),
    db.from("inventory_items").select("id, name, unit, stock, min_stock").is("deleted_at", null),
    loadInventoryReport(prev.from, prev.to, db).catch(() => []),
  ]);

  const consumos = reporte.map((r) => ({ row: r, consumo: consumoOf(r, fisico[r.item_id]) }));
  const costoReal = consumos.reduce((s, c) => s + c.consumo.val, 0);
  const costoPrev = prevReporte.reduce((s, r) => s + consumoOf(r).val, 0);

  const kpis: Kpis = {
    ventaBruta: ventas.bruta,
    ventaNeta: ventas.neta,
    costoReal,
    utilidad: ventas.neta - costoReal,
  };
  const previo: Kpis = {
    ventaBruta: ventasPrev.bruta,
    ventaNeta: ventasPrev.neta,
    costoReal: costoPrev,
    utilidad: ventasPrev.neta - costoPrev,
  };

  // Serie diaria (ventas y costo teórico de recetas por día).
  const mapDias = new Map<string, { ventas: number; costo: number }>();
  for (const o of ventas.rows) {
    const d = ecBusinessDate(new Date(o.created_at));
    const cur = mapDias.get(d) ?? { ventas: 0, costo: 0 };
    cur.ventas += Number(o.total || 0);
    mapDias.set(d, cur);
  }
  const { data: movs } = await db
    .from("inventory_movements")
    .select("movement_type, total_value, business_date")
    .is("deleted_at", null)
    .gte("business_date", from)
    .lte("business_date", to);
  for (const x of movs ?? []) {
    if (x.movement_type === "ajuste") continue;
    const cur = mapDias.get(x.business_date) ?? { ventas: 0, costo: 0 };
    cur.costo += Number(x.total_value || 0);
    mapDias.set(x.business_date, cur);
  }
  const porDia = [...mapDias.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([dia, v]) => ({ dia: dia.slice(5), ...v }));

  // Alertas de inventario por ítem.
  const stockById = new Map(
    (itemsRes.data ?? []).map((i) => [
      i.id as string,
      { stock: Number(i.stock || 0), min: Number(i.min_stock || 0) },
    ]),
  );
  const alertas: InventoryAlert[] = consumos.map(({ row, consumo }) => {
    const teorico = row.qtyVentas;
    const real = consumo.qty;
    const desv = teorico > 0 ? ((real - teorico) / teorico) * 100 : real > 0 ? 100 : 0;
    const info = stockById.get(row.item_id);
    const promedioDia = real / nDias;
    const stock = info?.stock ?? 0;
    const dura2Dias = promedioDia > 0 ? stock >= promedioDia * 2 : true;

    let level: AlertLevel = "verde";
    let magnitud = "Sin desviaciones relevantes";
    let comparacion = `Consumo real ${real.toFixed(2)} ${row.unit} vs. teórico ${teorico.toFixed(2)} ${row.unit}`;
    let explicacion = "El consumo se mantiene dentro de lo esperado.";

    if (teorico > 0 && desv > 10) {
      level = "rojo";
      magnitud = `Faltaron ${(real - teorico).toFixed(2)} ${row.unit}`;
      explicacion = `Desviación ${desv.toFixed(0)}% por encima del consumo esperado según las ventas.`;
    } else if (!dura2Dias) {
      level = "amarillo";
      magnitud = `Quedan ${stock.toFixed(2)} ${row.unit}`;
      comparacion = `Consumo promedio ${promedioDia.toFixed(2)} ${row.unit} por día`;
      explicacion = `Alcanza para menos de 2 días de operación.`;
    } else if (info && info.min > 0 && stock <= info.min) {
      level = "amarillo";
      magnitud = `Stock ${stock.toFixed(2)} ${row.unit}`;
      comparacion = `Mínimo definido ${info.min.toFixed(2)} ${row.unit}`;
      explicacion = "El inventario está en o por debajo del mínimo configurado.";
    }

    return {
      itemId: row.item_id,
      name: row.name,
      unit: row.unit,
      level,
      magnitud,
      comparacion,
      explicacion,
      desviacionPct: desv,
    };
  });

  const suma = (f: (r: (typeof reporte)[number]) => number) => reporte.reduce((s, r) => s + f(r), 0);
  const consumoVentas = suma((r) => r.valVentas);
  const bajas = suma((r) => r.valBajas);
  const lunch = suma((r) => r.valLunch);
  const transf = suma((r) => r.valTransfNeg);
  const otros = Math.max(0, costoReal - consumoVentas - bajas - lunch - transf);
  const composicion = [
    { nombre: "Consumo por ventas", valor: consumoVentas },
    { nombre: "Bajas y mermas", valor: bajas },
    { nombre: "Lunch de personal", valor: lunch },
    { nombre: "Transferencias", valor: transf },
    { nombre: "Diferencias no justificadas", valor: otros },
  ].filter((x) => x.valor > 0.005);

  return { from, to, kpis, previo, porDia, mix, alertas, composicion };
}

/** Resumen compacto en texto, listo para la IA o para Telegram. */
export function resumenTexto(d: DashboardData) {
  const m = (n: number) => `$${n.toFixed(2)}`;
  const top = [...d.mix].sort((a, b) => b.net - a.net).slice(0, 8);
  const rojas = d.alertas.filter((a) => a.level === "rojo").slice(0, 10);
  const amarillas = d.alertas.filter((a) => a.level === "amarillo").slice(0, 10);
  return [
    `Período ${d.from} al ${d.to}`,
    `Venta bruta ${m(d.kpis.ventaBruta)} (previo ${m(d.previo.ventaBruta)})`,
    `Venta neta ${m(d.kpis.ventaNeta)} (previo ${m(d.previo.ventaNeta)})`,
    `Costo real ${m(d.kpis.costoReal)} (previo ${m(d.previo.costoReal)})`,
    `Utilidad bruta ${m(d.kpis.utilidad)} (previo ${m(d.previo.utilidad)})`,
    "",
    "Platos con mayor venta:",
    ...top.map(
      (r) =>
        `- ${r.name}: ${r.units} u, venta ${m(r.net)}, costo ${m(r.cost)}, utilidad ${m(r.profit)} (${r.marginPct.toFixed(0)}%)`,
    ),
    "",
    "Alertas rojas (faltante excesivo):",
    ...(rojas.length
      ? rojas.map((a) => `- ${a.name}: ${a.magnitud}. ${a.comparacion}. ${a.explicacion}`)
      : ["- ninguna"]),
    "Alertas amarillas (stock bajo):",
    ...(amarillas.length
      ? amarillas.map((a) => `- ${a.name}: ${a.magnitud}. ${a.comparacion}`)
      : ["- ninguna"]),
    "",
    "Ventas por día:",
    ...d.porDia.map((x) => `- ${x.dia}: ventas ${m(x.ventas)}, costo ${m(x.costo)}`),
  ].join("\n");
}
