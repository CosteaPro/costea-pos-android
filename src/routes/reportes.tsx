import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Ban, Download, TrendingUp, Receipt, Utensils, Target, AlarmClock } from "lucide-react";
import { DelayAlerts } from "@/components/DelayAlerts";

import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { emitirFacturaSri, reenviarFacturaCorreo, sincronizarEstadoSri } from "@/lib/sri.functions";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/utils";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { printReportA4, esc as escHtml } from "@/lib/report-print";
import { useCompany } from "@/hooks/useCompany";
import { useRole } from "@/hooks/useRole";
import { buildCosteaWorkbook } from "@/lib/costeaExcel";
import { ecBusinessDate } from "@/lib/caja";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import { useProgressiveList } from "@/hooks/useProgressiveList";
import { useSalesChannels } from "@/hooks/useSalesChannels";
import {
  channelLabel,
  currency,
  SRI_STATUS_LABEL,
  type Category,
  
  type OrderWithItems,
  type Product,
  type SriStatus,
} from "@/lib/pos";

/** Etiqueta visible del ciclo de vida del comprobante ante el SRI. */
function SriBadge({ status }: { status: SriStatus }) {
  const tone: Record<SriStatus, string> = {
    no_aplica: "bg-muted text-muted-foreground",
    pendiente: "bg-amber-500/15 text-amber-500",
    enviado: "bg-sky-500/15 text-sky-400",
    autorizado: "bg-emerald-500/15 text-emerald-400",
    rechazado: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${tone[status]}`}>
      {SRI_STATUS_LABEL[status].toUpperCase()}
    </span>
  );
}

/** Descarga el XML firmado guardado junto al comprobante. */
function downloadXml(order: OrderWithItems) {
  const xml = order.xml_signed;
  if (!xml) return;
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${order.access_key ?? order.doc_number ?? order.folio}.xml`;
  a.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes y tablero de ventas | Costea POS" },
      {
        name: "description",
        content:
          "Ventas diarias, semanales y mensuales, cumplimiento de la meta mensual y exportación a Excel compatible con Costea Pro.",
      },
      { property: "og:title", content: "Reportes y tablero de ventas | Costea POS" },
      {
        property: "og:description",
        content: "Tablero con meta mensual, evolución de ventas y exportación Excel para Costea Pro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <ReportsScreen />
    </AppShell>
  ),
});

/** Fecha (AAAA-MM-DD) en la zona horaria oficial de Ecuador (UTC-5). */
const iso = (d: Date) => ecBusinessDate(d);
const today = () => iso(new Date());
/** Límites del rango fijados a UTC-5: el día contable empieza y termina en Ecuador. */

export function ReportsScreen() {
  const { company, reload: reloadCompany } = useCompany();
  const { isAdmin, isSuperAdmin } = useRole();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [monthOrders, setMonthOrders] = useState<OrderWithItems[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [canal, setCanal] = useState("todos");
  const { channels: salesChannels } = useSalesChannels();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAllRows((a, b) =>
        supabase
          .from("orders")
          .select("*, order_items(*)")
          .eq("status", "pagado")
          .gte("created_at", desdeEc(from))
          .lte("created_at", hastaEc(to))
          .order("created_at", { ascending: false })
          .range(a, b),
      );
      setOrders(rows as unknown as OrderWithItems[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar ventas");
    }
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      const first = `${today().slice(0, 7)}-01`;
      const [m, p, c] = await Promise.all([
        fetchAllRows((a, b) =>
          supabase
            .from("orders")
            .select("*, order_items(*)")
            .eq("status", "pagado")
            .gte("created_at", desdeEc(first))
            .range(a, b),
        ),
        supabase.from("products").select("*").order("name"),
        supabase.from("categories").select("*").order("sort_order"),
      ]);
      setMonthOrders(m as unknown as OrderWithItems[]);
      setProducts((p.data as Product[]) ?? []);
      setCategories((c.data as Category[]) ?? []);
    })();
  }, []);


  const setPeriod = (kind: "dia" | "semana" | "mes") => {
    const hoy = today();
    if (kind === "dia") {
      setFrom(hoy);
      setTo(hoy);
    } else if (kind === "semana") {
      const [y, m, d] = hoy.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, d));
      const day = (start.getUTCDay() + 6) % 7; // lunes = 0
      start.setUTCDate(d - day);
      setFrom(start.toISOString().slice(0, 10));
      setTo(hoy);
    } else {
      setFrom(`${hoy.slice(0, 7)}-01`);
      setTo(hoy);
    }
  };

  /** Los comprobantes anulados no suman a las ventas ni a la exportación. */
  const vigentes = useMemo(
    () =>
      orders.filter(
        (o) => o.doc_status !== "anulado" && (canal === "todos" || (o.sales_channel ?? "") === canal),
      ),
    [orders, canal],
  );

  /** Ventas agrupadas por canal (siempre sobre el rango completo, sin el filtro). */
  const porCanal = useMemo(() => {
    const map = new Map<string, { total: number; tickets: number }>();
    orders
      .filter((o) => o.doc_status !== "anulado")
      .forEach((o) => {
        const key = o.sales_channel || "otro";
        const acc = map.get(key) ?? { total: 0, tickets: 0 };
        map.set(key, { total: acc.total + Number(o.total), tickets: acc.tickets + 1 });
      });
    return Array.from(map.entries())
      .map(([value, v]) => ({ value, label: channelLabel(value, salesChannels), ...v }))
      .sort((a, b) => b.total - a.total);
  }, [orders, salesChannels]);

  const stats = useMemo(() => {
    const total = vigentes.reduce((s, o) => s + Number(o.total), 0);
    const items = vigentes.flatMap((o) => o.order_items);
    const units = items.reduce((s, i) => s + i.quantity, 0);
    return { total, tickets: vigentes.length, units, avg: vigentes.length ? total / vigentes.length : 0 };
  }, [vigentes]);

  /**
   * Dar de baja / anular: SOLO el Super Administrador / Propietario.
   * El comprobante queda marcado para siempre, el inventario se devuelve y
   * la venta deja de sumar en reportes. El número nunca se reutiliza.
   */
  const puedeAnular = (order: OrderWithItems) => isSuperAdmin && order.doc_status !== "anulado";

  const voidOrder = async (order: OrderWithItems) => {
    if (!puedeAnular(order)) {
      toast.error("Solo el Super Administrador / Propietario puede dar de baja comprobantes.");
      return;
    }

    const motivo = window.prompt(
      `Motivo de baja / anulación del comprobante ${order.doc_number ?? `#${order.folio}`}:`,
      "",
    );
    if (motivo === null) return;
    if (motivo.trim().length < 5) {
      toast.error("El motivo de la baja es obligatorio (mínimo 5 caracteres)");
      return;
    }
    const { error } = await supabase.rpc("void_order", {
      _order_id: order.id,
      _reason: motivo.trim(),
    });
    if (error) {
      toast.error(`No se pudo dar de baja: ${error.message}`);
      return;
    }
    toast.success("Comprobante dado de baja · inventario devuelto y venta excluida");
    load();
  };



  const goal = useMemo(() => {
    // El avance de la meta se mide con el día calendario de Ecuador (UTC-5),
    // no con la hora del dispositivo.
    const [anio, mes, dia] = today().split("-").map(Number);
    const meta = Number(company?.monthly_goal ?? 0);
    const vendido = monthOrders
      .filter((o) => o.doc_status !== "anulado")
      .reduce((s, o) => s + Number(o.total), 0);

    const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const diaActual = dia;
    const diasRestantes = Math.max(1, diasMes - diaActual + 1);
    const falta = Math.max(0, meta - vendido);
    return {
      meta,
      vendido,
      cumplimiento: meta > 0 ? (vendido / meta) * 100 : 0,
      falta,
      promedioActual: vendido / diaActual,
      promedioRequerido: falta / diasRestantes,
      diasRestantes,
    };
  }, [company, monthOrders]);

  const serie = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((o) => {
      const key = iso(new Date(o.created_at));

      map.set(key, (map.get(key) ?? 0) + Number(o.total));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, total]) => ({
        fecha: fecha.slice(8, 10) + "/" + fecha.slice(5, 7),
        total: Number(total.toFixed(2)),
      }));
  }, [orders]);




  const downloadBook = (rows: OrderWithItems[], nombre: string) => {
    const book = buildCosteaWorkbook({
      orders: [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      products,
      categories,
    });
    XLSX.writeFile(book, `${nombre}.xlsx`);
    toast.success("Excel para Costea Pro descargado · los registros originales se conservan");
  };

  const imprimir = () => {
    const filas = vigentes
      .map(
        (o) => `<tr>
          <td>${escHtml(new Date(o.created_at).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }))}</td>
          <td>${escHtml(o.doc_number ?? "")}</td>
          <td>${escHtml(o.doc_type === "factura" ? "Factura" : "Orden")}</td>
          <td>${escHtml(o.customer_name ?? "Consumidor final")}</td>
          <td class="r">${currency(Number(o.subtotal || 0))}</td>
          <td class="r">${currency(Number(o.total || 0) - Number(o.subtotal || 0))}</td>
          <td class="r">${currency(Number(o.total || 0))}</td>
        </tr>`,
      )
      .join("");

    printReportA4({
      titulo: "Reporte de ventas",
      negocio: company?.trade_name || company?.business_name || "Costea POS",
      periodo: `${from} al ${to}`,
      fontSize: "9px",
      cuerpo: `<table>
        <colgroup><col style="width:12%" /><col style="width:16%" /><col style="width:11%" /><col style="width:27%" /><col style="width:11%" /><col style="width:11%" /><col style="width:12%" /></colgroup>
        <thead><tr><th>Fecha</th><th>Documento</th><th>Tipo</th><th>Cliente</th><th class="r">Subtotal</th><th class="r">IVA</th><th class="r">Total</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr><td colspan="4">Total · ${stats.tickets} comprobantes</td>
          <td class="r">${currency(vigentes.reduce((a, o) => a + Number(o.subtotal || 0), 0))}</td>
          <td class="r">${currency(vigentes.reduce((a, o) => a + (Number(o.total || 0) - Number(o.subtotal || 0)), 0))}</td>
          <td class="r">${currency(stats.total)}</td></tr></tfoot>
      </table>`,
      nota: "No incluye comprobantes anulados.",
    });
  };

  const exportExcel = () => {
    if (vigentes.length === 0) {
      toast.error("No hay ventas en este periodo");
      return;
    }
    downloadBook(vigentes, `CosteaPOS_${from}_a_${to}`);
  };

  /** Exporta TODO el histórico sin límite de fechas (la información nunca se borra del sistema). */
  const exportAll = async () => {
    setExporting(true);
    try {
      const all: OrderWithItems[] = [];
      const size = 1000;
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from("orders")
          .select("*, order_items(*)")
          .eq("status", "pagado")
          .order("created_at", { ascending: true })
          .range(page * size, page * size + size - 1);
        if (error) throw error;
        const chunk = (data as OrderWithItems[]) ?? [];
        all.push(...chunk);
        if (chunk.length < size) break;
      }
      const rows = all.filter((o) => o.doc_status !== "anulado");
      if (rows.length === 0) {
        toast.error("Aún no hay ventas registradas");
        return;
      }
      downloadBook(rows, `CosteaPOS_historial_completo_${today()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo exportar el historial");
    } finally {
      setExporting(false);
    }
  };

  const cards = [
    { label: "Venta total", value: currency(stats.total), icon: TrendingUp },
    { label: "Tickets", value: String(stats.tickets), icon: Receipt },
    { label: "Artículos vendidos", value: String(stats.units), icon: Utensils },
    { label: "Ticket promedio", value: currency(stats.avg), icon: TrendingUp },
  ];

  // Renderizado progresivo: los cálculos y exportaciones usan todos los comprobantes.
  const { rendered: filas, hasMore: hayMas, sentinelRef } = useProgressiveList(orders, 40);

  return (
    <div className="space-y-5">
      <DelayAlerts />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Reportes de ventas</h1>
          <p className="text-sm text-muted-foreground">
            {company?.trade_name || company?.business_name || "Costea POS"}
          </p>
          <Link
            to="/bitacora"
            className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <AlarmClock className="size-4" /> Bitácora de demoras
          </Link>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" onClick={() => setPeriod("dia")}>
              Diario
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPeriod("semana")}>
              Semanal
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPeriod("mes")}>
              Mensual
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              Desde
            </Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Canal</Label>
            <select
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            >
              <option value="todos">Todos los canales</option>
              {salesChannels.map((c) => (
                <option key={c.id} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" onClick={imprimir}>
            Imprimir A4
          </Button>
          <Button onClick={exportExcel}>
            <Download className="size-4" /> Excel del rango
          </Button>
          <Button variant="secondary" onClick={exportAll} disabled={exporting}>
            <Download className="size-4" /> {exporting ? "Generando…" : "Historial completo"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="panel p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <c.icon className="size-3.5" /> {c.label}
            </div>
            <p className="tabular mt-2 font-display text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <section className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Target className="size-4 text-primary" /> Tablero del mes
          </h2>
          <GoalEditor
            current={goal.meta}
            canEdit={isAdmin}
            companyId={company?.id}
            onSaved={reloadCompany}
          />
        </div>
        {goal.meta <= 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Define la meta mensual aquí arriba para ver el cumplimiento."
              : "Aún no se define la meta mensual. Solo un administrador puede configurarla."}
          </p>
        ) : (
          <>
            <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, goal.cumplimiento)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric label="Meta mensual" value={currency(goal.meta)} />
              <Metric label="Vendido" value={currency(goal.vendido)} />
              <Metric label="Cumplimiento" value={`${goal.cumplimiento.toFixed(1)}%`} />
              <Metric label="Falta" value={currency(goal.falta)} />
              <Metric label="Promedio diario actual" value={currency(goal.promedioActual)} />
            </div>
            <p className="text-sm text-muted-foreground">
              Necesitas vender <strong className="text-foreground">{currency(goal.promedioRequerido)}</strong>{" "}
              por día durante los {goal.diasRestantes} días restantes para alcanzar la meta.
            </p>
          </>
        )}
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="font-display text-base font-semibold">Ventas por canal</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {porCanal.map((c) => (
            <Metric
              key={c.value}
              label={`${c.label} · ${c.tickets} tickets`}
              value={currency(c.total)}
            />
          ))}
          {porCanal.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin ventas en este periodo.</p>
          )}
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="font-display text-base font-semibold">Evolución de ventas</h2>
        <div className="mt-3 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="fecha" tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.6} />
              <YAxis tick={{ fontSize: 12 }} stroke="currentColor" opacity={0.6} width={60} />
              <Tooltip
                formatter={(v: number) => currency(Number(v))}
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
              />
              <Bar dataKey="total" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {serie.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin ventas en este periodo.</p>
        )}
      </section>

      <section className="panel overflow-hidden">
        <h2 className="border-b border-border px-4 py-3 font-display text-base font-semibold">
          Comprobantes emitidos
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Documento</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                {isSuperAdmin && <th className="px-4 py-2 text-right font-medium">Acción</th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((o) => {
                const anulado = o.doc_status === "anulado";
                return (
                  <tr key={o.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      {o.doc_number ?? `NV-${String(o.folio).padStart(8, "0")}`}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {o.doc_type === "factura" ? "Factura" : "Nota de venta"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
                    </td>
                    <td className="px-4 py-2">{o.customer_name ?? "Consumidor final"}</td>
                    <td className="tabular px-4 py-2 text-right">{currency(Number(o.total))}</td>
                    <td className="px-4 py-2">
                      {anulado ? (
                        <span className="rounded bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                          🔴 FACTURA ANULADA / DADA DE BAJA
                        </span>
                      ) : o.doc_type === "factura" ? (
                        <SriBadge status={(o.sri_status ?? "pendiente") as SriStatus} />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Nota de venta · sin validez tributaria
                        </span>
                      )}
                      {anulado && (
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {o.void_reason && <p>Motivo: {o.void_reason}</p>}
                          {o.voided_at && (
                            <p>
                              Dado de baja el{" "}
                              {new Date(o.voided_at).toLocaleString("es-EC", {
                                timeZone: "America/Guayaquil",
                              })}
                              {o.voided_by_email ? ` · ${o.voided_by_email}` : ""}
                            </p>
                          )}
                        </div>
                      )}

                      {o.doc_type === "factura" && o.sri_message && (
                        <p className="text-xs text-muted-foreground">{o.sri_message}</p>
                      )}
                      {o.doc_type === "factura" && o.authorization_number && (
                        <p className="tabular text-xs text-muted-foreground">
                          Autorización: {o.authorization_number}
                        </p>
                      )}
                      {o.doc_type === "factura" && o.access_key && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="text-xs font-medium text-primary hover:underline"
                            onClick={() => {
                              navigator.clipboard?.writeText(o.access_key ?? "");
                              toast.success("Clave de acceso copiada");
                            }}
                          >
                            Copiar clave (49)
                          </button>
                          {isSuperAdmin && o.xml_signed && (
                            <button
                              type="button"
                              className="text-xs font-medium text-primary hover:underline"
                              onClick={() => downloadXml(o)}
                            >
                              Descargar XML
                            </button>
                          )}
                          {isSuperAdmin && (
                            <button
                              type="button"
                              className="text-xs font-medium text-primary hover:underline"
                              onClick={async () => {
                                const t = toast.loading("Consultando estado en el SRI…");
                                try {
                                  const r = await sincronizarEstadoSri({ data: { orderIds: [o.id] } });
                                  toast.dismiss(t);
                                  if (r.autorizados) toast.success("Comprobante AUTORIZADO por el SRI");
                                  else if (r.rechazados) toast.error("El SRI reporta NO AUTORIZADO");
                                  else toast.warning("El SRI aún no autoriza el comprobante");
                                  await load();
                                } catch (e) {
                                  toast.dismiss(t);
                                  toast.error(e instanceof Error ? e.message : "No se pudo consultar");
                                }
                              }}
                            >
                              Actualizar estado
                            </button>
                          )}
                          {o.sri_status === "autorizado" && (
                            <button
                              type="button"
                              className="text-xs font-medium text-primary hover:underline"
                              onClick={async () => {
                                const correo =
                                  o.customer_email ??
                                  window.prompt("Correo del cliente para enviar la factura:") ??
                                  "";
                                if (!correo.trim()) return;
                                const t = toast.loading("Enviando factura por correo…");
                                try {
                                  const r = await reenviarFacturaCorreo({
                                    data: { orderId: o.id, email: correo.trim() },
                                  });
                                  toast.dismiss(t);
                                  toast.success(`Factura enviada a ${r.email ?? correo}`);
                                  await load();
                                } catch (e) {
                                  toast.dismiss(t);
                                  toast.error(e instanceof Error ? e.message : "No se pudo enviar el correo");
                                }
                              }}
                            >
                              Reenviar correo
                            </button>
                          )}
                          {isSuperAdmin && o.sri_status !== "autorizado" && (
                            <button
                              type="button"
                              className="text-xs font-medium text-primary hover:underline"
                              onClick={async () => {
                                const t = toast.loading("Reenviando al SRI…");
                                try {
                                  const r = await emitirFacturaSri({
                                    data: { orderId: o.id, issuedAtDevice: new Date().toISOString() },
                                  });
                                  toast.dismiss(t);
                                  if (r.sri_status === "autorizado")
                                    toast.success(`Autorizada · Nº ${r.authorization_number}`);
                                  else toast.warning(r.message);
                                  await load();
                                } catch (e) {
                                  toast.dismiss(t);
                                  toast.error(e instanceof Error ? e.message : "No se pudo reenviar");
                                }
                              }}
                            >
                              Reenviar al SRI
                            </button>
                          )}

                        </div>
                      )}
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-2 text-right">
                        {puedeAnular(o) ? (
                          <Button size="sm" variant="ghost" onClick={() => voidOrder(o)}>
                            <Ban className="size-4" /> Dar de baja
                          </Button>
                        ) : null}
                      </td>
                    )}

                  </tr>
                );
              })}
              {hayMas && (
                <tr>
                  <td
                    colSpan={isSuperAdmin ? 6 : 5}
                    className="px-4 py-3 text-center text-xs text-muted-foreground"
                  >
                    <div ref={sentinelRef}>Cargando más comprobantes…</div>
                  </td>
                </tr>
              )}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={isSuperAdmin ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground">

                    {loading ? "Cargando…" : "Sin comprobantes en este periodo."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>




    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1 font-display text-lg font-bold">{value}</p>
    </div>
  );
}

function GoalEditor({
  current,
  canEdit,
  companyId,
  onSaved,
}: {
  current: number;
  canEdit: boolean;
  companyId?: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(current || ""));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(current ? String(current) : "");
  }, [current]);

  if (!canEdit)
    return (
      <p className="text-xs text-muted-foreground">
        Meta mensual: <strong className="text-foreground">{currency(current)}</strong> · solo un
        administrador puede modificarla.
      </p>
    );

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await supabase
      .from("company_settings")
      .update({ monthly_goal: Number(value) || 0 })
      .eq("id", companyId);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Meta mensual actualizada");
      onSaved();
    }
  };

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="meta" className="text-xs text-muted-foreground">
          Meta mensual (USD)
        </Label>
        <Input
          id="meta"
          type="number"
          className="w-40"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={save} disabled={saving}>
        Guardar meta
      </Button>
    </div>
  );
}
