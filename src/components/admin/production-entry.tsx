import { useCallback, useEffect, useMemo, useState } from "react";
import { Factory, Pencil, Printer, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currency } from "@/lib/pos";
import { fmtQty } from "@/components/admin/purchasing";
import { unitLabel } from "@/lib/units";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { ecBusinessDate } from "@/lib/caja";
import { checkAndNotifyLowStock } from "@/lib/notifications.functions";
import {
  SHIFTS,
  deleteProductionEntry,
  editProductionEntry,
  loadProductionEntries,
  printProductionVoucher,
  registerProduction,
  round2,
  round6,
  type ProductionEntryRow,
  type ProductionResult,
  type SubRecipe,
} from "@/lib/production";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

const hoyEC = () => ecBusinessDate(new Date());
const fechaCorta = (d: string) => d.split("-").reverse().join("/");
const confirmDialog = (msg: string) =>
  typeof window === "undefined" ? false : window.confirm(msg);

type IngredientPreview = {
  name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
};

export function ProductionEntryScreen() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const checkStock = useServerFn(checkAndNotifyLowStock);
  const [subs, setSubs] = useState<SubRecipe[]>([]);
  const [recipeId, setRecipeId] = useState("");
  const [batches, setBatches] = useState("1");
  const [shift, setShift] = useState<string>(SHIFTS[0]);
  const [responsable, setResponsable] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(hoyEC());
  const [editId, setEditId] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<IngredientPreview[]>([]);
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<ProductionResult | null>(null);
  const [from, setFrom] = useState(hoyEC());
  const [to, setTo] = useState(hoyEC());
  const [history, setHistory] = useState<ProductionEntryRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  useEffect(() => {
    if (!responsable && user?.email) setResponsable(user.email);
  }, [user?.email, responsable]);

  const loadHistory = useCallback(async () => {
    setLoadingHist(true);
    try {
      setHistory(await loadProductionEntries(from, to));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el historial");
    } finally {
      setLoadingHist(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);


  const loadSubs = useCallback(async () => {
    const { data } = await supabase
      .from("recipes")
      .select("id, code, name, kind, yield_quantity, yield_unit, inventory_item_id, created_at")
      .eq("kind", "subreceta")
      .order("name");
    setSubs((data ?? []) as unknown as SubRecipe[]);
  }, []);

  useEffect(() => {
    loadSubs();
  }, [loadSubs]);

  const recipe = subs.find((s) => s.id === recipeId) ?? null;

  useEffect(() => {
    if (!recipeId) return setIngredients([]);
    (async () => {
      const { data } = await supabase
        .from("recipe_items")
        .select("name, unit, quantity, unit_cost")
        .eq("recipe_id", recipeId)
        .order("sort_order");
      setIngredients((data ?? []) as unknown as IngredientPreview[]);
    })();
  }, [recipeId]);

  const n = Math.max(0, Number(batches) || 0);
  const batchCost = round2(
    ingredients.reduce((acc, i) => acc + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0),
  );
  const totalQuantity = round6((Number(recipe?.yield_quantity) || 0) * n);
  const totalCost = round2(batchCost * n);
  const unitCost = totalQuantity > 0 ? round6(totalCost / totalQuantity) : 0;

  const canSave = useMemo(
    () => Boolean(recipe && n > 0 && ingredients.length > 0 && responsable.trim()),
    [recipe, n, ingredients.length, responsable],
  );

  const resetForm = () => {
    setEditId(null);
    setBatches("1");
    setNotes("");
    setDate(hoyEC());
  };

  const confirm = async () => {
    if (!recipe) return toast.error("Selecciona una subreceta");
    if (!(n > 0)) return toast.error("Ingresa el número de producciones");
    if (!responsable.trim()) return toast.error("Indica el responsable");
    setSaving(true);
    try {
      const payload = {
        recipe,
        batches: n,
        shift,
        notes,
        responsable: responsable.trim(),
        userId: user?.id ?? null,
        businessDate: date,
      };
      const res = editId
        ? await editProductionEntry({ ...payload, entryId: editId })
        : await registerProduction(payload);
      setLast(res);
      const affectedIds = res.lines.map((l) => l.item_id).filter(Boolean) as string[];
      if (affectedIds.length > 0) {
        checkStock({ data: { itemIds: affectedIds } }).catch(() => undefined);
      }
      toast.success(
        editId
          ? "Producción corregida: el inventario se recalculó"
          : "Producción registrada e ingresada al inventario",
      );
      resetForm();
      await loadSubs();
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la producción");
    } finally {
      setSaving(false);
    }
  };

  /** Carga una producción del historial en el formulario para corregirla. */
  const startEdit = (row: ProductionEntryRow) => {
    if (!row.recipe_id) return toast.error("Esta producción no tiene subreceta asociada");
    setEditId(row.id);
    setRecipeId(row.recipe_id);
    setBatches(String(row.batches));
    setShift(row.shift || SHIFTS[0]);
    setNotes(row.notes ?? "");
    setDate(row.business_date);
    if (row.created_by_email) setResponsable(row.created_by_email);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Anula la producción: devuelve insumos y retira la subreceta elaborada. */
  const removeEntry = async (row: ProductionEntryRow) => {
    if (
      !confirmDialog(
        `¿Eliminar la producción de ${row.recipe_name} del ${fechaCorta(row.business_date)}? Los insumos vuelven al inventario y la subreceta producida sale del stock.`,
      )
    )
      return;
    try {
      await deleteProductionEntry(row.id);
      toast.success("Producción eliminada: el inventario volvió a su estado anterior");
      if (editId === row.id) resetForm();
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar la producción");
    }
  };


  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">
            {editId ? "Corrigiendo producción registrada" : "Datos de la producción"}
          </h2>
          {editId && (
            <Button size="sm" variant="ghost" onClick={resetForm}>
              <X className="mr-1 size-4" /> Cancelar corrección
            </Button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-4">

          <div className="md:col-span-2">
            <Label>Subreceta a producir</Label>
            <select
              className={selectClass}
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
            >
              <option value="">— Selecciona una subreceta —</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} · ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Número de producciones (lotes)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={batches}
              onChange={(e) => setBatches(e.target.value)}
            />
          </div>
          <div>
            <Label>Turno</Label>
            <select className={selectClass} value={shift} onChange={(e) => setShift(e.target.value)}>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Responsable</Label>
            <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} />
          </div>
          <div>
            <Label>Fecha de producción</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Observaciones</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Cantidad total producida"
          value={`${fmtQty(totalQuantity)} ${unitLabel(recipe?.yield_unit ?? "")}`}
        />
        <Metric label="Costo por lote" value={currency(batchCost)} />
        <Metric label="Costo total" value={currency(totalCost)} />
        <Metric
          label="Costo unitario"
          value={`${currency(unitCost)} / ${unitLabel(recipe?.yield_unit ?? "")}`}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 font-display text-lg font-semibold">
          Insumos que se descontarán del inventario
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Insumo</th>
                <th className="px-3 py-2">Unidad</th>
                <th className="px-3 py-2 text-right">Cantidad por lote</th>
                <th className="px-3 py-2 text-right">Cantidad total</th>
                <th className="px-3 py-2 text-right">Costo unitario</th>
                <th className="px-3 py-2 text-right">Costo total</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((i, idx) => (
                <tr key={`${i.name}-${idx}`} className="border-t border-border">
                  <td className="px-3 py-2">{i.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{unitLabel(i.unit)}</td>
                  <td className="px-3 py-2 text-right">{fmtQty(Number(i.quantity) || 0)}</td>
                  <td className="px-3 py-2 text-right">
                    {fmtQty(round6((Number(i.quantity) || 0) * n))}
                  </td>
                  <td className="px-3 py-2 text-right">{currency(Number(i.unit_cost) || 0)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {currency(round2((Number(i.quantity) || 0) * n * (Number(i.unit_cost) || 0)))}
                  </td>
                </tr>
              ))}
              {ingredients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Selecciona una subreceta con ingredientes registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {last && (
            <Button variant="outline" onClick={() => printProductionVoucher(last)}>
              <Printer className="mr-2 size-4" /> Imprimir comprobante
            </Button>
          )}
          <Button onClick={confirm} disabled={!canSave || saving}>
            <Save className="mr-2 size-4" />
            {saving
              ? "Guardando…"
              : editId
                ? "Guardar corrección"
                : "Confirmar producción"}
          </Button>

        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Factory className="size-3.5" />
        Al confirmar: los insumos salen como VENTA y la subreceta terminada entra al
        inventario como ENTRADA POR PRODUCCIÓN, con su código, unidad y costo unitario calculado.
      </p>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Historial de producción</h2>
            <p className="text-xs text-muted-foreground">
              Muestra el día de hoy; elige un rango para revisar días anteriores.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button variant="outline" onClick={loadHistory} disabled={loadingHist}>
              {loadingHist ? "Cargando…" : "Actualizar"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Subreceta</th>
                <th className="px-3 py-2 text-right">Lotes</th>
                <th className="px-3 py-2 text-right">Cantidad producida</th>
                <th className="px-3 py-2 text-right">Costo total</th>
                <th className="px-3 py-2">Turno</th>
                <th className="px-3 py-2">Usuario</th>
                {isAdmin && <th className="px-3 py-2 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-border">
                  <td className="px-3 py-2">{fechaCorta(h.business_date)}</td>
                  <td className="px-3 py-2">
                    {h.recipe_code ? `${h.recipe_code} · ` : ""}
                    {h.recipe_name}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtQty(Number(h.batches) || 0)}</td>
                  <td className="px-3 py-2 text-right">
                    {fmtQty(Number(h.total_quantity) || 0)} {unitLabel(h.unit)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {currency(Number(h.total_cost) || 0)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{h.shift}</td>
                  <td className="px-3 py-2 text-muted-foreground">{h.created_by_email ?? "—"}</td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => startEdit(h)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => removeEntry(h)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 8 : 7}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    {loadingHist ? "Cargando…" : "No hay producciones registradas en este rango."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {isAdmin && (
          <p className="mt-3 text-xs text-muted-foreground">
            Al corregir se deshace la producción anterior y se aplica la nueva; al eliminar los
            insumos vuelven al inventario y la subreceta producida sale del stock.
          </p>
        )}
      </div>


    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
