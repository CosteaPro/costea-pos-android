import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Check, AlarmClock, Bell, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useCompany } from "@/hooks/useCompany";
import { useRole } from "@/hooks/useRole";
import { logDelayIfLate } from "@/lib/delays";
import { notifyOrderReady } from "@/lib/notifications.functions";

import { Button } from "@/components/ui/button";
import {
  currency,
  minutesSince,
  prepLimitFor,
  type OrderItem,
  type OrderWithItems,
  type RestaurantTable,
} from "@/lib/pos";

export const Route = createFileRoute("/cocina")({
  head: () => ({
    meta: [
      { title: "Pantalla de cocina | Costea POS" },
      {
        name: "description",
        content: "Comandas en vivo para la cocina: qué preparar, para qué mesa y desde hace cuánto.",
      },
      { property: "og:title", content: "Pantalla de cocina | Costea POS" },
      {
        property: "og:description",
        content: "Comandas en vivo con tiempos de preparación por mesa.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <KitchenScreen />
    </AppShell>
  ),
});

function KitchenScreen() {
  const { company } = useCompany();
  const { soloCocina } = useRole();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [tables, setTables] = useState<Record<string, RestaurantTable>>({});
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const [o, t] = await Promise.all([
      supabase
        .from("orders")
        .select("*, order_items(*)")
        // La orden sigue visible en cocina hasta que el cajero cobre o anule.
        // "Retirada" (delivered_at) NO la oculta: solo marca los platos ya llevados.
        .not("kitchen_sent_at", "is", null)
        .not("status", "in", "(pagado,cancelado)")
        .order("kitchen_sent_at"),
      supabase.from("restaurant_tables").select("*"),
    ]);
    setOrders((o.data as OrderWithItems[]) ?? []);
    const map: Record<string, RestaurantTable> = {};
    ((t.data as RestaurantTable[]) ?? []).forEach((x) => (map[x.id] = x));
    setTables(map);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("kds")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => load())
      .subscribe();
    const timer = setInterval(() => setTick((n) => n + 1), 15000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [load]);

  const advanceItem = async (item: OrderItem) => {
    const next = item.status === "pendiente" ? "preparando" : "listo";
    // Los modificadores y agregadores siguen el estado del plato al que pertenecen.
    const { error } = await supabase
      .from("order_items")
      .update({ status: next })
      .or(`id.eq.${item.id},parent_item_id.eq.${item.id}`);
    if (error) toast.error(error.message);
    else load();
  };


  const sendReadyAlert = useServerFn(notifyOrderReady);

  const markOrderReady = async (order: OrderWithItems) => {
    await supabase.from("order_items").update({ status: "listo" }).eq("order_id", order.id);
    const { error } = await supabase
      .from("orders")
      .update({ status: "listo", ready_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Pedido #${order.folio} listo · se avisó a los meseros`);
      const tableName = order.table_id ? tables[order.table_id]?.name ?? null : null;
      sendReadyAlert({ data: { folio: order.folio, orderLabel: order.order_label, tableName } }).catch(() => undefined);
      load();
    }
  };

  const markOrderDelivered = async (order: OrderWithItems) => {
    const deliveredAt = new Date().toISOString();
    await supabase.from("order_items").update({ status: "entregado" }).eq("order_id", order.id);
    const { error } = await supabase
      .from("orders")
      .update({ delivered_at: deliveredAt })
      .eq("id", order.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    // La mesa sigue OCUPADA con su monto y tiempo hasta que se cobre y se libere en caja.
    const tableName = order.table_id ? (tables[order.table_id]?.name ?? "") : "";
    const late = await logDelayIfLate(order, company, tableName, deliveredAt);
    if (late) {
      toast.warning(
        `Demora registrada en bitácora: ${late.actual} min (límite ${late.limit} min)`,
      );
    }
    toast.success(`Pedido #${order.folio} entregado`);
    load();
  };


  return (
    <div className="space-y-4" data-tick={tick}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">Cocina</h1>
        <p className="text-sm text-muted-foreground">{orders.length} comandas activas</p>
      </div>

      {orders.length === 0 && (
        <p className="panel p-10 text-center text-sm text-muted-foreground">
          No hay comandas pendientes.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {orders.map((order) => {
          const limit = prepLimitFor(company, order.service_type);
          const mins = minutesSince(order.kitchen_sent_at ?? order.created_at);
          const pendientes = order.order_items.filter(
            (i) => i.status !== "listo" && i.status !== "entregado",
          ).length;
          const retirada = pendientes === 0 && !!order.delivered_at;
          const ready = pendientes === 0;
          const late = !ready && mins >= limit;
          const warn = !late && !ready && mins >= Math.max(1, Math.round(limit * 0.6));
          return (
            <article
              key={order.id}
              className={`panel flex flex-col p-4 ${
                late
                  ? "animate-pulse border-destructive bg-destructive/10"
                  : ready
                    ? "border-success bg-success/10"
                    : warn
                      ? "border-warning"
                      : ""
              }`}
            >
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-bold">#{order.folio}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {order.order_label
                      ? order.order_label
                      : order.table_id
                        ? tables[order.table_id]?.name
                        : order.service_type === "llevar"
                          ? "Para llevar"
                          : "A domicilio"}
                    {order.customer_name ? ` · ${order.customer_name}` : ""}
                  </p>
                </div>
                <span
                  className={`tabular flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                    late
                      ? "bg-destructive text-destructive-foreground"
                      : warn
                        ? "bg-warning text-warning-foreground"
                        : "bg-surface-2"
                  }`}
                  title={
                    late
                      ? `Supera el límite de ${limit} min`
                      : warn
                        ? "Tiempo por vencer"
                        : "En tiempo"
                  }
                >
                  <Clock className="size-3" /> {mins}/{limit}m
                </span>
              </header>

              {late && (
                <p className="mt-2 flex items-center gap-2 rounded-md bg-destructive px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-destructive-foreground">
                  <AlarmClock className="size-4" /> Tiempo superado
                </p>
              )}
              {ready && (
                <p className="mt-2 flex items-center gap-2 rounded-md bg-success/20 px-2 py-1.5 text-xs font-semibold text-success">
                  <Bell className="size-4" />{" "}
                  {retirada
                    ? "Retirada · mesa abierta, esperando cobro"
                    : "Listo · esperando que el mesero lo retire"}
                </p>
              )}
              {!ready && order.delivered_at && (
                <p className="mt-2 rounded-md bg-primary/15 px-2 py-1.5 text-xs font-semibold text-primary">
                  Productos nuevos agregados a esta mesa
                </p>
              )}


              <ul className="mt-3 flex-1 space-y-1.5">
                {order.order_items
                  .filter((i) => !i.parent_item_id)
                  .map((item) => {
                    const opciones = order.order_items.filter(
                      (o) => o.parent_item_id === item.id,
                    );
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => advanceItem(item)}
                          disabled={item.status === "listo" || item.status === "entregado"}
                          className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            item.status === "listo" || item.status === "entregado"
                              ? "bg-success/15 text-muted-foreground line-through"
                              : item.status === "preparando"
                                ? "bg-warning/15"
                                : "bg-surface-2 hover:bg-accent"
                          }`}
                        >
                          <span className="tabular font-semibold text-primary">
                            {item.quantity}×
                          </span>
                          <span className="flex-1">
                            {item.product_name}
                            {opciones.length > 0 && (
                              <span className="mt-1 block space-y-0.5">
                                {opciones.map((o) => (
                                  <span
                                    key={o.id}
                                    className={`block pl-3 text-xs ${
                                      o.option_kind === "agregador"
                                        ? "font-semibold text-primary"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {o.option_kind === "agregador" ? "➕ " : "• "}
                                    {o.quantity > 1 ? `${o.quantity}× ` : ""}
                                    {o.product_name}
                                    {o.option_kind === "agregador" && !soloCocina
                                      ? ` — ${currency(Number(o.unit_price) * Number(o.quantity || 1))}`
                                      : ""}
                                    {o.notes ? ` (${o.notes})` : ""}
                                  </span>
                                ))}
                              </span>
                            )}
                            {item.notes && (
                              <em className="block text-xs not-italic text-warning">
                                📝 {item.notes}
                              </em>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>


              {order.notes && (
                <p className="mt-2 rounded-md bg-surface-2 p-2 text-xs text-muted-foreground">
                  {order.notes}
                </p>
              )}

              <footer className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="tabular text-sm text-muted-foreground">
                  {soloCocina ? "" : currency(Number(order.total))}
                </span>
                {retirada ? (
                  <span className="text-sm font-semibold text-muted-foreground">
                    Retirada · esperando cobro
                  </span>
                ) : ready ? (
                  soloCocina ? (
                    <span className="text-sm font-semibold text-success">Lista · avisada al mesero</span>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => markOrderDelivered(order)}>
                      <PackageCheck className="size-4" /> Marcar como entregado
                    </Button>
                  )
                ) : (
                  <Button size="sm" onClick={() => markOrderReady(order)}>
                    <Check className="size-4" /> Marcar como lista
                  </Button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
