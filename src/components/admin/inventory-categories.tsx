import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

export type InventoryCategory = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

/** Categorías de inventario: independientes de las categorías de venta del POS. */
export function useInventoryCategories() {
  const [categories, setCategories] = useState<InventoryCategory[]>([]);

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory_categories")
      .select("id, name, description, active")
      .order("name");
    if (error) return toast.error(error.message);
    setCategories((data as InventoryCategory[]) ?? []);
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  return { categories, loadCategories };
}

const empty = { name: "", description: "", active: true };

export function InventoryCategoriesTab({
  rows,
  reload,
}: {
  rows: InventoryCategory[];
  reload: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const openNew = () => {
    setForm({ ...empty });
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (c: InventoryCategory) => {
    setForm({ name: c.name, description: c.description ?? "", active: c.active });
    setEditing(c.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("El nombre de la categoría es obligatorio");
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      active: form.active,
    };
    const { error } = editing
      ? await supabase.from("inventory_categories").update(payload).eq("id", editing)
      : await supabase.from("inventory_categories").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Categoría actualizada" : "Categoría creada");
    setOpen(false);
    reload();
  };

  const toggleActive = async (c: InventoryCategory) => {
    const { error } = await supabase
      .from("inventory_categories")
      .update({ active: !c.active })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    reload();
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar categoría de inventario"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 size-4" /> Nueva categoría
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-secondary/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.description || "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${c.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
                  >
                    {c.active ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(c)}>
                    {c.active ? "Desactivar" : "Activar"}
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  Sin categorías de inventario registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar categoría" : "Nueva categoría de inventario"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre de la categoría</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Cárnicos, Lácteos, Abarrotes…"
              />
            </div>
            <div>
              <Label>Descripción (opcional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Estado</Label>
              <select
                className={selectClass}
                value={form.active ? "1" : "0"}
                onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
              >
                <option value="1">Activa</option>
                <option value="0">Inactiva</option>
              </select>
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
