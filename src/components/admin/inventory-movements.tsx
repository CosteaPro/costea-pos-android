import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { currency } from "@/lib/pos";
import { useCompany } from "@/hooks/useCompany";
import { fmtQty, usePurchasingData, type Item } from "@/components/admin/purchasing";
import { recalcularConsumoHistorico } from "@/lib/sales-consumption";
import { useProgressiveList } from "@/hooks/useProgressiveList";
import {
  printBlankCountList,
  printBlankCountTicket,
  printCountTicket,
} from "@/lib/inventory-print";
import { esc, printReportA4 } from "@/lib/report-print";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import { useRole } from "@/hooks/useRole";
import {
  consumoOf,
  costoRealOf,
  exportInventoryByItem,
  exportInventoryCosted,
  exportInventoryReport,
  exportMovementsHistory,
  hoyEC,
  isManualMovement,
  loadInventoryReport,
  loadPhysicalCounts,
  savePhysicalCount,
  movementLabelFor,
  MANUAL_MOVEMENTS,
  type ManualMovementKey,
  MOVEMENT_TYPES,
  type Movement,
  type MovementType,
  sfOf,
  type PhysicalMap,
  type ReportRow,
} from "@/lib/inventory.movements";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

const fmtFecha = (d: string) => d.split("-").reverse().join("/");

/** Selector de rango de fechas reutilizable en todos los reportes. */
function RangeBar({
  from,
  to,
  setFrom,
  setTo,
  onApply,
  children,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  onApply: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface/60 p-3">
      <div>
        <Label className="text-xs text-muted-foreground">Desde</Label>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-10"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Hasta</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
      </div>
      <Button onClick={onApply}>
        <CalendarRange className="mr-2 size-4" /> Consultar
      </Button>
      {children}
    </div>
  );
}

/* ────────────────────────────── 1. MOVIMIENTOS ────────────────────────────── */

type ItemTab = "items" | "subrecetas" | "recetas";

const ITEM_TABS: { value: ItemTab; label: string }[] = [
  { value: "items", label: "📦 Ítems" },
  { value: "subrecetas", label: "🥣 Subrecetas" },
  { value: "recetas", label: "🍳 Recetas" },
];

/** Tipos que se pueden registrar a mano, con su signo de afectación. */
type MovKey = "baja" | "lunch" | "ajuste_neg" | "transf_pos" | "transf_neg";

const MOVS: { value: MovKey; label: string; type: MovementType; sign: 1 | -1 }[] = [
  { value: "baja", label: "🗑️ Baja / merma", type: "baja", sign: 1 },
  { value: "lunch", label: "🍽️ Consumo de personal", type: "lunch", sign: 1 },
  { value: "ajuste_neg", label: "⚖️ Ajuste negativo", type: "ajuste", sign: -1 },
  { value: "transf_pos", label: "📥 Transferencia positiva", type: "transferencia", sign: 1 },
  { value: "transf_neg", label: "📤 Transferencia negativa", type: "transferencia", sign: -1 },
];

/** Línea del movimiento en preparación. */
type Line = {
  itemId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  cost: number;
};

/** Etiqueta de color por tipo de movimiento en el historial. */
function TipoChip({ type, quantity }: { type: string; quantity: number }) {
  const negativo = Number(quantity) < 0;
  let texto = movementLabelFor(type, quantity).replace(/^[^\w¿¡]+\s*/u, "");
  let clase = "bg-secondary text-muted-foreground";
  if (type === "baja") clase = "bg-destructive/15 text-destructive";
  else if (type === "lunch" || type === "entrada_produccion")
    clase = "bg-emerald-500/15 text-emerald-600";
  else if (type === "ajuste") {
    clase = "bg-muted text-muted-foreground";
    texto = negativo ? "Ajuste Neg." : "Ajuste Pos.";
  } else if (type === "transferencia") clase = "bg-blue-500/15 text-blue-600";
  else if (type === "venta") clase = "bg-amber-500/15 text-amber-600";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${clase}`}>{texto}</span>
  );
}

export function MovementsTab() {
  const { items, loadItems } = usePurchasingData();
  const { company } = useCompany();
  const { isAdmin } = useRole();

  const [mov, setMov] = useState<MovKey>("baja");
  const [tab, setTab] = useState<ItemTab>("items");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(hoyEC());
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [recetaItems, setRecetaItems] = useState<{ itemId: string; kind: string }[]>([]);

  const [from, setFrom] = useState(`${hoyEC().slice(0, 7)}-01`);
  const [to, setTo] = useState(hoyEC());
  const [buscar, setBuscar] = useState("");
  const [history, setHistory] = useState<Movement[]>([]);
  const [filterType, setFilterType] = useState<"todos" | MovementType>("todos");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [viendo, setViendo] = useState<Movement | null>(null);
  const [recalculando, setRecalculando] = useState(false);

  // Qué ítem de inventario corresponde a una subreceta y cuál a una receta final.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("recipes")
        .select("kind, inventory_item_id")
        .not("inventory_item_id", "is", null);
      setRecetaItems(
        (data ?? []).map((r) => ({
          itemId: r.inventory_item_id as string,
          kind: r.kind as string,
        })),
      );
    })();
  }, []);

  const load = useCallback(async () => {
    let q = supabase
      .from("inventory_movements")
      .select("*")
      .gte("business_date", from)
      .lte("business_date", to)
      .order("created_at", { ascending: false });
    if (filterType !== "todos") q = q.eq("movement_type", filterType);
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    setHistory((data ?? []) as unknown as Movement[]);
    setPage(1);
  }, [from, to, filterType]);

  useEffect(() => {
    load();
  }, [load]);

  const recalcularVentas = async () => {
    setRecalculando(true);
    const t = toast.loading("Recalculando consumo de ventas…");
    try {
      const r = await recalcularConsumoHistorico();
      toast.success(
        `Recálculo listo: ${r.pedidos} pedidos revisados, ${r.movimientos} descuentos aplicados`,
        { id: t },
      );
      await load();
      loadItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo recalcular", { id: t });
    } finally {
      setRecalculando(false);
    }
  };

  const selected = items.find((i) => i.id === itemId);
  const movDef = MOVS.find((m) => m.value === mov)!;

  const kindByItem = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of recetaItems) map.set(r.itemId, r.kind);
    return map;
  }, [recetaItems]);

  const itemsTab = useMemo(
    () =>
      items
        .filter((i) => i.active)
        .filter((i) => {
          const kind = kindByItem.get(i.id);
          if (tab === "subrecetas") return kind === "subreceta";
          if (tab === "recetas") return !!kind && kind !== "subreceta";
          return !kind;
        }),
    [items, kindByItem, tab],
  );

  const valorMovimiento = lines.reduce((s, l) => s + l.qty * l.cost, 0);

  const addLine = () => {
    if (!selected) return toast.error("Selecciona un producto");
    const cantidad = Number(qty);
    if (!Number.isFinite(cantidad) || cantidad <= 0)
      return toast.error("La cantidad debe ser mayor a 0");
    setLines((prev) => {
      const i = prev.findIndex((l) => l.itemId === selected.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + cantidad };
        return next;
      }
      return [
        ...prev,
        {
          itemId: selected.id,
          code: selected.code ?? "",
          name: selected.name,
          category: selected.category ?? "",
          unit: selected.unit,
          qty: cantidad,
          cost: Number(selected.unit_cost) || 0,
        },
      ];
    });
    setQty("");
    setItemId("");
  };

  const save = async () => {
    if (lines.length === 0) return toast.error("Agrega al menos un producto");
    setSaving(true);
    const { error } = await supabase.from("inventory_movements").insert(
      lines.map((l) => ({
        item_id: l.itemId,
        item_code: l.code || null,
        item_name: l.name,
        category: l.category,
        movement_type: movDef.type,
        business_date: date,
        quantity: l.qty * movDef.sign,
        unit: l.unit,
        unit_cost: l.cost,
        reason: reason.trim() || null,
      })),
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Movimiento registrado: ${movDef.label}`);
    setLines([]);
    setReason("");
    loadItems();
    load();
  };

  /** Comprobante A4 del movimiento en preparación. */
  const printDraft = () => {
    if (lines.length === 0) return toast.error("Agrega al menos un producto");
    const filas = lines
      .map(
        (l) => `<tr><td>${esc(l.code)} · ${esc(l.name)}</td><td class="r">${fmtQty(l.qty)}</td>
        <td>${esc(l.unit)}</td><td class="r">${currency(l.cost)}</td>
        <td class="r">${currency(l.qty * l.cost)}</td></tr>`,
      )
      .join("");
    printReportA4({
      titulo: "Movimiento de inventario",
      negocio: company?.trade_name ?? company?.business_name,
      periodo: fmtFecha(date),
      cuerpo: `<p style="font-size:11px;margin:0 0 8px">Tipo: <strong>${esc(movDef.label)}</strong></p>
      <table><thead><tr><th>Código/Producto</th><th class="r">Cantidad</th><th>Unidad</th>
      <th class="r">Costo</th><th class="r">Total</th></tr></thead><tbody>${filas}</tbody>
      <tfoot><tr><td colspan="4">Valor del movimiento</td><td class="r">${currency(valorMovimiento)}</td></tr></tfoot></table>`,
      nota: reason.trim() || undefined,
    });
  };

  /* ── Historial ── */

  const filtrado = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (m) =>
        m.item_name.toLowerCase().includes(q) ||
        (m.item_code ?? "").toLowerCase().includes(q) ||
        (m.reason ?? "").toLowerCase().includes(q),
    );
  }, [history, buscar]);

  const totalPaginas = Math.max(1, Math.ceil(filtrado.length / pageSize));
  const pagina = Math.min(page, totalPaginas);
  const visibles = filtrado.slice((pagina - 1) * pageSize, pagina * pageSize);
  const totalHistorial = filtrado
    .filter((m) => !m.deleted_at)
    .reduce((s, m) => s + Number(m.total_value || 0), 0);

  const printHistory = () => {
    const filas = filtrado
      .map(
        (m) => `<tr><td>${esc(fmtFecha(m.business_date))}</td><td>${esc(m.item_code ?? "")}</td>
        <td>${esc(m.item_name)}</td><td>${esc(m.category ?? "")}</td>
        <td>${esc(movementLabelFor(m.movement_type, Number(m.quantity)).replace(/^[^\w]+\s*/u, ""))}</td>
        <td class="r">${fmtQty(Number(m.quantity))} ${esc(m.unit)}</td>
        <td class="r">${currency(Number(m.total_value))}</td></tr>`,
      )
      .join("");
    printReportA4({
      titulo: "Historial de bajas y consumos",
      negocio: company?.trade_name ?? company?.business_name,
      periodo: `${fmtFecha(from)} al ${fmtFecha(to)}`,
      cuerpo: `<table><thead><tr><th>Fecha</th><th>Código</th><th>Descripción</th><th>Categoría</th>
      <th>Tipo</th><th class="r">Cantidad</th><th class="r">Valor total</th></tr></thead>
      <tbody>${filas}</tbody><tfoot><tr><td colspan="6">Total del rango</td>
      <td class="r">${currency(totalHistorial)}</td></tr></tfoot></table>`,
    });
  };

  const printMovement = (m: Movement) => {
    printReportA4({
      titulo: "Comprobante de movimiento",
      negocio: company?.trade_name ?? company?.business_name,
      periodo: fmtFecha(m.business_date),
      cuerpo: `<table><thead><tr><th>Código/Producto</th><th>Categoría</th><th>Tipo</th>
      <th class="r">Cantidad</th><th>Unidad</th><th class="r">Costo</th><th class="r">Total</th></tr></thead>
      <tbody><tr><td>${esc(m.item_code ?? "")} · ${esc(m.item_name)}</td><td>${esc(m.category ?? "")}</td>
      <td>${esc(movementLabelFor(m.movement_type, Number(m.quantity)).replace(/^[^\w]+\s*/u, ""))}</td>
      <td class="r">${fmtQty(Number(m.quantity))}</td><td>${esc(m.unit)}</td>
      <td class="r">${currency(Number(m.unit_cost))}</td>
      <td class="r">${currency(Number(m.total_value))}</td></tr></tbody></table>`,
      nota: m.reason ?? undefined,
    });
  };

  return (
    <Tabs defaultValue="registrar" className="space-y-4">
      <TabsList>
        <TabsTrigger value="registrar">📝 Registrar movimiento</TabsTrigger>
        <TabsTrigger value="historial">📋 Historial de Bajas/Consumos</TabsTrigger>
      </TabsList>

      {/* ─────────── Registrar movimiento ─────────── */}
      <TabsContent value="registrar">
        <section className="panel space-y-4 p-4">
          <h2 className="font-display text-lg font-semibold">Registrar movimiento</h2>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Tipo de movimiento</Label>
              <select
                className={selectClass}
                value={mov}
                onChange={(e) => setMov(e.target.value as MovKey)}
              >
                {MOVS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Fecha contable</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Agregar productos al movimiento</Label>
            <div className="flex flex-wrap gap-2">
              {ITEM_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    setTab(t.value);
                    setItemId("");
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${
                    tab === t.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
              <select
                className={selectClass}
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                <option value="">Selecciona un producto…</option>
                {itemsTab.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} · {i.name}
                  </option>
                ))}
              </select>
              <div>
                <Label className="text-xs text-muted-foreground">Cantidad</Label>
                <Input
                  type="number"
                  step="0.000001"
                  min="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0"
                />
              </div>
              <Button onClick={addLine}>
                <Plus className="mr-2 size-4" /> Agregar
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-secondary/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Código/Producto</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2">Unidad</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.itemId} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">
                      {l.code ? `${l.code} - ` : ""}
                      {l.name}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtQty(l.qty)}</td>
                    <td className="px-3 py-2">{l.unit}</td>
                    <td className="px-3 py-2 text-right">{currency(l.cost)}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {currency(l.qty * l.cost)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setLines((p) => p.filter((x) => x.itemId !== l.itemId))}
                        title="Quitar producto"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Aún no has agregado productos al movimiento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="rounded-md bg-secondary/40 px-3 py-2 text-right text-sm text-muted-foreground">
            Costo de última compra:{" "}
            <strong className="text-foreground">
              {currency(Number(selected?.unit_cost) || 0)}
            </strong>{" "}
            ·{" "}
            <span>
              Valor del movimiento:{" "}
              <strong className="text-primary">{currency(valorMovimiento)}</strong>
            </span>
          </p>

          <div>
            <Label>Motivo / observación</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej.: producto caducado, consumo del personal, traslado a sucursal…"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={printDraft}>
              <Printer className="mr-2 size-4" /> Imprimir
            </Button>
            <Button onClick={save} disabled={saving}>
              <Save className="mr-2 size-4" /> {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </section>
      </TabsContent>

      {/* ─────────── Historial ─────────── */}
      <TabsContent value="historial" className="space-y-4">
        <section className="panel space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tipo de movimiento</Label>
              <select
                className={selectClass}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              >
                <option value="todos">Todos los tipos</option>
                {MOVEMENT_TYPES.filter((t) => t.value !== "venta" && t.value !== "ajuste").map(
                  (t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Buscar producto o motivo</Label>
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={buscar}
                  onChange={(e) => {
                    setBuscar(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Ej.: INV-001, rotura…"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={printHistory} disabled={filtrado.length === 0}>
              <Printer className="mr-2 size-4" /> Imprimir
            </Button>
            <Button
              variant="outline"
              onClick={() => exportMovementsHistory(filtrado, from, to)}
              disabled={filtrado.length === 0}
            >
              <Download className="mr-2 size-4" /> Exportar Excel
            </Button>
            {isAdmin && (
              <Button variant="outline" onClick={recalcularVentas} disabled={recalculando}>
                <RefreshCw className={`mr-2 size-4 ${recalculando ? "animate-spin" : ""}`} />
                {recalculando ? "Recalculando…" : "Recalcular consumo de ventas"}
              </Button>
            )}
            <Button onClick={load}>
              <Search className="mr-2 size-4" /> Consultar
            </Button>
          </div>
        </section>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-secondary/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Valor Total</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((m) => (
                <tr
                  key={m.id}
                  className={`border-t border-border ${m.deleted_at ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{fmtFecha(m.business_date)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-primary">{m.item_code}</td>
                  <td className="px-3 py-2 font-medium">
                    <span className={m.deleted_at ? "line-through" : ""}>{m.item_name}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      {m.category}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <TipoChip type={m.movement_type} quantity={Number(m.quantity)} />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {fmtQty(Number(m.quantity))}{" "}
                    <span className="text-xs text-muted-foreground">{m.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{currency(Number(m.total_value))}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setViendo(m)}
                      title="Ver detalle"
                    >
                      <Eye className="size-4 text-primary" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtrado.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Sin movimientos registrados en el rango seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
            {filtrado.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-secondary/40 font-semibold">
                  <td className="px-3 py-2" colSpan={6}>
                    Total del rango
                  </td>
                  <td className="px-3 py-2 text-right">{currency(totalHistorial)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Mostrar:</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>de {filtrado.length} registros</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1}
            >
              <ChevronLeft className="size-4" />
            </Button>
            {Array.from({ length: totalPaginas })
              .map((_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPaginas || Math.abs(n - pagina) <= 1)
              .map((n, idx, arr) => (
                <span key={n} className="flex items-center gap-1">
                  {idx > 0 && arr[idx - 1] !== n - 1 && (
                    <span className="px-1 text-muted-foreground">…</span>
                  )}
                  <Button
                    size="sm"
                    variant={n === pagina ? "default" : "outline"}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </Button>
                </span>
              ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </TabsContent>

      <Dialog open={!!viendo} onOpenChange={(o) => !o && setViendo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del movimiento</DialogTitle>
          </DialogHeader>
          {viendo && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Fecha:</span>{" "}
                {fmtFecha(viendo.business_date)}
              </p>
              <p>
                <span className="text-muted-foreground">Producto:</span> {viendo.item_code} ·{" "}
                {viendo.item_name}
              </p>
              <p>
                <span className="text-muted-foreground">Categoría:</span> {viendo.category ?? "—"}
              </p>
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">Tipo:</span>
                <TipoChip type={viendo.movement_type} quantity={Number(viendo.quantity)} />
              </p>
              <p>
                <span className="text-muted-foreground">Cantidad:</span>{" "}
                {fmtQty(Number(viendo.quantity))} {viendo.unit}
              </p>
              <p>
                <span className="text-muted-foreground">Costo unitario:</span>{" "}
                {currency(Number(viendo.unit_cost))}
              </p>
              <p>
                <span className="text-muted-foreground">Valor total:</span>{" "}
                <strong>{currency(Number(viendo.total_value))}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Motivo:</span> {viendo.reason ?? "—"}
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => printMovement(viendo)}>
                  <Printer className="mr-2 size-4" /> Imprimir
                </Button>
                <Button onClick={() => setViendo(null)}>Cerrar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

/* ──────────────────────── 2. CONTEO FÍSICO Y CIERRE ──────────────────────── */

export function PhysicalCountTab() {
  const { items, loadItems } = usePurchasingData();
  const { company } = useCompany();
  const [query, setQuery] = useState("");
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [date, setDate] = useState(hoyEC());
  const [notes, setNotes] = useState("");
  const [tipoConteo, setTipoConteo] = useState<"diario" | "mensual">("diario");
  const [busy, setBusy] = useState(false);
  const [guardado, setGuardado] = useState(false);

  /** El conteo guardado siempre se puede volver a abrir y corregir. */
  useEffect(() => {
    let vivo = true;
    loadPhysicalCounts(date)
      .then((map) => {
        if (!vivo) return;
        const next: Record<string, string> = {};
        for (const [id, entry] of Object.entries(map)) next[id] = String(entry.qty ?? 0);
        setCounted(next);
        setGuardado(Object.keys(next).length > 0);
      })
      .catch(() => {
        if (vivo) {
          setCounted({});
          setGuardado(false);
        }
      });
    return () => {
      vivo = false;
    };
  }, [date]);

  /**
   * Ítems que entran en el conteo según su frecuencia de control:
   *  • Diario  → solo los marcados como diario (lista completa de ese grupo).
   *  • Mensual → todos los ítems (diarios + mensuales): es el inventario completo.
   */
  const alcance = useMemo(
    () =>
      items.filter(
        (i) =>
          i.active && (tipoConteo === "mensual" || (i.control_frequency ?? "diario") === "diario"),
      ),
    [items, tipoConteo],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return alcance;
    return alcance.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.code ?? "").toLowerCase().includes(q),
    );
  }, [alcance, query]);

  /** Conteo físico: si el usuario no escribe nada, vale 0.00 (no hay existencia). */
  const countOf = (i: Item) => {
    const value = counted[i.id];
    const n = Number(value);
    return value === undefined || value === "" || Number.isNaN(n) ? 0 : n;
  };

  /** Guarda el conteo con su fecha y lo deja como saldo inicial del día siguiente. */
  const guardar = async () => {
    const activos = alcance;
    if (activos.length === 0) return toast.error("No hay insumos activos");
    setBusy(true);
    try {
      for (const i of activos) {
        const qty = countOf(i);
        await savePhysicalCount(date, i.id, qty, qty * (Number(i.unit_cost) || 0));
      }
      const { error } = await supabase.rpc("apply_physical_count_as_opening", {
        _business_date: date,
      });
      if (error) throw new Error(error.message);
      setGuardado(true);
      await loadItems();
      toast.success(
        `Conteo guardado del ${fmtFecha(date)}: queda como saldo inicial del día siguiente.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el conteo");
    } finally {
      setBusy(false);
    }
  };

  const negocio = company?.trade_name || company?.business_name || "Costea POS";

  /** Tirilla térmica: solo lo registrado, sin cálculos. */
  const imprimirTirilla = () => {
    if (rows.length === 0) return toast.error("No hay insumos para imprimir");
    printCountTicket(
      rows.map((i) => ({
        code: i.code ?? "",
        name: i.name,
        unit: i.unit,
        fisico: countOf(i),
      })),
      {
        negocio,
        fecha: date,
        tipo: tipoConteo === "mensual" ? "Conteo mensual" : "Conteo diario",
        notas: notes.trim() || undefined,
        printer: company?.printer_pos || undefined,
      },
    );
    toast.success("Tirilla de cierre enviada a la impresora");
  };

  /** Lista en blanco (A4) con el mismo orden y filtro que la pantalla. */
  const imprimirLista = () => {
    if (rows.length === 0) return toast.error("No hay insumos activos");
    printBlankCountList(
      rows.map((i) => ({ code: i.code, name: i.name, unit: i.unit, category: i.category })),
      tipoConteo,
      negocio,
    );
  };

  /** Lista en blanco en tirilla 80mm, para imprimir desde la caja POS. */
  const imprimirListaPOS = () => {
    if (rows.length === 0) return toast.error("No hay insumos activos");
    printBlankCountTicket(
      rows.map((i) => ({ code: i.code, name: i.name, unit: i.unit })),
      {
        negocio,
        fecha: date,
        tipo: tipoConteo === "mensual" ? "Conteo mensual" : "Conteo diario",
        printer: company?.printer_pos || undefined,
      },
    );
    toast.success("Lista para conteo enviada a la caja POS");
  };

  // Renderizado progresivo: el guardado sigue usando todos los insumos.
  const {
    rendered: filasConteo,
    hasMore: hayMasConteo,
    sentinelRef: refConteo,
  } = useProgressiveList(rows, 40);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface/60 p-3">
        <div>
          <Label className="text-xs text-muted-foreground">Fecha del conteo</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Tipo de conteo</Label>
          <select
            className={selectClass}
            value={tipoConteo}
            onChange={(e) => setTipoConteo(e.target.value as "diario" | "mensual")}
          >
            <option value="diario">Conteo diario</option>
            <option value="mensual">Conteo mensual</option>
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <Label className="text-xs text-muted-foreground">Observación</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </div>
        {guardado && (
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            Conteo guardado · se puede corregir
          </div>
        )}
        <Button onClick={guardar} disabled={busy}>
          <ClipboardCheck className="mr-2 size-4" /> Guardar conteo
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={imprimirTirilla}>
          <Printer className="mr-2 size-4" /> Imprimir tirilla del cierre (80mm)
        </Button>
        <Button variant="outline" onClick={imprimirLista}>
          <FileText className="mr-2 size-4" /> Lista para conteo físico (A4) ·{" "}
          {tipoConteo === "mensual" ? "mensual" : "diario"}
        </Button>
        <Button variant="outline" onClick={imprimirListaPOS}>
          <Printer className="mr-2 size-4" /> Lista para conteo físico en caja POS (80mm)
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar insumo por nombre o código"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-secondary/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2 text-right">Cantidad contada</th>
            </tr>
          </thead>
          <tbody>
            {filasConteo.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{i.code}</td>
                <td className="px-3 py-2 font-medium">{i.name}</td>
                <td className="px-3 py-2">{i.unit}</td>
                <td className="px-3 py-2 text-right">
                  <Input
                    type="number"
                    step="0.000001"
                    min="0"
                    className="h-9 w-32 text-right"
                    value={counted[i.id] ?? "0.00"}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setCounted((p) => ({ ...p, [i.id]: e.target.value }))}
                    onBlur={(e) =>
                      setCounted((p) => ({
                        ...p,
                        [i.id]: e.target.value.trim() === "" ? "0.00" : e.target.value,
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
            {hayMasConteo && (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-center text-xs text-muted-foreground">
                  <div ref={refConteo}>Cargando más insumos…</div>
                </td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  Sin insumos activos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────── 3. INVENTARIO — 25 COLUMNAS ────────────────────── */

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #hoja-inventario, #hoja-inventario * { visibility: visible !important; color:#000 !important; background:#fff !important; }
  #hoja-inventario { position: absolute; inset: 0; width: 100%; overflow: visible !important; }
  .no-print { display: none !important; }
  @page { size: A4 portrait; margin: 8mm; }
}
`;

/** Columnas del reporte en el orden fijo obligatorio (26 con Costo Unit.). */
type Col = {
  h: string;
  money?: boolean;
  left?: boolean;
  cell: (x: {
    r: ReportRow;
    sf: ReturnType<typeof sfOf>;
    c: ReturnType<typeof consumoOf>;
  }) => string;
};

const COLUMNS: Col[] = [
  { h: "Código", left: true, cell: ({ r }) => r.code },
  { h: "Descripción", left: true, cell: ({ r }) => r.name },
  { h: "Categoría", left: true, cell: ({ r }) => r.category },
  { h: "Unidad Inv", left: true, cell: ({ r }) => r.unit },
  { h: "Inv. Inicial", cell: ({ r }) => fmtQty(r.qtyInicial) },
  { h: "Inv. Inicial $", money: true, cell: ({ r }) => currency(r.valInicial) },
  {
    h: "Costo Unit.",
    money: true,
    cell: ({ r }) => (r.unitCost > 0 ? currency(r.unitCost) : "—"),
  },
  { h: "Compras", cell: ({ r }) => fmtQty(r.qtyCompras) },
  { h: "Compras $", money: true, cell: ({ r }) => currency(r.valCompras) },
  { h: "Bajas", cell: ({ r }) => fmtQty(r.qtyBajas) },
  { h: "Bajas $", money: true, cell: ({ r }) => currency(r.valBajas) },
  { h: "Lunch", cell: ({ r }) => fmtQty(r.qtyLunch) },
  { h: "Lunch $", money: true, cell: ({ r }) => currency(r.valLunch) },
  { h: "Transf. Pos", cell: ({ r }) => fmtQty(r.qtyTransfPos) },
  { h: "Transf. Pos $", money: true, cell: ({ r }) => currency(r.valTransfPos) },
  { h: "Transf. Neg", cell: ({ r }) => fmtQty(r.qtyTransfNeg) },
  { h: "Transf. Neg $", money: true, cell: ({ r }) => currency(r.valTransfNeg) },
  { h: "Ventas", cell: ({ r }) => fmtQty(r.qtyVentas) },
  { h: "Ventas $", money: true, cell: ({ r }) => currency(r.valVentas) },
  { h: "Inv. Sistema", cell: ({ r }) => fmtQty(r.qtyFinal) },
  { h: "Inv. Sistema $", money: true, cell: ({ r }) => currency(r.valFinal) },
  { h: "Inv. Físico", cell: ({ sf }) => fmtQty(sf.fisicoQty) },
  { h: "Inv. Físico $", money: true, cell: ({ sf }) => currency(sf.fisicoVal) },
  { h: "S/F Cant", cell: ({ sf }) => fmtQty(sf.sfQty) },
  { h: "S/F $", money: true, cell: ({ sf }) => currency(sf.sfVal) },
  { h: "Consumo $", money: true, cell: ({ c }) => currency(c.val) },
];

export function InventoryReportsTab() {
  const { company } = useCompany();
  const [from, setFrom] = useState(`${hoyEC().slice(0, 7)}-01`);
  const [to, setTo] = useState(hoyEC());
  const [allRows, setAllRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("todas");
  const [physical, setPhysical] = useState<PhysicalMap>({});
  const [ventaNeta, setVentaNeta] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [range, setRange] = useState<{ from: string; to: string }>({ from, to });
  const [simpleView, setSimpleView] = useState<"none" | "items" | "costeado">("none");

  /** Recalcula TODO: filas del rango, conteo físico y venta neta. */
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, phys, ventas] = await Promise.all([
        loadInventoryReport(range.from, range.to),
        loadPhysicalCounts(range.to),
        supabase
          .from("orders")
          .select("subtotal")
          .eq("status", "pagado")
          .eq("doc_status", "emitido")
          .gte("created_at", desdeEc(range.from))
          .lte("created_at", hastaEc(range.to)),
      ]);
      setAllRows(rows);
      setPhysical(phys);
      setVentaNeta((ventas.data ?? []).reduce((s, o) => s + Number(o.subtotal || 0), 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el inventario");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Actualización automática: cualquier movimiento guardado recalcula la pantalla. */
  useEffect(() => {
    const channel = supabase
      .channel("inventario-tiempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_movements" }, () =>
        refresh(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_items" }, () =>
        refresh(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refresh())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_physical_counts" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const categories = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.category).filter(Boolean))).sort(),
    [allRows],
  );
  const rows = useMemo(
    () => (category === "todas" ? allRows : allRows.filter((r) => r.category === category)),
    [allRows, category],
  );

  const costoReal = useMemo(() => costoRealOf(rows, physical), [rows, physical]);
  const pctCosto = ventaNeta > 0 ? (costoReal / ventaNeta) * 100 : null;

  const negocio = company?.trade_name || company?.business_name || "Costea POS";

  /* ── Hoja única: reporte del período, con o sin columnas de dinero ── */
  const hoja = (opts: { titulo: string; hideMoney: boolean; onBack: () => void }) => {
    const cols = COLUMNS.filter((c) => !(opts.hideMoney && c.money));
    return (
      <div id="hoja-inventario" className="fixed inset-0 z-50 overflow-auto bg-white text-black">
        <style>{PRINT_CSS}</style>
        <div className="no-print sticky top-0 flex flex-wrap gap-2 border-b border-neutral-300 bg-white p-3">
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 size-4" /> Imprimir
          </Button>
          <Button variant="outline" onClick={opts.onBack}>
            <Undo2 className="mr-2 size-4" /> Regresar
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              exportInventoryReport(rows, range.from, range.to, physical, {
                hideMoney: opts.hideMoney,
              })
            }
          >
            <Download className="mr-2 size-4" /> Exportar Excel
          </Button>
        </div>

        <div className="p-6">
          <header className="mb-4 text-center">
            <h1 className="text-xl font-bold uppercase">{negocio}</h1>
            <p className="text-sm">{opts.titulo}</p>
            <p className="text-xs">
              Del {fmtFecha(range.from)} al {fmtFecha(range.to)}
              {category === "todas" ? "" : ` · Categoría: ${category}`}
            </p>
          </header>

          <table className="w-full border-collapse text-[9px]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.h}
                    className={`border border-neutral-400 bg-neutral-100 px-1 py-1 font-semibold ${
                      c.left ? "text-left" : "text-right"
                    }`}
                  >
                    {c.h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sf = sfOf(r, physical[r.item_id]);
                const c = consumoOf(r, physical[r.item_id]);
                return (
                  <tr key={r.item_id}>
                    {cols.map((col) => (
                      <td
                        key={col.h}
                        className={`border border-neutral-300 px-1 py-0.5 ${
                          col.left ? "text-left" : "text-right"
                        }`}
                      >
                        {col.cell({ r, sf, c })}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length} className="border border-neutral-300 p-6 text-center">
                    Sin datos en el período seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
            {!opts.hideMoney && (
              <tfoot>
                <tr className="font-bold">
                  <td
                    colSpan={cols.length - 1}
                    className="border border-neutral-400 px-1 py-1 text-right"
                  >
                    COSTO REAL TOTAL (suma de Consumo $)
                  </td>
                  <td className="border border-neutral-400 px-1 py-1 text-right">
                    {currency(costoReal)}
                  </td>
                </tr>
                <tr className="font-bold">
                  <td
                    colSpan={cols.length - 1}
                    className="border border-neutral-400 px-1 py-1 text-right"
                  >
                    VENTA NETA {currency(ventaNeta)} · % DE COSTO
                  </td>
                  <td className="border border-neutral-400 px-1 py-1 text-right">
                    {pctCosto === null ? "—" : `${pctCosto.toFixed(1)}%`}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  };

  if (simpleView !== "none")
    return hoja({
      titulo: simpleView === "costeado" ? "Inventario costeado" : "Inventario por ítem",
      hideMoney: simpleView === "items",
      onBack: () => setSimpleView("none"),
    });

  if (reportOpen)
    return hoja({
      titulo: "Reporte de inventario",
      hideMoney: false,
      onBack: () => setReportOpen(false),
    });

  /* ───────────────────────── Pantalla de trabajo ───────────────────────── */
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface/60 p-3">
        <div>
          <Label className="text-xs text-muted-foreground">Fecha desde</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Fecha hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Categoría</Label>
          <select
            className={selectClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="todas">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <Button
          disabled={loading}
          onClick={() => {
            setRange({ from, to });
            setReportOpen(true);
          }}
        >
          <CalendarRange className="mr-2 size-4" />
          {loading ? "Calculando…" : "Generar reporte del período"}
        </Button>
        <Button
          variant="outline"
          onClick={() => exportInventoryReport(rows, range.from, range.to, physical)}
          disabled={rows.length === 0}
        >
          <Download className="mr-2 size-4" /> Exportar Excel
        </Button>

        <div className="flex w-full flex-wrap gap-3">
          <Button
            disabled={loading}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => {
              setRange({ from, to });
              setSimpleView("items");
            }}
          >
            <ClipboardCheck className="mr-2 size-4" /> Inventario por Ítem
          </Button>
          <Button
            disabled={loading}
            className="bg-amber-500 text-black hover:bg-amber-600"
            onClick={() => {
              setRange({ from, to });
              setSimpleView("costeado");
            }}
          >
            <FileText className="mr-2 size-4" /> Inventario Costeado
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Costo real total</p>
          <p className="font-display text-2xl font-semibold">{currency(costoReal)}</p>
          <p className="text-xs text-muted-foreground">Suma de la columna Consumo $</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            % de costo sobre venta neta
          </p>
          <p
            className={`font-display text-2xl font-semibold ${
              pctCosto === null
                ? "text-muted-foreground"
                : pctCosto > 40
                  ? "text-destructive"
                  : "text-emerald-600"
            }`}
          >
            {pctCosto === null ? "Sin ventas" : `${pctCosto.toFixed(1)}%`}
          </p>
          <p className="text-xs text-muted-foreground">Costo real ÷ venta neta × 100</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Venta neta</p>
          <p className="font-display text-2xl font-semibold">{currency(ventaNeta)}</p>
          <p className="text-xs text-muted-foreground">
            Sin IVA · {fmtFecha(range.from)} a {fmtFecha(range.to)}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Elige el rango de fechas y presiona <strong>Generar reporte del período</strong>: el detalle
        completo se abre en hoja blanca lista para imprimir. Solo se suman los movimientos con fecha
        dentro del rango seleccionado.
      </p>
    </div>
  );
}
