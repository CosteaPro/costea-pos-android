import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useCompany } from "@/hooks/useCompany";
import { printReportA4, esc } from "@/lib/report-print";
import { ecBusinessDate } from "@/lib/caja";
import { loadCashFlow, saveManualFlow, type DayFlow } from "@/lib/flujo-caja";

export const Route = createFileRoute("/admin/flujo-caja")({
  head: () => ({
    meta: [
      { title: "Flujo de caja | Costea POS" },
      {
        name: "description",
        content:
          "Flujo de caja diario del restaurante: saldo inicial, entradas por ventas, salidas por compras y gastos, flujo neto y saldo final.",
      },
      { property: "og:title", content: "Flujo de caja | Costea POS" },
      {
        property: "og:description",
        content: "Entradas y salidas de dinero día por día con arrastre automático de saldos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CashFlowPage,
});

const money = (n: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n || 0);

const fechaCorta = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
const fechaLarga = (d: string) => d.split("-").reverse().join("/");

function CashFlowPage() {
  const { company } = useCompany();
  const hoy = ecBusinessDate(new Date());
  const primero = `${hoy.slice(0, 7)}-01`;

  const [from, setFrom] = useState(primero);
  const [to, setTo] = useState(hoy);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [dias, setDias] = useState<DayFlow[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setDias(await loadCashFlow(from, to, saldoInicial));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el flujo de caja");
    } finally {
      setLoading(false);
    }
  }, [from, to, saldoInicial]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarManual = async (fecha: string, campo: "otrosIngresos" | "otrosEgresos", v: number) => {
    const dia = dias.find((d) => d.fecha === fecha);
    if (!dia) return;
    try {
      await saveManualFlow(fecha, {
        otrosIngresos: campo === "otrosIngresos" ? v : dia.otrosIngresos,
        otrosEgresos: campo === "otrosEgresos" ? v : dia.otrosEgresos,
      });
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const totales = useMemo(() => {
    const sum = (f: (d: DayFlow) => number) => dias.reduce((s, d) => s + f(d), 0);
    return {
      efectivo: sum((d) => d.ventasEfectivo),
      tarjeta: sum((d) => d.ventasTarjeta),
      transferencia: sum((d) => d.ventasTransferencia),
      cobros: sum((d) => d.cobrosCredito),
      otrosIng: sum((d) => d.otrosIngresos),
      entradas: sum((d) => d.totalEntradas),
      compras: sum((d) => d.compras),
      gastos: sum((d) => d.gastosGenerales),
      nomina: sum((d) => d.nomina),
      otrosEgr: sum((d) => d.otrosEgresos),
      salidas: sum((d) => d.totalSalidas),
      neto: sum((d) => d.flujoNeto),
    };
  }, [dias]);

  const imprimir = () => {
    const th = `<tr>
      <th>Fecha</th><th class="r">Saldo inicial</th>
      <th class="r">Ventas efectivo</th><th class="r">Ventas tarjeta</th>
      <th class="r">Transferencia efectiva</th><th class="r">Cobros crédito</th><th class="r">Otros ingresos</th>
      <th class="r">Total entradas</th>
      <th class="r">Compras / proveedores</th><th class="r">Gastos generales</th>
      <th class="r">Nómina / sueldos</th><th class="r">Otros egresos</th>
      <th class="r">Total salidas</th><th class="r">Flujo neto</th><th class="r">Saldo final</th>
    </tr>`;
    const body = dias
      .map(
        (d) => `<tr>
        <td>${esc(fechaLarga(d.fecha))}</td>
        <td class="r">${money(d.saldoInicial)}</td>
        <td class="r">${money(d.ventasEfectivo)}</td>
        <td class="r">${money(d.ventasTarjeta)}</td>
        <td class="r">${money(d.ventasTransferencia)}</td>
        <td class="r">${money(d.cobrosCredito)}</td>
        <td class="r">${money(d.otrosIngresos)}</td>
        <td class="r">${money(d.totalEntradas)}</td>
        <td class="r">${money(d.compras)}</td>
        <td class="r">${money(d.gastosGenerales)}</td>
        <td class="r">${money(d.nomina)}</td>
        <td class="r">${money(d.otrosEgresos)}</td>
        <td class="r">${money(d.totalSalidas)}</td>
        <td class="r">${money(d.flujoNeto)}</td>
        <td class="r">${money(d.saldoFinal)}</td>
      </tr>`,
      )
      .join("");
    const tfoot = `<tr>
      <td>TOTALES</td><td class="r"></td>
      <td class="r">${money(totales.efectivo)}</td>
      <td class="r">${money(totales.tarjeta)}</td>
      <td class="r">${money(totales.transferencia)}</td>
      <td class="r">${money(totales.cobros)}</td>
      <td class="r">${money(totales.otrosIng)}</td>
      <td class="r">${money(totales.entradas)}</td>
      <td class="r">${money(totales.compras)}</td>
      <td class="r">${money(totales.gastos)}</td>
      <td class="r">${money(totales.nomina)}</td>
      <td class="r">${money(totales.otrosEgr)}</td>
      <td class="r">${money(totales.salidas)}</td>
      <td class="r">${money(totales.neto)}</td>
      <td class="r">${money(dias.at(-1)?.saldoFinal ?? saldoInicial)}</td>
    </tr>`;

    printReportA4({
      titulo: "Flujo de caja",
      negocio: company?.trade_name || company?.business_name,
      periodo: `${fechaLarga(from)} al ${fechaLarga(to)}`,
      cuerpo: `<table><thead>${th}</thead><tbody>${body}</tbody><tfoot>${tfoot}</tfoot></table>`,
      nota: "El saldo final de cada día se arrastra como saldo inicial del día siguiente. Las ventas por Transferencia Crédito no entran al flujo hasta que el cobro se confirma.",
      fontSize: "6.4px",
    });
  };

  const saldoFinalPeriodo = dias.at(-1)?.saldoFinal ?? saldoInicial;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Flujo de caja</h1>
        <p className="text-sm text-muted-foreground">
          {company?.trade_name || company?.business_name || "Costea POS"} · Entradas y salidas de
          dinero día por día. Solo se editan "Otros ingresos" y "Otros egresos".
        </p>
      </header>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="text-xs font-medium">
          Desde
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
        </label>
        <label className="text-xs font-medium">
          Hasta
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
        </label>
        <label className="text-xs font-medium">
          Saldo inicial de caja
          <Input
            type="number"
            step="0.01"
            value={saldoInicial}
            onChange={(e) => setSaldoInicial(Number(e.target.value) || 0)}
            className="mt-1 w-40"
          />
        </label>
        <Button variant="outline" onClick={cargar} disabled={loading}>
          {loading ? "Cargando…" : "Actualizar"}
        </Button>
        <Button onClick={imprimir} disabled={!dias.length}>
          Imprimir A4
        </Button>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-right text-xs">
          <thead className="bg-muted/60 text-[11px] uppercase">
            <tr>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2">Saldo inicial</th>
              <th className="p-2">Efectivo</th>
              <th className="p-2">Tarjeta</th>
              <th className="p-2">Transf. efectiva</th>
              <th className="p-2">Cobros crédito</th>
              <th className="p-2">Otros ingresos</th>
              <th className="p-2">Total entradas</th>
              <th className="p-2">Compras</th>
              <th className="p-2">Gastos generales</th>
              <th className="p-2">Nómina</th>
              <th className="p-2">Otros egresos</th>
              <th className="p-2">Total salidas</th>
              <th className="p-2">Flujo neto</th>
              <th className="p-2">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.fecha} className="border-t">
                <td className="p-2 text-left font-medium">{fechaCorta(d.fecha)}</td>
                <td className="p-2">{money(d.saldoInicial)}</td>
                <td className="p-2">{money(d.ventasEfectivo)}</td>
                <td className="p-2">{money(d.ventasTarjeta)}</td>
                <td className="p-2">{money(d.ventasTransferencia)}</td>
                <td className="p-2">{money(d.cobrosCredito)}</td>
                <td className="p-1">
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={d.otrosIngresos}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== d.otrosIngresos) guardarManual(d.fecha, "otrosIngresos", v);
                    }}
                    className="h-8 w-24 text-right"
                  />
                </td>
                <td className="p-2 font-semibold">{money(d.totalEntradas)}</td>
                <td className="p-2">{money(d.compras)}</td>
                <td className="p-2">{money(d.gastosGenerales)}</td>
                <td className="p-2">{money(d.nomina)}</td>
                <td className="p-1">
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={d.otrosEgresos}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== d.otrosEgresos) guardarManual(d.fecha, "otrosEgresos", v);
                    }}
                    className="h-8 w-24 text-right"
                  />
                </td>
                <td className="p-2 font-semibold">{money(d.totalSalidas)}</td>
                <td className={`p-2 font-semibold ${d.flujoNeto < 0 ? "text-destructive" : ""}`}>
                  {money(d.flujoNeto)}
                </td>
                <td className="p-2 font-bold">{money(d.saldoFinal)}</td>
              </tr>
            ))}
            {!dias.length && !loading && (
              <tr>
                <td colSpan={15} className="p-6 text-center text-muted-foreground">
                  Sin movimientos en el período seleccionado.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 bg-muted/40 font-semibold">
            <tr>
              <td className="p-2 text-left">TOTALES</td>
              <td className="p-2" />
              <td className="p-2">{money(totales.efectivo)}</td>
              <td className="p-2">{money(totales.tarjeta)}</td>
              <td className="p-2">{money(totales.transferencia)}</td>
              <td className="p-2">{money(totales.otrosIng)}</td>
              <td className="p-2">{money(totales.entradas)}</td>
              <td className="p-2">{money(totales.compras)}</td>
              <td className="p-2">{money(totales.gastos)}</td>
              <td className="p-2">{money(totales.nomina)}</td>
              <td className="p-2">{money(totales.otrosEgr)}</td>
              <td className="p-2">{money(totales.salidas)}</td>
              <td className="p-2">{money(totales.neto)}</td>
              <td className="p-2">{money(saldoFinalPeriodo)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}
