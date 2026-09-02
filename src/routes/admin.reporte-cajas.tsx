import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { Printer, RefreshCw, FileSpreadsheet, Search, Eye, Monitor, Globe } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCompany } from "@/hooks/useCompany";
import { ecBusinessDate } from "@/lib/caja";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import { printReportA4, esc } from "@/lib/report-print";

export const Route = createFileRoute("/admin/reporte-cajas")({
  head: () => ({
    meta: [
      { title: "Reporte de venta por caja | Costea POS" },
      {
        name: "description",
        content:
          "Ingresos consolidados por punto de venta: cajas autorizadas y caja web, con desglose por forma de pago, transacciones y último movimiento.",
      },
      { property: "og:title", content: "Reporte de venta por caja | Costea POS" },
      {
        property: "og:description",
        content: "Ventas por caja autorizada y caja web, con impresión A4 y exportación a Excel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CajasSalesReport,
});

const CAJA_WEB = "__web__";
const POR_PAGINA = 10;

const num2 = (n: number) =>
  new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
const money = (n: number) => `$${num2(n)}`;
const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const horaEc = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-EC", {
        timeZone: "America/Guayaquil",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

const FORMAS = ["efectivo", "tarjeta", "transferencia", "otros"] as const;
type Forma = (typeof FORMAS)[number];
const ETIQUETA: Record<Forma, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otros: "Otros",
};

/** Agrupa las formas de pago del sistema en las cuatro columnas del reporte. */
function grupoPago(forma: string | null): Forma {
  const f = String(forma ?? "efectivo").toLowerCase();
  if (f === "efectivo") return "efectivo";
  if (f === "tarjeta") return "tarjeta";
  if (f === "transferencia") return "transferencia";
  return "otros";
}

type Operacion = {
  fecha: string;
  tipo: string;
  numero: string;
  cliente: string;
  forma: string;
  total: number;
};

type Fila = {
  codigo: string;
  nombre: string;
  local: string;
  web: boolean;
  pagos: Record<Forma, number>;
  total: number;
  documentos: number;
  ultimo: string | null;
  operaciones: Operacion[];
};

const filaVacia = (codigo: string, nombre: string, local: string, web = false): Fila => ({
  codigo,
  nombre,
  local,
  web,
  pagos: { efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0 },
  total: 0,
  documentos: 0,
  ultimo: null,
  operaciones: [],
});

function acumular(fila: Fila, op: Operacion) {
  fila.pagos[grupoPago(op.forma)] += op.total;
  fila.total += op.total;
  fila.documentos += 1;
  if (!fila.ultimo || op.fecha > fila.ultimo) fila.ultimo = op.fecha;
  fila.operaciones.push(op);
}

function CajasSalesReport() {
  const { company } = useCompany();
  const hoy = ecBusinessDate(new Date());
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [seleccion, setSeleccion] = useState<string>("todas");
  const [todas, setTodas] = useState(true);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [detalle, setDetalle] = useState<Fila | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: cajas, error: e1 }, docs, web] = await Promise.all([
        supabase.from("cajas").select("codigo,nombre,local,activa").order("codigo"),
        fetchAllRows((a, b) =>
          supabase
            .from("caja_documentos")
            .select(
              "caja_codigo,tipo,doc_number,doc_relacionado,estado_sri,forma_pago,total,fecha_emision,cliente_nombre",
            )
            .gte("fecha_emision", desdeEc(desde))
            .lte("fecha_emision", hastaEc(hasta))
            .range(a, b),
        ),
        fetchAllRows((a, b) =>
          supabase
            .from("orders")
            .select("doc_type,doc_number,folio,doc_status,payment_method,total,created_at,customer_name,origin")
            .eq("origin", "nube")
            // Solo ventas efectivamente cobradas, igual que el tablero y el P&G.
            .eq("status", "pagado")
            .gte("created_at", desdeEc(desde))
            .lte("created_at", hastaEc(hasta))
            .range(a, b),
        ),
      ]);
      if (e1) throw e1;


      const mapa = new Map<string, Fila>();
      for (const c of cajas ?? []) mapa.set(c.codigo, filaVacia(c.codigo, c.nombre, c.local));

      for (const d of docs) {
        // Una venta facturada guarda orden + factura: se cuenta una sola vez.
        if (d.tipo === "orden" && d.doc_relacionado) continue;
        if (d.estado_sri === "rechazado" || d.estado_sri === "anulado") continue;
        const fila =
          mapa.get(d.caja_codigo) ??
          mapa.set(d.caja_codigo, filaVacia(d.caja_codigo, d.caja_codigo, "—")).get(d.caja_codigo)!;
        acumular(fila, {
          fecha: d.fecha_emision,
          tipo: d.tipo === "factura" ? "Factura" : "Orden",
          numero: d.doc_number,
          cliente: d.cliente_nombre || "Consumidor final",
          forma: d.forma_pago ?? "efectivo",
          total: Number(d.total) || 0,
        });
      }

      // La caja web siempre aparece como caja independiente.
      const filaWeb = filaVacia(CAJA_WEB, "Caja Web", "Aplicación web", true);
      for (const o of web) {
        if (o.doc_status === "anulado") continue;
        acumular(filaWeb, {
          fecha: o.created_at,
          tipo: o.doc_type === "factura" ? "Factura" : "Nota de venta",
          numero: o.doc_number || `#${o.folio}`,
          cliente: o.customer_name || "Consumidor final",
          forma: o.payment_method ?? "efectivo",
          total: Number(o.total) || 0,
        });
      }

      const orden = [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
      for (const f of orden) f.operaciones.sort((a, b) => b.fecha.localeCompare(a.fecha));
      filaWeb.operaciones.sort((a, b) => b.fecha.localeCompare(a.fecha));
      setFilas([...orden, filaWeb]);
      setPagina(1);
    } catch (err) {
      toast.error("No se pudo cargar el reporte", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Los montos se actualizan conforme cada caja sincroniza sus ventas.
  useEffect(() => {
    const canal = supabase
      .channel("reporte-cajas")
      .on("postgres_changes", { event: "*", schema: "public", table: "caja_documentos" }, () => {
        void cargar();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [cargar]);

  const visibles = useMemo(
    () => (todas || seleccion === "todas" ? filas : filas.filter((f) => f.codigo === seleccion)),
    [filas, todas, seleccion],
  );

  const totalGeneral = useMemo(() => {
    const t = filaVacia("", "TOTALES", "");
    for (const f of visibles) {
      for (const k of FORMAS) t.pagos[k] += f.pagos[k];
      t.total += f.total;
      t.documentos += f.documentos;
    }
    return t;
  }, [visibles]);

  const cajasActivas = visibles.filter((f) => f.documentos > 0).length;
  const promedio = visibles.length ? totalGeneral.total / visibles.length : 0;

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * POR_PAGINA;
  const pagina1 = visibles.slice(inicio, inicio + POR_PAGINA);

  const periodo = desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  const negocio = company?.trade_name || company?.business_name || "Costea POS";

  const imprimir = () => {
    const encabezado = `<tr><th>Caja</th><th class="r">Total vendido</th>${FORMAS.map(
      (f) => `<th class="r">${ETIQUETA[f]}</th>`,
    ).join("")}<th class="r">N° Transacciones</th><th class="r">Último movimiento</th></tr>`;
    const cuerpo = visibles
      .map(
        (f) =>
          `<tr><td>${esc(f.nombre)}${f.web ? "" : ` (${esc(f.codigo)})`}</td><td class="r">${money(
            f.total,
          )}</td>${FORMAS.map((k) => `<td class="r">${money(f.pagos[k])}</td>`).join(
            "",
          )}<td class="r">${f.documentos}</td><td class="r">${esc(horaEc(f.ultimo))}</td></tr>`,
      )
      .join("");
    const pie = `<tr><td>TOTALES</td><td class="r">${money(totalGeneral.total)}</td>${FORMAS.map(
      (k) => `<td class="r">${money(totalGeneral.pagos[k])}</td>`,
    ).join("")}<td class="r">${totalGeneral.documentos}</td><td class="r">—</td></tr>`;

    printReportA4({
      titulo: "Reporte de venta por caja",
      negocio,
      periodo,
      cuerpo: `<table><thead>${encabezado}</thead><tbody>${cuerpo}</tbody><tfoot>${pie}</tfoot></table>`,
      nota: "El arqueo de cada caja es independiente. La suma de todas las cajas se muestra únicamente en este reporte.",
      fontSize: "9px",
    });
  };

  const imprimirDetalle = (f: Fila) => {
    const cuerpo = `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Número</th><th>Cliente</th><th>Forma de pago</th><th class="r">Total</th></tr></thead><tbody>${f.operaciones
      .map(
        (o) =>
          `<tr><td>${esc(horaEc(o.fecha))}</td><td>${esc(o.tipo)}</td><td>${esc(o.numero)}</td><td>${esc(
            o.cliente,
          )}</td><td>${esc(o.forma)}</td><td class="r">${money(o.total)}</td></tr>`,
      )
      .join("")}</tbody><tfoot><tr><td colspan="5">TOTAL (${f.documentos} operaciones)</td><td class="r">${money(
      f.total,
    )}</td></tr></tfoot></table>`;
    printReportA4({
      titulo: `Arqueo · ${f.nombre}`,
      negocio,
      periodo,
      cuerpo,
      fontSize: "9px",
    });
  };

  const exportar = () => {
    const data = [...visibles, totalGeneral].map((f) => ({
      Caja: f.nombre,
      Código: f.web ? "WEB" : f.codigo || "TOTAL",
      "Total vendido": f.total,
      Efectivo: f.pagos.efectivo,
      Tarjeta: f.pagos.tarjeta,
      Transferencia: f.pagos.transferencia,
      Otros: f.pagos.otros,
      "N° Transacciones": f.documentos,
      "Último movimiento": horaEc(f.ultimo),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "VentasPorCaja");
    XLSX.writeFile(wb, `ventas-por-caja-${desde}-a-${hasta}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reporte de Venta por Caja</h1>
        <p className="text-sm text-muted-foreground">
          Visualice y analice los ingresos consolidados por punto de venta.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div>
          <Label htmlFor="desde">Fecha inicio</Label>
          <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label htmlFor="hasta">Fecha fin</Label>
          <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
        </div>
        <div className="min-w-56 flex-1">
          <Label>Seleccionar caja</Label>
          <Select
            value={seleccion}
            onValueChange={(v) => {
              setSeleccion(v);
              setTodas(v === "todas");
              setPagina(1);
            }}
            disabled={todas}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas las cajas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las cajas</SelectItem>
              {filas.map((f) => (
                <SelectItem key={f.codigo} value={f.codigo}>
                  {f.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Checkbox
            checked={todas}
            onCheckedChange={(v) => {
              const on = v === true;
              setTodas(on);
              if (on) setSeleccion("todas");
              setPagina(1);
            }}
          />
          Todas las cajas
        </label>
        <Button variant="outline" onClick={imprimir}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir
        </Button>
        <Button variant="outline" onClick={exportar}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
        </Button>
        <Button onClick={() => void cargar()} disabled={loading}>
          {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Buscar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total general", valor: money(totalGeneral.total) },
          { label: "Transacciones", valor: String(totalGeneral.documentos) },
          { label: "Cajas activas", valor: String(cajasActivas) },
          { label: "Promedio/caja", valor: money(promedio) },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{k.valor}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="p-2 text-left">Caja</th>
              <th className="p-2 text-right">Total vendido</th>
              {FORMAS.map((f) => (
                <th key={f} className="p-2 text-right">
                  {ETIQUETA[f]}
                </th>
              ))}
              <th className="p-2 text-right">N° Transacciones</th>
              <th className="p-2 text-right">Último movimiento</th>
              <th className="p-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pagina1.map((f) => (
              <tr key={f.codigo} className="border-t">
                <td className="p-2">
                  <span className="flex items-center gap-2">
                    {f.web ? (
                      <Globe className="h-4 w-4 text-primary" />
                    ) : (
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{f.nombre}</span>
                    {!f.web && <span className="text-xs text-muted-foreground">({f.codigo})</span>}
                  </span>
                </td>
                {f.documentos === 0 ? (
                  <>
                    <td className="p-2 text-right tabular-nums">{money(0)}</td>
                    <td colSpan={4} className="p-2 text-center italic text-muted-foreground">
                      Sin movimientos
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-2 text-right font-semibold tabular-nums">{money(f.total)}</td>
                    {FORMAS.map((k) => (
                      <td key={k} className="p-2 text-right tabular-nums">
                        {money(f.pagos[k])}
                      </td>
                    ))}
                  </>
                )}
                <td className="p-2 text-right tabular-nums">{f.documentos}</td>
                <td className="p-2 text-right text-muted-foreground">{horaEc(f.ultimo)}</td>
                <td className="p-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setDetalle(f)}>
                    <Eye className="mr-1 h-4 w-4" /> Ver
                  </Button>
                </td>
              </tr>
            ))}
            {pagina1.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                  No hay cajas registradas todavía.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-muted/60 font-semibold">
            <tr>
              <td className="p-2">TOTALES</td>
              <td className="p-2 text-right tabular-nums">{money(totalGeneral.total)}</td>
              {FORMAS.map((k) => (
                <td key={k} className="p-2 text-right tabular-nums">
                  {money(totalGeneral.pagos[k])}
                </td>
              ))}
              <td className="p-2 text-right tabular-nums">{totalGeneral.documentos}</td>
              <td className="p-2 text-right">—</td>
              <td className="p-2 text-right">—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p className="italic">
          Nota: El arqueo de cada caja es independiente. La suma de todas las cajas se muestra únicamente en este
          reporte.
        </p>
        <div className="flex items-center gap-2">
          <span>
            Mostrando {visibles.length === 0 ? 0 : inicio + 1} a {Math.min(inicio + POR_PAGINA, visibles.length)} de{" "}
            {visibles.length} cajas
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={paginaActual <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={paginaActual >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          >
            Siguiente
          </Button>
        </div>
      </div>

      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Arqueo de {detalle?.nombre} · {periodo}</DialogTitle>
          </DialogHeader>
          {detalle && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {FORMAS.map((k) => (
                  <div key={k} className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">{ETIQUETA[k]}</p>
                    <p className="font-semibold tabular-nums">{money(detalle.pagos[k])}</p>
                  </div>
                ))}
                <div className="rounded-md border bg-muted/50 p-2">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold tabular-nums">{money(detalle.total)}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="p-2 text-left">Fecha</th>
                      <th className="p-2 text-left">Tipo</th>
                      <th className="p-2 text-left">Número</th>
                      <th className="p-2 text-left">Cliente</th>
                      <th className="p-2 text-left">Forma de pago</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.operaciones.map((o, i) => (
                      <tr key={`${o.numero}-${i}`} className="border-t">
                        <td className="p-2">{horaEc(o.fecha)}</td>
                        <td className="p-2">{o.tipo}</td>
                        <td className="p-2">{o.numero}</td>
                        <td className="p-2">{o.cliente}</td>
                        <td className="p-2 capitalize">{o.forma}</td>
                        <td className="p-2 text-right tabular-nums">{money(o.total)}</td>
                      </tr>
                    ))}
                    {detalle.operaciones.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-muted-foreground">
                          Sin movimientos en el período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" onClick={() => imprimirDetalle(detalle)}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir arqueo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
