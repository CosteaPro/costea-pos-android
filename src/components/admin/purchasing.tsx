import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  Truck,
} from "lucide-react";

import { toast } from "sonner";
import { recalcularReportes } from "@/lib/reportes-cache.functions";
import { supabase } from "@/integrations/supabase/client";
import { desdeEc, fechaEc, hastaEc } from "@/lib/fecha-ec";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRole } from "@/hooks/useRole";
import { currency } from "@/lib/pos";
import { useMeasurementUnits } from "@/hooks/useMeasurementUnits";
import {
  INVENTORY_UNITS,
  autoPurchaseFactor,
  recipeFor,
  type InventoryUnit,
} from "@/lib/units";
import { useInventoryCategories } from "@/components/admin/inventory-categories";
import { useAuth } from "@/hooks/useAuth";
import { deletePurchase, revertPurchase } from "@/lib/purchases.functions";
import { useCompany } from "@/hooks/useCompany";
import {
  printPurchaseA4,
  printPurchaseTicket,
  type PurchasePrintInfo,
  type PurchasePrintLine,
} from "@/lib/purchase-print";
import { esc, printReportA4 } from "@/lib/report-print";




export type Supplier = {
  id: string;
  code: string | null;
  id_number: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  active: boolean;
  notes: string | null;
};

export type TaxTreatment = "grava15" | "no_grava" | "tarifa0";

/** Tratamiento tributario del ítem (IVA vigente en Ecuador). */
export const TAX_TREATMENTS: { value: TaxTreatment; label: string; rate: number }[] = [
  { value: "grava15", label: "✅ Grava IVA 15%", rate: 15 },
  { value: "no_grava", label: "⚪ No grava IVA", rate: 0 },
  { value: "tarifa0", label: "⚪ Tarifa 0%", rate: 0 },
];

export const taxRateOf = (t: string | null | undefined) =>
  TAX_TREATMENTS.find((x) => x.value === t)?.rate ?? 0;

export const taxLabelOf = (t: string | null | undefined) =>
  TAX_TREATMENTS.find((x) => x.value === t)?.label ?? "⚪ No grava IVA";

export type Item = {
  id: string;
  code: string | null;
  name: string;
  category: string;
  category_id: string | null;
  tax_treatment: TaxTreatment;
  unit: string;
  min_stock: number;
  stock: number;
  unit_cost: number;
  location: string | null;
  supplier_id: string | null;
  active: boolean;
  purchase_unit: string;
  purchase_to_inventory: number;
  recipe_unit: string;
  inventory_to_recipe: number;
  cost_per_recipe_unit?: number | null;
  last_purchase_unit_cost?: number | null;
  last_purchase_at?: string | null;
  deleted_at?: string | null;
  /** Frecuencia de control para el conteo físico: diario o mensual. */
  control_frequency?: "diario" | "mensual" | null;
};

/** Redondeo a 6 decimales para conservar precisión en conversiones. */
export const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

export const round2 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;

/** Todas las cantidades del inventario se muestran con 2 decimales fijos. */
export const fmtQty = (n: number) =>
  new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(n || 0));


type Purchase = {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  document_number: string;
  purchased_at: string;
  total: number;
  tax_base?: number | null;
  tax_amount?: number | null;

  notes: string | null;
};

type PurchaseLine = { item_id: string; item_name: string; quantity: string; unit_cost: string };

type DetailLine = {
  item_id: string | null;
  item_name: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  tax_treatment?: string | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
};


const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

const fmtDate = (value: string) =>
  new Date(value).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const emptySupplier = {
  id_number: "",
  name: "",
  address: "",
  phone: "",
  email: "",
  category: "",
  notes: "",
  active: true,
};

const emptyItem = {
  name: "",
  category: "",
  category_id: "",
  tax_treatment: "grava15" as TaxTreatment,

  unit: "unidad",
  min_stock: "0",
  stock: "0",
  unit_cost: "0",
  location: "",
  supplier_id: "",
  active: true,
  purchase_unit: "unidad",
  purchase_to_inventory: "1",
  recipe_unit: "unidad",
  inventory_to_recipe: "1",
  control_frequency: "diario" as "diario" | "mensual",
};

export function PurchasesScreen() {
  const { isAdmin, loading: loadingRole } = useRole();

  if (loadingRole) {
    return <p className="py-16 text-center text-muted-foreground">Cargando…</p>;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertTriangle className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-3 font-display text-xl font-semibold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El módulo de compras es exclusivo del Super Administrador.
        </p>
      </div>
    );
  }

  return <PurchasesAdmin />;
}

/** Carga compartida de proveedores e ítems para las pantallas administrativas. */
export function usePurchasingData() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const loadSuppliers = useCallback(async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .is("deleted_at", null)
      .order("name");
    if (error) return toast.error(error.message);
    setSuppliers((data as Supplier[]) ?? []);
  }, []);

  const loadItems = useCallback(async () => {
    const { data, error } = await supabase.from("inventory_items").select("*").order("name");
    if (error) return toast.error(error.message);
    setItems((data as Item[]) ?? []);
  }, []);

  useEffect(() => {
    loadSuppliers();
    loadItems();
  }, [loadSuppliers, loadItems]);

  return { suppliers, items, loadSuppliers, loadItems };
}

export function PurchasesAdmin() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const loadSuppliers = useCallback(async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .is("deleted_at", null)
      .order("name");
    if (error) return toast.error(error.message);
    setSuppliers((data as Supplier[]) ?? []);
  }, []);

  const loadItems = useCallback(async () => {
    const { data, error } = await supabase.from("inventory_items").select("*").order("name");
    if (error) return toast.error(error.message);
    setItems((data as Item[]) ?? []);
  }, []);

  useEffect(() => {
    loadSuppliers();
    loadItems();
  }, [loadSuppliers, loadItems]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Módulo de compras</h1>
        <p className="text-sm text-muted-foreground">
          Proveedores, ítems de inventario y registro de compras con actualización automática de
          stock y costo.
        </p>
      </header>

      <Tabs defaultValue="compras">
        <TabsList>
          <TabsTrigger value="compras">
            <ShoppingCart className="mr-2 size-4" /> Compras
          </TabsTrigger>
          <TabsTrigger value="inventario">
            <Boxes className="mr-2 size-4" /> Inventario
          </TabsTrigger>
          <TabsTrigger value="proveedores">
            <Truck className="mr-2 size-4" /> Proveedores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compras" className="mt-4">
          <PurchasesTab suppliers={suppliers} items={items} onSaved={loadItems} />
        </TabsContent>
        <TabsContent value="inventario" className="mt-4">
          <ItemsTab items={items} suppliers={suppliers} reload={loadItems} />
        </TabsContent>
        <TabsContent value="proveedores" className="mt-4">
          <SuppliersTab rows={suppliers} reload={loadSuppliers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Proveedores ---------------- */

export function SuppliersTab({ rows, reload }: { rows: Supplier[]; reload: () => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptySupplier });
  const [toDelete, setToDelete] = useState<Supplier | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.code ?? "").toLowerCase().includes(q) ||
        r.id_number.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(currentPage * PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query]);

  /** Números de página con puntos suspensivos. */
  const pageNumbers = useMemo(() => {
    const out: (number | "…")[] = [];
    for (let n = 1; n <= totalPages; n++) {
      if (n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1) out.push(n);
      else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
  }, [totalPages, currentPage]);

  const openNew = () => {
    setForm({ ...emptySupplier });
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setForm({
      id_number: s.id_number ?? "",
      name: s.name,
      address: s.address ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      category: s.category ?? "",
      notes: s.notes ?? "",
      active: s.active,
    });
    setEditing(s.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("La razón social o nombre es obligatoria");
    const payload = {
      id_number: form.id_number.trim(),
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      category: form.category.trim() || null,
      notes: form.notes.trim() || null,
      active: form.active,
    };
    const { error } = editing
      ? await supabase.from("suppliers").update(payload).eq("id", editing)
      : await supabase.from("suppliers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Proveedor actualizado" : "Proveedor registrado");
    setOpen(false);
    reload();
  };

  /** Retiro lógico: sale del listado, sus compras históricas quedan intactas. */
  const removeSupplier = async (s: Supplier) => {
    const { error } = await supabase
      .from("suppliers")
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Proveedor eliminado del listado");
    setToDelete(null);
    reload();
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, código o RUC"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" /> Nuevo proveedor
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-secondary/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">RUC / ID</th>
              <th className="px-3 py-2">Razón social</th>
              <th className="px-3 py-2">Rubro</th>
              <th className="px-3 py-2">Contacto</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                <td className="px-3 py-2">{s.id_number || "—"}</td>
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.category || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {[s.phone, s.email].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                      <Pencil className="mr-1 size-4" /> Editar
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      aria-label={`Eliminar ${s.name}`}
                      onClick={() => setToDelete(s)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Sin proveedores registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Mostrando {firstShown} a {lastShown} de {filtered.length} registros
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Página anterior"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          {pageNumbers.map((n, idx) =>
            n === "…" ? (
              <span key={`gap-${idx}`} className="px-1">
                …
              </span>
            ) : (
              <Button
                key={n}
                size="icon"
                variant={n === currentPage ? "default" : "ghost"}
                onClick={() => setPage(n)}
              >
                {n}
              </Button>
            ),
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Página siguiente"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar proveedor</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.name} saldrá del listado y de las nuevas compras. Sus compras
              históricas y movimientos de inventario se conservan intactos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && removeSupplier(toDelete)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Razón social / Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>RUC / Identificación</Label>
              <Input
                value={form.id_number}
                onChange={(e) => setForm({ ...form, id_number: e.target.value })}
              />
            </div>
            <div>
              <Label>Rubro / Tipo de productos</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Dirección</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Correo electrónico</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Observaciones</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ---------------- Inventario ---------------- */

export function ItemsTab({
  items,
  suppliers,
  reload,
}: {
  items: Item[];
  suppliers: Supplier[];
  reload: () => void;
}) {
  const { categories } = useInventoryCategories();
  const { isSuperAdmin } = useRole();
  const { units: purchaseUnits, addUnit } = useMeasurementUnits();
  const [query, setQuery] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const confirmDelete = async () => {
    if (!deletingItem) return;
    setDeletingBusy(true);
    try {
      const { deleteInventoryItem } = await import("@/lib/inventory-items.functions");
      await deleteInventoryItem({ data: { itemId: deletingItem.id } });
      toast.success(
        `Ítem ${deletingItem.code ?? ""} eliminado. Su historial se conserva y su código queda bloqueado.`,
      );
      setDeletingItem(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar el ítem");
    }
    setDeletingBusy(false);
  };

  const restore = async (i: Item) => {
    try {
      const { restoreInventoryItem } = await import("@/lib/inventory-items.functions");
      await restoreInventoryItem({ data: { itemId: i.id } });
      toast.success("Ítem restaurado con su mismo código");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo restaurar el ítem");
    }
  };


  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyItem });




  const deletedCount = useMemo(() => items.filter((i) => !!i.deleted_at).length, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = items.filter((i) => (showDeleted ? !!i.deleted_at : !i.deleted_at));
    if (!q) return base;
    return base.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.code ?? "").toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q),
    );
  }, [items, query, showDeleted]);


  const openNew = () => {
    setForm({ ...emptyItem });
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (i: Item) => {
    setForm({
      name: i.name,
      category: i.category,
      category_id: i.category_id ?? "",
      tax_treatment: (i.tax_treatment ?? "grava15") as TaxTreatment,
      unit: i.unit,
      min_stock: String(i.min_stock),
      stock: String(i.stock),
      unit_cost: String(i.unit_cost),
      location: i.location ?? "",
      supplier_id: i.supplier_id ?? "",
      active: i.active,
      purchase_unit: i.purchase_unit || i.unit,
      purchase_to_inventory: String(i.purchase_to_inventory ?? 1),
      recipe_unit: i.recipe_unit || i.unit,
      inventory_to_recipe: String(i.inventory_to_recipe ?? 1),
      control_frequency: (i.control_frequency ?? "diario") as "diario" | "mensual",
    });
    setEditing(i.id);
    setOpen(true);
  };

  /** Solo el Super Administrador / Propietario puede editar unidades, factores y costo. */
  const unitsLocked = !!editing && !isSuperAdmin;

  /** Conversión oficial automática (ej.: 1 libra = 0,453592 kilos). */
  const autoFactor = autoPurchaseFactor(form.purchase_unit, form.unit);

  /** La unidad de inventario define la unidad de receta y el factor de compra. */
  const setInventoryUnit = (value: string) => {
    const { recipeUnit, factor } = recipeFor(value);
    setForm((prev) => {
      const auto = autoPurchaseFactor(prev.purchase_unit, value);
      return {
        ...prev,
        unit: value,
        recipe_unit: recipeUnit,
        inventory_to_recipe: String(factor),
        purchase_to_inventory:
          auto !== null ? String(round6(auto)) : prev.purchase_to_inventory,
      };
    });
  };

  /** Al cambiar la unidad de compra se recalcula el factor cuando la conversión es oficial. */
  const setPurchaseUnit = (value: string) => {
    setForm((prev) => {
      const auto = autoPurchaseFactor(value, prev.unit);
      return {
        ...prev,
        purchase_unit: value,
        purchase_to_inventory:
          auto !== null ? String(round6(auto)) : prev.purchase_to_inventory,
      };
    });
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("El nombre del ítem es obligatorio");
    const purchaseUnitRaw = (form.purchase_unit.trim() || form.unit).toLowerCase();
    const autoSave = autoPurchaseFactor(purchaseUnitRaw, form.unit);
    // La conversión oficial siempre manda sobre lo digitado.
    const fCompra = autoSave !== null ? round6(autoSave) : Number(form.purchase_to_inventory);
    const { recipeUnit, factor: fReceta } = recipeFor(form.unit);
    if (!(fCompra > 0)) return toast.error("El factor de compra a inventario debe ser mayor a 0");
    const purchaseUnit = purchaseUnitRaw;
    const categoryName =
      categories.find((c) => c.id === form.category_id)?.name ?? form.category.trim();

    const aviso =
      "⚠️ Esta configuración afecta costos y existencias. Después de guardar solo podrá modificarse con permiso del Super Administrador.\n\n¿Deseas continuar?";
    const avisoAdmin =
      "⚠️ Estás modificando unidades o conversiones ya guardadas. Esto recalcula costos y existencias de este ítem.\n\n¿Confirmas el cambio?";
    const cambioUnidades =
      !!editing &&
      (() => {
        const orig = items.find((i) => i.id === editing);
        return (
          !!orig &&
          (orig.unit !== form.unit ||
            Number(orig.inventory_to_recipe) !== fReceta ||
            Number(orig.purchase_to_inventory) !== fCompra ||
            orig.purchase_unit !== purchaseUnit)
        );
      })();
    if (!editing && !window.confirm(aviso)) return;
    if (cambioUnidades && !window.confirm(avisoAdmin)) return;

    await addUnit(purchaseUnit);

    const payload = {
      name: form.name.trim(),
      category: categoryName,
      category_id: form.category_id || null,
      tax_treatment: form.tax_treatment,
      unit: form.unit,
      min_stock: Number(form.min_stock) || 0,
      stock: Number(form.stock) || 0,
      unit_cost: Number(form.unit_cost) || 0,
      cost_per_recipe_unit: round6((Number(form.unit_cost) || 0) / (fReceta || 1)),
      location: form.location.trim() || null,
      supplier_id: form.supplier_id || null,
      active: form.active,
      purchase_unit: purchaseUnit,
      purchase_to_inventory: fCompra,
      recipe_unit: recipeUnit,
      inventory_to_recipe: fReceta,
      control_frequency: form.control_frequency,
    };

    // Unidades, conversiones y costo: editables solo por el Super Administrador.
    const {
      unit: _u,
      recipe_unit: _r,
      inventory_to_recipe: _f,
      purchase_unit: _pu,
      purchase_to_inventory: _pf,
      unit_cost: _uc,
      cost_per_recipe_unit: _cr,
      ...sinUnidades
    } = payload;
    const editable = isSuperAdmin ? payload : sinUnidades;
    const { error } = editing
      ? await supabase.from("inventory_items").update(editable).eq("id", editing)
      : await supabase.from("inventory_items").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Ítem actualizado" : "Ítem registrado");
    setOpen(false);
    reload();
  };

  const supplierName = (id: string | null) =>
    suppliers.find((s) => s.id === id)?.name ?? "—";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, código o categoría"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {isSuperAdmin && (
          <Button
            variant={showDeleted ? "default" : "outline"}
            onClick={() => setShowDeleted((v) => !v)}
          >
            {showDeleted ? "Ver activos" : `Eliminados (${deletedCount})`}
          </Button>
        )}
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" /> Nuevo ítem
        </Button>
      </div>

      {showDeleted && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Los ítems eliminados conservan todo su historial en los reportes hasta la fecha de
          eliminación y su código queda bloqueado para siempre: nunca se reutiliza.
        </p>
      )}


      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-secondary/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Ítem</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">IVA</th>

              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2 text-right">Mínimo</th>
              <th className="px-3 py-2 text-right">Costo</th>
              <th className="px-3 py-2">Bodega</th>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => {
              const low = Number(i.stock) < Number(i.min_stock);
              return (
                <tr
                  key={i.id}
                  className={`border-t border-border ${low ? "bg-destructive/10" : ""}`}
                >
                  <td className="px-3 py-2 font-mono text-xs">{i.code}</td>
                  <td className="px-3 py-2 font-medium">
                    <span className="flex items-center gap-2">
                      {i.name}
                      {low && <AlertTriangle className="size-4 text-destructive" />}
                      {i.deleted_at ? (
                        <span className="rounded bg-destructive/15 px-1.5 text-xs text-destructive">
                          Eliminado {i.deleted_at.slice(0, 10).split("-").reverse().join("/")}
                        </span>
                      ) : (
                        !i.active && (
                          <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                            Inactivo
                          </span>
                        )
                      )}

                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{i.category || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {taxLabelOf(i.tax_treatment)}
                  </td>

                  <td className="px-3 py-2 text-muted-foreground">
                    <div>{i.unit}</div>
                    <div className="text-xs">
                      🛒 1 {i.purchase_unit} = {fmtQty(Number(i.purchase_to_inventory))} {i.unit} · 🍽️ 1{" "}
                      {i.unit} = {fmtQty(Number(i.inventory_to_recipe))} {i.recipe_unit}
                    </div>
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${low ? "text-destructive" : ""}`}
                  >
                    {fmtQty(Number(i.stock))}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {fmtQty(Number(i.min_stock))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div>{currency(Number(i.unit_cost))}</div>
                    <div className="text-xs text-muted-foreground">
                      {currency(
                        Number(i.cost_per_recipe_unit ?? 0) ||
                          Number(i.unit_cost) / (Number(i.inventory_to_recipe) || 1),
                      )}{" "}
                      / {i.recipe_unit}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{i.location || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{supplierName(i.supplier_id)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {i.deleted_at ? (
                      isSuperAdmin && (
                        <Button variant="ghost" size="sm" onClick={() => restore(i)}>
                          Restaurar
                        </Button>
                      )
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(i)}>
                          Editar
                        </Button>
                        {isSuperAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeletingItem(i)}
                          >
                            <Trash2 className="mr-1 size-4" /> Eliminar
                          </Button>
                        )}
                      </>
                    )}
                  </td>

                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  {showDeleted
                    ? "No hay ítems eliminados."
                    : "Sin ítems de inventario registrados."}
                </td>
              </tr>
            )}

          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar ítem" : "Nuevo ítem de inventario"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nombre / Descripción</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Categoría de inventario</Label>
              <select
                className={selectClass}
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">
                  {form.category ? form.category : "Selecciona una categoría…"}
                </option>
                {categories
                  .filter((c) => c.active || c.id === form.category_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.active ? "" : " (inactiva)"}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label>Tratamiento de IVA</Label>
              <select
                className={selectClass}
                value={form.tax_treatment}
                onChange={(e) =>
                  setForm({ ...form, tax_treatment: e.target.value as TaxTreatment })
                }
              >
                {TAX_TREATMENTS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Frecuencia de control</Label>
              <select
                className={selectClass}
                value={form.control_frequency}
                onChange={(e) =>
                  setForm({
                    ...form,
                    control_frequency: e.target.value as "diario" | "mensual",
                  })
                }
              >
                <option value="diario">📅 Diario</option>
                <option value="mensual">📆 Mensual</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Los ítems diarios se cuentan todos los días; el conteo mensual incluye todos los
                ítems.
              </p>
            </div>

            <div>
              <Label>Stock actual (en {form.unit})</Label>
              <Input
                type="number"
                step="0.01"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </div>
            <div>
              <Label>Stock mínimo de alerta (en {form.unit})</Label>
              <Input
                type="number"
                step="0.01"
                value={form.min_stock}
                onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
              />
            </div>
            <div>
              <Label>
                Costo por {form.unit} (unidad de inventario) {unitsLocked && "🔒"}
              </Label>
              <Input
                type="number"
                step="0.000001"
                value={form.unit_cost}
                readOnly={unitsLocked}
                className={unitsLocked ? "bg-muted/40" : undefined}
                onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {editing
                  ? unitsLocked
                    ? "Se actualiza automáticamente con la última compra registrada."
                    : "Editable por el Super Administrador; también se actualiza con cada compra."
                  : "Costo inicial; luego se actualiza con cada compra."}
                {" · "}
                {currency(
                  (Number(form.unit_cost) || 0) / (Number(form.inventory_to_recipe) || 1),
                )}{" "}
                por {form.recipe_unit}
              </p>
            </div>
            <div>
              <Label>Ubicación / Bodega</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div>
              <Label>Proveedor principal</Label>
              <select
                className={selectClass}
                value={form.supplier_id}
                onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
              >
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Estado</Label>
              <select
                className={selectClass}
                value={form.active ? "1" : "0"}
                onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
              >
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </div>

            <div className="sm:col-span-2 space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
              <p className="font-display text-sm font-semibold">
                Conversiones de unidades del ítem
              </p>
              <p className="text-xs text-muted-foreground">
                🛒 La unidad de compra sirve <strong>solo para registrar compras</strong>. El
                inventario, el stock y el costo se controlan <strong>únicamente</strong> en la
                unidad de inventario. Ej.: 1 bidón de aceite a $40 con factor 20 litros = 20 litros
                en stock a $2,00 por litro.
              </p>

              <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">
                ⚠️ Esta configuración afecta costos y existencias.{" "}
                {isSuperAdmin
                  ? "Como Super Administrador puedes editarla y guardarla."
                  : "Después de guardar solo podrá modificarla el Super Administrador."}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>🛒 Unidad de compra {unitsLocked && "🔒"}</Label>
                  <select
                    className={selectClass}
                    disabled={unitsLocked}
                    value={purchaseUnits.includes(form.purchase_unit) ? form.purchase_unit : "__new"}
                    onChange={(e) => {
                      if (e.target.value === "__new") {
                        const nueva = window.prompt("Nombre de la nueva unidad de compra")?.trim();
                        if (nueva) setPurchaseUnit(nueva.toLowerCase());
                        return;
                      }
                      setPurchaseUnit(e.target.value);
                    }}
                  >
                    {purchaseUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                    {!purchaseUnits.includes(form.purchase_unit) && form.purchase_unit && (
                      <option value="__new">{form.purchase_unit} (nueva)</option>
                    )}
                    <option value="__new">➕ Crear unidad nueva…</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Las unidades nuevas se guardan en el listado maestro.
                  </p>
                </div>
                <div>
                  <Label>
                    Factor: 1 {form.purchase_unit || "compra"} = ? {form.unit || "inventario"}
                    {autoFactor !== null && " 🔒"}
                  </Label>
                  <Input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={autoFactor !== null ? String(round6(autoFactor)) : form.purchase_to_inventory}
                    readOnly={autoFactor !== null || unitsLocked}
                    className={autoFactor !== null || unitsLocked ? "bg-muted/40" : undefined}
                    onChange={(e) => setForm({ ...form, purchase_to_inventory: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {autoFactor !== null
                      ? `Conversión oficial automática: 1 ${form.purchase_unit} = ${fmtQty(round6(autoFactor))} ${form.unit} (1 kilo = 2,20462 libras).`
                      : "Declara cuánto contiene 1 unidad de compra (ej.: 1 caja = 24 unidades)."}
                  </p>
                </div>
                <div>
                  <Label>📦 Unidad de inventario (base) {unitsLocked && "🔒"}</Label>
                  <select
                    className={selectClass}
                    disabled={unitsLocked}
                    value={form.unit}
                    onChange={(e) => setInventoryUnit(e.target.value)}
                  >
                    {INVENTORY_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                    {!INVENTORY_UNITS.some((u) => u.value === form.unit) && (
                      <option value={form.unit}>{form.unit}</option>
                    )}
                  </select>
                </div>
                <div>
                  <Label>🍳 Unidad de receta (automática) 🔒</Label>
                  <Input value={form.recipe_unit} readOnly className="bg-muted/40" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    1 {form.unit} = {fmtQty(Number(form.inventory_to_recipe) || 0)}{" "}
                    {form.recipe_unit}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Ejemplo: 1 {form.purchase_unit || "compra"} ={" "}
                {fmtQty(autoFactor ?? (Number(form.purchase_to_inventory) || 0))}{" "}
                {form.unit || "inventario"} ={" "}
                {fmtQty(
                  (autoFactor ?? (Number(form.purchase_to_inventory) || 0)) *
                    (Number(form.inventory_to_recipe) || 0),
                )}{" "}
                {form.recipe_unit || "receta"}.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingItem} onOpenChange={(v) => !v && setDeletingItem(null)}>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar ítem de inventario</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Vas a eliminar{" "}
              <strong className="text-foreground">
                {deletingItem?.code} — {deletingItem?.name}
              </strong>
              .
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Su historial de compras, movimientos y consumos se conserva intacto.</li>
              <li>Seguirá apareciendo en los reportes de períodos anteriores a hoy.</li>
              <li>Desde hoy no aparecerá en listas activas, compras ni reportes posteriores.</li>
              <li>Su código queda bloqueado para siempre: nunca se reutiliza.</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingItem(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deletingBusy}>
              {deletingBusy ? "Eliminando…" : "Eliminar definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>


  );
}

/* ---------------- Compras ---------------- */

export function PurchasesTab({
  suppliers,
  items,
  onSaved,
}: {
  suppliers: Supplier[];
  items: Item[];
  onSaved: () => void;
}) {
  const { isSuperAdmin } = useRole();
  const { user } = useAuth();
  const { company } = useCompany();
  const [rows, setRows] = useState<Purchase[]>([]);
  const [detail, setDetail] = useState<Record<string, DetailLine[]>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Purchase | null>(null);
  const [printJob, setPrintJob] = useState<{
    lines: PurchasePrintLine[];
    info: PurchasePrintInfo;
  } | null>(null);
  const [askQuickLoad, setAskQuickLoad] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;



  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [emissionDate, setEmissionDate] = useState(() => fechaEc());
  const [emissionPoint, setEmissionPoint] = useState("001");
  const [confirmSave, setConfirmSave] = useState(false);
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([
    { item_id: "", item_name: "", quantity: "1", unit_cost: "0" },
  ]);

  const load = useCallback(async () => {
    let q = supabase
      .from("purchases")
      .select(
        "*, purchase_items(item_id, item_name, quantity, unit_cost, subtotal, tax_treatment, tax_rate, tax_amount)",
      )
      .order("purchased_at", { ascending: false })
      .limit(300);
    if (from) q = q.gte("purchased_at", desdeEc(from));
    if (to) q = q.lte("purchased_at", hastaEc(to));
    if (supplierFilter) q = q.eq("supplier_id", supplierFilter);
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    const list = (data ?? []) as unknown as (Purchase & { purchase_items: DetailLine[] })[];
    const filtered = itemFilter
      ? list.filter((p) => (p.purchase_items ?? []).some((l) => l.item_id === itemFilter))
      : list;
    setRows(filtered.map(({ purchase_items: _ignored, ...p }) => p as Purchase));
    setDetail(Object.fromEntries(filtered.map((p) => [p.id, p.purchase_items ?? []])));
  }, [from, to, supplierFilter, itemFilter]);

  useEffect(() => {
    load();
  }, [load]);

  /** Cálculo tributario por línea según el tratamiento de IVA del ítem. */
  const computed = useMemo(
    () =>
      lines.map((l) => {
        const item = items.find((i) => i.id === l.item_id);
        const rate = taxRateOf(item?.tax_treatment);
        const base = round2((Number(l.quantity) || 0) * (Number(l.unit_cost) || 0));
        const tax = round2((base * rate) / 100);
        return {
          line: l,
          item,
          rate,
          treatment: item?.tax_treatment ?? "no_grava",
          base,
          tax,
          total: round2(base + tax),
        };
      }),
    [lines, items],
  );

  const totals = useMemo(() => {
    const base = round2(computed.reduce((a, c) => a + c.base, 0));
    const base0 = round2(computed.filter((c) => c.rate <= 0).reduce((a, c) => a + c.base, 0));
    const baseTaxed = round2(computed.filter((c) => c.rate > 0).reduce((a, c) => a + c.base, 0));
    const tax = round2(computed.reduce((a, c) => a + c.tax, 0));
    return { base, base0, baseTaxed, tax, total: round2(base + tax) };
  }, [computed]);

  const openNew = () => {
    setEditingId(null);
    setSupplierId("");
    setSupplierSearch("");
    setDocumentNumber("");
    setEmissionDate(fechaEc());
    setEmissionPoint("001");
    setNotes("");
    setAskQuickLoad(false);
    setPaymentMethod("efectivo");
    setDueDate("");
    setLines([{ item_id: "", item_name: "", quantity: "1", unit_cost: "0" }]);
    setOpen(true);
  };

  const openEdit = (p: Purchase) => {
    setEditingId(p.id);
    setSupplierId(p.supplier_id ?? "");
    setSupplierSearch("");
    setDocumentNumber(p.document_number ?? "");
    setEmissionDate(fechaEc(p.purchased_at));
    setNotes(p.notes ?? "");
    setPaymentMethod(
      (p as unknown as { payment_method?: string | null }).payment_method ?? "efectivo",
    );
    setDueDate((p as unknown as { due_date?: string | null }).due_date ?? "");
    setAskQuickLoad(false);
    const det = detail[p.id] ?? [];
    setLines(
      det.length > 0
        ? det.map((l) => ({
            item_id: l.item_id ?? "",
            item_name: l.item_name,
            quantity: String(Number(l.quantity)),
            unit_cost: String(Number(l.unit_cost)),
          }))
        : [{ item_id: "", item_name: "", quantity: "1", unit_cost: "0" }],
    );
    setOpen(true);
  };

  const setLine = (index: number, patch: Partial<PurchaseLine>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const pickItem = (index: number, id: string) => {
    const item = items.find((i) => i.id === id);
    const factor = Number(item?.purchase_to_inventory) || 1;
    setLine(index, {
      item_id: id,
      item_name: item?.name ?? "",
      unit_cost: item ? String(round6(Number(item.unit_cost) * factor)) : "0",
    });
  };

  const chooseSupplier = (id: string) => {
    setSupplierId(id);
    setAskQuickLoad(Boolean(id) && !editingId);
  };

  /** Trae los ítems comprados antes a este proveedor con su último costo unitario. */
  const quickLoadSupplierItems = async () => {
    if (!supplierId) return;
    setQuickLoading(true);
    const { data, error } = await supabase
      .from("purchase_items")
      .select("item_id, item_name, unit_cost, purchases!inner(supplier_id, purchased_at)")
      .eq("purchases.supplier_id", supplierId)
      .limit(1000);
    setQuickLoading(false);
    if (error) return toast.error(error.message);

    const list = (data ?? []) as unknown as Array<{
      item_id: string | null;
      item_name: string;
      unit_cost: number;
      purchases: { purchased_at: string } | null;
    }>;
    const latest = new Map<string, { name: string; cost: number; at: string }>();
    for (const r of list) {
      if (!r.item_id) continue;
      const at = r.purchases?.purchased_at ?? "";
      const prev = latest.get(r.item_id);
      if (!prev || at > prev.at)
        latest.set(r.item_id, { name: r.item_name, cost: Number(r.unit_cost) || 0, at });
    }
    if (latest.size === 0) {
      setAskQuickLoad(false);
      return toast.info("Este proveedor todavía no tiene ítems comprados.");
    }
    setLines(
      [...latest.entries()].map(([item_id, v]) => ({
        item_id,
        item_name: items.find((i) => i.id === item_id)?.name ?? v.name,
        quantity: "0",
        unit_cost: String(v.cost),
      })),
    );
    setAskQuickLoad(false);
    toast.success(`${latest.size} ítems precargados con su último costo. Ajusta cantidades.`);
  };

  const buildPrint = (
    valid: typeof computed,
    info: { proveedor: string; documento: string; fecha: string },
  ) => ({
    lines: valid.map((c) => ({
      code: c.item?.code ?? "—",
      name: c.line.item_name,
      unit: c.item?.purchase_unit ?? "",
      quantity: Number(c.line.quantity) || 0,
      unitCost: Number(c.line.unit_cost) || 0,
      total: c.total,
    })),
    info: {
      negocio: company?.trade_name ?? company?.business_name ?? "",
      proveedor: info.proveedor,
      documento: info.documento,
      fecha: info.fecha,
      base: totals.base,
      iva: totals.tax,
      total: totals.total,
      notas: notes.trim() || null,
      printer: company?.printer_pos ?? "",
    },
  });

  const logAudit = async (
    purchase: { id: string | null; supplier_name: string; document_number: string },
    action: string,
    payload: Record<string, unknown>,
  ) => {
    await supabase.from("purchase_audit_log").insert({
      purchase_id: purchase.id,
      action,
      supplier_name: purchase.supplier_name,
      document_number: purchase.document_number,
      detail: payload as never,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
    });
  };

  /** Valida antes de pedir confirmación al usuario. */
  const askSave = () => {
    if (!suppliers.find((s) => s.id === supplierId)) return toast.error("Selecciona un proveedor");
    if (!documentNumber.trim()) return toast.error("Ingresa el N° de factura");
    if (computed.filter((c) => c.line.item_id && Number(c.line.quantity) > 0).length === 0)
      return toast.error("Agrega al menos un ítem con cantidad");
    setConfirmSave(true);
  };

  /** Imprime un borrador del comprobante antes de guardarlo. */
  const printDraft = () => {
    const valid = computed.filter((c) => c.line.item_id && Number(c.line.quantity) > 0);
    if (valid.length === 0) return toast.error("Agrega al menos un ítem con cantidad");
    const job = buildPrint(valid, {
      proveedor: suppliers.find((s) => s.id === supplierId)?.name ?? "—",
      documento: documentNumber.trim() || "—",
      fecha: fmtDate(`${emissionDate}T12:00:00-05:00`),
    });
    printPurchaseA4(job.lines, job.info);
  };

  const save = async () => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) return toast.error("Selecciona un proveedor");
    if (!documentNumber.trim()) return toast.error("Ingresa el N° de factura");
    const valid = computed.filter((c) => c.line.item_id && Number(c.line.quantity) > 0);
    if (valid.length === 0) return toast.error("Agrega al menos un ítem con cantidad");
    if (editingId && !isSuperAdmin)
      return toast.error("Solo el Administrador puede editar una compra.");

    // Un cambio con fecha anterior a hoy afecta reportes ya calculados.
    const esPasada = emissionDate < fechaEc(new Date());
    if (
      esPasada &&
      !window.confirm("Este cambio afecta reportes anteriores. ¿Guardar y recalcular?")
    )
      return;

    setSaving(true);
    let purchaseId = editingId;

    if (editingId) {
      // Revierte stock y costos generados por la compra original antes de re-aplicar.
      const before = detail[editingId] ?? [];
      try {
        await revertPurchase({ data: { purchaseId: editingId } });
      } catch (e) {
        setSaving(false);
        return toast.error(e instanceof Error ? e.message : "No se pudo revertir la compra");
      }

      const { error: updError } = await supabase
        .from("purchases")
        .update({
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          document_number: documentNumber.trim(),
          notes: notes.trim() || null,
          tax_base: totals.base,
          tax_amount: totals.tax,
          total: totals.total,
          payment_method: paymentMethod,
          due_date: paymentMethod === "credito" ? dueDate || null : null,
          paid: paymentMethod !== "credito",
          paid_at: paymentMethod !== "credito" ? new Date().toISOString() : null,
        })
        .eq("id", editingId);
      if (updError) {
        setSaving(false);
        return toast.error(updError.message);
      }
      await logAudit(
        { id: editingId, supplier_name: supplier.name, document_number: documentNumber.trim() },
        "editada",
        {
          antes: before.map((l) => ({
            item: l.item_name,
            cantidad: Number(l.quantity),
            costo: Number(l.unit_cost),
          })),
          despues: valid.map((c) => ({
            item: c.line.item_name,
            cantidad: Number(c.line.quantity),
            costo: Number(c.line.unit_cost),
          })),
          total: totals.total,
        },
      );
    } else {
      const { data, error } = await supabase
        .from("purchases")
        .insert({
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          document_number: documentNumber.trim(),
          notes: notes.trim() || null,
          tax_base: totals.base,
          tax_amount: totals.tax,
          total: totals.total,
          payment_method: paymentMethod,
          due_date: paymentMethod === "credito" ? dueDate || null : null,
          paid: paymentMethod !== "credito",
          paid_at: paymentMethod !== "credito" ? new Date().toISOString() : null,
          purchased_at: `${emissionDate}T12:00:00-05:00`,
        })
        .select("id")
        .single();

      if (error || !data) {
        setSaving(false);
        return toast.error(error?.message ?? "No se pudo registrar la compra");
      }
      purchaseId = data.id;
    }

    const { error: itemsError } = await supabase.from("purchase_items").insert(
      valid.map((c) => ({
        purchase_id: purchaseId as string,
        item_id: c.line.item_id,
        item_name: c.line.item_name,
        quantity: Number(c.line.quantity),
        unit_cost: Number(c.line.unit_cost) || 0,
        subtotal: c.base,
        tax_treatment: c.treatment,
        tax_rate: c.rate,
        tax_amount: c.tax,
      })),
    );

    setSaving(false);
    if (itemsError) return toast.error(itemsError.message);

    toast.success(
      editingId
        ? "Compra actualizada. Costos y movimientos recalculados."
        : "Compra registrada. Stock y costos actualizados.",
    );
    // Los reportes pre-calculados (Mix y P&G) se actualizan en segundo plano.
    void recalcularReportes({ data: { fecha: emissionDate } }).catch(() => undefined);

    setPrintJob(
      buildPrint(valid, {
        proveedor: supplier.name,
        documento: documentNumber.trim(),
        fecha: fmtDate(`${emissionDate}T12:00:00-05:00`),
      }),
    );
    setOpen(false);
    setEditingId(null);
    load();
    onSaved();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deletePurchase({ data: { purchaseId: deleting.id } });
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "No se pudo eliminar la compra");
    }

    await logAudit(
      {
        id: null,
        supplier_name: deleting.supplier_name,
        document_number: deleting.document_number,
      },
      "eliminada",
      {
        total: Number(deleting.total),
        items: (detail[deleting.id] ?? []).map((l) => ({
          item: l.item_name,
          cantidad: Number(l.quantity),
          costo: Number(l.unit_cost),
        })),
      },
    );
    toast.success("Compra eliminada. Movimientos y costos revertidos.");
    setDeleting(null);
    load();
    onSaved();
  };

  /** Reimprime un comprobante ya guardado. */
  const printSaved = (p: Purchase, format: "ticket" | "a4") => {
    const det = detail[p.id] ?? [];
    const printLines: PurchasePrintLine[] = det.map((l) => {
      const item = items.find((i) => i.id === l.item_id);
      return {
        code: item?.code ?? "—",
        name: l.item_name,
        unit: item?.purchase_unit ?? "",
        quantity: Number(l.quantity),
        unitCost: Number(l.unit_cost),
        total: round2(Number(l.subtotal) + (Number(l.tax_amount) || 0)),
      };
    });
    const info: PurchasePrintInfo = {
      negocio: company?.trade_name ?? company?.business_name ?? "",
      proveedor: p.supplier_name,
      documento: p.document_number,
      fecha: fmtDate(p.purchased_at),
      base: Number(p.tax_base) || 0,
      iva: Number(p.tax_amount) || 0,
      total: Number(p.total) || 0,
      notas: p.notes,
      printer: company?.printer_pos ?? "",
    };
    if (format === "ticket") printPurchaseTicket(printLines, info);
    else printPurchaseA4(printLines, info);
  };

  /** Filas filtradas por el buscador de proveedor o número de factura. */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) =>
      `${p.supplier_name ?? ""} ${p.document_number ?? ""}`.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(currentPage * PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [search, from, to, supplierFilter, itemFilter]);

  /** Números de página con puntos suspensivos, como en la referencia. */
  const pageNumbers = useMemo(() => {
    const out: (number | "…")[] = [];
    for (let n = 1; n <= totalPages; n++) {
      if (n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1) out.push(n);
      else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
  }, [totalPages, currentPage]);

  /** Reporte A4 del historial filtrado. */
  const printHistory = () => {
    if (!filtered.length) return toast.error("No hay compras para imprimir.");
    const filas = filtered
      .map(
        (p) => `<tr>
          <td>${esc(fmtDate(p.purchased_at))}</td>
          <td>${esc(p.supplier_name || "—")}</td>
          <td>${esc(p.document_number || "—")}</td>
          <td class="r">${esc(currency(Number(p.total) || 0))}</td>
        </tr>`,
      )
      .join("");
    const total = filtered.reduce((a, p) => a + (Number(p.total) || 0), 0);
    printReportA4({
      titulo: "Historial de compras",
      negocio: company?.trade_name || company?.business_name || "Costea Pro",
      periodo: from || to ? `${from || "inicio"} al ${to || "hoy"}` : "Todos los registros",
      fontSize: "10px",
      cuerpo: `<table>
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>N° Factura</th><th class="r">Total $</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr><td colspan="3">Total general (${filtered.length} compras)</td><td class="r">${esc(currency(total))}</td></tr></tfoot>
      </table>`,
      firmas: ["Elaborado por", "Revisado por", "Administrador"],
    });
  };

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Historial de Compras
          </h2>
          <p className="text-sm text-muted-foreground">
            Gestione y revise todos los registros de compras a proveedores.
          </p>
        </div>
        <Button className="shrink-0" onClick={openNew}>
          <Plus className="mr-2 size-4" /> Registrar Compra
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label>Buscar Proveedor o Factura</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Ej. La Granja, 001-…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Fecha Inicio</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>Fecha Fin</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => setShowAdvanced((v) => !v)}>
            <SlidersHorizontal className="mr-2 size-4" /> Filtros Avanzados
          </Button>
          <Button variant="outline" onClick={printHistory}>
            <Printer className="mr-2 size-4" /> Imprimir
          </Button>
        </div>

        {showAdvanced && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div>
              <Label>Proveedor</Label>
              <select
                className={selectClass}
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Ítem</Label>
              <select
                className={selectClass}
                value={itemFilter}
                onChange={(e) => setItemFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">N° Factura</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(p.purchased_at)}</td>
                  <td className="px-3 py-2">{p.supplier_name || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.document_number || "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {currency(Number(p.total) || 0)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setViewing(p)}>
                        <Eye className="mr-1 size-4" /> Ver
                      </Button>
                      {isSuperAdmin && (
                        <Button
                          size="sm"
                          variant="destructive"
                          aria-label="Eliminar compra"
                          onClick={() => setDeleting(p)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground">
                    No hay compras registradas con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground">
          <span>
            Mostrando {firstShown} a {lastShown} de {filtered.length} registros
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Página anterior"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            {pageNumbers.map((n, idx) =>
              n === "…" ? (
                <span key={`gap-${idx}`} className="px-1">
                  …
                </span>
              ) : (
                <Button
                  key={n}
                  size="icon"
                  variant={n === currentPage ? "default" : "ghost"}
                  onClick={() => setPage(n)}
                >
                  {n}
                </Button>
              ),
            )}
            <Button
              size="icon"
              variant="ghost"
              aria-label="Página siguiente"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(viewing)} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Detalle de la compra</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Proveedor: </span>
                  <span className="font-medium">{viewing.supplier_name || "—"}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">N° Factura: </span>
                  <span className="font-medium">{viewing.document_number || "—"}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Fecha: </span>
                  <span className="font-medium">{fmtDate(viewing.purchased_at)}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-medium">{currency(Number(viewing.total) || 0)}</span>
                </p>
              </div>

              <table className="tabular w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-1">Cant.</th>
                    <th>Descripción</th>
                    <th className="text-right">Costo unit.</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail[viewing.id] ?? []).map((l, idx) => (
                    <tr key={idx} className="border-b border-border/60">
                      <td className="py-1">{Number(l.quantity)}</td>
                      <td>
                        {l.item_name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {Number(l.tax_rate) > 0
                            ? `IVA ${Number(l.tax_rate)}% · ${currency(Number(l.tax_amount) || 0)}`
                            : "Sin IVA"}
                        </span>
                      </td>
                      <td className="text-right">{currency(Number(l.unit_cost) || 0)}</td>
                      <td className="text-right">
                        {currency(Number(l.subtotal) + (Number(l.tax_amount) || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="text-xs text-muted-foreground">
                Base imponible {currency(Number(viewing.tax_base) || 0)} · IVA{" "}
                {currency(Number(viewing.tax_amount) || 0)} · Total{" "}
                {currency(Number(viewing.total) || 0)}
              </p>
              {viewing.notes && <p className="text-xs text-muted-foreground">{viewing.notes}</p>}

              <DialogFooter className="flex-wrap gap-2">
                {isSuperAdmin && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const p = viewing;
                      setViewing(null);
                      openEdit(p);
                    }}
                  >
                    <Pencil className="mr-1 size-4" /> Editar
                  </Button>
                )}
                <Button variant="outline" onClick={() => printSaved(viewing, "ticket")}>
                  <Printer className="mr-1 size-4" /> Imprimir térmico
                </Button>
                <Button onClick={() => printSaved(viewing, "a4")}>
                  <FileText className="mr-1 size-4" /> Imprimir A4 / PDF
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0 text-left">
            <div>
              <DialogTitle className="font-display text-2xl">
                {editingId ? "Editar compra" : "Registrar Nueva Compra"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Ingrese los detalles de la factura del proveedor para registrar la transacción.
              </p>
            </div>
            <span className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">
              Hoy: {fechaEc().split("-").reverse().join("/")}
            </span>
          </DialogHeader>

          {/* Datos del comprobante */}
          <section className="rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4 text-primary" /> Datos del Comprobante
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Proveedor</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="Buscar proveedor…"
                    className="pl-8"
                  />
                </div>
                <select
                  className={selectClass}
                  value={supplierId}
                  onChange={(e) => chooseSupplier(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {suppliers
                    .filter(
                      (s) =>
                        s.active &&
                        s.name.toLowerCase().includes(supplierSearch.trim().toLowerCase()),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fecha de Emisión</Label>
                <Input
                  type="date"
                  value={emissionDate}
                  onChange={(e) => setEmissionDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">N° Factura</Label>
                <Input
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="000-000-000000000"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Punto de Emisión</Label>
                <select
                  className={selectClass}
                  value={emissionPoint}
                  onChange={(e) => setEmissionPoint(e.target.value)}
                >
                  <option value="001">Matriz (001)</option>
                  <option value="002">Sucursal (002)</option>
                  <option value="003">Bodega (003)</option>
                </select>
              </div>
            </div>
          </section>

          {askQuickLoad && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-sm">
                ⚡ ¿Desea traer los ítems de este proveedor con su último costo?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={quickLoadSupplierItems} disabled={quickLoading}>
                  {quickLoading ? "Cargando…" : "Sí, traer ítems"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAskQuickLoad(false)}>
                  No, ingresar manual
                </Button>
              </div>
            </div>
          )}

          {/* Detalle de ítems */}
          <section className="rounded-lg border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Detalle de Ítems</h3>
              <Button
                size="sm"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { item_id: "", item_name: "", quantity: "1", unit_cost: "0" },
                  ])
                }
              >
                <Plus className="mr-2 size-4" /> Agregar producto/insumo
              </Button>
            </div>

            <div className="hidden grid-cols-[70px_120px_1fr_120px_110px_44px] gap-2 border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Cant.</span>
              <span>Unidad de compra</span>
              <span>Descripción del ítem</span>
              <span className="text-right">Costo unit.</span>
              <span className="text-right">Subtotal</span>
              <span className="text-center">Acción</span>
            </div>

            <div className="divide-y divide-border">
              {lines.map((l, index) => {
                const item = items.find((i) => i.id === l.item_id);
                const factor = Number(item?.purchase_to_inventory) || 1;
                const qty = Number(l.quantity) || 0;
                return (
                  <div key={index} className="py-2">
                    <div className="grid items-center gap-2 sm:grid-cols-[70px_120px_1fr_120px_110px_44px]">
                      <Input
                        type="number"
                        step="0.000001"
                        value={l.quantity}
                        onChange={(e) => setLine(index, { quantity: e.target.value })}
                        placeholder="Cant."
                        className="text-center"
                      />
                      <div
                        className="flex h-10 items-center rounded-md border border-border bg-muted/50 px-2 text-sm text-muted-foreground"
                        title="Unidad de compra configurada en el producto"
                      >
                        <span className="sm:hidden mr-1 text-[11px] uppercase">Unidad:</span>
                        <span className="truncate">{item?.purchase_unit || "—"}</span>
                      </div>
                      <select
                        className={selectClass}
                        value={l.item_id}
                        onChange={(e) => pickItem(index, e.target.value)}
                      >
                        <option value="">Selecciona ítem…</option>
                        {items
                          .filter((i) => i.active)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                      </select>
                      <Input
                        type="number"
                        step="0.01"
                        value={l.unit_cost}
                        onChange={(e) => setLine(index, { unit_cost: e.target.value })}
                        placeholder="Costo"
                        className="text-right"
                      />
                      <span className="tabular text-right text-sm font-medium">
                        {currency(computed[index]?.base ?? 0)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Quitar línea"
                        className="justify-self-center text-destructive"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {item && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cantidad y costo en 🛒 {item.purchase_unit} → ingresa al inventario{" "}
                        <strong className="text-foreground">
                          {fmtQty(qty * factor)} {item.unit}
                        </strong>{" "}
                        · costo por {item.unit}:{" "}
                        {currency((Number(l.unit_cost) || 0) / (factor || 1))} ·{" "}
                        {taxLabelOf(item.tax_treatment)} · IVA{" "}
                        {currency(computed[index]?.tax ?? 0)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Pago / observaciones + resumen */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Forma de Pago</Label>
                <select
                  className={selectClass}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="efectivo">Contado (efectivo)</option>
                  <option value="credito">Crédito de proveedor</option>
                </select>
              </div>
              {paymentMethod === "credito" && (
                <div>
                  <Label className="text-xs">Fecha de vencimiento</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              )}
              <div>
                <Label className="text-xs">Observaciones</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas adicionales sobre esta compra…"
                  rows={4}
                />
              </div>
            </div>

            <div className="space-y-2 self-start rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal 0%</span>
                <span className="tabular">{currency(totals.base0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal gravado</span>
                <span className="tabular">{currency(totals.baseTaxed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA</span>
                <span className="tabular">{currency(totals.tax)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="font-semibold">TOTAL GENERAL</span>
                <span className="tabular font-display text-xl font-semibold text-primary">
                  {currency(totals.total)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={printDraft}>
              <Printer className="mr-2 size-4" /> Imprimir
            </Button>
            <Button onClick={askSave} disabled={saving}>
              {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Guardar Compra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSave} onOpenChange={setConfirmSave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Guardar esta compra?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se actualizarán inventario y costos con los ítems ingresados.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmSave(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setConfirmSave(false);
                void save();
              }}
              disabled={saving}
            >
              Sí, guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={Boolean(printJob)} onOpenChange={(v) => !v && setPrintJob(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Imprimir comprobante de compra</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Elige el formato del comprobante interno de la compra registrada.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (printJob) printPurchaseTicket(printJob.lines, printJob.info);
                setPrintJob(null);
              }}
            >
              <Printer className="mr-2 size-4" /> Formato térmico
            </Button>
            <Button
              onClick={() => {
                if (printJob) printPurchaseA4(printJob.lines, printJob.info);
                setPrintJob(null);
              }}
            >
              <FileText className="mr-2 size-4" /> Formato A4 / PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar compra</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se revertirán el stock y los costos que generó la compra de{" "}
            <strong className="text-foreground">{deleting?.supplier_name}</strong> por{" "}
            {currency(Number(deleting?.total ?? 0))}. Esta acción queda registrada en el historial.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Eliminar y revertir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
