import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/hooks/useCompany";

import {
  printSalesMix,
  printModifiersMix,
  type SalesMixRow,
  type ModifierRow,
} from "@/lib/sales-mix-print";
import type { MixAggregate, MixData } from "@/lib/sales-mix";
import { leerMixGuardado, rangoPorDefecto } from "@/lib/reportes-cache";
import { obtenerReporte } from "@/lib/reportes-cache.functions";
import { useProgressiveList } from "@/hooks/useProgressiveList";

export const Route = createFileRoute("/admin/mix-ventas")({
  head: () => ({
    meta: [
      { title: "Mix de ventas | Costea POS" },
      {
        name: "description",
        content:
          "Mix de ventas por receta: unidades, precio de venta neto, participación, costo, contribución y porcentaje de contribución por periodo.",
      },
      { property: "og:title", content: "Mix de ventas | Costea POS" },
      {
        property: "og:description",
        content: "Participación, costo y contribución de cada plato vendido en el periodo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesMixPage,
});

const num2 = (n: number) =>
  new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
const money = (n: number) => `$ ${num2(n)}`;
const pct2 = (n: number) => `${num2(n)} %`;

type SortKey = "nombre" | "unidades" | "contribucion" | "contribucionPct";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "nombre", label: "Nombre / Código" },
  { key: "unidades", label: "Unidades vendidas" },
  { key: "contribucion", label: "Contribución $" },
  { key: "contribucionPct", label: "% Contribución" },
];

function SalesMixPage() {
  const { company } = useCompany();
  // Vista por defecto: del 1° del mes a hoy, ya pre-calculada.
  const [from, setFrom] = useState(rangoPorDefecto().from);
  const [to, setTo] = useState(rangoPorDefecto().to);
  const [sort, setSort] = useState<SortKey>("contribucion");
  const [loading, setLoading] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [aggs, setAggs] = useState<MixAggregate[]>([]);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [taxTotal, setTaxTotal] = useState(0);
  const [modRows, setModRows] = useState<ModifierRow[]>([]);
  const [tab, setTab] = useState<"ventas" | "modificadores">("ventas");

  const pintar = useCallback((datos: MixData) => {
    setAggs(datos.aggs);
    setCosts(datos.costs);
    setTaxTotal(datos.taxTotal);
    setModRows(datos.modRows);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // El resultado guardado se pinta al instante; si está vencido o no
      // existe, el servidor lo recalcula y la pantalla se actualiza sola.
      const guardado = await leerMixGuardado(from, to);
      if (guardado) {
        pintar(guardado.payload);
        setLoading(false);
        if (!guardado.vencido) return;
        setActualizando(true);
      }
      const fresco = (await obtenerReporte({ data: { kind: "mix", from, to } })) as MixData;
      pintar(fresco);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el mix de ventas");
    } finally {
      setActualizando(false);
      setLoading(false);
    }
  }, [from, to, pintar]);

  useEffect(() => {
    void load();
  }, [load]);

  const { rows, totals } = useMemo(() => {
    const netGeneral = aggs.reduce((s, a) => s + a.net, 0);
    const list: SalesMixRow[] = aggs.map((a) => {
      const unitCost = a.productId ? (costs[a.productId] ?? 0) : 0;
      const totalCost = unitCost * a.units;
      const contrib = a.net - totalCost;
      return {
        code: a.code,
        name: a.name,
        units: a.units,
        pvn: a.units > 0 ? a.net / a.units : 0,
        net: a.net,
        mixPct: netGeneral > 0 ? (a.net / netGeneral) * 100 : 0,
        unitCost,
        totalCost,
        costPct: a.net > 0 ? (totalCost / a.net) * 100 : 0,
        contrib,
        contribPct: a.net > 0 ? (contrib / a.net) * 100 : 0,
      };
    });

    list.sort((x, y) => {
      if (sort === "nombre") return x.name.localeCompare(y.name, "es");
      if (sort === "unidades") return y.units - x.units;
      if (sort === "contribucionPct") return y.contribPct - x.contribPct;
      return y.contrib - x.contrib;
    });

    const cost = list.reduce((s, r) => s + r.totalCost, 0);
    const contrib = netGeneral - cost;
    return {
      rows: list,
      totals: {
        units: list.reduce((s, r) => s + r.units, 0),
        net: netGeneral,
        tax: taxTotal,
        gross: netGeneral + taxTotal,
        cost,
        costPct: netGeneral > 0 ? (cost / netGeneral) * 100 : 0,
        contrib,
        contribPct: netGeneral > 0 ? (contrib / netGeneral) * 100 : 0,
      },
    };
  }, [aggs, costs, sort, taxTotal]);

  const print = () => {
    const negocio = company?.trade_name || company?.business_name || "Costea POS";
    const ok =
      tab === "modificadores"
        ? printModifiersMix({ rows: modRows, from, to, negocio })
        : printSalesMix({ rows, totals, from, to, negocio });
    if (!ok) toast.error("Permite las ventanas emergentes para imprimir el reporte");
  };

  // Renderizado progresivo: los totales e impresiones usan todas las filas.
  const { rendered: filasVenta, hasMore: hayMasVenta, sentinelRef: refVenta } =
    useProgressiveList(rows, 40);
  const { rendered: filasMod, hasMore: hayMasMod, sentinelRef: refMod } =
    useProgressiveList(modRows, 40);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Mix de ventas</h1>
        <p className="text-sm text-muted-foreground">
          Participación, costo y contribución de cada receta vendida en el rango seleccionado.
        </p>
      </header>

      <div className="flex gap-2">
        {(
          [
            { key: "ventas", label: "Mix de ventas" },
            { key: "modificadores", label: "Mix de modificadores" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>


      <section className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1">
          <Label htmlFor="mix-desde" className="text-xs text-muted-foreground">
            Desde
          </Label>
          <Input
            id="mix-desde"
            type="date"
            className="w-40"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mix-hasta" className="text-xs text-muted-foreground">
            Hasta
          </Label>
          <Input
            id="mix-hasta"
            type="date"
            className="w-40"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        {tab === "ventas" && (
          <div className="space-y-1">
            <Label htmlFor="mix-orden" className="text-xs text-muted-foreground">
              Ordenar por
            </Label>
            <select
              id="mix-orden"
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="size-4" /> Generar reporte
        </Button>
        {actualizando && (
          <span className="text-xs text-muted-foreground">Actualizando…</span>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={print}
          disabled={(tab === "ventas" ? rows.length : modRows.length) === 0}
        >
          <Printer className="size-4" /> Imprimir
        </Button>
      </section>

      {tab === "modificadores" ? (
        <section className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Modificador</th>
                <th className="px-3 py-1.5 text-right font-medium">Veces pedido</th>
              </tr>
            </thead>
            <tbody>
              {filasMod.map((m) => (
                <tr key={m.name} className="border-t border-border">
                  <td className="px-3 py-1">{m.name}</td>
                  <td className="tabular px-3 py-1 text-right font-semibold">{num2(m.units)}</td>
                </tr>
              ))}
              {hayMasMod && (
                <tr>
                  <td colSpan={2} className="px-3 py-3 text-center text-xs text-muted-foreground">
                    <div ref={refMod}>Cargando más…</div>
                  </td>
                </tr>
              )}
              {modRows.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-10 text-center text-muted-foreground">
                    {loading ? "Cargando…" : "Sin modificadores pedidos en este periodo."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ) : (
        <>
      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Código</th>
                <th className="px-3 py-1.5 font-medium">Nombre receta</th>
                <th className="px-3 py-1.5 text-right font-medium">Unidades</th>
                <th className="px-3 py-1.5 text-right font-medium">P.V.N.</th>
                <th className="px-3 py-1.5 text-right font-medium">Total</th>
                <th className="px-3 py-1.5 text-right font-bold text-foreground">Mix %</th>
                <th className="px-3 py-1.5 text-right font-medium">Costo U$</th>
                <th className="px-3 py-1.5 text-right font-medium">Costo T$</th>
                <th className="px-3 py-1.5 text-right font-medium">% Costo</th>
                <th className="px-3 py-1.5 text-right font-bold text-foreground">Contrib$</th>
                <th className="px-3 py-1.5 text-right font-bold text-foreground">% Contrib</th>
              </tr>
            </thead>
            <tbody>
              {filasVenta.map((r) => (
                <tr key={`${r.code}-${r.name}`} className="border-t border-border">
                  <td className="px-3 py-1">{r.code}</td>
                  <td className="px-3 py-1">{r.name}</td>
                  <td className="tabular px-3 py-1 text-right">{num2(r.units)}</td>
                  <td className="tabular px-3 py-1 text-right">{money(r.pvn)}</td>
                  <td className="tabular px-3 py-1 text-right">{money(r.net)}</td>
                  <td className="tabular px-3 py-1 text-right font-semibold">{pct2(r.mixPct)}</td>
                  <td className="tabular px-3 py-1 text-right">{money(r.unitCost)}</td>
                  <td className="tabular px-3 py-1 text-right">{money(r.totalCost)}</td>
                  <td className="tabular px-3 py-1 text-right">{pct2(r.costPct)}</td>
                  <td className="tabular px-3 py-1 text-right font-semibold">{money(r.contrib)}</td>
                  <td className="tabular px-3 py-1 text-right font-semibold">
                    {pct2(r.contribPct)}
                  </td>
                </tr>
              ))}
              {hayMasVenta && (
                <tr>
                  <td colSpan={11} className="px-3 py-3 text-center text-xs text-muted-foreground">
                    <div ref={refVenta}>Cargando más…</div>
                  </td>
                </tr>
              )}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                    {loading ? "Cargando…" : "Sin ventas cobradas en este periodo."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="font-display text-base font-semibold">Totales del periodo</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Total label="Venta neta general" value={money(totals.net)} />
          <Total label="IVA 15%" value={money(totals.tax)} />
          <Total label="Venta bruta total" value={money(totals.gross)} />
          <Total label="Costo total general" value={money(totals.cost)} />
          <Total label="% Costo general" value={pct2(totals.costPct)} />
          <Total label="Contribución total" value={money(totals.contrib)} />
          <Total label="% Contribución general" value={pct2(totals.contribPct)} />
        </dl>
      </section>
        </>
      )}
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="tabular mt-1 font-display text-lg font-semibold">{value}</dd>
    </div>
  );
}
