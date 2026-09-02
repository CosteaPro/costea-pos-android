import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { montoEC } from "@/lib/costeaExcel";
import {
  groupItems,
  isPercentGroup,
  lineAmount,
  loadExpensesRange,
  loadGroups,
  loadLineItems,
  loadPyg,
  type ExpenseRow,
  type Group,
  type LineItem,
} from "@/lib/pyg";

export const Route = createFileRoute("/admin/finanzas")({
  head: () => ({
    meta: [
      { title: "Finanzas · reporte de gastos por período | Costea POS" },
      {
        name: "description",
        content:
          "Reporte de gastos del restaurante por período, agrupado por grupo y rubro, con el detalle de cada factura registrada en Gastos generales.",
      },
      { property: "og:title", content: "Finanzas · reporte de gastos por período | Costea POS" },
      {
        property: "og:description",
        content: "Totales por grupo y rubro con detalle de facturas al hacer clic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanzasPage,
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
  }).format(new Date());
  const [y, m] = p.split("-");
  return { year: Number(y), month: Number(m) };
};

function FinanzasPage() {
  const inicial = hoyEC();
  const [year, setYear] = useState(inicial.year);
  const [desde, setDesde] = useState(inicial.month);
  const [hasta, setHasta] = useState(inicial.month);
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [gastos, setGastos] = useState<ExpenseRow[]>([]);
  const [ventasBrutas, setVentasBrutas] = useState(0);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const desdeM = Math.min(desde, hasta);
      const hastaM = Math.max(desde, hasta);
      const [grupos, catalogo, filas, ...pygs] = await Promise.all([
        loadGroups(),
        loadLineItems(),
        loadExpensesRange(year, desdeM, hastaM),
        ...Array.from({ length: hastaM - desdeM + 1 }, (_, i) => loadPyg(year, desdeM + i)),
      ]);
      setGroups(grupos);
      setItems(catalogo);
      setGastos(filas);
      setVentasBrutas(pygs.reduce((s, p) => s + p.ventasBrutas, 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el reporte");
    } finally {
      setLoading(false);
    }
  }, [year, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const porGrupo = useMemo(() => groupItems(groups, items), [groups, items]);

  const reporte = useMemo(
    () =>
      groups
        .map((g) => {
          const pct = isPercentGroup(g);
          const rubros = (porGrupo.get(g.key) ?? [])
            .map((it) => {
              const facturas = gastos.filter((x) => x.line_key === it.line_key);
              const valor = facturas.reduce((s, f) => s + f.amount, 0);
              return { item: it, facturas, total: lineAmount(valor, ventasBrutas, pct), raw: valor };
            })
            .filter((r) => r.facturas.length > 0);
          return { group: g, pct, rubros, total: rubros.reduce((s, r) => s + r.total, 0) };
        })
        .filter((s) => s.rubros.length > 0),
    [groups, porGrupo, gastos, ventasBrutas],
  );

  const totalGeneral = reporte.reduce((s, g) => s + g.total, 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Finanzas · reporte de gastos
          </h1>
          <p className="text-sm text-muted-foreground">
            Gastos por período agrupados por grupo y rubro. Haz clic en un rubro para ver el detalle
            de sus facturas. Los datos se ingresan en Gastos generales.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={desde}
            onChange={(e) => setDesde(Number(e.target.value))}
            aria-label="Mes desde"
          >
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">a</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={hasta}
            onChange={(e) => setHasta(Number(e.target.value))}
            aria-label="Mes hasta"
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
            aria-label="Año"
            onChange={(e) => setYear(Number(e.target.value) || inicial.year)}
          />
          <Button variant="outline" onClick={cargar} disabled={loading}>
            Actualizar
          </Button>
        </div>
      </header>

      <div className="space-y-3">
        {reporte.length === 0 && !loading && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Sin gastos registrados en el período seleccionado.
          </Card>
        )}

        {reporte.map((sec) => (
          <Card key={sec.group.id} className="overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted px-3 py-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                {sec.group.label} {sec.pct ? "(%)" : "($)"}
              </h2>
              <span className="font-semibold tabular-nums">$ {montoEC(sec.total)}</span>
            </div>
            <div className="divide-y">
              {sec.rubros.map((r) => {
                const abierto = !!abiertos[r.item.id];
                return (
                  <div key={r.item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                      onClick={() => setAbiertos((p) => ({ ...p, [r.item.id]: !abierto }))}
                    >
                      <span className="flex items-center gap-1">
                        {abierto ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        {r.item.label}
                        <span className="text-xs text-muted-foreground">
                          ({r.facturas.length} {r.facturas.length === 1 ? "factura" : "facturas"}
                          {sec.pct ? ` · ${r.raw.toFixed(2)}%` : ""})
                        </span>
                      </span>
                      <span className="tabular-nums">$ {montoEC(r.total)}</span>
                    </button>

                    {abierto && (
                      <div className="overflow-x-auto border-t bg-muted/30 px-3 py-2">
                        <table className="w-full text-xs">
                          <thead className="uppercase text-muted-foreground">
                            <tr>
                              <th className="py-1 text-left">Fecha</th>
                              <th className="py-1 text-left">Factura</th>
                              <th className="py-1 text-left">Proveedor</th>
                              <th className="py-1 text-right">Base</th>
                              <th className="py-1 text-right">IVA</th>
                              <th className="py-1 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.facturas.map((f) => (
                              <tr key={f.id}>
                                <td className="py-1 tabular-nums">{f.expense_date}</td>
                                <td className="py-1">{f.invoice_number || "—"}</td>
                                <td className="py-1">{f.supplier_name || "—"}</td>
                                <td className="py-1 text-right tabular-nums">
                                  {montoEC(f.base_amount)}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {montoEC(f.tax_amount)}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {montoEC(f.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        <Card className="flex items-center justify-between bg-primary/10 px-3 py-3 font-bold">
          <span>TOTAL DEL PERÍODO</span>
          <span className="tabular-nums">$ {montoEC(totalGeneral)}</span>
        </Card>
      </div>
    </div>
  );
}
