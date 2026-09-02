/**
 * Cálculo del Mix de ventas.
 *
 * Vive fuera de la pantalla para que el mismo resultado se pueda calcular en
 * el navegador (período personalizado) o en el servidor (pre-cálculo nocturno)
 * y guardarse en `report_snapshots`.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/utils";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import type { Db } from "@/lib/db";
import type { ModifierRow } from "@/lib/sales-mix-print";

export type MixAggregate = {
  productId: string | null;
  code: string;
  name: string;
  units: number;
  net: number;
  gross: number;
};

export type MixData = {
  from: string;
  to: string;
  aggs: MixAggregate[];
  costs: Record<string, number>;
  taxTotal: number;
  modRows: ModifierRow[];
};

/** Agrega las ventas cobradas del rango por receta/producto. */
export async function computeSalesMix(from: string, to: string, db: Db = supabase): Promise<MixData> {
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

  const products = productsRes.data ?? [];
  const recipes = (recipesRes.data ?? []).filter((r) => r.kind !== "subreceta");
  const recipeIds = recipes.map((r) => r.id);

  // Costo total de cada receta (suma de sus insumos).
  const costByRecipe: Record<string, number> = {};
  if (recipeIds.length > 0) {
    for (let i = 0; i < recipeIds.length; i += 300) {
      const { data: items } = await db
        .from("recipe_items")
        .select("recipe_id, subtotal")
        .in("recipe_id", recipeIds.slice(i, i + 300));
      for (const it of items ?? []) {
        costByRecipe[it.recipe_id] = (costByRecipe[it.recipe_id] ?? 0) + Number(it.subtotal || 0);
      }
    }
  }

  const prodById = new Map(products.map((p) => [p.id, p]));
  const recipeByProduct = new Map(
    recipes.filter((r) => r.product_id).map((r) => [r.product_id as string, r]),
  );

  // Costo unitario por producto (1 receta = 1 plato).
  const costs: Record<string, number> = {};
  for (const [productId, r] of recipeByProduct) {
    const y = Number(r.yield_quantity) || 1;
    costs[productId] = (costByRecipe[r.id] ?? 0) / (y > 0 ? y : 1);
  }

  const map = new Map<string, MixAggregate>();
  const mods = new Map<string, number>();
  let taxTotal = 0;
  for (const o of ordersData) {
    if (o.doc_status === "anulado") continue;
    const rate = Number(o.iva_rate ?? 15);
    for (const it of o.order_items ?? []) {
      // Los modificadores ($0.00) van a su propia pestaña, no al mix de ventas.
      if (it.option_kind === "modificador") {
        const nombre = it.product_name.trim();
        mods.set(nombre, (mods.get(nombre) ?? 0) + Number(it.quantity || 0));
        continue;
      }
      const key = it.product_id ?? `n:${it.product_name.trim().toLowerCase()}`;
      const gross = Number(it.unit_price || 0) * Number(it.quantity || 0);
      const net = gross / (1 + rate / 100);
      taxTotal += gross - net;
      const prod = it.product_id ? prodById.get(it.product_id) : undefined;
      const recipe = it.product_id ? recipeByProduct.get(it.product_id) : undefined;
      const cur = map.get(key) ?? {
        productId: it.product_id ?? null,
        code: recipe?.code ?? prod?.code ?? "S/C",
        name: recipe?.name ?? it.product_name,
        units: 0,
        net: 0,
        gross: 0,
      };
      cur.units += Number(it.quantity || 0);
      cur.net += net;
      cur.gross += gross;
      map.set(key, cur);
    }
  }

  return {
    from,
    to,
    aggs: [...map.values()],
    costs,
    taxTotal,
    modRows: [...mods.entries()]
      .map(([name, units]) => ({ name, units }))
      .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "es")),
  };
}
