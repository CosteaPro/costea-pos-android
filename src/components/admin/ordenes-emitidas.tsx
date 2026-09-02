import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoidDialog } from "@/components/admin/void-dialog";
import { currency } from "@/lib/pos";
import { ecBusinessDate } from "@/lib/caja";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import { useProgressiveList } from "@/hooks/useProgressiveList";

/** Órdenes de venta (notas de venta) recibidas desde las cajas. */
type Row = {
  id: string;
  doc_number: string | null;
  order_label: string | null;
  folio: number;
  created_at: string;
  customer_name: string | null;
  customer_id_number: string | null;
  total: number;
  payment_method: string | null;
  sales_channel: string;
  origin: string;
  doc_status: string;
  void_reason: string | null;
  voided_by_email: string | null;
  voided_at: string | null;
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil", hour12: false });

const PAGOS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  credito: "Crédito",
};

export function OrdenesEmitidas() {
  const hoy = ecBusinessDate(new Date());
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [buscar, setBuscar] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cargando, setCargando] = useState(false);
  const [anular, setAnular] = useState<Row | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, doc_number, order_label, folio, created_at, customer_name, customer_id_number, total, payment_method, sales_channel, origin, doc_status, void_reason, voided_by_email, voided_at",
      )
      .eq("doc_type", "nota_venta")
      .gte("created_at", desdeEc(desde))
      .lte("created_at", hastaEc(hasta))
      .order("created_at", { ascending: false })
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
      `${r.doc_number ?? ""} ${r.order_label ?? ""} ${r.folio} ${r.customer_name ?? ""} ${r.customer_id_number ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, buscar]);

  // Renderizado progresivo: los totales usan todas las filas, la tabla pinta por bloques.
  const { rendered: filas, hasMore: hayMas, sentinelRef } = useProgressiveList(visibles, 40);

  const totales = useMemo(() => {
    const vivas = visibles.filter((r) => r.doc_status !== "anulado");
    return {
      cantidad: visibles.length,
      anuladas: visibles.filter((r) => r.doc_status === "anulado").length,
      monto: vivas.reduce((a, r) => a + Number(r.total || 0), 0),
    };
  }, [visibles]);

  const confirmarAnulacion = async (motivo: string) => {
    if (!anular) return;
    const { error } = await supabase.rpc("void_order", { _order_id: anular.id, _reason: motivo });
    if (error) throw new Error(error.message);
    await cargar();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta label="Órdenes" valor={String(totales.cantidad)} />
        <Tarjeta label="Anuladas" valor={String(totales.anuladas)} />
        <Tarjeta label="Total vendido" valor={currency(totales.monto)} />
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
          <Label>Buscar número de orden o cliente</Label>
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
        <Button variant="outline" onClick={cargar} disabled={cargando}>
          <RefreshCw className={`mr-1 size-4 ${cargando ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card p-3">
        <table className="tabular w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Emisión</th>
              <th>Orden</th>
              <th>Cliente</th>
              <th>Canal</th>
              <th>Forma de pago</th>
              <th className="text-right">Total $</th>
              <th>Documento</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => {
              const anulada = r.doc_status === "anulado";
              return (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-2 whitespace-nowrap">{fecha(r.created_at)}</td>
                  <td className="whitespace-nowrap font-medium">
                    {r.doc_number ?? r.order_label ?? `#${r.folio}`}
                  </td>
                  <td>{r.customer_name ?? "Consumidor final"}</td>
                  <td className="capitalize">{r.sales_channel}</td>
                  <td>{PAGOS[r.payment_method ?? ""] ?? r.payment_method ?? "—"}</td>
                  <td className="text-right font-semibold">{currency(Number(r.total))}</td>
                  <td>
                    {anulada ? (
                      <div className="text-xs text-destructive">
                        <p className="font-semibold">Anulada</p>
                        <p>{r.void_reason}</p>
                        <p>
                          {r.voided_by_email} · {r.voided_at ? fecha(r.voided_at) : ""}
                        </p>
                      </div>
                    ) : (
                      "Vigente"
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {!anulada && (
                      <Button size="sm" variant="destructive" onClick={() => setAnular(r)}>
                        <Ban className="mr-1 size-4" /> Anular
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {hayMas && (
              <tr>
                <td colSpan={8} className="py-3 text-center text-xs text-muted-foreground">
                  <div ref={sentinelRef}>Cargando más órdenes…</div>
                </td>
              </tr>
            )}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  No hay órdenes emitidas en el rango seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <VoidDialog
        open={Boolean(anular)}
        title="Anular orden"
        subject={`Orden ${anular?.doc_number ?? anular?.order_label ?? ""}`}
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
