import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRole } from "@/hooks/useRole";
import { AVISO_PRIVACIDAD, ID_TYPES, type Customer } from "@/lib/pos";
import { isValidCedula, isValidRuc } from "@/lib/sri";
import { useProgressiveList } from "@/hooks/useProgressiveList";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes frecuentes | Costea POS" },
      {
        name: "description",
        content:
          "Registro de clientes frecuentes con identificación, contacto y aviso de privacidad conforme a la Ley de Protección de Datos del Ecuador.",
      },
      { property: "og:title", content: "Clientes frecuentes | Costea POS" },
      {
        property: "og:description",
        content: "Consulta y administra los clientes registrados para facturación electrónica.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <CustomersScreen />
    </AppShell>
  ),
});

const empty = {
  id_type: "cedula",
  id_number: "",
  name: "",
  address: "",
  email: "",
  phone: "",
  notes: "",
};

function CustomersScreen() {
  const { isAdmin } = useRole();
  const [rows, setRows] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [editing, setEditing] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("customers").select("*").order("name");
    if (error) toast.error(error.message);
    setRows((data as Customer[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.id_number.toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Carga diferida: se pintan las filas visibles y el resto al hacer scroll.
  const { rendered: visibles, hasMore: hayMas, sentinelRef } = useProgressiveList(filtered, 40);

  const openNew = () => {
    setForm({ ...empty });
    setEditing(null);
    setAccepted(false);
    setOpen(true);
  };

  const openEdit = (c: Customer) => {
    setForm({
      id_type: c.id_type,
      id_number: c.id_number,
      name: c.name,
      address: c.address ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
    });
    setEditing(c.id);
    setAccepted(c.privacy_accepted);
    setOpen(true);
  };

  const save = async () => {
    const digits = form.id_number.replace(/\D/g, "");
    if (!form.name.trim()) return toast.error("El nombre o razón social es obligatorio");
    if (form.id_type === "cedula" && !isValidCedula(digits)) return toast.error("Cédula inválida");
    if (form.id_type === "ruc" && !isValidRuc(digits)) return toast.error("RUC inválido");
    if (!accepted)
      return toast.error("Debes confirmar que el cliente conoce y acepta el aviso de privacidad");

    const payload = {
      id_type: form.id_type,
      id_number: form.id_number.trim(),
      name: form.name.trim(),
      address: form.address.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      privacy_accepted: true,
    };

    const { error } = editing
      ? await supabase.from("customers").update(payload).eq("id", editing)
      : await supabase.from("customers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Cliente actualizado" : "Cliente registrado");
    setOpen(false);
    load();
  };

  const remove = async (c: Customer) => {
    if (!window.confirm(`¿Eliminar el registro de ${c.name}? Esta acción no se puede deshacer.`))
      return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Cliente eliminado");
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Clientes frecuentes</h1>
          <p className="text-sm text-muted-foreground">
            Datos usados solo para facturación y cumplimiento tributario.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-56 pl-9"
              placeholder="Buscar por nombre o ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {isAdmin && (
            <Button onClick={openNew}>
              <Plus className="size-4" /> Nuevo cliente
            </Button>
          )}
        </div>
      </div>

      <p className="panel flex gap-2 p-4 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" />
        <span>{AVISO_PRIVACIDAD}</span>
      </p>

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Identificación</th>
                <th className="px-4 py-2 font-medium">Nombre / Razón social</th>
                <th className="px-4 py-2 font-medium">Contacto</th>
                {isAdmin && <th className="px-4 py-2 text-right font-medium">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <span className="tabular">{c.id_number}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{c.id_type}</span>
                  </td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-4 py-10 text-center text-muted-foreground">
                    {loading ? "Cargando…" : "Aún no hay clientes registrados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {hayMas && (
            <p ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
              Cargando más clientes…
            </p>
          )}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Tipo de identificación</Label>
              <select
                className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
                value={form.id_type}
                onChange={(e) => setForm({ ...form, id_type: e.target.value })}
              >
                {ID_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Número</Label>
              <Input
                value={form.id_number}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, id_number: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Nombre o razón social</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Dirección</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Correo</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Notas internas</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <label className="flex items-start gap-2 rounded-md bg-surface-2 p-3 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              El cliente fue informado y acepta el tratamiento de sus datos personales. {AVISO_PRIVACIDAD}
            </span>
          </label>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
