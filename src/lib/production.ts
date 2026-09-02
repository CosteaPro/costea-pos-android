/**
 * Ingreso de producción de subrecetas.
 *
 * Al registrar una producción:
 *  • La subreceta producida ENTRA al inventario en la columna COMPRAS
 *    (cantidad total, costo total y costo unitario).
 *  • Los ingredientes SALEN del inventario multiplicados por el número de
 *    lotes, registrados como CONSUMO DE PRODUCCIÓN.
 */
import { supabase } from "@/integrations/supabase/client";
import { printA4 } from "@/lib/inventory-print";
import { ecBusinessDate } from "@/lib/caja";
import { autoPurchaseFactor, recipeFor } from "@/lib/units";

export const round2 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;
export const round6 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 1e6) / 1e6;

export const SHIFTS = ["Mañana", "Tarde", "Noche"] as const;

export type SubRecipe = {
  id: string;
  code: string | null;
  name: string;
  kind: string;
  yield_quantity: number;
  yield_unit: string;
  inventory_item_id: string | null;
  created_at?: string;
};

export type ProductionLine = {
  item_id: string | null;
  sub_recipe_id: string | null;
  name: string;
  unit: string;
  quantityBatch: number;
  quantityTotal: number;
  unitCost: number;
  totalCost: number;
};

export type ProductionResult = {
  id: string;
  recipeCode: string;
  recipeName: string;
  batches: number;
  yieldPerBatch: number;
  totalQuantity: number;
  unit: string;
  batchCost: number;
  totalCost: number;
  unitCost: number;
  shift: string;
  responsable: string;
  businessDate: string;
  notes: string;
  lines: ProductionLine[];
};

/**
 * Garantiza que la subreceta tenga su ítem espejo en el inventario para poder
 * registrar entradas y salidas con cantidad y valor.
 */
export async function ensureSubrecipeItem(recipe: SubRecipe): Promise<string> {
  if (recipe.inventory_item_id) return recipe.inventory_item_id;

  const unit = recipe.yield_unit || "unidad";
  const { recipeUnit } = recipeFor(unit);
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      name: recipe.name,
      category: "Producción",
      unit,
      purchase_unit: unit,
      purchase_to_inventory: 1,
      recipe_unit: recipeUnit === unit ? unit : unit,
      inventory_to_recipe: 1,
      tax_treatment: "no_grava",
      min_stock: 0,
      stock: 0,
      unit_cost: 0,
      active: true,
      notes: `Subreceta ${recipe.code ?? ""}`.trim(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const itemId = data.id as string;
  const { error: upErr } = await supabase
    .from("recipes")
    .update({ inventory_item_id: itemId })
    .eq("id", recipe.id);
  if (upErr) throw new Error(upErr.message);
  return itemId;
}

type IngredientRow = {
  item_id: string | null;
  sub_recipe_id: string | null;
  source_type: string;
  name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
};

/** Registra la producción completa: entrada de la subreceta y salida de insumos. */
export async function registerProduction(opts: {
  recipe: SubRecipe;
  batches: number;
  shift: string;
  notes?: string;
  responsable: string;
  userId?: string | null;
  businessDate?: string;
}): Promise<ProductionResult> {
  const { recipe, batches, shift, responsable } = opts;
  if (!(batches > 0)) throw new Error("Ingresa una cantidad de producciones válida");

  const yieldPerBatch = Number(recipe.yield_quantity) || 0;
  if (!(yieldPerBatch > 0)) throw new Error("La subreceta no tiene rendimiento configurado");

  const { data: rawItems, error: riErr } = await supabase
    .from("recipe_items")
    .select("item_id, sub_recipe_id, source_type, name, unit, quantity, unit_cost")
    .eq("recipe_id", recipe.id)
    .order("sort_order");
  if (riErr) throw new Error(riErr.message);
  const ingredients = (rawItems ?? []) as unknown as IngredientRow[];
  if (!ingredients.length) throw new Error("La subreceta no tiene ingredientes registrados");

  const batchCost = round2(
    ingredients.reduce((a, r) => a + (Number(r.quantity) || 0) * (Number(r.unit_cost) || 0), 0),
  );
  const totalQuantity = round2(yieldPerBatch * batches);
  const totalCost = round2(batchCost * batches);
  const unitCost = round2(totalCost / (totalQuantity || 1));
  const businessDate = opts.businessDate || ecBusinessDate(new Date());

  const itemId = await ensureSubrecipeItem(recipe);

  // 1) Registro de la producción: es el documento que agrupa entrada y salidas.
  const { data: entry, error: eErr } = await supabase
    .from("production_entries")
    .insert({
      recipe_id: recipe.id,
      recipe_code: recipe.code,
      recipe_name: recipe.name,
      item_id: itemId,
      business_date: businessDate,
      batches,
      yield_per_batch: yieldPerBatch,
      total_quantity: totalQuantity,
      unit: recipe.yield_unit,
      batch_cost: batchCost,
      total_cost: totalCost,
      unit_cost: unitCost,
      shift,
      notes: opts.notes ?? null,
      created_by: opts.userId ?? null,
      created_by_email: responsable,
    })
    .select("id")
    .single();
  if (eErr) throw new Error(eErr.message);
  const entryId = entry.id as string;


  // 2) SALIDA de ingredientes: cantidad de 1 lote × número de producciones.
  // Las líneas que son subrecetas u otras recetas se descuentan de su ítem espejo.
  const recipeIds = ingredients.map((i) => i.sub_recipe_id).filter(Boolean) as string[];
  const subItemMap = new Map<string, string>();
  if (recipeIds.length) {
    const { data: recs } = await supabase
      .from("recipes")
      .select("id, code, name, kind, yield_quantity, yield_unit, inventory_item_id")
      .in("id", recipeIds);
    for (const r of recs ?? []) {
      const rec = r as unknown as SubRecipe;
      const mirror = rec.inventory_item_id ?? (await ensureSubrecipeItem(rec));
      subItemMap.set(rec.id, mirror);
    }
  }

  const resolvedItemId = (ing: IngredientRow) =>
    ing.item_id ?? (ing.sub_recipe_id ? (subItemMap.get(ing.sub_recipe_id) ?? null) : null);

  const itemIds = Array.from(
    new Set(ingredients.map(resolvedItemId).filter(Boolean) as string[]),
  );
  const { data: invItems } = itemIds.length
    ? await supabase
        .from("inventory_items")
        .select("id, code, name, category, unit, unit_cost, inventory_to_recipe")
        .in("id", itemIds)
    : { data: [] as Array<Record<string, unknown>> };
  const invMap = new Map(
    (invItems ?? []).map((i) => [i["id"] as string, i as Record<string, unknown>]),
  );

  const lines: ProductionLine[] = [];
  type MovementInsert = {
    item_id: string;
    item_code: string | null;
    item_name: string;
    category: string | null;
    movement_type: "venta" | "entrada_produccion";

    business_date: string;
    quantity: number;
    unit: string;
    unit_cost: number;
    total_value: number;
    reason: string;
    created_by: string | null;
    production_entry_id: string;

  };
  const movements: MovementInsert[] = [];

  for (const ing of ingredients) {
    const qtyBatch = Number(ing.quantity) || 0;
    const qtyTotalRecipe = round2(qtyBatch * batches);
    const cost = Number(ing.unit_cost) || 0;
    lines.push({
      item_id: ing.item_id,
      sub_recipe_id: ing.sub_recipe_id,
      name: ing.name,
      unit: ing.unit,
      quantityBatch: qtyBatch,
      quantityTotal: qtyTotalRecipe,
      unitCost: cost,
      totalCost: round2(qtyTotalRecipe * cost),
    });

    const targetId = resolvedItemId(ing);
    const inv = targetId ? invMap.get(targetId) : null;
    if (!inv) continue;
    // Conversión oficial: la cantidad de la receta pasa a unidad de inventario
    // antes de descontar (gramo→kilo ÷1000, mililitro→litro ÷1000, libra→kilo ×0.453592).
    const invUnit = String(inv["unit"] ?? "");
    const recUnit = (ing.unit || "").toLowerCase();
    const porcion = !!ing.sub_recipe_id && recUnit === "unidad";
    const mismaUnidad = recUnit === invUnit.toLowerCase();
    let qtyInv: number;
    if (porcion || mismaUnidad || !recUnit) {
      qtyInv = round2(qtyTotalRecipe);
    } else {
      const auto = autoPurchaseFactor(recUnit, invUnit);
      qtyInv =
        auto !== null
          ? round2(qtyTotalRecipe * auto)
          : round2(qtyTotalRecipe / (Number(inv["inventory_to_recipe"]) || 1));
    }
    if (!(qtyInv > 0)) continue;
    movements.push({
      item_id: targetId as string,
      item_code: (inv["code"] as string | null) ?? null,
      item_name: (inv["name"] as string | null) ?? ing.name,
      category: (inv["category"] as string | null) ?? null,
      movement_type: "venta",
      business_date: businessDate,
      quantity: -qtyInv,
      unit: (inv["unit"] as string) ?? "",
      unit_cost: Number(inv["unit_cost"]) || 0,
      total_value: round2(-qtyInv * (Number(inv["unit_cost"]) || 0)),
      reason: `CONSUMO POR VENTA · ${recipe.name} (${batches} lote(s))`,
      created_by: opts.userId ?? null,
      production_entry_id: entryId,
    });
  }

  // 2b) ENTRADA POR PRODUCCIÓN: la subreceta elaborada entra al inventario.
  const { data: mirror } = await supabase
    .from("inventory_items")
    .select("code, name, category, unit")
    .eq("id", itemId)
    .maybeSingle();
  movements.push({
    item_id: itemId,
    item_code: (mirror?.code as string | null) ?? null,
    item_name: (mirror?.name as string | null) ?? recipe.name,
    category: (mirror?.category as string | null) ?? "Producción",
    movement_type: "entrada_produccion",
    business_date: businessDate,
    quantity: totalQuantity,
    unit: (mirror?.unit as string) ?? recipe.yield_unit,
    unit_cost: unitCost,
    total_value: totalCost,
    reason: `ENTRADA POR PRODUCCIÓN · ${recipe.name} (${batches} lote(s))`,
    created_by: opts.userId ?? null,
    production_entry_id: entryId,
  });

  if (movements.length) {
    const { error: mErr } = await supabase.from("inventory_movements").insert(movements);
    if (mErr) throw new Error(mErr.message);
  }

  // 3) Detalle de insumos consumidos, para consulta e impresión.
  await supabase.from("production_entry_items").insert(
    lines.map((l) => ({
      entry_id: entryId,
      item_id: l.item_id,
      sub_recipe_id: l.sub_recipe_id,
      name: l.name,
      unit: l.unit,
      quantity_batch: l.quantityBatch,
      quantity_total: l.quantityTotal,
      unit_cost: l.unitCost,
      total_cost: l.totalCost,
    })),
  );

  return {
    id: entryId,

    recipeCode: recipe.code ?? "",
    recipeName: recipe.name,
    batches,
    yieldPerBatch,
    totalQuantity,
    unit: recipe.yield_unit,
    batchCost,
    totalCost,
    unitCost,
    shift,
    responsable,
    businessDate,
    notes: opts.notes ?? "",
    lines,
  };
}

/* ─────────────────────── Comprobante A4 horizontal ─────────────────────── */

const money = (n: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n || 0);
const qtyFmt = (n: number) =>
  new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

/** Imprime el comprobante de producción en hoja A4 horizontal para firmar. */
export function printProductionVoucher(p: ProductionResult, empresa = "Costea POS") {
  const fecha = p.businessDate.split("-").reverse().join("/");
  const hora = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const rows = p.lines
    .map(
      (l) => `<tr>
        <td>${esc(l.name)}</td>
        <td>${esc(l.unit)}</td>
        <td class="r">${qtyFmt(l.quantityBatch)}</td>
        <td class="r">${qtyFmt(l.quantityTotal)}</td>
        <td class="r">${money(l.unitCost)}</td>
        <td class="r">${money(l.totalCost)}</td>
      </tr>`,
    )
    .join("");

  printA4(
    `<!doctype html><html lang="es"><head><meta charset="utf-8" />
    <title>Comprobante de producción</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; }
      h1 { font-size: 16px; margin: 0 0 2px; }
      .sub { color: #555; margin-bottom: 10px; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
      .box { border: 1px solid #bbb; border-radius: 6px; padding: 6px 8px; }
      .box b { display: block; font-size: 13px; }
      .box span { color: #555; font-size: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #bbb; padding: 4px 6px; }
      th { background: #eef2f5; text-align: left; }
      .r { text-align: right; }
      .firmas { display: flex; gap: 60px; margin-top: 40px; }
      .firma { flex: 1; border-top: 1px solid #333; padding-top: 4px; text-align: center; }
    </style></head><body>
      <h1>${esc(empresa)} · Comprobante de ingreso de producción</h1>
      <div class="sub">Fecha: ${fecha} ${hora} · Turno: ${esc(p.shift)} · Responsable: ${esc(p.responsable)}</div>
      <div class="grid">
        <div class="box"><span>Subreceta</span><b>${esc(p.recipeCode)} ${esc(p.recipeName)}</b></div>
        <div class="box"><span>Lotes producidos</span><b>${qtyFmt(p.batches)}</b></div>
        <div class="box"><span>Cantidad total producida</span><b>${qtyFmt(p.totalQuantity)} ${esc(p.unit)}</b></div>
        <div class="box"><span>Rendimiento por lote</span><b>${qtyFmt(p.yieldPerBatch)} ${esc(p.unit)}</b></div>
        <div class="box"><span>Costo por lote</span><b>${money(p.batchCost)}</b></div>
        <div class="box"><span>Costo total de producción</span><b>${money(p.totalCost)}</b></div>
        <div class="box"><span>Costo unitario</span><b>${money(p.unitCost)} / ${esc(p.unit)}</b></div>
        <div class="box"><span>Observaciones</span><b>${esc(p.notes || "—")}</b></div>
      </div>
      <table>
        <thead><tr>
          <th>Ingrediente consumido</th><th>Unidad</th>
          <th class="r">Cant. x lote</th><th class="r">Cant. total</th>
          <th class="r">Costo unitario</th><th class="r">Costo total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th colspan="5" class="r">Costo total de producción</th><th class="r">${money(p.totalCost)}</th></tr></tfoot>
      </table>
      <div class="firmas">
        <div class="firma">Elaborado por</div>
        <div class="firma">Revisado por</div>
        <div class="firma">Recibido en bodega</div>
      </div>
    </body></html>`,
    "Comprobante de producción",
  );
}

/* ─────────────────────── Historial de producción ─────────────────────── */

export type ProductionEntryRow = {
  id: string;
  business_date: string;
  recipe_id: string | null;
  recipe_code: string | null;
  recipe_name: string;
  batches: number;
  total_quantity: number;
  unit: string;
  total_cost: number;
  unit_cost: number;
  shift: string;
  notes: string | null;
  created_by_email: string | null;
  created_at: string;
};

/** Producciones registradas dentro del rango de fechas (hora Ecuador). */
export async function loadProductionEntries(from: string, to: string) {
  const { data, error } = await supabase
    .from("production_entries")
    .select(
      "id, business_date, recipe_id, recipe_code, recipe_name, batches, total_quantity, unit, total_cost, unit_cost, shift, notes, created_by_email, created_at",
    )
    .gte("business_date", from)
    .lte("business_date", to)
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProductionEntryRow[];
}

/**
 * Anula una producción: devuelve los ingredientes al inventario y retira del
 * stock la subreceta elaborada. Queda como si nunca se hubiera registrado.
 */
export async function deleteProductionEntry(entryId: string) {
  const { error } = await supabase.rpc("delete_production_entry", { _entry_id: entryId });
  if (error) throw new Error(error.message);
}

/** Corrige una producción: deshace la anterior y vuelve a registrarla con los datos nuevos. */
export async function editProductionEntry(opts: {
  entryId: string;
  recipe: SubRecipe;
  batches: number;
  shift: string;
  notes?: string;
  responsable: string;
  userId?: string | null;
  businessDate: string;
}) {
  await deleteProductionEntry(opts.entryId);
  return registerProduction(opts);
}
