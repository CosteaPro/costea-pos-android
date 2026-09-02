import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Mic,
  Printer,
  Receipt,
  RefreshCw,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
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
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { currency } from "@/lib/pos";
import { cn } from "@/lib/utils";
import { esc, printReportA4 } from "@/lib/report-print";
import {
  hoyEc,
  periodoPrevio,
  resumenTexto,
  variacion,
  type DashboardData,
  type MixRow,
} from "@/lib/dashboard-data";
import { leerPanelGuardado } from "@/lib/reportes-cache";
import { obtenerReporte } from "@/lib/reportes-cache.functions";
import { askAssistant, sendDashboardAction, type TargetRole } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Tablero de mando | Costea Pro" },
      {
        name: "description",
        content:
          "Tablero ejecutivo del restaurante: ventas, costo real, utilidad, alertas de inventario, mix de ventas y asistente inteligente con avisos por Telegram.",
      },
      { property: "og:title", content: "Tablero de mando | Costea Pro" },
      {
        property: "og:description",
        content: "Indicadores, alertas de inventario y asistente inteligente en un solo tablero.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

const VERDE = "#00a86b";
const AMARILLO = "#fd7e14";
const ROJO = "#dc3545";
const AZUL = "#007bff";

const PIE_COLORS = [AZUL, AMARILLO, VERDE, "#6f42c1", ROJO];

type OrdenMix = "vendidos" | "ingreso" | "utilidad" | "menos" | "peor";
type MixPieDato = { nombre: string; valor: number; pct: number; row?: MixRow };
const FILTROS_MIX: Array<[OrdenMix, string]> = [
  ["vendidos", "📊 Más vendidos"],
  ["ingreso", "💰 Mayor ingreso"],
  ["utilidad", "📈 Mejor utilidad"],
  ["menos", "📉 Menos vendidos"],
  ["peor", "❌ Peor rentables"],
];

type Accion = {
  id: string;
  kind: string;
  title: string;
  target_role: string;
  status: string;
  created_at: string;
};

const ESTADO_LABEL: Record<string, string> = {
  enviado: "Enviado",
  leido: "Leído",
  revision: "En revisión",
  resuelto: "Resuelto",
};

type SemaforoDato = {
  nivel: "rojo" | "amarillo" | "verde";
  nombre: string;
  emoji: string;
  color: string;
  valor: number;
};

function DashboardPage() {
  const { company } = useCompany();
  const [from, setFrom] = useState(() => `${hoyEc().slice(0, 7)}-01`);
  const [to, setTo] = useState(() => hoyEc());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [orden, setOrden] = useState<OrdenMix>("ingreso");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Se pinta el resultado guardado y, si está vencido, el servidor lo
      // recalcula en segundo plano.
      const guardado = await leerPanelGuardado(from, to);
      if (guardado) {
        setData(guardado.payload);
        setLoading(false);
        if (!guardado.vencido) return;
        setActualizando(true);
      }
      const fresco = (await obtenerReporte({
        data: { kind: "dashboard", from, to },
      })) as DashboardData;
      setData(fresco);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el tablero");
    } finally {
      setActualizando(false);
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const prev = useMemo(() => periodoPrevio(from, to), [from, to]);

  const [producto, setProducto] = useState<MixRow | null>(null);

  const mix = useMemo(() => {
    const list = [...(data?.mix ?? [])];
    list.sort((a, b) => {
      if (orden === "vendidos") return b.units - a.units;
      if (orden === "menos") return a.units - b.units;
      if (orden === "utilidad") return b.profit - a.profit;
      if (orden === "peor") return a.marginPct - b.marginPct;
      return b.net - a.net;
    });
    return list.slice(0, 5);
  }, [data, orden]);

  const { mixPie, mixShare } = useMemo(() => {
    const total = (data?.mix ?? []).reduce((s, r) => s + Math.max(r.net, 0), 0);
    if (total <= 0) return { mixPie: [] as MixPieDato[], mixShare: 0 };
    const top = mix.reduce((s, r) => s + Math.max(r.net, 0), 0);
    const items: MixPieDato[] = mix.map((r) => ({
      nombre: r.name,
      valor: Math.max(r.net, 0),
      pct: (Math.max(r.net, 0) / total) * 100,
      row: r,
    }));
    const resto = Math.max(total - top, 0);
    if (resto > 0.005)
      items.push({ nombre: "Todos los demás", valor: resto, pct: (resto / total) * 100 });
    return { mixPie: items, mixShare: (top / total) * 100 };
  }, [data, mix]);


  const alertas = data?.alertas ?? [];
  const rojas = alertas.filter((a) => a.level === "rojo");
  const amarillas = alertas.filter((a) => a.level === "amarillo");
  const verdes = alertas.length - rojas.length - amarillas.length;

  const semaforo: SemaforoDato[] = [
    { nivel: "rojo", nombre: "Faltantes en exceso", emoji: "🔴", color: ROJO, valor: rojas.length },
    { nivel: "amarillo", nombre: "Stock bajo", emoji: "🟡", color: AMARILLO, valor: amarillas.length },
    { nivel: "verde", nombre: "Niveles normales", emoji: "🟢", color: VERDE, valor: Math.max(verdes, 0) },
  ];
  const [detalle, setDetalle] = useState<"rojo" | "amarillo" | null>(null);
  const abrirDetalle = (nivel?: SemaforoDato["nivel"]) => {
    if (nivel === "rojo" && rojas.length) setDetalle("rojo");
    if (nivel === "amarillo" && amarillas.length) setDetalle("amarillo");
  };
  const listaDetalle = detalle === "rojo" ? rojas : detalle === "amarillo" ? amarillas : [];



  const kpis = data?.kpis;
  const cards = [
    { label: "Venta bruta", value: kpis?.ventaBruta ?? 0, prev: data?.previo.ventaBruta ?? 0, icon: Receipt },
    { label: "Venta neta", value: kpis?.ventaNeta ?? 0, prev: data?.previo.ventaNeta ?? 0, icon: FileText },
    { label: "Costo real", value: kpis?.costoReal ?? 0, prev: data?.previo.costoReal ?? 0, icon: DollarSign, invertir: true },
    { label: "Utilidad bruta", value: kpis?.utilidad ?? 0, prev: data?.previo.utilidad ?? 0, icon: TrendingUp },
  ];

  const negocio = company?.trade_name || company?.business_name || "Costea Pro";

  const reporteHtml = () => {
    if (!data) return "";
    const filas = mix
      .map(
        (r) => `<tr><td>${esc(r.name)}</td><td class="r">${r.units}</td><td class="r">${esc(currency(r.net))}</td>
        <td class="r">${esc(currency(r.cost))}</td><td class="r">${esc(currency(r.profit))}</td>
        <td class="r">${r.marginPct.toFixed(1)} %</td></tr>`,
      )
      .join("");
    const alertasHtml = [...rojas, ...amarillas]
      .map(
        (a) =>
          `<tr><td>${esc(a.name)}</td><td>${a.level === "rojo" ? "Faltante excesivo" : "Stock bajo"}</td>
           <td>${esc(a.magnitud)}</td><td>${esc(a.comparacion)}</td><td>${esc(a.explicacion)}</td></tr>`,
      )
      .join("");
    return `
      <table>
        <thead><tr><th>Indicador</th><th class="r">Período</th><th class="r">Período anterior</th><th class="r">Variación</th></tr></thead>
        <tbody>${cards
          .map(
            (c) =>
              `<tr><td>${esc(c.label)}</td><td class="r">${esc(currency(c.value))}</td><td class="r">${esc(currency(c.prev))}</td><td class="r">${variacion(c.value, c.prev).toFixed(1)} %</td></tr>`,
          )
          .join("")}</tbody>
      </table>
      <h3 style="margin:14px 0 6px;font-size:12px">Mix de ventas</h3>
      <table><thead><tr><th>Plato</th><th class="r">Cant.</th><th class="r">Venta</th><th class="r">Costo</th><th class="r">Utilidad</th><th class="r">% Rent.</th></tr></thead>
        <tbody>${filas}</tbody></table>
      <h3 style="margin:14px 0 6px;font-size:12px">Alertas de inventario</h3>
      <table><thead><tr><th>Producto</th><th>Nivel</th><th>Magnitud</th><th>Comparación</th><th>Explicación</th></tr></thead>
        <tbody>${alertasHtml || `<tr><td colspan="5">Sin alertas en el período.</td></tr>`}</tbody></table>`;
  };

  const imprimir = () => {
    if (!data) return;
    printReportA4({
      titulo: "Tablero de mando ejecutivo",
      negocio,
      periodo: `${from} al ${to}`,
      cuerpo: reporteHtml(),
      fontSize: "9px",
      firmas: ["Elaborado por", "Revisado por", "Administrador"],
    });
  };

  const exportarExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        cards.map((c) => ({
          Indicador: c.label,
          Período: c.value,
          Anterior: c.prev,
          "Variación %": Number(variacion(c.value, c.prev).toFixed(2)),
        })),
      ),
      "Indicadores",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.mix.map((r) => ({
          Plato: r.name,
          Cantidad: r.units,
          Venta: r.net,
          Costo: r.cost,
          Utilidad: r.profit,
          "% Rentabilidad": Number(r.marginPct.toFixed(2)),
        })),
      ),
      "Mix de ventas",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        alertas.map((a) => ({
          Producto: a.name,
          Nivel: a.level,
          Magnitud: a.magnitud,
          Comparación: a.comparacion,
          Explicación: a.explicacion,
        })),
      ),
      "Alertas",
    );
    XLSX.writeFile(wb, `tablero-${from}-al-${to}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Tablero de mando</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Período: {from} al {to} · comparado con {prev.from} al {prev.to}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <div className="min-w-0 space-y-1">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-full sm:w-[9.5rem]" />
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-full sm:w-[9.5rem]" />
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading} className="col-span-2 w-full sm:w-auto">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Actualizar
          </Button>
        </div>
      </header>

      {/* 1. Métricas clave */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const v = variacion(c.value, c.prev);
          const sube = v >= 0;
          const bueno = c.invertir ? !sube : sube;
          return (
            <article key={c.label} className="panel min-w-0 p-4">
              <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
                <c.icon className="size-4 shrink-0" style={{ color: AZUL }} />
                <span className="truncate">{c.label}</span>
              </div>
              <p className="tabular mt-2 font-display text-[1.75rem] font-semibold leading-none sm:text-3xl">
                {loading ? "—" : currency(c.value)}
              </p>
              <p
                className="mt-2 flex flex-wrap items-center gap-1 text-[11px] font-semibold sm:text-xs"
                style={{ color: bueno ? VERDE : ROJO }}
              >
                {sube ? <TrendingUp className="size-3.5 shrink-0" /> : <TrendingDown className="size-3.5 shrink-0" />}
                {sube ? "↑" : "↓"} {Math.abs(v).toFixed(1)}%
                <span className="font-normal text-muted-foreground">
                  <span className="hidden sm:inline">vs. período anterior</span>
                  <span className="sm:hidden">vs. anterior</span>
                </span>
              </p>
            </article>
          );
        })}
      </section>


      {/* 2. Alertas de inventario + Mix de ventas */}
      <section className="grid gap-3 xl:grid-cols-2">
        <div className="panel px-4 py-3">
        <h2 className="mb-1 flex items-center gap-1.5 font-display text-sm font-semibold">
          <AlertTriangle className="size-4 shrink-0" style={{ color: ROJO }} /> Alertas de Inventario
        </h2>


        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <div className="relative h-[72px] w-[72px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={semaforo}
                    dataKey="valor"
                    nameKey="nombre"
                    innerRadius={20}
                    outerRadius={34}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                    onClick={(d: unknown) => abrirDetalle((d as { payload?: SemaforoDato })?.payload?.nivel)}
                  >
                    {semaforo.map((s) => (
                      <Cell
                        key={s.nivel}
                        fill={s.color}
                        className={s.nivel === "verde" ? undefined : "cursor-pointer"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, n: string) => [`${v} ítems`, n]}
                    contentStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-0.5 text-center text-[10px] text-muted-foreground">
              {loading ? "—" : alertas.length} ítems
            </p>
          </div>

          <ul className="min-w-0 flex-1 space-y-1">
            {semaforo.map((s) => (
              <li key={s.nivel} className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="tabular shrink-0 font-display text-base font-semibold leading-none">
                  {loading ? "—" : s.valor}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground sm:text-xs">
                  {s.nombre}
                </span>
                {s.nivel !== "verde" && s.valor > 0 && (
                  <button
                    type="button"
                    onClick={() => abrirDetalle(s.nivel)}
                    className="shrink-0 text-[11px] font-semibold underline underline-offset-2 hover:opacity-80 sm:text-xs"
                    style={{ color: s.color }}
                  >
                    Ver detalle
                  </button>
                )}
              </li>
            ))}
          </ul>

        </div>
        </div>

        {/* Mix de ventas compacto */}
        <div className="panel px-4 py-3">
          <h2 className="mb-1.5 flex items-center gap-1.5 font-display text-sm font-semibold">
            🏆 Mix de Ventas
          </h2>
          <div className="-mx-1 mb-2 flex snap-x gap-1 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTROS_MIX.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setOrden(k)}
                className={cn(
                  "shrink-0 snap-start whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold transition",
                  orden === k
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="mb-1 text-[11px] font-semibold" style={{ color: VERDE }}>
            ✅ Los 5 productos seleccionados representan el {mixShare.toFixed(0)}% del total
          </p>
          <div className="flex items-center gap-3">
            <div className="h-[92px] w-[92px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mixPie}
                    dataKey="valor"
                    nameKey="nombre"
                    innerRadius={22}
                    outerRadius={44}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={false}
                    onClick={(d: unknown) => {
                      const row = (d as { payload?: { row?: MixRow } })?.payload?.row;
                      if (row) setProducto(row);
                    }}
                  >
                    {mixPie.map((s, i) => (
                      <Cell
                        key={s.nombre}
                        fill={s.row ? PIE_COLORS[i % PIE_COLORS.length] : "var(--border)"}
                        className={s.row ? "cursor-pointer" : undefined}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, n: string) => [currency(Number(v)), n]}
                    contentStyle={tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="min-w-0 flex-1 space-y-0.5 text-[11px]">
              {mixPie.map((s, i) => (
                <li key={s.nombre} className="flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.row ? PIE_COLORS[i % PIE_COLORS.length] : "var(--border)" }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    disabled={!s.row}
                    onClick={() => s.row && setProducto(s.row)}
                    className="min-w-0 flex-1 truncate text-left hover:underline disabled:no-underline"
                  >
                    {s.nombre}
                  </button>
                  <span className="tabular shrink-0 font-semibold">{s.pct.toFixed(0)}%</span>
                </li>
              ))}
              {mixPie.length === 0 && (
                <li className="text-muted-foreground">
                  {loading ? "Cargando…" : "Sin ventas en el período."}
                </li>
              )}
            </ul>
          </div>
        </div>
      </section>

      <Dialog open={producto !== null} onOpenChange={(o) => !o && setProducto(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{producto?.name}</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Unidades</dt>
            <dd className="tabular text-right font-semibold">{producto?.units ?? 0}</dd>
            <dt className="text-muted-foreground">Venta neta</dt>
            <dd className="tabular text-right font-semibold">{currency(producto?.net ?? 0)}</dd>
            <dt className="text-muted-foreground">Costo</dt>
            <dd className="tabular text-right font-semibold">{currency(producto?.cost ?? 0)}</dd>
            <dt className="text-muted-foreground">Utilidad</dt>
            <dd className="tabular text-right font-semibold">{currency(producto?.profit ?? 0)}</dd>
            <dt className="text-muted-foreground">% Rentabilidad</dt>
            <dd
              className="tabular text-right font-semibold"
              style={{ color: colorRent(producto?.marginPct ?? 0) }}
            >
              {(producto?.marginPct ?? 0).toFixed(1)} %
            </dd>
          </dl>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setProducto(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>




      <Dialog open={detalle !== null} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detalle === "rojo" ? "🔴 Faltantes en exceso" : "🟡 Stock bajo"}
              <span className="text-sm font-normal text-muted-foreground">
                {listaDetalle.length} ítems
              </span>
            </DialogTitle>
          </DialogHeader>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {listaDetalle.map((a) => (
              <li
                key={a.itemId}
                className="rounded-lg border-l-4 bg-secondary/40 px-3 py-2"
                style={{ borderColor: a.level === "rojo" ? ROJO : AMARILLO }}
              >
                <p className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                  <span>{a.name}</span>
                  <span className="tabular text-xs" style={{ color: a.level === "rojo" ? ROJO : AMARILLO }}>
                    {a.desviacionPct >= 0 ? "+" : ""}
                    {a.desviacionPct.toFixed(0)}%
                  </span>
                </p>
                <p className="text-xs font-medium">{a.magnitud}</p>
                <p className="text-xs text-muted-foreground">
                  {a.comparacion}. {a.explicacion}
                </p>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDetalle(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* 4. Gráficos */}
      <section className="grid gap-4 xl:grid-cols-2">


        <div className="panel p-4">
          <h2 className="mb-3 font-display text-base font-semibold">Ventas vs. costos por día</h2>
          <div className="h-60 sm:h-80">

            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.porDia ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="dia" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} width={54} />
                <Tooltip formatter={(v: number) => currency(Number(v))} contentStyle={tooltipStyle} />
                <Legend />
                <Line type="monotone" dataKey="ventas" name="Ventas" stroke={AZUL} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="costo" name="Costos" stroke={ROJO} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-4 xl:col-span-2">
          <h2 className="mb-3 font-display text-base font-semibold">Composición de costos del período</h2>
          <div className="h-60 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.composicion ?? []}
                  dataKey="valor"
                  nameKey="nombre"
                  outerRadius={110}
                  label={(e: { name?: string }) => e.name ?? ""}
                >
                  {(data?.composicion ?? []).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => currency(Number(v))} contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* 5-7. Asistente IA + acciones */}
      <AssistantPanel data={data} negocio={negocio} />

      {/* 8. Acciones rápidas */}
      <section className="panel flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap">
        <Button onClick={imprimir} disabled={!data} className="w-full sm:w-auto">
          <FileText className="size-4" /> Ver reporte completo
        </Button>
        <Button variant="secondary" onClick={imprimir} disabled={!data} className="w-full sm:w-auto">
          <Printer className="size-4" /> Exportar PDF
        </Button>
        <Button variant="secondary" onClick={exportarExcel} disabled={!data} className="w-full sm:w-auto">
          <FileSpreadsheet className="size-4" /> Exportar Excel
        </Button>
      </section>

    </div>
  );
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--foreground)",
};

const colorRent = (p: number) => (p >= 50 ? VERDE : p >= 35 ? AMARILLO : ROJO);

function Chip({ color, text }: { color: string; text: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 font-semibold"
      style={{ background: `${color}22`, color }}
    >
      {text}
    </span>
  );
}

/* ─────────────────── Asistente de Costea + acciones ─────────────────── */

function AssistantPanel({ data, negocio }: { data: DashboardData | null; negocio: string }) {
  const preguntar = useServerFn(askAssistant);
  const enviarAccion = useServerFn(sendDashboardAction);
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [escuchando, setEscuchando] = useState(false);
  const recRef = useRef<any>(null);

  const cargarAcciones = useCallback(async () => {
    const { data: rows } = await supabase
      .from("dashboard_actions")
      .select("id, kind, title, target_role, status, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    setAcciones((rows ?? []) as Accion[]);
  }, []);

  useEffect(() => {
    void cargarAcciones();
  }, [cargarAcciones]);

  const consultar = async (texto: string) => {
    if (!data) return;
    if (!texto.trim()) return toast.error("Escribe una pregunta para el asistente.");
    setPensando(true);
    try {
      const r = await preguntar({ data: { question: texto, contexto: resumenTexto(data) } });
      setRespuesta(r.answer);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "El asistente no pudo responder");
    } finally {
      setPensando(false);
    }
  };

  const dictar = () => {
    const w = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return toast.error("Este navegador no permite dictado por voz.");
    if (escuchando) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = "es-EC";
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      const texto = ev.results?.[0]?.[0]?.transcript ?? "";
      setPregunta(texto);
      void consultar(texto);
    };
    rec.onend = () => setEscuchando(false);
    rec.onerror = () => setEscuchando(false);
    recRef.current = rec;
    setEscuchando(true);
    rec.start();
  };

  const proponer = async (
    kind: "reporte" | "orden_compra" | "aviso_cocina",
    title: string,
    targetRole: TargetRole,
    detail: string,
  ) => {
    try {
      const r = await enviarAccion({ data: { kind, title, detail, targetRole } });
      toast.success(`Hecho. Enviado a ${r.destinatario}. Te aviso en cuanto responda.`);
      void cargarAcciones();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar por Telegram");
    }
  };

  const bajos = (data?.alertas ?? []).filter((a) => a.level === "amarillo");
  const rojas = (data?.alertas ?? []).filter((a) => a.level === "rojo");

  return (
    <section className="panel space-y-4 p-4">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Bot className="size-4" style={{ color: AZUL }} /> 🤖 Asistente de Costea
      </h2>

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Button
          onClick={() =>
            void consultar(
              "Dame un informe ejecutivo del período: resumen, puntos positivos, puntos de atención y recomendaciones.",
            )
          }
          disabled={pensando || !data}
          className="w-full sm:w-auto"
        >
          <Sparkles className="size-4" /> Generar informe ejecutivo
        </Button>
        <Button variant="secondary" className="w-full sm:w-auto" onClick={() => void consultar("¿Qué se me va a acabar en los próximos 2 días?")} disabled={pensando || !data}>
          ¿Qué se me acaba en 2 días?
        </Button>
        <Button variant="secondary" className="w-full sm:w-auto" onClick={() => void consultar("¿Cómo van las ventas comparadas con el período anterior?")} disabled={pensando || !data}>
          Comparar con período anterior
        </Button>
      </div>


      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm whitespace-pre-wrap min-h-24">
        {pensando ? "Analizando los datos del período…" : respuesta || "Pregunta lo que quieras sobre ventas, costos, inventario o rentabilidad. Ejemplos: «¿Cuánto fue la venta de ayer?», «¿Por qué faltaron 300 kg de arroz?»."}
      </div>

      <div className="space-y-2 sm:flex sm:items-end sm:gap-2 sm:space-y-0">
        <div className="min-w-0 space-y-1 sm:flex-1">
          <Label className="text-xs">Tu pregunta</Label>
          <Textarea
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            rows={2}
            placeholder="Dame un informe de ventas hasta ayer…"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            onClick={dictar}
            variant={escuchando ? "destructive" : "secondary"}
            className="size-12 shrink-0 rounded-full sm:size-14"
            title="Hablar con el asistente"
          >
            <Mic className="size-6" />
          </Button>
          <Button onClick={() => void consultar(pregunta)} disabled={pensando} className="h-12 flex-1 sm:h-14 sm:flex-none">
            <Send className="size-4" /> Preguntar
          </Button>
        </div>
      </div>


      {/* Acciones propuestas */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Acciones propuestas</h3>
        <div className="grid gap-2 lg:grid-cols-3">
          <ActionCard
            texto="📤 ¿Enviar este reporte detallado al administrador por Telegram?"
            onAceptar={() =>
              void proponer(
                "reporte",
                `📊 Reporte ${negocio} · ${data?.from} al ${data?.to}`,
                "admin",
                data ? resumenTexto(data) : "",
              )
            }
            disabled={!data}
          />
          <ActionCard
            texto="📝 ¿Generar la lista de compras de los productos con stock bajo y enviarla al encargado?"
            onAceptar={() =>
              void proponer(
                "orden_compra",
                `📝 Compras sugeridas · ${data?.to}`,
                "inventory",
                bajos.length
                  ? bajos.map((a) => `- ${a.name}: ${a.magnitud}. ${a.comparacion}`).join("\n")
                  : "No hay productos con stock bajo.",
              )
            }
            disabled={!data || bajos.length === 0}
          />
          <ActionCard
            texto="🔔 ¿Avisar al jefe de cocina sobre los consumos anormales?"
            onAceptar={() =>
              void proponer(
                "aviso_cocina",
                `🔔 Consumo anormal · ${data?.to}`,
                "kitchen",
                rojas.length
                  ? rojas.map((a) => `- ${a.name}: ${a.magnitud}. ${a.explicacion}`).join("\n")
                  : "Sin consumos anormales.",
              )
            }
            disabled={!data || rojas.length === 0}
          />
        </div>
      </div>

      {/* Seguimiento */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Seguimiento de acciones</h3>
          <Button size="sm" variant="ghost" onClick={() => void cargarAcciones()}>
            <RefreshCw className="size-3.5" /> Actualizar
          </Button>
        </div>
        {acciones.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no se han enviado acciones.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {acciones.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-md bg-secondary/30 px-3 py-1.5">
                <span className="truncate">{a.title}</span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    background: `${estadoColor(a.status)}22`,
                    color: estadoColor(a.status),
                  }}
                >
                  {ESTADO_LABEL[a.status] ?? a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const estadoColor = (s: string) =>
  s === "resuelto" ? VERDE : s === "revision" ? AMARILLO : s === "leido" ? AZUL : "#6c757d";

function ActionCard({
  texto,
  onAceptar,
  disabled,
}: {
  texto: string;
  onAceptar: () => void;
  disabled?: boolean;
}) {
  const [estado, setEstado] = useState<"pendiente" | "rechazada">("pendiente");
  if (estado === "rechazada") return null;
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm">{texto}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={onAceptar} disabled={disabled}>
          <Download className="size-3.5 rotate-180" /> Sí, enviar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEstado("rechazada")}>
          No
        </Button>
      </div>
    </div>
  );
}
