import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Printer, Save, Trash2, Utensils } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { currency } from "@/lib/pos";
import { useCompany } from "@/hooks/useCompany";
import { useRole } from "@/hooks/useRole";

import { fmtQty, round2, round6, type Item } from "@/components/admin/purchasing";
import { INVENTORY_UNITS, recipeFor, unitLabel } from "@/lib/units";
import { ensureSubrecipeItem, type SubRecipe } from "@/lib/production";
import { printRecipeList, printRecipesFull, type RecipePrintRow } from "@/lib/recipe-print";


const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

type Product = { id: string; code: string | null; name: string; price: number; available: boolean };

export type Recipe = {
  id: string;
  code: string | null;
  product_id: string | null;
  name: string;
  /** "plato" = receta base del producto · "variante" = receta alternativa del mismo producto. */
  kind: "plato" | "subreceta" | "variante";
  yield_quantity: number;
  yield_unit: string;
  suggested_net_price: number | null;
  inventory_item_id: string | null;
  /** Solo variantes: precio de venta propio (con IVA incluido). */
  sale_price?: number | null;
  /** Solo variantes: nombre visible en la venta. */
  variant_name?: string | null;
  created_at: string;
};

/** Orígenes posibles de un insumo: inventario, subreceta u otra receta/plato. */
export type SourceType = "item" | "subreceta" | "receta";

type Line = {
  key: string;
  source_type: SourceType;
  source_id: string;
  name: string;
  unit: string;
  quantity: string;
  unit_cost: number;
};

const pct = (n: number) =>
  `${new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} %`;
/** Costo unitario con 2 decimales fijos. */
const costUnit = (n: number) =>
  `$${new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)}`;
const fechaEC = (iso: string) =>
  new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

/** Costo neto por unidad de receta del ítem, tomado de la última compra registrada. */
export const itemRecipeCost = (i: Item) => {
  const direct = Number(i.cost_per_recipe_unit) || 0;
  if (direct > 0) return direct;
  const factor = Number(i.inventory_to_recipe) || 1;
  return round6((Number(i.unit_cost) || 0) / (factor || 1));
};

export function FinalRecipesScreen() {
  const { company } = useCompany();
  const { isSuperAdmin } = useRole();
  /** Solo el Super Administrador / Propietario crea o edita recetas y subrecetas. */
  const editable = isSuperAdmin;
  const ivaRate = Number(company?.iva_rate ?? 15);

  const [tab, setTab] = useState<"subrecetas" | "platos">("platos");
  const subMode = tab === "subrecetas";

  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [subCosts, setSubCosts] = useState<Record<string, number>>({});

  const [productId, setProductId] = useState("");

  const [lines, setLines] = useState<Line[]>([]);
  const [suggested, setSuggested] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Alta rápida de subrecetas reutilizables (se costean con sus propios insumos).
  const [subId, setSubId] = useState("");
  const [subName, setSubName] = useState("");
  const [subYield, setSubYield] = useState("1000");
  const [subUnit, setSubUnit] = useState("gramo");

  const loadCatalogs = useCallback(async () => {
    const [prodRes, itemRes, recRes] = await Promise.all([
      supabase.from("products").select("id, code, name, price, available").order("name"),
      supabase.from("inventory_items").select("*").eq("active", true).order("name"),
      supabase.from("recipes").select("*").order("name"),
    ]);
    setProducts(((prodRes.data ?? []) as Product[]).filter((p) => p.available));
    setItems((itemRes.data ?? []) as unknown as Item[]);
    const recs = (recRes.data ?? []) as unknown as Recipe[];
    setRecipes(recs);

    if (recs.length) {
      const { data } = await supabase
        .from("recipe_items")
        .select("recipe_id, subtotal")
        .in(
          "recipe_id",
          recs.map((s) => s.id),
        );
      const tot: Record<string, number> = {};
      for (const row of data ?? []) {
        const id = row.recipe_id as string;
        tot[id] = (tot[id] ?? 0) + (Number(row.subtotal) || 0);
      }
      setTotals(tot);
      const map: Record<string, number> = {};
      for (const s of recs) {
        const y = Number(s.yield_quantity) || 1;
        map[s.id] = round6((tot[s.id] ?? 0) / (y || 1));
      }
      setSubCosts(map);
    } else {
      setTotals({});
      setSubCosts({});
    }
  }, []);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  const currentRecipe = useMemo(() => {
    if (subMode) return recipes.find((r) => r.id === subId) ?? null;
    return recipes.find((r) => r.product_id === productId && r.kind === "plato") ?? null;
  }, [recipes, productId, subMode, subId]);


  /** Carga los ingredientes guardados de la receta seleccionada. */
  const loadLines = useCallback(async (recipeId: string | null) => {
    if (!recipeId) return setLines([]);
    const { data } = await supabase
      .from("recipe_items")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("sort_order");
    setLines(
      (data ?? []).map((r, idx) => ({
        key: `${r.id}-${idx}`,
        source_type: (r.source_type as SourceType) ?? "item",
        source_id: (r.source_type === "item" ? r.item_id : r.sub_recipe_id) ?? "",
        name: r.name as string,
        unit: (r.unit as string) ?? "",
        quantity: String(Number(r.quantity) || 0),
        unit_cost: Number(r.unit_cost) || 0,
      })),
    );
  }, []);

  useEffect(() => {
    loadLines(currentRecipe?.id ?? null);
    setSuggested(
      currentRecipe?.suggested_net_price != null ? String(currentRecipe.suggested_net_price) : "",
    );
  }, [currentRecipe?.id, loadLines]);

  const product = products.find((p) => p.id === productId) ?? null;
  const priceTotal = Number(product?.price) || 0;

  const netPrice = round2(priceTotal / (1 + ivaRate / 100));
  const ivaAmount = round2(priceTotal - netPrice);

  const costOf = useCallback(
    (type: SourceType, id: string) => {
      if (type === "item") {
        const it = items.find((i) => i.id === id);
        return it ? itemRecipeCost(it) : 0;
      }
      return subCosts[id] ?? 0;
    },
    [items, subCosts],
  );

  const unitOf = useCallback(
    (type: SourceType, id: string) => {
      if (type === "item") return items.find((i) => i.id === id)?.recipe_unit ?? "";
      if (type === "receta") return "unidad";
      return recipes.find((r) => r.id === id)?.yield_unit ?? "";
    },
    [items, recipes],
  );

  /**
   * Unidades disponibles para cada línea con su costo unitario convertido.
   * Ejemplo: arroz $1.20/kilo → en gramos muestra $0.0012/gramo.
   */
  const unitChoices = useCallback(
    (type: SourceType, id: string) => {
      // Recetas de platos: siempre por unidad (porción/plato), sin conversión.
      if (type === "receta") {
        const r = recipes.find((x) => x.id === id);
        if (!r) return [] as { value: string; label: string; cost: number }[];
        return [{ value: "unidad", label: "Unidad (porción)", cost: subCosts[id] ?? 0 }];
      }
      if (type !== "item") {
        const r = recipes.find((x) => x.id === id);
        if (!r) return [] as { value: string; label: string; cost: number }[];
        const base = subCosts[id] ?? 0;
        const { recipeUnit, factor } = recipeFor(r.yield_unit);
        const opts = [
          {
            value: r.yield_unit,
            label: `${unitLabel(r.yield_unit)} (inventario)`,
            cost: base,
          },
        ];
        if (recipeUnit && recipeUnit !== r.yield_unit) {
          opts.push({
            value: recipeUnit,
            label: `${unitLabel(recipeUnit)} (receta)`,
            cost: round6(base / (factor || 1)),
          });
        }
        return opts;
      }

      const it = items.find((i) => i.id === id);
      if (!it) return [] as { value: string; label: string; cost: number }[];
      const factor = Number(it.inventory_to_recipe) || 1;
      const recipeCost = itemRecipeCost(it);
      const invCost = round6(recipeCost * (factor || 1));
      const opts = [
        { value: it.unit, label: `${unitLabel(it.unit)} (inventario)`, cost: invCost },
      ];
      if (it.recipe_unit && it.recipe_unit !== it.unit) {
        opts.push({
          value: it.recipe_unit,
          label: `${unitLabel(it.recipe_unit)} (receta)`,
          cost: recipeCost,
        });
      }
      return opts;
    },
    [items, recipes, subCosts],
  );

  const nameOf = useCallback(
    (type: SourceType, id: string) => {
      if (type === "item") {
        const it = items.find((i) => i.id === id);
        return it ? `${it.code ? `${it.code} · ` : ""}${it.name}` : "";
      }
      return recipes.find((r) => r.id === id)?.name ?? "";
    },
    [items, recipes],
  );

  const addLine = () =>
    setLines((p) => [
      ...p,
      {
        key: `n-${Date.now()}-${p.length}`,
        source_type: "item",
        source_id: "",
        name: "",
        unit: "",
        quantity: "",
        unit_cost: 0,
      },
    ]);

  const setSource = (key: string, type: SourceType, id: string) =>
    setLines((p) =>
      p.map((l) => {
        if (l.key !== key) return l;
        const choices = unitChoices(type, id);
        const pick = choices[choices.length - 1];
        return {
          ...l,
          source_type: type,
          source_id: id,
          name: nameOf(type, id),
          unit: pick?.value ?? unitOf(type, id),
          unit_cost: pick?.cost ?? costOf(type, id),
        };
      }),
    );

  /** Cambia la unidad a usar en la línea y recalcula el costo unitario convertido. */
  const setLineUnit = (key: string, unit: string) =>
    setLines((p) =>
      p.map((l) => {
        if (l.key !== key) return l;
        const choice = unitChoices(l.source_type, l.source_id).find((c) => c.value === unit);
        return { ...l, unit, unit_cost: choice?.cost ?? l.unit_cost };
      }),
    );


  const totalCost = round2(
    lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * l.unit_cost, 0),
  );

  const suggestedNet = Number(suggested) > 0 ? Number(suggested) : null;
  const baseNet = subMode ? 0 : (suggestedNet ?? netPrice);
  const costPct = baseNet > 0 ? (totalCost / baseNet) * 100 : 0;
  const margin = round2(baseNet - totalCost);
  const marginPct = baseNet > 0 ? (margin / baseNet) * 100 : 0;

  const resetSubForm = () => {
    setSubId("");
    setSubName("");
    setSubYield("1000");
    setSubUnit("gramo");
    setLines([]);
  };

  const selectSub = (r: Recipe) => {
    setSubId(r.id);
    setSubName(r.name);
    setSubYield(String(r.yield_quantity ?? 1000));
    setSubUnit(r.yield_unit ?? "gramo");
  };




  const save = async () => {
    if (subMode && !subName.trim() && !currentRecipe) return toast.error("Nombra la subreceta");
    if (!subMode && !productId) return toast.error("Selecciona un plato del menú");


    const valid = lines.filter((l) => l.source_id && Number(l.quantity) > 0);
    if (!valid.length) return toast.error("Agrega al menos un insumo con cantidad");

    // Única regla de duplicados: el mismo insumo no puede repetirse en la misma receta.
    const seen = new Set<string>();
    for (const l of valid) {
      const key = `${l.source_type}:${l.source_id}`;
      if (seen.has(key)) return toast.error(`El insumo "${l.name}" está repetido en la receta`);
      seen.add(key);
    }
    // Una receta no puede contenerse a sí misma.
    if (currentRecipe && valid.some((l) => l.source_id === currentRecipe.id)) {
      return toast.error("Una receta no puede incluirse a sí misma como insumo");
    }

    setSaving(true);
    try {
      let recipeId = currentRecipe?.id ?? null;
      const payload: {
        name: string;
        kind: string;
        product_id: string | null;
        yield_quantity?: number;
        yield_unit?: string;
        suggested_net_price?: number | null;
        sale_price?: number | null;
        variant_name?: string | null;
      } = subMode
        ? {
            name: subName.trim() || currentRecipe?.name || "Subreceta",
            kind: "subreceta",
            yield_quantity: Number(subYield) || 1,
            yield_unit: subUnit,
            product_id: null,
          }
        : {
            name: product?.name ?? "Receta",
            kind: "plato",
            product_id: productId,
            suggested_net_price: suggestedNet,
          };

      // El plato solo admite una receta base: si ya existe, se actualiza en vez de insertar.
      if (!recipeId && !subMode && productId) {

        const { data: existing } = await supabase
          .from("recipes")
          .select("id")
          .eq("product_id", productId)
          .eq("kind", "plato")
          .maybeSingle();
        if (existing?.id) recipeId = existing.id as string;
      }

      if (recipeId) {
        const { error } = await supabase.from("recipes").update(payload).eq("id", recipeId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase.from("recipes").insert(payload).select("*").single();
        if (error) throw new Error(error.message);
        recipeId = data.id as string;
      }


      await supabase.from("recipe_items").delete().eq("recipe_id", recipeId);
      const { error: insErr } = await supabase.from("recipe_items").insert(
        valid.map((l, idx) => ({
          recipe_id: recipeId,
          source_type: l.source_type,
          item_id: l.source_type === "item" ? l.source_id : null,
          sub_recipe_id: l.source_type === "item" ? null : l.source_id,
          name: l.name,
          unit: l.unit,
          quantity: Number(l.quantity),
          unit_cost: l.unit_cost,
          subtotal: round2((Number(l.quantity) || 0) * l.unit_cost),
          sort_order: idx,
        })),
      );
      if (insErr) throw new Error(insErr.message);

      // La subreceta necesita su ítem espejo en inventario para el ingreso de producción.
      if (subMode && recipeId) {
        const { data: saved } = await supabase
          .from("recipes")
          .select("id, code, name, kind, yield_quantity, yield_unit, inventory_item_id")
          .eq("id", recipeId)
          .single();
        if (saved) await ensureSubrecipeItem(saved as unknown as SubRecipe);
      }

      toast.success("Receta guardada");
      await loadCatalogs();
      if (subMode && recipeId) setSubId(recipeId);

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la receta");
    } finally {
      setSaving(false);
    }
  };

  const subRecipes = recipes.filter((r) => r.kind === "subreceta");
  const dishRecipes = recipes.filter((r) => r.kind === "plato");
  const q = search.trim().toLowerCase();
  const filteredSubs = subRecipes.filter(
    (r) => !q || r.name.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q),
  );
  const filteredDishes = dishRecipes.filter(
    (r) => !q || r.name.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q),
  );

  /** Filas listas para las vistas de impresión (precio neto, costo y contribución). */
  const printRows = (withLines: Record<string, RecipePrintRow["lines"]> = {}): RecipePrintRow[] =>
    filteredDishes.map((r) => {
      const prod = products.find((p) => p.id === r.product_id);
      const net = r.suggested_net_price ?? round2((Number(prod?.price) || 0) / (1 + ivaRate / 100));
      return {
        code: prod?.code ?? r.code ?? "—",
        name: r.name,
        net,
        cost: round2(totals[r.id] ?? 0),
        date: fechaEC(r.created_at),
        lines: withLines[r.id] ?? [],
      };
    });

  const handlePrintList = () => {
    if (!printRecipeList(printRows(), company?.trade_name))
      toast.error("Permite las ventanas emergentes para ver la vista de impresión");
  };

  const handlePrintFull = async () => {
    if (!filteredDishes.length) return toast.error("No hay recetas para imprimir");
    const { data } = await supabase
      .from("recipe_items")
      .select("recipe_id, item_id, sub_recipe_id, name, quantity, unit, subtotal")
      .in(
        "recipe_id",
        filteredDishes.map((r) => r.id),
      )
      .order("sort_order");
    const map: Record<string, RecipePrintRow["lines"]> = {};
    for (const row of data ?? []) {
      const id = row.recipe_id as string;
      const code =
        items.find((i) => i.id === row.item_id)?.code ??
        recipes.find((r) => r.id === row.sub_recipe_id)?.code ??
        "";
      (map[id] ??= []).push({
        code,
        name: row.name as string,
        quantity: Number(row.quantity) || 0,
        unit: (row.unit as string) ?? "",
        subtotal: Number(row.subtotal) || 0,
      });
    }
    if (!printRecipesFull(printRows(map), company?.trade_name))
      toast.error("Permite las ventanas emergentes para ver la vista de impresión");
  };


  const composition = (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Composición de la receta</h2>
        {editable && (
          <Button size="sm" variant="outline" onClick={addLine}>
            <Plus className="mr-2 size-4" /> Agregar insumo
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-secondary/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Origen</th>
              <th className="px-3 py-2">Insumo</th>
              <th className="px-3 py-2">Unidad a usar</th>
              <th className="px-3 py-2 text-right">Cantidad necesaria</th>
              <th className="px-3 py-2 text-right">Costo unitario en esa unidad</th>
              <th className="px-3 py-2 text-right">Subtotal neto</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-t border-border">
                <td className="px-3 py-2">
                  <select
                    className={selectClass}
                    value={l.source_type}
                    disabled={!editable}
                    onChange={(e) => setSource(l.key, e.target.value as SourceType, "")}
                  >
                    <option value="item">📦 Ítem de inventario</option>
                    <option value="subreceta">🥘 Subreceta</option>
                    <option value="receta">🍽️ Otra receta</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    className={selectClass}
                    value={l.source_id}
                    disabled={!editable}
                    onChange={(e) => setSource(l.key, l.source_type, e.target.value)}
                  >
                    <option value="">— Selecciona —</option>
                    {l.source_type === "item"
                      ? items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.code ? `${i.code} · ` : ""}
                            {i.name}
                          </option>
                        ))
                      : (l.source_type === "subreceta" ? subRecipes : dishRecipes)
                          .filter((r) => r.id !== currentRecipe?.id)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.code ? `${r.code} · ` : ""}
                              {r.name}
                            </option>
                          ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    className={selectClass}
                    value={l.unit}
                    disabled={!editable || !l.source_id || l.source_type === "receta"}
                    onChange={(e) => setLineUnit(l.key, e.target.value)}
                  >
                    {unitChoices(l.source_type, l.source_id).length === 0 && (
                      <option value="">—</option>
                    )}
                    {unitChoices(l.source_type, l.source_id).map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <Input
                    type="number"
                    min="0"
                    step="0.000001"
                    className="h-9 w-32 text-right"
                    value={l.quantity}
                    readOnly={!editable}
                    disabled={!editable}
                    onChange={(e) =>
                      setLines((p) =>
                        p.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  {costUnit(l.unit_cost)}
                  <span className="ml-1 text-xs text-muted-foreground">
                    / {unitLabel(l.unit || "")}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  {currency(round2((Number(l.quantity) || 0) * l.unit_cost))}
                </td>
                <td className="px-3 py-2 text-right">
                  {editable && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Agrega los insumos que componen la receta.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-secondary/40">
              <td colSpan={5} className="px-3 py-2 text-right font-semibold">
                Costo total neto de la receta
              </td>
              <td className="px-3 py-2 text-right font-semibold">{currency(totalCost)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  const summary = (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 font-display text-lg font-semibold">Resumen de cálculos</h2>
      {subMode ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Costo total del lote" value={currency(totalCost)} />
          <Metric
            label="Rendimiento por lote"
            value={`${fmtQty(Number(subYield) || 0)} ${unitLabel(subUnit)}`}
          />
          <Metric
            label="Costo unitario"
            value={`${currency(round6(totalCost / (Number(subYield) || 1)))} / ${unitLabel(subUnit)}`}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Precio de venta neto" value={currency(baseNet)} />
          <Metric label="Costo total neto" value={currency(totalCost)} />
          <Metric label="Porcentaje de costo" value={pct(costPct)} />
          <Metric label="Margen de contribución" value={currency(margin)} />
          <Metric label="% margen de contribución" value={pct(marginPct)} />
        </div>
      )}
      {!subMode && (
        <div className="mt-4 max-w-xs">
          <Label>Precio de venta neto sugerido (opcional)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder={String(netPrice)}
            value={suggested}
            readOnly={!editable}
            disabled={!editable}
            onChange={(e) => setSuggested(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Al modificarlo se recalculan los porcentajes de costo y margen.
          </p>
        </div>
      )}
      {editable && (
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 size-4" />
            {saving ? "Guardando…" : subMode ? "Guardar subreceta" : "Guardar receta"}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "subrecetas" | "platos")}
      className="space-y-4"
    >
      <TabsList>
        <TabsTrigger value="subrecetas">Subrecetas</TabsTrigger>
        <TabsTrigger value="platos">Recetas de platos</TabsTrigger>
      </TabsList>

      {!editable && (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
          Modo consulta: las recetas y subrecetas solo pueden crearse o modificarse por el Super
          Administrador / Propietario.
        </p>
      )}

      {/* ───────────────────────── Subrecetas ───────────────────────── */}
      <TabsContent value="subrecetas" className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">
              {editable ? (subId ? "Editar subreceta" : "Nueva subreceta") : "Subreceta"}
            </h2>
            {subId && editable && (
              <Button size="sm" variant="outline" onClick={resetSubForm}>
                <Plus className="mr-2 size-4" /> Nueva subreceta
              </Button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={subName}
                readOnly={!editable}
                disabled={!editable}
                onChange={(e) => setSubName(e.target.value)}
              />
            </div>
            <div>
              <Label>Rendimiento por lote</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={subYield}
                readOnly={!editable}
                disabled={!editable}
                onChange={(e) => setSubYield(e.target.value)}
              />
            </div>
            <div>
              <Label>Unidad de inventario</Label>
              <select
                className={selectClass}
                value={subUnit}
                disabled={!editable}
                onChange={(e) => setSubUnit(e.target.value)}
              >
                {INVENTORY_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Código</Label>
              <div className="flex h-10 items-center px-1 font-semibold">
                {(subMode ? currentRecipe?.code : (product?.code ?? currentRecipe?.code)) ??
                  "Automático"}
              </div>
            </div>
          </div>
        </div>

        {composition}
        {summary}

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">
              Subrecetas creadas ({subRecipes.length})
            </h2>
            <Input
              placeholder="Buscar por código o nombre…"
              className="h-9 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-secondary/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2 text-right">Rendimiento</th>
                  <th className="px-3 py-2">Unidad de inventario</th>
                  <th className="px-3 py-2 text-right">Costo unitario</th>
                  <th className="px-3 py-2">Creada</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{r.code ?? "—"}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 text-right">{fmtQty(Number(r.yield_quantity))}</td>
                    <td className="px-3 py-2">{unitLabel(r.yield_unit)}</td>
                    <td className="px-3 py-2 text-right">{currency(subCosts[r.id] ?? 0)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fechaEC(r.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => selectSub(r)}>
                        Revisar
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredSubs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      Todavía no hay subrecetas creadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </TabsContent>

      {/* ─────────────────────── Recetas de platos ─────────────────────── */}
      <TabsContent value="platos" className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Seleccionar receta / plato</Label>
              <select
                className={selectClass}
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">— Selecciona un producto del menú —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} · ` : ""}
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Precio total (con IVA)</Label>
              <div className="flex h-10 items-center px-1 font-semibold">
                {currency(priceTotal)}
              </div>
            </div>
            <div>
              <Label>Desglose</Label>
              <div className="flex h-10 items-center px-1 text-sm">
                Neto {currency(netPrice)} + IVA {currency(ivaAmount)} ({ivaRate}%)
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Las recetas se crean una sola vez aquí. Para ofrecer recetas alternativas dentro de un
            producto, apúntalas como variantes desde la ficha del producto en el Menú.
          </p>

        </div>


        {composition}
        {summary}

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">
              Recetas de platos creadas ({dishRecipes.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={handlePrintList}>
                <Printer className="mr-2 size-4" /> Imprimir listado
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrintFull}>
                <Printer className="mr-2 size-4" /> Imprimir recetas completas
              </Button>
              <Input
                placeholder="Buscar por código o nombre…"
                className="h-9 w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead className="bg-secondary/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Plato</th>
                  <th className="px-3 py-2 text-right">Precio neto</th>
                  <th className="px-3 py-2 text-right">Costo total</th>
                  <th className="px-3 py-2 text-right">% costo</th>
                  <th className="px-3 py-2 text-right">Contribución</th>
                  <th className="px-3 py-2 text-right">% contribución</th>
                  <th className="px-3 py-2">Creada</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredDishes.map((r) => {
                  const prod = products.find((p) => p.id === r.product_id);
                  const net =
                    r.suggested_net_price ??
                    round2((Number(prod?.price) || 0) / (1 + ivaRate / 100));
                  const cost = round2(totals[r.id] ?? 0);
                  const contribucion = round2(net - cost);
                  return (
                    <tr key={r.id} className="border-t border-border">
                      {/* Código de VENTA del producto: fijo, la receta solo se asocia a él. */}
                      <td className="px-3 py-2 font-medium">{prod?.code ?? r.code ?? "—"}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-right">{currency(net)}</td>
                      <td className="px-3 py-2 text-right">{currency(cost)}</td>
                      <td className="px-3 py-2 text-right">
                        {net > 0 ? pct((cost / net) * 100) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{currency(contribucion)}</td>
                      <td className="px-3 py-2 text-right">
                        {net > 0 ? pct((contribucion / net) * 100) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{fechaEC(r.created_at)}</td>

                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!r.product_id}
                          onClick={() => setProductId(r.product_id ?? "")}
                        >
                          Revisar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filteredDishes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                      Todavía no hay recetas de platos creadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </TabsContent>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Utensils className="size-3.5" />
        Los costos unitarios provienen del valor neto de la última compra registrada: {
          items.length
        }{" "}
        insumos disponibles.
      </p>
    </Tabs>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
