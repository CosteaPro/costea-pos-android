import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Printer, Trash2, Pencil, ArrowLeft, Tags, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { currency } from "@/lib/pos";
import { ecBusinessDate } from "@/lib/caja";

const round2 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export type ExpenseCategory = { id: string; name: string; active: boolean };

export type ExpenseSupplier = {
  id: string;
  name: string;
  id_number: string;
  phone: string | null;
  email: string | null;
};

export type Expense = {
  id: string;
  business_date: string;
  category_id: string | null;
  category_name: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_id_number: string | null;
  document_number: string;
  doc_type: string;
  description: string;
  base_amount: number;
  iva_rate: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  due_date: string | null;
  paid: boolean;
  paid_at: string | null;
  notes: string | null;
};

const emptyForm = () => ({
  business_date: ecBusinessDate(new Date()),
  category_id: "",
  supplier_id: "",
  supplier_name: "",
  supplier_id_number: "",
  document_number: "",
  doc_type: "factura",
  description: "",
  base_amount: "0",
  payment_method: "efectivo",
  due_date: "",
  notes: "",
});

type ReportMode = null | "detalle" | "categoria";

export function ExpensesPanel() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [suppliers, setSuppliers] = useState<ExpenseSupplier[]>([]);
  const [rows, setRows] = useState<Expense[]>([]);
  const [from, setFrom] = useState(ecBusinessDate(new Date()).slice(0, 8) + "01");
  const [to, setTo] = useState(ecBusinessDate(new Date()));
  const [categoryFilter, setCategoryFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ReportMode>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [supsOpen, setSupsOpen] = useState(false);
  const [newSupOpen, setNewSupOpen] = useState(false);

  const ivaRate = 15;

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from("expense_categories")
      .select("id, name, active")
      .order("name");
    setCategories((data ?? []) as ExpenseCategory[]);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase
      .from("suppliers")
      .select("id, name, id_number, phone, email")
      .eq("active", true)
      .order("name");
    setSuppliers((data ?? []) as ExpenseSupplier[]);
  }, []);

  const load = useCallback(async () => {
    let q = supabase
      .from("expenses")
      .select("*")
      .order("business_date", { ascending: false })
      .limit(500);
    if (from) q = q.gte("business_date", from);
    if (to) q = q.lte("business_date", to);
    if (categoryFilter) q = q.eq("category_id", categoryFilter);
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Expense[]);
  }, [from, to, categoryFilter]);

  useEffect(() => {
    loadCategories();
    loadSuppliers();
  }, [loadCategories, loadSuppliers]);
  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const base = round2(rows.reduce((a, r) => a + Number(r.base_amount || 0), 0));
    const tax = round2(rows.reduce((a, r) => a + Number(r.tax_amount || 0), 0));
    return { base, tax, total: round2(base + tax) };
  }, [rows]);

  const baseNum = Number(String(form.base_amount).replace(",", ".")) || 0;
  const taxPreview = form.doc_type === "factura" ? round2((baseNum * ivaRate) / 100) : 0;
  const totalPreview = round2(baseNum + taxPreview);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({
      business_date: e.business_date,
      category_id: e.category_id ?? "",
      supplier_id: e.supplier_id ?? "",
      supplier_name: e.supplier_name ?? "",
      supplier_id_number: e.supplier_id_number ?? "",
      document_number: e.document_number ?? "",
      doc_type: e.doc_type,
      description: e.description ?? "",
      base_amount: String(Number(e.base_amount)),
      payment_method: e.payment_method,
      due_date: e.due_date ?? "",
      notes: e.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.description.trim()) return toast.error("Describe el gasto");
    if (baseNum <= 0) return toast.error("El valor base debe ser mayor a cero");
    if (form.payment_method === "credito" && !form.due_date)
      return toast.error("Ingresa la fecha de vencimiento del crédito");

    setSaving(true);
    const category = categories.find((c) => c.id === form.category_id);
    const supplier = suppliers.find((s) => s.id === form.supplier_id);
    const payload = {
      business_date: form.business_date,
      category_id: form.category_id || null,
      category_name: category?.name ?? "Otros",
      supplier_id: form.supplier_id || null,
      supplier_name: supplier?.name ?? form.supplier_name.trim(),
      supplier_id_number: supplier?.id_number ?? form.supplier_id_number.trim() ?? null,
      document_number: form.document_number.trim(),
      doc_type: form.doc_type,
      description: form.description.trim(),
      base_amount: baseNum,
      iva_rate: form.doc_type === "factura" ? ivaRate : 0,
      tax_amount: taxPreview,
      total: totalPreview,
      payment_method: form.payment_method,
      due_date: form.payment_method === "credito" ? form.due_date : null,
      paid: form.payment_method !== "credito",
      paid_at: form.payment_method !== "credito" ? new Date().toISOString() : null,
      notes: form.notes.trim() || null,
      created_by: user?.id ?? null,
    };

    const { error } = editingId
      ? await supabase.from("expenses").update(payload).eq("id", editingId)
      : await supabase.from("expenses").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editingId ? "Gasto actualizado" : "Gasto registrado");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!window.confirm("¿Eliminar este gasto? Se actualizarán todos los reportes.")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Gasto eliminado");
    load();
  };

  if (report === "detalle")
    return (
      <ExpensesReport rows={rows} from={from} to={to} totals={totals} onBack={() => setReport(null)} />
    );
  if (report === "categoria")
    return (
      <ExpensesCategoryReport
        rows={rows}
        from={from}
        to={to}
        totals={totals}
        onBack={() => setReport(null)}
      />
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-4">
        <div>
          <Label>Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label>Categoría</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button className="w-full" onClick={openNew}>
            <Plus className="mr-2 size-4" /> Registrar gasto
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setCatsOpen(true)}>
          <Tags className="mr-2 size-4" /> Categorías de gasto
        </Button>
        <Button variant="outline" onClick={() => setSupsOpen(true)}>
          <Truck className="mr-2 size-4" /> Proveedores
        </Button>
        <Button variant="outline" onClick={() => setReport("detalle")}>
          <Printer className="mr-2 size-4" /> Reporte detallado
        </Button>
        <Button variant="outline" onClick={() => setReport("categoria")}>
          <Printer className="mr-2 size-4" /> Resumen por categoría
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Base imponible" value={totals.base} />
        <SummaryCard label="IVA crédito tributario" value={totals.tax} />
        <SummaryCard label="Total gastos" value={totals.total} />
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Fecha</th>
                <th>Categoría</th>
                <th>Proveedor</th>
                <th>Descripción</th>
                <th>Comprobante</th>
                <th className="text-right">Base $</th>
                <th className="text-right">IVA $</th>
                <th className="text-right">Total $</th>
                <th>Pago</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2">{fmtDate(r.business_date)}</td>
                  <td>{r.category_name}</td>
                  <td>{r.supplier_name || "—"}</td>
                  <td>{r.description}</td>
                  <td>{r.doc_type === "factura" ? "Factura" : "Nota de venta"}</td>
                  <td className="text-right">{currency(Number(r.base_amount))}</td>
                  <td className="text-right">{currency(Number(r.tax_amount))}</td>
                  <td className="text-right font-semibold">{currency(Number(r.total))}</td>
                  <td>
                    {r.payment_method === "credito"
                      ? `Crédito${r.paid ? " · pagado" : " · pendiente"}`
                      : "Efectivo"}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove(r.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-muted-foreground">
                    No hay gastos en el período seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar gasto" : "Registrar gasto"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={form.business_date}
                onChange={(e) => setForm({ ...form, business_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Categoría</Label>
              <div className="flex gap-2">
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">Otros</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="icon" onClick={() => setCatsOpen(true)}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Proveedor</Label>
              <div className="flex gap-2">
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.supplier_id}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                >
                  <option value="">Sin proveedor</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.id_number ? `· ${s.id_number}` : ""}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="icon" onClick={() => setNewSupOpen(true)}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo de comprobante</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.doc_type}
                onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
              >
                <option value="factura">Factura (con IVA 15%)</option>
                <option value="nota_venta">Nota de venta (IVA 0.00)</option>
              </select>
            </div>
            <div>
              <Label>N° de comprobante</Label>
              <Input
                value={form.document_number}
                onChange={(e) => setForm({ ...form, document_number: e.target.value })}
              />
            </div>
            <div>
              <Label>
                {form.doc_type === "factura" ? "Base imponible $" : "Total del gasto $"}
              </Label>
              <Input
                inputMode="decimal"
                value={form.base_amount}
                onChange={(e) => setForm({ ...form, base_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Forma de pago</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              >
                <option value="efectivo">Efectivo hoy</option>
                <option value="credito">Crédito de proveedor</option>
              </select>
            </div>
            {form.payment_method === "credito" && (
              <div className="sm:col-span-2">
                <Label>Fecha de vencimiento</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>Observaciones</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
            <span className="tabular text-sm">
              Base <strong>{currency(baseNum)}</strong> · IVA <strong>{currency(taxPreview)}</strong>{" "}
              · Total <strong>{currency(totalPreview)}</strong>
            </span>
            <Button onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar gasto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CategoriesDialog
        open={catsOpen}
        onOpenChange={setCatsOpen}
        categories={categories}
        reload={() => {
          loadCategories();
          load();
        }}
      />

      <SuppliersDialog
        open={supsOpen}
        onOpenChange={setSupsOpen}
        suppliers={suppliers}
        reload={loadSuppliers}
      />

      <NewSupplierDialog
        open={newSupOpen}
        onOpenChange={setNewSupOpen}
        onCreated={async (id) => {
          await loadSuppliers();
          setForm((f) => ({ ...f, supplier_id: id }));
        }}
      />
    </div>
  );
}

function CategoriesDialog({
  open,
  onOpenChange,
  categories,
  reload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: ExpenseCategory[];
  reload: () => void;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const { error } = await supabase.from("expense_categories").insert({ name: n });
    if (error) return toast.error(error.message);
    setName("");
    toast.success("Categoría creada");
    reload();
  };

  const saveEdit = async () => {
    if (!editing || !editing.name.trim()) return;
    const { error } = await supabase
      .from("expense_categories")
      .update({ name: editing.name.trim() })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    setEditing(null);
    toast.success("Categoría actualizada");
    reload();
  };

  const remove = async (id: string) => {
    if (!window.confirm("¿Eliminar esta categoría?")) return;
    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Categoría eliminada");
    reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Categorías de gasto</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label>Nueva categoría</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Mantenimiento"
            />
          </div>
          <Button onClick={add}>
            <Plus className="mr-2 size-4" /> Agregar
          </Button>
        </div>

        <ul className="divide-y divide-border rounded-md border border-border">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              {editing?.id === c.id ? (
                <>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                  <Button size="sm" onClick={saveEdit}>
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{c.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing({ id: c.id, name: c.name })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => remove(c.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
          {categories.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
              Aún no hay categorías.
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function SuppliersDialog({
  open,
  onOpenChange,
  suppliers,
  reload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: ExpenseSupplier[];
  reload: () => void;
}) {
  const [editing, setEditing] = useState<ExpenseSupplier | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const saveEdit = async () => {
    if (!editing || !editing.name.trim()) return toast.error("Ingresa el nombre");
    const { error } = await supabase
      .from("suppliers")
      .update({
        name: editing.name.trim(),
        id_number: editing.id_number.trim(),
        phone: editing.phone?.trim() || null,
        email: editing.email?.trim() || null,
      })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    setEditing(null);
    toast.success("Proveedor actualizado");
    reload();
  };

  const remove = async (id: string) => {
    if (!window.confirm("¿Eliminar este proveedor?")) return;
    const { error } = await supabase.from("suppliers").update({ active: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Proveedor eliminado");
    reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Proveedores de gastos</DialogTitle>
        </DialogHeader>

        <Button className="w-fit" onClick={() => setNewOpen(true)}>
          <Plus className="mr-2 size-4" /> Nuevo proveedor
        </Button>

        <ul className="divide-y divide-border rounded-md border border-border">
          {suppliers.map((s) => (
            <li key={s.id} className="px-3 py-2">
              {editing?.id === s.id ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Nombre"
                  />
                  <Input
                    value={editing.id_number}
                    onChange={(e) => setEditing({ ...editing, id_number: e.target.value })}
                    placeholder="RUC / Cédula"
                  />
                  <Input
                    value={editing.phone ?? ""}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    placeholder="Teléfono"
                  />
                  <Input
                    value={editing.email ?? ""}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                    placeholder="Correo"
                  />
                  <div className="flex gap-2 sm:col-span-2">
                    <Button size="sm" onClick={saveEdit}>
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-sm">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[s.id_number, s.phone, s.email].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => remove(s.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
          {suppliers.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
              Aún no hay proveedores.
            </li>
          )}
        </ul>

        <NewSupplierDialog open={newOpen} onOpenChange={setNewOpen} onCreated={() => reload()} />
      </DialogContent>
    </Dialog>
  );
}

function NewSupplierDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Ingresa el nombre del proveedor");
    setSaving(true);
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        name: name.trim(),
        id_number: idNumber.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Proveedor creado");
    setName("");
    setIdNumber("");
    setPhone("");
    setEmail("");
    onOpenChange(false);
    if (data?.id) await onCreated(data.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo proveedor</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>RUC / Cédula</Label>
            <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>Correo</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar proveedor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular font-display text-xl font-semibold">{currency(value)}</p>
    </div>
  );
}

function ReportShell({
  title,
  from,
  to,
  onBack,
  children,
}: {
  title: string;
  from: string;
  to: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-6 text-black">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex justify-end gap-2 print:hidden">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 size-4" /> Regresar
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 size-4" /> Imprimir
          </Button>
        </div>
        <h1 className="text-center text-xl font-bold">{title}</h1>
        <p className="mb-4 text-center text-sm">
          Período: {from ? fmtDate(from) : "—"} al {to ? fmtDate(to) : "—"}
        </p>
        {children}
      </div>
    </div>
  );
}

function ExpensesReport({
  rows,
  from,
  to,
  totals,
  onBack,
}: {
  rows: Expense[];
  from: string;
  to: string;
  totals: { base: number; tax: number; total: number };
  onBack: () => void;
}) {
  return (
    <ReportShell title="Reporte detallado de gastos" from={from} to={to} onBack={onBack}>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1">Fecha</th>
            <th>Proveedor</th>
            <th>Categoría</th>
            <th>Descripción</th>
            <th>Comprobante</th>
            <th className="text-right">Base $</th>
            <th className="text-right">IVA $</th>
            <th className="text-right">Total $</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-300">
              <td className="py-1">{fmtDate(r.business_date)}</td>
              <td>{r.supplier_name || "—"}</td>
              <td>{r.category_name}</td>
              <td>{r.description}</td>
              <td>{r.doc_type === "factura" ? "Factura" : "Nota de venta"}</td>
              <td className="text-right">{currency(Number(r.base_amount))}</td>
              <td className="text-right">{currency(Number(r.tax_amount))}</td>
              <td className="text-right">{currency(Number(r.total))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td className="py-1" colSpan={5}>
              TOTALES
            </td>
            <td className="text-right">{currency(totals.base)}</td>
            <td className="text-right">{currency(totals.tax)}</td>
            <td className="text-right">{currency(totals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </ReportShell>
  );
}

function ExpensesCategoryReport({
  rows,
  from,
  to,
  totals,
  onBack,
}: {
  rows: Expense[];
  from: string;
  to: string;
  totals: { base: number; tax: number; total: number };
  onBack: () => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, { base: number; tax: number; total: number; count: number }>();
    for (const r of rows) {
      const key = r.category_name || "Otros";
      const acc = map.get(key) ?? { base: 0, tax: 0, total: 0, count: 0 };
      acc.base += Number(r.base_amount || 0);
      acc.tax += Number(r.tax_amount || 0);
      acc.total += Number(r.total || 0);
      acc.count += 1;
      map.set(key, acc);
    }
    return [...map.entries()]
      .map(([name, v]) => ({
        name,
        base: round2(v.base),
        tax: round2(v.tax),
        total: round2(v.total),
        count: v.count,
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  return (
    <ReportShell title="Resumen de gastos por categoría" from={from} to={to} onBack={onBack}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1">Categoría</th>
            <th className="text-right">N° gastos</th>
            <th className="text-right">Base $</th>
            <th className="text-right">IVA $</th>
            <th className="text-right">Total $</th>
            <th className="text-right">% del total</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((g) => (
            <tr key={g.name} className="border-b border-gray-300">
              <td className="py-1">{g.name}</td>
              <td className="text-right">{g.count}</td>
              <td className="text-right">{currency(g.base)}</td>
              <td className="text-right">{currency(g.tax)}</td>
              <td className="text-right">{currency(g.total)}</td>
              <td className="text-right">
                {totals.total ? ((g.total / totals.total) * 100).toFixed(1) : "0.0"}%
              </td>
            </tr>
          ))}
          {grouped.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center">
                No hay gastos en el período seleccionado.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td className="py-1" colSpan={2}>
              TOTAL GENERAL
            </td>
            <td className="text-right">{currency(totals.base)}</td>
            <td className="text-right">{currency(totals.tax)}</td>
            <td className="text-right">{currency(totals.total)}</td>
            <td className="text-right">100%</td>
          </tr>
        </tfoot>
      </table>
    </ReportShell>
  );
}
