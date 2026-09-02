import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { montoEC } from "@/lib/costeaExcel";
import { fechaEc } from "@/lib/fecha-ec";
import {
  IVA_RATE,
  addExpense,
  addGroup,
  addLineItem,
  deleteExpense,
  deleteGroup,
  deleteLineItem,
  groupItems,
  isPercentGroup,
  ivaDe,
  lineAmount,
  loadExpenses,
  loadGroups,
  loadLineItems,
  loadPyg,
  renameGroup,
  renameLineItem,
  updateExpense,
  type ExpenseRow,
  type Group,
  type GroupKind,
  type LineItem,
} from "@/lib/pyg";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const hoyEC = () => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const [y, m] = p.split("-");
  return { year: Number(y), month: Number(m) };
};

type Borrador = {
  id: string | null;
  line_key: string;
  expense_date: string;
  invoice_number: string;
  supplier_name: string;
  base_amount: string;
  iva_rate: string;
};

const nuevoBorrador = (year: number, month: number): Borrador => ({
  id: null,
  line_key: "",
  expense_date: `${year}-${String(month).padStart(2, "0")}-01`,
  invoice_number: "",
  supplier_name: "",
  base_amount: "",
  iva_rate: String(IVA_RATE),
});

export function GastosGeneralesPanel() {
  const inicial = hoyEC();
  const [year, setYear] = useState(inicial.year);
  const [month, setMonth] = useState(inicial.month);
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [gastos, setGastos] = useState<ExpenseRow[]>([]);
  const [ventasBrutas, setVentasBrutas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // alta de grupo y de rubro
  const [nombreGrupo, setNombreGrupo] = useState("");
  const [tipoGrupo, setTipoGrupo] = useState<GroupKind>("fijo");
  const [nuevosRubros, setNuevosRubros] = useState<Record<string, string>>({});

  const [form, setForm] = useState<Borrador>(nuevoBorrador(inicial.year, inicial.month));

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [grupos, catalogo, filas, pyg] = await Promise.all([
        loadGroups(),
        loadLineItems(),
        loadExpenses(year, month),
        loadPyg(year, month),
      ]);
      setGroups(grupos);
      setItems(catalogo);
      setGastos(filas);
      setVentasBrutas(pyg.ventasBrutas);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar los gastos");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setForm(nuevoBorrador(year, month));
  }, [year, month]);

  const porGrupo = useMemo(() => groupItems(groups, items), [groups, items]);
  const grupoDe = useCallback(
    (key: string) => groups.find((g) => g.key === key) ?? null,
    [groups],
  );

  /* --------------------- Pestaña 1: grupos y rubros --------------------- */

  const crearGrupo = async () => {
    const label = nombreGrupo.trim();
    if (!label) {
      toast.error("Escribe el nombre del grupo");
      return;
    }
    try {
      await addGroup(label, tipoGrupo, groups.length + 1);
      setNombreGrupo("");
      setGroups(await loadGroups());
      toast.success("Grupo agregado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar el grupo");
    }
  };

  const renombrarGrupo = async (g: Group, label: string) => {
    const nuevo = label.trim();
    if (!nuevo || nuevo === g.label) return;
    try {
      await renameGroup(g.id, nuevo);
      setGroups((p) => p.map((x) => (x.id === g.id ? { ...x, label: nuevo } : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo renombrar el grupo");
    }
  };

  const eliminarGrupo = async (g: Group) => {
    if (!confirm(`¿Eliminar el grupo "${g.label}" con sus rubros y todos sus gastos?`)) return;
    try {
      await deleteGroup(g);
      setGroups((p) => p.filter((x) => x.id !== g.id));
      setItems((p) => p.filter((i) => i.section !== g.key));
      setGastos((p) => p.filter((x) => x.section !== g.key));
      toast.success("Grupo eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar el grupo");
    }
  };

  const crearRubro = async (g: Group) => {
    const label = (nuevosRubros[g.key] ?? "").trim();
    if (!label) return;
    try {
      await addLineItem(g.key, label, (porGrupo.get(g.key)?.length ?? 0) + 1);
      setNuevosRubros((p) => ({ ...p, [g.key]: "" }));
      setItems(await loadLineItems());
      toast.success("Rubro agregado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar el rubro");
    }
  };

  const renombrar = async (item: LineItem, label: string) => {
    const nuevo = label.trim();
    if (!nuevo || nuevo === item.label) return;
    try {
      await renameLineItem(item.id, nuevo);
      setItems((p) => p.map((i) => (i.id === item.id ? { ...i, label: nuevo } : i)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo renombrar");
    }
  };

  const eliminarRubro = async (item: LineItem) => {
    if (!confirm(`¿Eliminar el rubro "${item.label}" y todos los gastos registrados con él?`)) return;
    try {
      await deleteLineItem(item.id, item.line_key);
      setItems((p) => p.filter((i) => i.id !== item.id));
      setGastos((p) => p.filter((g) => g.line_key !== item.line_key));
      toast.success("Rubro eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  /* --------------------- Pestaña 2: gastos del mes --------------------- */

  const rubroSel = items.find((i) => i.line_key === form.line_key) ?? null;
  const grupoSel = rubroSel ? grupoDe(rubroSel.section) : null;
  const esPorcentual = isPercentGroup(grupoSel);

  const baseNum = Number(form.base_amount) || 0;
  const tasaNum = esPorcentual ? 0 : Number(form.iva_rate) || 0;
  const ivaNum = ivaDe(baseNum, tasaNum);
  const totalNum = baseNum + ivaNum;

  const proveedores = useMemo(
    () => [...new Set(gastos.map((g) => g.supplier_name).filter(Boolean))].sort(),
    [gastos],
  );

  const guardarGasto = async () => {
    if (!rubroSel) {
      toast.error("Selecciona un rubro");
      return;
    }
    if (!Number.isFinite(baseNum) || baseNum === 0) {
      toast.error(esPorcentual ? "Ingresa el porcentaje" : "Ingresa la base imponible");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        item: rubroSel,
        expense_date: fechaEc(form.expense_date),
        invoice_number: form.invoice_number,
        supplier_name: form.supplier_name,
        base_amount: baseNum,
        iva_rate: tasaNum,
      };
      if (form.id) await updateExpense(form.id, year, month, payload);
      else await addExpense(year, month, payload);
      setGastos(await loadExpenses(year, month));
      setForm(nuevoBorrador(year, month));
      toast.success(form.id ? "Gasto actualizado" : "Gasto registrado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el gasto");
    } finally {
      setSaving(false);
    }
  };

  const editarGasto = (g: ExpenseRow) => {
    setForm({
      id: g.id,
      line_key: g.line_key,
      expense_date: g.expense_date,
      invoice_number: g.invoice_number,
      supplier_name: g.supplier_name,
      base_amount: String(g.base_amount),
      iva_rate: String(g.iva_rate),
    });
  };

  const eliminarGasto = async (g: ExpenseRow) => {
    if (!confirm(`¿Eliminar el gasto de ${g.label} por $ ${montoEC(g.amount)}?`)) return;
    try {
      await deleteExpense(g.id);
      setGastos((p) => p.filter((x) => x.id !== g.id));
      if (form.id === g.id) setForm(nuevoBorrador(year, month));
      toast.success("Gasto eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  const totalBase = gastos.reduce((s, g) => s + g.base_amount, 0);
  const totalIva = gastos.reduce((s, g) => s + g.tax_amount, 0);
  const totalGastos = gastos.reduce((s, g) => {
    const pct = isPercentGroup(grupoDe(g.section));
    return s + lineAmount(g.amount, ventasBrutas, pct);
  }, 0);

  const periodo = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        aria-label="Mes"
      >
        {MESES.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <Input
        type="number"
        className="h-9 w-24"
        value={year}
        aria-label="Año"
        onChange={(e) => setYear(Number(e.target.value) || inicial.year)}
      />
      <Button variant="outline" onClick={cargar} disabled={loading}>
        Actualizar
      </Button>
    </div>
  );

  return (
    <Tabs defaultValue="gastos" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="grupos">Grupos y rubros</TabsTrigger>
          <TabsTrigger value="gastos">Ingreso de gastos</TabsTrigger>
        </TabsList>
        {periodo}
      </div>

      {/* ---------------- Pestaña 1 ---------------- */}
      <TabsContent value="grupos" className="space-y-4">
        <Card className="p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Nuevo grupo</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Los grupos son las secciones del P&amp;G. Tipo fijo ($) o porcentual (% sobre ventas).
          </p>
          <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
            <Input
              placeholder="Nombre del grupo"
              value={nombreGrupo}
              onChange={(e) => setNombreGrupo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") crearGrupo();
              }}
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={tipoGrupo}
              onChange={(e) => setTipoGrupo(e.target.value as GroupKind)}
              aria-label="Tipo de grupo"
            >
              <option value="fijo">Fijo $</option>
              <option value="porcentual">Porcentual %</option>
            </select>
            <Button onClick={crearGrupo}>
              <Plus className="mr-1 h-4 w-4" />
              Agregar grupo
            </Button>
          </div>
        </Card>

        <div className="grid gap-3 xl:grid-cols-2">
          {groups.map((g) => {
            const lines = porGrupo.get(g.key) ?? [];
            return (
              <Card key={g.id} className="overflow-hidden">
                <div className="flex items-center gap-2 border-b bg-muted px-3 py-2">
                  <Input
                    className="h-8 font-semibold"
                    defaultValue={g.label}
                    onBlur={(e) => renombrarGrupo(g, e.target.value)}
                    aria-label={`Nombre del grupo ${g.label}`}
                  />
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {g.kind === "porcentual" ? "%" : "$"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => eliminarGrupo(g)}
                    aria-label={`Eliminar grupo ${g.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="divide-y">
                  {lines.length === 0 && (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      Sin rubros. Agrega el primero abajo.
                    </p>
                  )}
                  {lines.map((it) => (
                    <div
                      key={it.id}
                      className="grid grid-cols-[1fr_36px] items-center gap-2 px-3 py-1.5"
                    >
                      <Input
                        className="h-8"
                        defaultValue={it.label}
                        onBlur={(e) => renombrar(it, e.target.value)}
                        aria-label={`Rubro ${it.label}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => eliminarRubro(it)}
                        aria-label={`Eliminar ${it.label}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 border-t px-3 py-2">
                  <Input
                    className="h-8"
                    placeholder="Nombre del nuevo rubro"
                    value={nuevosRubros[g.key] ?? ""}
                    onChange={(e) => setNuevosRubros((p) => ({ ...p, [g.key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") crearRubro(g);
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => crearRubro(g)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Agregar rubro
                  </Button>
                </div>
              </Card>
            );
          })}
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay grupos. Crea el primero arriba.</p>
          )}
        </div>
      </TabsContent>

      {/* ---------------- Pestaña 2 ---------------- */}
      <TabsContent value="gastos" className="space-y-4">
        <Card className="p-3">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
            {form.id ? "Editar gasto" : "Registrar gasto"} · {MESES[month - 1]} {year}
          </h2>
          <div className="grid gap-2 md:grid-cols-6">
            <Input
              type="date"
              value={form.expense_date}
              aria-label="Fecha"
              onChange={(e) => setForm((p) => ({ ...p, expense_date: e.target.value }))}
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm md:col-span-2"
              value={form.line_key}
              onChange={(e) => setForm((p) => ({ ...p, line_key: e.target.value }))}
              aria-label="Rubro"
            >
              <option value="">Rubro…</option>
              {groups.map((g) => {
                const lines = porGrupo.get(g.key) ?? [];
                if (!lines.length) return null;
                return (
                  <optgroup key={g.key} label={g.label}>
                    {lines.map((it) => (
                      <option key={it.id} value={it.line_key}>
                        {it.label} {g.kind === "porcentual" ? "(%)" : "($)"}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <Input
              placeholder="N.º de factura"
              value={form.invoice_number}
              onChange={(e) => setForm((p) => ({ ...p, invoice_number: e.target.value }))}
            />
            <Input
              placeholder="Proveedor"
              list="proveedores-gastos"
              value={form.supplier_name}
              onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))}
            />
            <datalist id="proveedores-gastos">
              {proveedores.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder={esPorcentual ? "%" : "Base imponible $"}
              className="text-right"
              aria-label={esPorcentual ? "Porcentaje" : "Base imponible"}
              value={form.base_amount}
              onChange={(e) => setForm((p) => ({ ...p, base_amount: e.target.value }))}
            />
          </div>

          {!esPorcentual && (
            <div className="mt-2 grid gap-2 md:grid-cols-6">
              <div className="md:col-span-3" />
              <label className="flex items-center gap-2 text-sm">
                IVA %
                <Input
                  type="number"
                  step="0.01"
                  className="h-9 text-right"
                  value={form.iva_rate}
                  onChange={(e) => setForm((p) => ({ ...p, iva_rate: e.target.value }))}
                />
              </label>
              <div className="flex h-9 items-center justify-end text-sm tabular-nums">
                IVA: $ {montoEC(ivaNum)}
              </div>
              <div className="flex h-9 items-center justify-end font-semibold tabular-nums">
                Total: $ {montoEC(totalNum)}
              </div>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button onClick={guardarGasto} disabled={saving}>
              <Plus className="mr-1 h-4 w-4" />
              {form.id ? "Guardar cambios" : "Registrar gasto"}
            </Button>
            {form.id && (
              <Button variant="ghost" onClick={() => setForm(nuevoBorrador(year, month))}>
                <X className="mr-1 h-4 w-4" />
                Cancelar
              </Button>
            )}
            {esPorcentual && (
              <span className="text-xs text-muted-foreground">
                Equivale a $ {montoEC(lineAmount(baseNum, ventasBrutas, true))} sobre las ventas
                brutas del mes.
              </span>
            )}
          </div>
        </Card>

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Rubro</th>
                <th className="px-3 py-2 text-left">Factura</th>
                <th className="px-3 py-2 text-left">Proveedor</th>
                <th className="px-3 py-2 text-right">Base</th>
                <th className="px-3 py-2 text-right">IVA</th>
                <th className="px-3 py-2 text-right">Total $</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {gastos.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    Sin gastos registrados en {MESES[month - 1]} {year}.
                  </td>
                </tr>
              )}
              {gastos.map((g) => {
                const pct = isPercentGroup(grupoDe(g.section));
                return (
                  <tr key={g.id}>
                    <td className="px-3 py-2 tabular-nums">{g.expense_date}</td>
                    <td className="px-3 py-2">{g.label}</td>
                    <td className="px-3 py-2">{g.invoice_number || "—"}</td>
                    <td className="px-3 py-2">{g.supplier_name || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pct ? `${montoEC(g.base_amount)} %` : `$ ${montoEC(g.base_amount)}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">$ {montoEC(g.tax_amount)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      $ {montoEC(lineAmount(g.amount, ventasBrutas, pct))}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => editarGasto(g)}
                          aria-label={`Editar gasto ${g.label}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => eliminarGasto(g)}
                          aria-label={`Eliminar gasto ${g.label}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-muted/50 font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan={4}>
                  Total del mes
                </td>
                <td className="px-3 py-2 text-right tabular-nums">$ {montoEC(totalBase)}</td>
                <td className="px-3 py-2 text-right tabular-nums">$ {montoEC(totalIva)}</td>
                <td className="px-3 py-2 text-right tabular-nums">$ {montoEC(totalGastos)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>

        <p className="text-xs text-muted-foreground">
          Todo lo que se ingresa aquí va directo al Estado de Pérdidas y Ganancias: el P&amp;G no se
          escribe, solo lee.
        </p>
      </TabsContent>
    </Tabs>
  );
}
