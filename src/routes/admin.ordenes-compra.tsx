import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Ban, FileSpreadsheet, PackageCheck, Printer, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoidDialog } from "@/components/admin/void-dialog";
import { currency, paymentLabel } from "@/lib/pos";
import { ecBusinessDate } from "@/lib/caja";
import { useProgressiveList } from "@/hooks/useProgressiveList";
import { useCompany } from "@/hooks/useCompany";
import { esc, printReportA4 } from "@/lib/report-print";


export const Route = createFileRoute("/admin/ordenes-compra")({
  head: () => ({
    meta: [
      { title: "Órdenes de compra | Costea POS" },
      {
        name: "description",
        content:
          "Órdenes de compra a proveedores: estado pendiente, recibida o anulada, con recepción de mercadería y anulación interna con clave de administrador.",
      },
      { property: "og:title", content: "Órdenes de compra | Costea POS" },
      {
        property: "og:description",
        content: "Seguimiento de compras a proveedores con recepción y anulación controlada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdenesCompra,
});

type Row = {
  id: string;
  order_number: string | null;
  document_number: string;
  supplier_name: string;
  purchased_at: string;
  received_at: string | null;
  payment_method: string;
  tax_base: number;
  tax_amount: number;
  total: number;
  status: string;
  paid: boolean;
  void_reason: string | null;
  voided_by_email: string | null;
  voided_at: string | null;
};

const fmt = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

function OrdenesCompra() {
  const hoy = ecBusinessDate(new Date());
  const primero = `${hoy.slice(0, 8)}01`;
  const [desde, setDesde] = useState(primero);
  const [hasta, setHasta] = useState(hoy);
  const [buscar, setBuscar] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cargando, setCargando] = useState(false);
  const [anular, setAnular] = useState<Row | null>(null);
  const { company } = useCompany();


  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("purchases")
      .select(
        "id, order_number, document_number, supplier_name, purchased_at, received_at, payment_method, tax_base, tax_amount, total, status, paid, void_reason, voided_by_email, voided_at",
      )
      .gte("purchased_at", desde)
      .lte("purchased_at", hasta)
      .order("purchased_at", { ascending: false })
      .limit(500);
    setCargando(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Row[]);
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.order_number ?? ""} ${r.document_number} ${r.supplier_name}`.toLowerCase().includes(q),
    );
  }, [rows, buscar]);

  // Carga diferida: se pintan las filas visibles y el resto al hacer scroll.
  const {
    rendered: enPantalla,
    hasMore: hayMas,
    sentinelRef,
  } = useProgressiveList(visibles, 40);

  const totales = useMemo(() => {
    const vivas = visibles.filter((r) => r.status !== "anulada");
    return {
      cantidad: visibles.length,
      pendientes: vivas.filter((r) => r.status === "pendiente").length,
      anuladas: visibles.filter((r) => r.status === "anulada").length,
      monto: vivas.reduce((a, r) => a + Number(r.total || 0), 0),
    };
  }, [visibles]);

  const recibir = async (r: Row) => {
    const { error } = await supabase.rpc("receive_purchase", { _purchase_id: r.id });
    if (error) return toast.error(error.message);
    toast.success("Orden marcada como recibida");
    cargar();
  };

  const confirmarAnulacion = async (motivo: string) => {
    if (!anular) return;
    const { error } = await supabase.rpc("void_purchase", {
      _purchase_id: anular.id,
      _reason: motivo,
    });
    if (error) throw new Error(error.message);
    await cargar();
  };

  /** Reporte del período en hoja blanca A4 con encabezado, total y firmas. */
  const imprimir = () => {
    if (!visibles.length) return toast.error("No hay órdenes en el período seleccionado.");
    const estado = (r: Row) =>
      r.status === "anulada" ? "Anulada" : r.status === "recibida" ? "Recibida" : "Pendiente";
    const filas = visibles
      .map(
        (r) => `<tr>
          <td>${esc(r.order_number ?? "—")}</td>
          <td>${esc(fmt(r.purchased_at))}</td>
          <td>${esc(r.supplier_name)}</td>
          <td>${esc(`Comprobante ${r.document_number} · ${paymentLabel(r.payment_method)}`)}</td>
          <td class="r">${esc(currency(Number(r.total)))}</td>
          <td>${esc(estado(r))}</td>
        </tr>`,
      )
      .join("");

    printReportA4({
      titulo: "Reporte de órdenes de compra",
      negocio: company?.trade_name || company?.business_name || "Costea Pro",
      periodo: `${fmt(desde)} al ${fmt(hasta)}`,
      fontSize: "10px",
      cuerpo: `<table>
        <thead><tr>
          <th>Número</th><th>Fecha</th><th>Proveedor</th><th>Descripción</th>
          <th class="r">Monto $</th><th>Estado</th>
        </tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr>
          <td colspan="4">Total general (${totales.cantidad} órdenes, sin anuladas)</td>
          <td class="r">${esc(currency(totales.monto))}</td><td></td>
        </tr></tfoot>
      </table>`,
      firmas: ["Elaborado por", "Revisado por", "Administrador"],
    });
  };


  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Órdenes de compra</h1>
        <p className="text-sm text-muted-foreground">
          Compras a proveedores con estado, recepción de mercadería y anulación interna registrada.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <Tarjeta label="Órdenes" valor={String(totales.cantidad)} />
        <Tarjeta label="Pendientes" valor={String(totales.pendientes)} />
        <Tarjeta label="Anuladas" valor={String(totales.anuladas)} />
        <Tarjeta label="Total comprado" valor={currency(totales.monto)} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div>
          <Label>Desde</Label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <Label>Hasta</Label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="min-w-[220px] flex-1">
          <Label>Buscar orden, comprobante o proveedor</Label>
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
        <Button onClick={cargar} disabled={cargando}>
          <FileSpreadsheet className="mr-1 size-4" /> Generar reporte
        </Button>
        <Button variant="outline" onClick={imprimir} disabled={cargando}>
          <Printer className="mr-1 size-4" /> Imprimir
        </Button>
        <Button variant="outline" onClick={cargar} disabled={cargando}>
          <RefreshCw className={`mr-1 size-4 ${cargando ? "animate-spin" : ""}`} /> Actualizar
        </Button>

      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card p-3">
        <table className="tabular w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Fecha</th>
              <th>Orden</th>
              <th>Comprobante</th>
              <th>Proveedor</th>
              <th>Forma de pago</th>
              <th className="text-right">Base $</th>
              <th className="text-right">IVA $</th>
              <th className="text-right">Total $</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {enPantalla.map((r) => {
              const anulada = r.status === "anulada";
              return (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-2 whitespace-nowrap">{fmt(r.purchased_at)}</td>
                  <td className="whitespace-nowrap font-medium">{r.order_number ?? "—"}</td>
                  <td>{r.document_number}</td>
                  <td>{r.supplier_name}</td>
                  <td>{paymentLabel(r.payment_method)}</td>
                  <td className="text-right">{currency(Number(r.tax_base))}</td>
                  <td className="text-right">{currency(Number(r.tax_amount))}</td>
                  <td className="text-right font-semibold">{currency(Number(r.total))}</td>
                  <td>
                    {anulada ? (
                      <div className="text-xs text-destructive">
                        <p className="font-semibold">Anulada</p>
                        <p>{r.void_reason}</p>
                        <p>
                          {r.voided_by_email} · {r.voided_at ? fmt(r.voided_at) : ""}
                        </p>
                      </div>
                    ) : r.status === "recibida" ? (
                      <span className="text-emerald-600">Recibida {fmt(r.received_at)}</span>
                    ) : (
                      "Pendiente"
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.status === "pendiente" && (
                        <Button size="sm" variant="outline" onClick={() => recibir(r)}>
                          <PackageCheck className="mr-1 size-4" /> Recibir
                        </Button>
                      )}
                      {!anulada && (
                        <Button size="sm" variant="destructive" onClick={() => setAnular(r)}>
                          <Ban className="mr-1 size-4" /> Anular
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-muted-foreground">
                  No hay órdenes de compra en el rango seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {hayMas && (
          <p ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
            Cargando más órdenes…
          </p>
        )}
      </div>

      <VoidDialog
        open={Boolean(anular)}
        title="Anular orden de compra"
        subject={`Orden ${anular?.order_number ?? anular?.document_number ?? ""}`}
        onOpenChange={(v) => !v && setAnular(null)}
        onConfirm={confirmarAnulacion}
      />
    </div>
  );
}

function Tarjeta({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular font-display text-xl font-semibold">{valor}</p>
    </div>
  );
}
