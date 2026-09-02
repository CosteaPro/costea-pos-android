import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Users, Split, Merge, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useCompany } from "@/hooks/useCompany";
import { useKitchenAlerts } from "@/hooks/useKitchenAlerts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ecBusinessDate } from "@/lib/caja";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  currency,
  minutesSince,
  prepLimitFor,
  TABLE_STATE,
  type Order,
  type OrderItem,
  type RestaurantTable,
  type TableStatus,
} from "@/lib/pos";

export const Route = createFileRoute("/mesas")({
  head: () => ({
    meta: [
      { title: "Mapa de mesas | Costea POS" },
      {
        name: "description",
        content:
          "Consulta qué mesas están ocupadas, divide o une cuentas y abre el pedido al instante.",
      },
      { property: "og:title", content: "Mapa de mesas | Costea POS" },
      {
        property: "og:description",
        content: "Mesas libres y ocupadas, con división y unión de cuentas en tiempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <TablesScreen />
    </AppShell>
  ),
});

function TablesScreen() {
  const navigate = useNavigate();
  const { company, loading: loadingCompany } = useCompany();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [manage, setManage] = useState<{ order: Order; table: RestaurantTable } | null>(null);
  const { readyTableIds } = useKitchenAlerts();
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const [t, o] = await Promise.all([
      supabase.from("restaurant_tables").select("*").order("sort_order"),
      supabase
        .from("orders")
        .select("*")
        .is("released_at", null)
        .in("status", ["abierto", "en_cocina", "listo", "pagado"]),
    ]);
    setTables((t.data as RestaurantTable[]) ?? []);
    setOrders((o.data as Order[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("mesas-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const byTable = useMemo(() => {
    const map = new Map<string, Order>();
    orders.forEach((o) => {
      if (!o.table_id) return;
      const prev = map.get(o.table_id);
      // Un pedido abierto manda sobre uno ya cobrado pendiente de liberar.
      if (!prev || (prev.status === "pagado" && o.status !== "pagado")) map.set(o.table_id, o);
    });
    return map;
  }, [orders]);

  const stateOf = useCallback(
    (t: RestaurantTable): TableStatus => {
      const order = byTable.get(t.id);
      if (order) return order.status === "pagado" ? "cobrada" : "ocupada";
      return t.status === "reservada" ? "reservada" : "disponible";
    },
    [byTable],
  );

  const counts = useMemo(() => {
    const c: Record<TableStatus, number> = { disponible: 0, ocupada: 0, cobrada: 0, reservada: 0 };
    tables.forEach((t) => (c[stateOf(t)] += 1));
    return c;
  }, [tables, stateOf]);

  const zones = useMemo(() => Array.from(new Set(tables.map((t) => t.zone))), [tables]);

  const setReserved = async (t: RestaurantTable, reserved: boolean) => {
    const { error } = await supabase
      .from("restaurant_tables")
      .update({ status: reserved ? "reservada" : "disponible" })
      .eq("id", t.id);
    if (error) toast.error(error.message);
    else {
      toast.success(reserved ? `${t.name} reservada` : `Reserva liberada`);
      load();
    }
  };

  const releaseTable = async (t: RestaurantTable, order: Order) => {
    const { error } = await supabase
      .from("orders")
      .update({ released_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("restaurant_tables").update({ status: "disponible" }).eq("id", t.id);
    toast.success(`${t.name} disponible`);
    load();
  };

  if (!loadingCompany && company && company.operation_mode !== "restaurante") {
    return (
      <div className="panel mx-auto max-w-lg space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold">Gestión de mesas desactivada</h1>
        <p className="text-sm text-muted-foreground">
          Tu tipo de local actual no usa mapa de mesas. Los pedidos se registran directamente desde el
          punto de venta.
        </p>
        <Button onClick={() => navigate({ to: "/configuracion" })} variant="secondary">
          Cambiar tipo de local
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold">Mapa de mesas</h1>
        <div className="flex flex-wrap gap-3 text-xs">
          {(Object.keys(TABLE_STATE) as TableStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-muted-foreground">
              <span className={`size-2.5 rounded-full ${TABLE_STATE[s].dot}`} />
              {TABLE_STATE[s].label} · <strong className="text-foreground">{counts[s]}</strong>
            </span>
          ))}
        </div>
      </div>

      <TablesManager tables={tables} occupied={byTable} onChanged={load} />

      {zones.map((zone) => (
        <section key={zone} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {zone}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {tables
              .filter((t) => t.zone === zone)
              .map((t) => {
                const order = byTable.get(t.id);
                const state = stateOf(t);
                const meta = TABLE_STATE[state];
                const listo = readyTableIds.has(t.id);
                const limite = prepLimitFor(company, order?.service_type);
                const demorado =
                  !!order &&
                  !listo &&
                  !order.delivered_at &&
                  order.status !== "pagado" &&
                  !!order.kitchen_sent_at &&
                  minutesSince(order.kitchen_sent_at) >= limite;

                return (
                  <div
                    key={t.id}
                    className={`panel flex flex-col gap-1 p-4 ${
                      demorado
                        ? "animate-pulse border-destructive bg-destructive/15"
                        : listo
                          ? "animate-pulse border-success bg-success/20 ring-2 ring-success"
                          : meta.card
                    }`}
                  >
                    <button
                      onClick={() =>
                        navigate({
                          to: "/",
                          search: order ? { order: order.id } : { table: t.id },
                        })
                      }
                      className="flex flex-col items-start gap-1 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className={`size-2.5 rounded-full ${meta.dot}`} />
                        <span className="font-display text-lg font-bold">{t.name}</span>
                      </span>
                      <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3.5" />
                        {order && Number(order.guests ?? 0) > 0
                          ? `${order.guests} personas`
                          : `${t.seats} lugares`}
                      </span>
                      {listo && (
                        <span className="mt-1 rounded-md bg-success px-2 py-0.5 text-xs font-bold uppercase text-success-foreground">
                          Pedido listo para entregar
                        </span>
                      )}
                      {demorado && (
                        <span className="mt-1 rounded-md bg-destructive px-2 py-0.5 text-xs font-bold uppercase text-destructive-foreground">
                          Tiempo superado
                        </span>
                      )}
                      {order ? (
                        <>
                          <span className="tabular mt-2 text-base font-semibold">
                            {currency(Number(order.total))}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Cuenta #{order.folio} · {minutesSince(order.created_at)} min
                          </span>
                        </>
                      ) : (
                        <span className="mt-2 text-xs text-muted-foreground">Toca para tomar pedido</span>
                      )}
                    </button>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
                      {state === "ocupada" && (
                        <button
                          onClick={() => setManage({ order: order!, table: t })}
                          className="text-primary hover:underline"
                        >
                          Dividir / unir
                        </button>
                      )}
                      {state === "cobrada" && (
                        <button
                          onClick={() => releaseTable(t, order!)}
                          className="text-success hover:underline"
                        >
                          Liberar mesa
                        </button>
                      )}
                      {state === "disponible" && (
                        <button
                          onClick={() => setReserved(t, true)}
                          className="text-reserved hover:underline"
                        >
                          Reservar
                        </button>
                      )}
                      {state === "reservada" && (
                        <button
                          onClick={() => setReserved(t, false)}
                          className="text-muted-foreground hover:underline"
                        >
                          Quitar reserva
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      {manage && (
        <SplitMergeDialog
          order={manage.order}
          table={manage.table}
          otherOrders={orders.filter(
            (o) =>
              o.id !== manage.order.id &&
              ["abierto", "en_cocina", "listo"].includes(o.status) &&
              o.doc_status !== "anulado" &&
              ecBusinessDate(new Date(o.created_at)) === ecBusinessDate(),
          )}
          tables={tables}
          onClose={() => setManage(null)}
          onDone={() => {
            setManage(null);
            load();
          }}
        />
      )}
    </div>
  );
}


function SplitMergeDialog({
  order,
  table,
  otherOrders,
  tables,
  onClose,
  onDone,
}: {
  order: Order;
  table: RestaurantTable;
  otherOrders: Order[];
  tables: RestaurantTable[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [targetTable, setTargetTable] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id)
      .then(({ data }) => setItems((data as OrderItem[]) ?? []));
  }, [order.id]);

  const recalc = async (orderId: string) => {
    const { data } = await supabase
      .from("order_items")
      .select("unit_price, quantity")
      .eq("order_id", orderId);
    const total = (data ?? []).reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0);
    const rate = Number(order.iva_rate ?? 15);
    const base = total / (1 + rate / 100);
    await supabase
      .from("orders")
      .update({
        total,
        subtotal: Math.round(base * 100) / 100,
        tax_amount: Math.round((total - base) * 100) / 100,
      })
      .eq("id", orderId);
    return total;
  };

  const split = async () => {
    if (selected.length === 0) {
      toast.error("Selecciona los ítems a separar");
      return;
    }
    setBusy(true);
    try {
      const { data: created, error } = await supabase
        .from("orders")
        .insert({
          table_id: targetTable || order.table_id,
          service_type: order.service_type,
          sales_channel: order.sales_channel,
          status: order.status,
          iva_rate: order.iva_rate,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: mvErr } = await supabase
        .from("order_items")
        .update({ order_id: created.id })
        .in("id", selected);
      if (mvErr) throw mvErr;
      await Promise.all([recalc(order.id), recalc(created.id)]);
      toast.success("Cuenta dividida");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo dividir");
    } finally {
      setBusy(false);
    }
  };

  const merge = async () => {
    if (!mergeInto) {
      toast.error("Elige la cuenta destino");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("order_items")
        .update({ order_id: mergeInto })
        .eq("order_id", order.id);
      if (error) throw error;
      await supabase.from("orders").update({ status: "cancelado" }).eq("id", order.id);
      await recalc(mergeInto);
      toast.success("Cuentas unidas");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo unir");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            Cuenta #{order.folio} · {table.name}
          </DialogTitle>
          <DialogDescription>Separa ítems a otra mesa o une esta cuenta con otra.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ítems de la cuenta
          </p>
          {items.map((i) => (
            <label
              key={i.id}
              className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2 text-sm"
            >
              <Checkbox
                checked={selected.includes(i.id)}
                onCheckedChange={(v) =>
                  setSelected((prev) => (v ? [...prev, i.id] : prev.filter((x) => x !== i.id)))
                }
              />
              <span className="min-w-0 flex-1 truncate">
                {i.quantity} × {i.product_name}
              </span>
              <span className="tabular">{currency(Number(i.unit_price) * i.quantity)}</span>
            </label>
          ))}
          {items.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin ítems.</p>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm font-semibold">Dividir cuenta</p>
          <Select value={targetTable} onValueChange={setTargetTable}>
            <SelectTrigger>
              <SelectValue placeholder="Mesa para la nueva cuenta (opcional)" />
            </SelectTrigger>
            <SelectContent>
              {tables.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} · {t.zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={split} disabled={busy} className="w-full">
            <Split className="size-4" /> Separar {selected.length} ítem(s)
          </Button>
        </div>

        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm font-semibold">Unir con otra cuenta</p>
          <Select value={mergeInto} onValueChange={setMergeInto}>
            <SelectTrigger>
              <SelectValue placeholder="Cuenta destino" />
            </SelectTrigger>
            <SelectContent>
              {otherOrders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  Cuenta #{o.folio} — {tables.find((t) => t.id === o.table_id)?.name ?? "Sin mesa"} —{" "}
                  {currency(Number(o.total))}
                </SelectItem>
              ))}
              {otherOrders.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No hay otras cuentas abiertas ahora.
                </div>
              )}
            </SelectContent>

          </Select>
          <Button onClick={merge} disabled={busy} variant="secondary" className="w-full">
            <Merge className="size-4" /> Unir esta cuenta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TablesManager({
  tables,
  occupied,
  onChanged,
}: {
  tables: RestaurantTable[];
  occupied: Map<string, Order>;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", seats: "4", zone: "Salón" });
  const [edit, setEdit] = useState<{ id: string; name: string; seats: string; zone: string } | null>(null);

  const add = async () => {
    if (!form.name.trim()) {
      toast.error("Escribe el número o nombre de la mesa");
      return;
    }
    const { error } = await supabase.from("restaurant_tables").insert({
      name: form.name.trim(),
      seats: Number(form.seats) || 4,
      zone: form.zone.trim() || "Salón",
      sort_order: tables.length,
    });
    if (error) toast.error(error.message);
    else {
      setForm({ name: "", seats: "4", zone: form.zone });
      toast.success("Mesa agregada");
      onChanged();
    }
  };

  const save = async () => {
    if (!edit) return;
    const { error } = await supabase
      .from("restaurant_tables")
      .update({ name: edit.name.trim(), seats: Number(edit.seats) || 4, zone: edit.zone.trim() || "Salón" })
      .eq("id", edit.id);
    if (error) toast.error(error.message);
    else {
      setEdit(null);
      toast.success("Mesa actualizada");
      onChanged();
    }
  };

  const remove = async (t: RestaurantTable) => {
    if (occupied.has(t.id)) {
      toast.error("La mesa tiene una cuenta abierta");
      return;
    }
    const { error } = await supabase.from("restaurant_tables").delete().eq("id", t.id);
    if (error) toast.error("No se puede eliminar: tiene pedidos registrados");
    else {
      toast.success("Mesa eliminada");
      onChanged();
    }
  };

  return (
    <section className="panel p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-display text-base font-semibold">Administrar mesas</span>
        <span className="text-xs text-muted-foreground">{open ? "Ocultar" : "Mostrar"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_110px_1fr_auto]">
            <div className="space-y-1">
              <Label className="text-xs">Número / nombre</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Lugares</Label>
              <Input
                type="number"
                value={form.seats}
                onChange={(e) => setForm({ ...form, seats: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zona</Label>
              <Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
            </div>
            <Button onClick={add} className="self-end">
              <Plus className="size-4" /> Agregar
            </Button>
          </div>

          <div className="divide-y divide-border rounded-md border border-border">
            {tables.map((t) =>
              edit?.id === t.id ? (
                <div key={t.id} className="grid gap-2 p-2 sm:grid-cols-[1fr_110px_1fr_auto]">
                  <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <Input
                    type="number"
                    value={edit.seats}
                    onChange={(e) => setEdit({ ...edit, seats: e.target.value })}
                  />
                  <Input value={edit.zone} onChange={(e) => setEdit({ ...edit, zone: e.target.value })} />
                  <div className="flex gap-1">
                    <Button size="icon" onClick={save} aria-label="Guardar mesa">
                      <Check className="size-4" />
                    </Button>
                    <Button size="icon" variant="secondary" onClick={() => setEdit(null)} aria-label="Cancelar">
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <strong>{t.name}</strong>
                    <span className="text-muted-foreground"> · {t.seats} lugares · {t.zone}</span>
                  </span>
                  <span className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Editar ${t.name}`}
                      onClick={() =>
                        setEdit({ id: t.id, name: t.name, seats: String(t.seats), zone: t.zone })
                      }
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Eliminar ${t.name}`}
                      onClick={() => remove(t)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </div>
              ),
            )}
            {tables.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Aún no hay mesas registradas.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
