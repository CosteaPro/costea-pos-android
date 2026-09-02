import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { montoEC } from "@/lib/costeaExcel";
import { useCompany } from "@/hooks/useCompany";
import { printReportA4, esc } from "@/lib/report-print";
import {
  groupItems,
  isCleaning,
  CLEANING_CATEGORY,
  isPercentGroup,
  lineAmount,
  loadGroups,
  loadLineItems,
  loadManualLines,
  loadPyg,
  recalcularMes,
  type Group,
  type LineItem,
  type PygData,
} from "@/lib/pyg";
import { leerPygGuardado, rangoPorDefecto } from "@/lib/reportes-cache";
import { obtenerReporte, recalcularReportes } from "@/lib/reportes-cache.functions";


export const Route = createFileRoute("/admin/perdidas-ganancias")({
  head: () => ({
    meta: [
      { title: "Estado de pérdidas y ganancias | Costea POS" },
      {
        name: "description",
        content:
          "Estado mensual de pérdidas y ganancias: ventas netas, costo de producción por categoría, gastos, mano de obra y resultado total.",
      },
      { property: "og:title", content: "Estado de pérdidas y ganancias | Costea POS" },
      {
        property: "og:description",
        content: "Resultado mensual del restaurante con costos automáticos y gastos guardados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PygPage,
});

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
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = p.split("-");
  return { year: Number(y), month: Number(m), day: Number(d), iso: p };
};

/** Fecha "YYYY-MM-DD" a Date local (sin corrimiento de zona). */
const isoADate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};
const dateAIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function PygPage() {
  const inicial = hoyEC();
  const [year, setYear] = useState(inicial.year);
  const [month, setMonth] = useState(inicial.month);
  const [data, setData] = useState<PygData | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [manual, setManual] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [desglosarIva, setDesglosarIva] = useState<"Sí" | "No">("Sí");
  const [recalcAbierto, setRecalcAbierto] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [fechaCorte, setFechaCorte] = useState<Date | undefined>(undefined);
  /** Fecha de corte aplicada al reporte tras recalcular (día 1 → esta fecha). */
  const [corteAplicado, setCorteAplicado] = useState<string | undefined>(undefined);

  const { company } = useCompany();

  const ultimoDiaMes = new Date(year, month, 0).getDate();
  const primerDia = new Date(year, month - 1, 1);
  const ultimoDia = new Date(year, month - 1, ultimoDiaMes);
  const corteSugerido =
    year === inicial.year && month === inicial.month ? isoADate(inicial.iso) : ultimoDia;

  const abrirRecalculo = () => {
    setFechaCorte(corteSugerido);
    setRecalcAbierto(true);
  };

  const cargar = useCallback(async (hasta?: string) => {
    setLoading(true);
    try {
      // Vista por defecto (mes en curso, del 1° a hoy): ya viene pre-calculada.
      const rango = rangoPorDefecto();
      const esPorDefecto =
        !hasta && year === Number(rango.to.slice(0, 4)) && month === Number(rango.to.slice(5, 7));
      const guardado = esPorDefecto ? await leerPygGuardado(rango.from, rango.to) : null;

      const [lines, catalogo, grupos] = await Promise.all([
        loadManualLines(year, month),
        loadLineItems(),
        loadGroups(),
      ]);
      setManual(lines);
      setItems(catalogo);
      setGroups(grupos);
      if (esPorDefecto) setCorteAplicado(rango.to);

      if (guardado) {
        setData(guardado.payload);
        setLoading(false);
        if (!guardado.vencido) return;
        setActualizando(true);
      }
      const pyg = esPorDefecto
        ? ((await obtenerReporte({
            data: { kind: "pyg", from: rango.from, to: rango.to },
          })) as PygData)
        : await loadPyg(year, month, hasta);
      setData(pyg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el reporte");
    } finally {
      setActualizando(false);
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    setCorteAplicado(undefined);
    cargar();
  }, [cargar]);

  const ejecutarRecalculo = async () => {
    if (!fechaCorte) return;
    setRecalculando(true);
    try {
      const res = await recalcularMes(year, month, dateAIso(fechaCorte));
      setRecalcAbierto(false);
      setCorteAplicado(res.hasta);
      // Se guarda el resultado para que la próxima apertura sea instantánea.
      void recalcularReportes({ data: { fecha: res.hasta } }).catch(() => undefined);
      toast.success(
        `Del 1 al ${res.hasta.split("-").reverse().join("/")}: consumo $${res.consumo.toFixed(2)} cargado al P&G (${res.pedidos} pedidos).`,
      );
      await cargar(res.hasta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo recalcular el mes");
    } finally {
      setRecalculando(false);
    }
  };


  const brutas = data?.ventasBrutas ?? 0;
  /** La VENTA NETA es el 100%: base de todos los porcentajes del reporte. */
  const netas = data?.ventasNetas ?? 0;
  const pct = (v: number) => (netas > 0 ? `${((v / netas) * 100).toFixed(2)}%` : "0,00%");

  const limpieza = data?.utilesLimpieza ?? 0;

  const costoLabel = "COSTO DE PRODUCCIÓN";


  const secciones = useMemo(() => {
    const porGrupo = groupItems(groups, items);
    let limpiezaAsignada = false;

    const base = groups
      .map((g) => {
        const percent = isPercentGroup(g);
        const lines = (porGrupo.get(g.key) ?? []).map((it) => {
          const raw = manual[it.line_key] ?? 0;
          let amount = lineAmount(raw, netas, percent);
          // Útiles de limpieza: el consumo del inventario entra automático.
          if (!percent && isCleaning(it.label)) {
            amount += limpieza;
            limpiezaAsignada = true;
          }
          return { item: it, raw, amount, auto: !percent && isCleaning(it.label) };
        });
        return {
          key: g.key,
          title: g.label,
          percent,
          lines,
          total: lines.reduce((s, l) => s + l.amount, 0),
        };
      })
      .filter((s) => s.lines.length > 0);

    // Sin rubro creado todavía: se muestra igual para no perder el gasto.
    if (!limpiezaAsignada && limpieza > 0) {
      base.push({
        key: "__limpieza",
        title: "GASTOS GENERALES (automático)",
        percent: false,
        lines: [
          {
            item: {
              id: "__limpieza",
              section: "__limpieza",
              line_key: "__limpieza",
              label: CLEANING_CATEGORY,
              sort_order: 0,
            },
            raw: 0,
            amount: limpieza,
            auto: true,
          },
        ],
        total: limpieza,
      });
    }

    return base;
  }, [groups, items, manual, netas, limpieza]);



  const totalManual = secciones.reduce((a, s) => a + s.total, 0);
  const resultado = (data?.ventasNetas ?? 0) - (data?.costoTotal ?? 0) - totalManual;

  const imprimir = () => {
    const fila = (label: string, amount: number, strong = false, indent = false) =>
      `<tr${strong ? ' class="s"' : ""}>
        <td${indent ? ' class="i"' : ""}>${esc(label)}</td>
        <td class="r">$ ${montoEC(amount)}</td>
        <td class="r">${pct(amount)}</td>
      </tr>`;

    const filas = [
      fila("VENTAS BRUTAS", brutas, true),
      fila("IMPUESTOS", data?.iva ?? 0, true),
      ...(desglosarIva === "Sí"
        ? [
            fila("IVA cobrado con facturas", data?.ivaFacturas ?? 0, false, true),
            fila("IVA cobrado sin facturas", data?.ivaSinFacturas ?? 0, false, true),
            fila("(-) TOTAL IVA COBRADO", data?.iva ?? 0),
          ]
        : [fila("(-) TOTAL IVA COBRADO", data?.iva ?? 0)]),
      fila("= VENTAS NETAS", data?.ventasNetas ?? 0, true),
      fila(costoLabel, data?.costoTotal ?? 0, true),
      ...(data?.costoCategorias ?? []).map((c, i) => fila(`${i + 1}. ${c.name}`, c.amount, false, true)),
      ...secciones.flatMap((sec) => [
        fila(sec.title, sec.total, true),
        ...sec.lines.map((l, i) =>
          fila(
            `${i + 1}. ${l.item.label}${sec.percent ? ` (${(l.raw || 0).toFixed(2)}%)` : ""}`,
            l.amount,
            false,
            true,
          ),
        ),
      ]),
      fila("RESULTADO TOTAL", resultado, true),
    ].join("");

    const ultimo = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dd = (d: number) => String(d).padStart(2, "0");
    printReportA4({
      titulo: "Estado de Pérdidas y Ganancias",
      negocio: company?.trade_name || company?.business_name || "Costea POS",
      periodo: `desde ${dd(1)}/${dd(month)}/${year} hasta ${dd(ultimo)}/${dd(month)}/${year}`,
      fontSize: "10px",
      compacto: true,
      cuerpo: `<style>
        tr.s td { background:#f0f0f0; font-weight:700; }
        td.i { padding-left:14px; color:#333; }
        td, th { white-space:nowrap; }
        td:first-child, th:first-child { white-space:normal; max-width:95mm; }
      </style>
      <table>
        <thead><tr><th>Concepto</th><th class="r">Valor</th><th class="r">% ventas netas</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>`,
    });
  };

  const Row = ({
    label,
    amount,
    strong,
    indent,
  }: {
    label: string;
    amount: number;
    strong?: boolean;
    indent?: boolean;
  }) => (
    <div
      className={`grid grid-cols-[1fr_130px_90px] items-center gap-2 px-3 py-1.5 ${
        strong ? "bg-muted/60 font-semibold" : ""
      }`}
    >
      <span className={`${indent ? "pl-6 text-sm text-muted-foreground" : "text-sm"} truncate`}>
        {label}
      </span>
      <span className="text-right tabular-nums">$ {montoEC(amount)}</span>
      <span className="text-right tabular-nums text-sm text-muted-foreground">{pct(amount)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Estado de pérdidas y ganancias
          </h1>
          <p className="text-sm text-muted-foreground">
            Solo lectura: las ventas y el costo son automáticos; los gastos se ingresan en Gastos
            generales. Cambia allá = cambia aquí.
          </p>

        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
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
            onChange={(e) => setYear(Number(e.target.value) || inicial.year)}
          />
          <div className="flex items-center gap-2">
            <label htmlFor="desglosar-iva" className="text-sm text-muted-foreground">
              Desglosar IVA:
            </label>
            <select
              id="desglosar-iva"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={desglosarIva}
              onChange={(e) => setDesglosarIva(e.target.value as "Sí" | "No")}
            >
              <option value="Sí">Sí</option>
              <option value="No">No</option>
            </select>
          </div>
          <Button variant="outline" onClick={() => cargar(corteAplicado)} disabled={loading}>
            Actualizar
          </Button>
          <Button variant="outline" onClick={abrirRecalculo} disabled={loading || recalculando}>
            {recalculando ? "Recalculando…" : "Recalcular"}
          </Button>
          <Button variant="outline" onClick={imprimir} disabled={loading}>
            Imprimir A4
          </Button>
          <Button asChild>
            <Link to="/admin/gastos">Ingresar gastos</Link>
          </Button>

          <Dialog open={recalcAbierto} onOpenChange={(o) => !recalculando && setRecalcAbierto(o)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Recalcular {MESES[month - 1]} {year}</DialogTitle>
                <DialogDescription>
                  Elige la fecha de corte. Se recalculará desde el 1 de{" "}
                  {MESES[month - 1]?.toLowerCase()} hasta esa fecha.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={fechaCorte}
                  onSelect={setFechaCorte}
                  defaultMonth={primerDia}
                  disabled={{ before: primerDia, after: ultimoDia }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRecalcAbierto(false)}
                  disabled={recalculando}
                >
                  Cancelar
                </Button>
                <Button onClick={ejecutarRecalculo} disabled={recalculando || !fechaCorte}>
                  {recalculando ? "Recalculando…" : "Recalcular"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>


        </div>
      </header>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_130px_90px] gap-2 border-b bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide">
          <span>Concepto</span>
          <span className="text-right">Valor</span>
          <span className="text-right">% ventas netas</span>
        </div>

        <Row label="VENTAS BRUTAS" amount={brutas} strong />
        <Row label="IMPUESTOS" amount={data?.iva ?? 0} strong />
        {desglosarIva === "Sí" ? (
          <>
            <Row label="IVA cobrado con facturas" amount={data?.ivaFacturas ?? 0} indent />
            <Row label="IVA cobrado sin facturas" amount={data?.ivaSinFacturas ?? 0} indent />
            <Row label="(-) TOTAL IVA COBRADO" amount={data?.iva ?? 0} />
          </>
        ) : (
          <Row label="(-) TOTAL IVA COBRADO" amount={data?.iva ?? 0} />
        )}
        <Row label="= VENTAS NETAS" amount={data?.ventasNetas ?? 0} strong />

        <Row label={costoLabel} amount={data?.costoTotal ?? 0} strong />
        {(data?.costoCategorias ?? []).map((c, i) => (
          <Row key={c.name} label={`${i + 1}. ${c.name}`} amount={c.amount} indent />
        ))}

        {secciones.map((s) => (
          <div key={s.key}>
            <Row label={s.title} amount={s.total} strong />
            {s.lines.map((l, i) => (
              <Row
                key={l.item.id}
                label={`${i + 1}. ${l.item.label}${
                  s.percent ? ` (${(l.raw || 0).toFixed(2)}%)` : ""
                }`}
                amount={l.amount}
                indent
              />
            ))}
          </div>
        ))}

        <div className="grid grid-cols-[1fr_130px_90px] items-center gap-2 border-t bg-primary/10 px-3 py-3 font-bold">
          <span>RESULTADO TOTAL</span>
          <span className="text-right tabular-nums">$ {montoEC(resultado)}</span>
          <span className="text-right tabular-nums">{pct(resultado)}</span>
        </div>
      </Card>
    </div>
  );
}
