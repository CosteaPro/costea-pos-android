import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/hooks/useCompany";
import { ecBusinessDate } from "@/lib/caja";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import { printReportA4, esc } from "@/lib/report-print";

export const Route = createFileRoute("/admin/ventas-semanales")({
  head: () => ({
    meta: [
      { title: "Ventas semanales | Costea POS" },
      {
        name: "description",
        content:
          "Reporte de ventas semanales: 52 semanas con venta bruta diaria, transacciones, ticket promedio y desglose por forma de pago en dólares y porcentaje.",
      },
      { property: "og:title", content: "Ventas semanales | Costea POS" },
      {
        property: "og:description",
        content: "52 semanas con venta bruta, transacciones, ticket promedio y formas de pago.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WeeklySalesPage,
});

const num2 = (n: number) =>
  new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
const money = (n: number) => `$ ${num2(n)}`;
const pct = (part: number, base: number) => (base > 0 ? `${num2((part / base) * 100)} %` : "—");

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

type Totales = {
  bruta: number;
  transacciones: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  credito: number;
  delivery: number;
  otros: number;
};

const empty = (): Totales => ({
  bruta: 0,
  transacciones: 0,
  efectivo: 0,
  tarjeta: 0,
  transferencia: 0,
  credito: 0,
  delivery: 0,
  otros: 0,
});

const sumar = (a: Totales, b: Totales): Totales => ({
  bruta: a.bruta + b.bruta,
  transacciones: a.transacciones + b.transacciones,
  efectivo: a.efectivo + b.efectivo,
  tarjeta: a.tarjeta + b.tarjeta,
  transferencia: a.transferencia + b.transferencia,
  credito: a.credito + b.credito,
  delivery: a.delivery + b.delivery,
  otros: a.otros + b.otros,
});

type DiaFila = { fecha: string; label: string; futuro: boolean; t: Totales };
type SemanaFila = { numero: number; inicio: string; fin: string; dias: DiaFila[]; total: Totales };

/** Suma un número de días a una fecha AAAA-MM-DD (sin zonas horarias). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene el 1 de enero del año. */
function primerLunes(year: number): string {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dow = (jan1.getUTCDay() + 6) % 7; // 0 = lunes
  jan1.setUTCDate(jan1.getUTCDate() - dow);
  return jan1.toISOString().slice(0, 10);
}

const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function WeeklySalesPage() {
  const { company } = useCompany();
  const hoy = ecBusinessDate(new Date());
  const [year, setYear] = useState<number>(Number(hoy.slice(0, 4)));
  const [porDia, setPorDia] = useState<Record<string, Totales>>({});
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const acc: Record<string, Totales> = {};
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("orders")
          .select("created_at,total,payment_method,status,doc_status")
          .gte("created_at", desdeEc(`${year}-01-01`))
          .lte("created_at", hastaEc(`${year}-12-31`))
          .eq("status", "pagado")
          .neq("doc_status", "anulado")
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data ?? [];
        for (const o of rows) {
          const fecha = ecBusinessDate(new Date(o.created_at));
          const t = (acc[fecha] ??= empty());
          const amount = Number(o.total) || 0;
          t.bruta += amount;
          t.transacciones += 1;
          switch (o.payment_method) {
            case "efectivo":
              t.efectivo += amount;
              break;
            case "tarjeta":
              t.tarjeta += amount;
              break;
            case "transferencia":
              t.transferencia += amount;
              break;
            case "credito":
            case "transferencia_credito":
              t.credito += amount;
              break;
            case "plataforma":
              t.delivery += amount;
              break;
            default:
              t.otros += amount;
          }
        }
        if (rows.length < pageSize) break;
      }
      setPorDia(acc);
    } catch (e) {
      toast.error("No se pudieron cargar las ventas", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const semanas = useMemo<SemanaFila[]>(() => {
    const inicio = primerLunes(year);
    const out: SemanaFila[] = [];
    for (let w = 0; w < 52; w++) {
      const base = addDays(inicio, w * 7);
      const dias: DiaFila[] = [];
      let total = empty();
      for (let i = 0; i < 7; i++) {
        const fecha = addDays(base, i);
        const t = porDia[fecha] ?? empty();
        dias.push({ fecha, label: DIAS[i], futuro: fecha > hoy, t });
        total = sumar(total, t);
      }
      out.push({ numero: w + 1, inicio: base, fin: addDays(base, 6), dias, total });
    }
    return out;
  }, [porDia, year, hoy]);

  const anual = useMemo(
    () => semanas.reduce((acc, s) => sumar(acc, s.total), empty()),
    [semanas],
  );

  /** Semana que contiene la fecha de hoy (1..52). */
  const semanaActual = useMemo(() => {
    const s = semanas.find((w) => hoy >= w.inicio && hoy <= w.fin);
    return s?.numero ?? 1;
  }, [semanas, hoy]);

  const [semanaSel, setSemanaSel] = useState<number>(1);
  useEffect(() => setSemanaSel(semanaActual), [semanaActual]);

  // Al abrir, deja visible la semana en curso.
  useEffect(() => {
    if (loading) return;
    const el = document.getElementById(`semana-${semanaActual}`);
    el?.scrollIntoView({ block: "start" });
  }, [loading, semanaActual, year]);

  type ModoImpresion = "actual" | "semana" | "totales" | "completo";

  const imprimir = (modo: ModoImpresion = "completo") => {
    const filaHtml = (
      fecha: string,
      dia: string,
      t: Totales,
      futuro: boolean,
      fuerte = false,
    ) => {
      if (futuro && t.transacciones === 0)
        return `<tr><td>${esc(fecha)}</td><td>${esc(dia)}</td>${Array.from({ length: 13 })
          .map(() => `<td class="r"></td>`)
          .join("")}</tr>`;
      const cMonto = (v: number) => `<td class="r">${money(v)}</td>`;
      const cPct = (v: number) => `<td class="r">${pct(v, t.bruta)}</td>`;
      return `<tr${fuerte ? ' style="font-weight:700;background:#f2f2f2"' : ""}>
        <td>${esc(fecha)}</td>
        <td>${esc(dia)}</td>
        <td class="r">${money(t.bruta)}</td>
        <td class="r">${t.transacciones}</td>
        <td class="r">${money(t.transacciones ? t.bruta / t.transacciones : 0)}</td>
        ${cMonto(t.efectivo)}
        ${cMonto(t.tarjeta)}${cPct(t.tarjeta)}
        ${cMonto(t.transferencia)}${cPct(t.transferencia)}
        ${cMonto(t.credito)}${cPct(t.credito)}
        ${cMonto(t.delivery)}${cPct(t.delivery)}
        ${cMonto(t.otros)}${cPct(t.otros)}
      </tr>`;
    };
    const elegidas =
      modo === "actual"
        ? semanas.filter((s) => s.numero === semanaActual)
        : modo === "semana"
          ? semanas.filter((s) => s.numero === semanaSel)
          : semanas.filter((s) => s.total.transacciones > 0);

    const soloTotales = modo === "totales";

    const cuerpoTotales = `<table><thead><tr>
        <th>Semana</th><th>Período</th><th class="r">Venta $</th><th class="r">Transac.</th><th class="r">Ticket $</th>
        <th class="r">Efectivo $</th><th class="r">Tarjeta $</th><th class="r">Transfer. $</th>
        <th class="r">Crédito $</th><th class="r">Delivery $</th><th class="r">Otros $</th>
      </tr></thead><tbody>
      ${semanas
        .filter((s) => s.total.transacciones > 0)
        .map(
          (s) => `<tr>
            <td>Semana ${s.numero}</td>
            <td style="white-space:nowrap">${fechaCorta(s.inicio)} al ${fechaCorta(s.fin)}</td>
            <td class="r">${money(s.total.bruta)}</td>
            <td class="r">${s.total.transacciones}</td>
            <td class="r">${money(s.total.transacciones ? s.total.bruta / s.total.transacciones : 0)}</td>
            <td class="r">${money(s.total.efectivo)}</td>
            <td class="r">${money(s.total.tarjeta)}</td>
            <td class="r">${money(s.total.transferencia)}</td>
            <td class="r">${money(s.total.credito)}</td>
            <td class="r">${money(s.total.delivery)}</td>
            <td class="r">${money(s.total.otros)}</td>
          </tr>`,
        )
        .join("")}
      </tbody></table>`;

    const cuerpo = elegidas
      .map(
        (s) => `<h3 style="font-size:11px;margin:10px 0 3px">Semana ${s.numero} · ${fechaCorta(
          s.inicio,
        )} al ${fechaCorta(s.fin)}</h3>
        <table><thead><tr>
          <th>Fecha</th><th>Día</th><th class="r">Venta $</th><th class="r">Transac.</th><th class="r">Ticket $</th>
          <th class="r">Efectivo $</th>
          <th class="r">Tarjeta $</th><th class="r">Tarjeta %</th>
          <th class="r">Transfer. $</th><th class="r">Transfer. %</th>
          <th class="r">Crédito $</th><th class="r">Crédito %</th>
          <th class="r">Delivery $</th><th class="r">Delivery %</th>
          <th class="r">Otros $</th><th class="r">Otros %</th>
        </tr></thead><tbody>
        ${s.dias
          .map((d) => filaHtml(fechaCorta(d.fecha), d.label, d.t, d.futuro))
          .join("")}
        ${filaHtml("Total", `Semana ${s.numero}`, s.total, false, true)}
        </tbody></table>`,
      )
      .join("");
    const unica = modo === "actual" || modo === "semana" ? elegidas[0] : null;
    const periodo = soloTotales
      ? `Año ${year} · resumen por semana`
      : unica
        ? `Semana ${unica.numero} · ${fechaCorta(unica.inicio)} al ${fechaCorta(unica.fin)}`
        : `Año ${year}`;

    printReportA4({
      titulo: "Reporte de Ventas Semanales",
      negocio: company?.trade_name || company?.business_name,
      periodo,
      cuerpo: soloTotales
        ? cuerpoTotales
        : cuerpo || "<p>Sin ventas registradas en el período.</p>",
      fontSize: "8px",
    });
  };

  const years = Array.from({ length: 6 }, (_, i) => Number(hoy.slice(0, 4)) - i);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Ventas semanales</h1>
          <p className="text-sm text-muted-foreground">
            52 semanas del año, día por día: venta bruta, transacciones, ticket promedio y formas de
            pago en dólares y porcentaje.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="anio">Año</Label>
            <select
              id="anio"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" onClick={() => void cargar()} disabled={loading}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Actualizar
          </Button>
          <div className="space-y-1">
            <Label htmlFor="semana-print">Semana</Label>
            <select
              id="semana-print"
              value={semanaSel}
              onChange={(e) => setSemanaSel(Number(e.target.value))}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {semanas.map((s) => (
                <option key={s.numero} value={s.numero}>
                  Semana {s.numero}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => imprimir("actual")}>
            <Printer className="size-4" /> Semana en curso
          </Button>
          <Button variant="outline" onClick={() => imprimir("semana")}>
            <Printer className="size-4" /> Semana elegida
          </Button>
          <Button variant="outline" onClick={() => imprimir("totales")}>
            <Printer className="size-4" /> Solo totales
          </Button>
          <Button variant="outline" onClick={() => imprimir("completo")}>
            <Printer className="size-4" /> Año completo
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total del año {year}</p>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
          <Metric label="Venta bruta" value={money(anual.bruta)} />
          <Metric label="Transacciones" value={String(anual.transacciones)} />
          <Metric
            label="Ticket promedio"
            value={money(anual.transacciones ? anual.bruta / anual.transacciones : 0)}
          />
          <Metric label="Efectivo" value={money(anual.efectivo)} sub={pct(anual.efectivo, anual.bruta)} />
          <Metric label="Tarjeta" value={money(anual.tarjeta)} sub={pct(anual.tarjeta, anual.bruta)} />
          <Metric
            label="Transferencias"
            value={money(anual.transferencia)}
            sub={pct(anual.transferencia, anual.bruta)}
          />
          <Metric label="Crédito" value={money(anual.credito)} sub={pct(anual.credito, anual.bruta)} />
          <Metric label="Delivery / Otros" value={money(anual.delivery + anual.otros)} sub={pct(anual.delivery + anual.otros, anual.bruta)} />
        </div>
      </section>

      <div className="space-y-6">
        {semanas.map((s) => (
          <SemanaTabla key={s.numero} semana={s} />
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display text-sm font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-[11px] text-muted-foreground tabular-nums">{sub}</p> : null}
    </div>
  );
}

function CeldaMonto({ valor }: { valor: number }) {
  return (
    <td className="px-2 py-1.5 text-right tabular-nums">
      <span>{money(valor)}</span>
    </td>
  );
}

function CeldaPct({ valor, base }: { valor: number; base: number }) {
  return (
    <td className="px-2 py-1.5 text-right tabular-nums text-[11px] text-muted-foreground">
      {pct(valor, base)}
    </td>
  );
}

function SemanaTabla({ semana }: { semana: SemanaFila }) {
  const t = semana.total;
  return (
    <section
      id={`semana-${semana.numero}`}
      className="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="font-display text-sm font-semibold">Semana {semana.numero}</h2>
        <p className="whitespace-nowrap text-xs text-muted-foreground">
          {fechaCorta(semana.inicio)} al {fechaCorta(semana.fin)}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">Fecha</th>
              <th className="px-2 py-2 text-left">Día</th>
              <th className="px-2 py-2 text-right">Venta $</th>
              <th className="px-2 py-2 text-right">Transac.</th>
              <th className="px-2 py-2 text-right">Ticket $</th>
              <th className="px-2 py-2 text-right">Efectivo $</th>
              <th className="px-2 py-2 text-right">Tarjeta $</th>
              <th className="px-2 py-2 text-right">Tarjeta %</th>
              <th className="px-2 py-2 text-right">Transfer. $</th>
              <th className="px-2 py-2 text-right">Transfer. %</th>
              <th className="px-2 py-2 text-right">Crédito $</th>
              <th className="px-2 py-2 text-right">Crédito %</th>
              <th className="px-2 py-2 text-right">Delivery $</th>
              <th className="px-2 py-2 text-right">Delivery %</th>
              <th className="px-2 py-2 text-right">Otros $</th>
              <th className="px-2 py-2 text-right">Otros %</th>
            </tr>
          </thead>
          <tbody>
            {semana.dias.map((d) => {
              const vacio = d.futuro && d.t.transacciones === 0;
              return (
                <tr key={d.fecha} className="border-t border-border">
                  <td className="px-2 py-1.5 text-xs tabular-nums">{fechaCorta(d.fecha)}</td>
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{d.label}</span>
                  </td>
                  {vacio ? (
                    <td className="px-2 py-1.5 text-right text-xs text-muted-foreground" colSpan={14}>
                      —
                    </td>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                        {money(d.t.bruta)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{d.t.transacciones}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {money(d.t.transacciones ? d.t.bruta / d.t.transacciones : 0)}
                      </td>
                      <CeldaMonto valor={d.t.efectivo} />
                      <CeldaMonto valor={d.t.tarjeta} />
                      <CeldaPct valor={d.t.tarjeta} base={d.t.bruta} />
                      <CeldaMonto valor={d.t.transferencia} />
                      <CeldaPct valor={d.t.transferencia} base={d.t.bruta} />
                      <CeldaMonto valor={d.t.credito} />
                      <CeldaPct valor={d.t.credito} base={d.t.bruta} />
                      <CeldaMonto valor={d.t.delivery} />
                      <CeldaPct valor={d.t.delivery} base={d.t.bruta} />
                      <CeldaMonto valor={d.t.otros} />
                      <CeldaPct valor={d.t.otros} base={d.t.bruta} />
                    </>
                  )}
                </tr>
              );
            })}
            <tr className="border-t-2 border-border bg-muted/40 font-semibold">
              <td className="px-2 py-2">Total</td>
              <td className="px-2 py-2">Semana {semana.numero}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {money(t.bruta)}
                <span className="block text-[11px] font-normal text-muted-foreground">100 %</span>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{t.transacciones}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {money(t.transacciones ? t.bruta / t.transacciones : 0)}
              </td>
              <CeldaMonto valor={t.efectivo} />
              <CeldaMonto valor={t.tarjeta} />
              <CeldaPct valor={t.tarjeta} base={t.bruta} />
              <CeldaMonto valor={t.transferencia} />
              <CeldaPct valor={t.transferencia} base={t.bruta} />
              <CeldaMonto valor={t.credito} />
              <CeldaPct valor={t.credito} base={t.bruta} />
              <CeldaMonto valor={t.delivery} />
              <CeldaPct valor={t.delivery} base={t.bruta} />
              <CeldaMonto valor={t.otros} />
              <CeldaPct valor={t.otros} base={t.bruta} />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
