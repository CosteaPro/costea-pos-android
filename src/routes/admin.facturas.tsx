import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, FileText, FileCode2, Mail, RefreshCw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoidDialog } from "@/components/admin/void-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrdenesEmitidas } from "@/components/admin/ordenes-emitidas";
import { emitirFacturaSri, reenviarFacturaCorreo, sincronizarEstadoSri } from "@/lib/sri.functions";
import { currency } from "@/lib/pos";
import { ecBusinessDate } from "@/lib/caja";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import { useProgressiveList } from "@/hooks/useProgressiveList";

export const Route = createFileRoute("/admin/facturas")({
  head: () => ({
    meta: [
      { title: "Facturas emitidas | Costea POS" },
      {
        name: "description",
        content:
          "Listado de facturas electrónicas emitidas: estado en el SRI, reenvío, descarga de RIDE y XML, y anulación interna con clave de administrador.",
      },
      { property: "og:title", content: "Facturas emitidas | Costea POS" },
      {
        property: "og:description",
        content: "Control de facturas electrónicas con reenvío al SRI, descargas y anulación interna.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FacturasEmitidas,
});

type Row = {
  id: string;
  doc_number: string | null;
  created_at: string;
  customer_name: string | null;
  customer_id_number: string | null;
  customer_email: string | null;
  total: number;
  sri_status: string;
  sri_message: string | null;
  doc_status: string;
  access_key: string | null;
  authorization_number: string | null;
  void_reason: string | null;
  voided_by_email: string | null;
  voided_at: string | null;
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil", hour12: false });

const ESTADOS: Record<string, string> = {
  pendiente: "Pendiente",
  enviado: "Enviado",
  autorizado: "Autorizado",
  rechazado: "Rechazado",
};

function FacturasEmitidas() {
  const emitir = useServerFn(emitirFacturaSri);
  const sincronizar = useServerFn(sincronizarEstadoSri);
  const reenviarCorreo = useServerFn(reenviarFacturaCorreo);

  const hoy = ecBusinessDate(new Date());
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [buscar, setBuscar] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [anular, setAnular] = useState<Row | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, doc_number, created_at, customer_name, customer_id_number, customer_email, total, sri_status, sri_message, doc_status, access_key, authorization_number, void_reason, voided_by_email, voided_at",
      )
      .eq("doc_type", "factura")
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
      `${r.doc_number ?? ""} ${r.customer_name ?? ""} ${r.customer_id_number ?? ""} ${r.access_key ?? ""}`
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
      autorizadas: vivas.filter((r) => r.sri_status === "autorizado").length,
      monto: vivas.reduce((a, r) => a + Number(r.total || 0), 0),
      anuladas: visibles.filter((r) => r.doc_status === "anulado").length,
    };
  }, [visibles]);

  const conAccion = async (id: string, fn: () => Promise<string>) => {
    setTrabajando(id);
    try {
      toast.success(await fn());
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setTrabajando(null);
    }
  };

  const reintentarSri = (r: Row) =>
    conAccion(r.id, async () => {
      const res = await emitir({ data: { orderId: r.id, issuedAtDevice: new Date().toISOString() } });
      return res.message;
    });

  const consultarSri = (r: Row) =>
    conAccion(r.id, async () => {
      const res = await sincronizar({ data: { orderIds: [r.id] } });
      return `Autorizados ${res.autorizados} · Rechazados ${res.rechazados} · Pendientes ${res.pendientes}`;
    });

  const enviarCorreo = (r: Row) =>
    conAccion(r.id, async () => {
      await reenviarCorreo({ data: { orderId: r.id } });
      return "Comprobante reenviado al correo del cliente";
    });

  const confirmarAnulacion = async (motivo: string) => {
    if (!anular) return;
    const { error } = await supabase.rpc("void_order", { _order_id: anular.id, _reason: motivo });
    if (error) throw new Error(error.message);
    await cargar();
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Comprobantes emitidos</h1>
        <p className="text-sm text-muted-foreground">
          Facturas electrónicas y órdenes de venta que llegan desde las cajas, en listas separadas.
        </p>
      </header>

      <Tabs defaultValue="facturas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="facturas">Facturas emitidas</TabsTrigger>
          <TabsTrigger value="ordenes">Órdenes emitidas</TabsTrigger>
        </TabsList>

        <TabsContent value="ordenes">
          <OrdenesEmitidas />
        </TabsContent>

        <TabsContent value="facturas" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Tarjeta label="Facturas" valor={String(totales.cantidad)} />
        <Tarjeta label="Autorizadas" valor={String(totales.autorizadas)} />
        <Tarjeta label="Anuladas" valor={String(totales.anuladas)} />
        <Tarjeta label="Total facturado" valor={currency(totales.monto)} />
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
          <Label>Buscar número, cliente o clave de acceso</Label>
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
              <th>Factura</th>
              <th>Cliente</th>
              <th>Cédula / RUC</th>
              <th className="text-right">Total $</th>
              <th>Estado SRI</th>
              <th>Documento</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => {
              const anulada = r.doc_status === "anulado";
              const autorizada = r.sri_status === "autorizado";
              const ocupado = trabajando === r.id;
              return (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-2 whitespace-nowrap">{fecha(r.created_at)}</td>
                  <td className="whitespace-nowrap font-medium">{r.doc_number ?? "—"}</td>
                  <td>{r.customer_name ?? "Consumidor final"}</td>
                  <td>{r.customer_id_number ?? "9999999999999"}</td>
                  <td className="text-right font-semibold">{currency(Number(r.total))}</td>
                  <td>
                    <span className={autorizada ? "text-emerald-600" : "text-muted-foreground"}>
                      {ESTADOS[r.sri_status] ?? r.sri_status}
                    </span>
                    {r.sri_message && (
                      <p className="max-w-[240px] text-xs text-muted-foreground">{r.sri_message}</p>
                    )}
                  </td>
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
                    <div className="flex flex-wrap justify-end gap-1">
                      {!autorizada && !anulada && (
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => reintentarSri(r)}>
                          <Send className="mr-1 size-4" /> Reenviar SRI
                        </Button>
                      )}
                      {r.access_key && (
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => consultarSri(r)}>
                          <RefreshCw className="mr-1 size-4" /> Consultar
                        </Button>
                      )}
                      {autorizada && r.access_key && (
                        <>
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={`/api/public/comprobante/${r.access_key}?formato=ride`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileText className="mr-1 size-4" /> PDF
                            </a>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={`/api/public/comprobante/${r.access_key}?formato=xml`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileCode2 className="mr-1 size-4" /> XML
                            </a>
                          </Button>
                          {r.customer_email && (
                            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => enviarCorreo(r)}>
                              <Mail className="mr-1 size-4" /> Correo
                            </Button>
                          )}
                        </>
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
            {hayMas && (
              <tr>
                <td colSpan={8} className="py-3 text-center text-xs text-muted-foreground">
                  <div ref={sentinelRef}>Cargando más facturas…</div>
                </td>
              </tr>
            )}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground">
                  No hay facturas emitidas en el rango seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
        </TabsContent>
      </Tabs>

      <VoidDialog
        open={Boolean(anular)}
        title="Anular factura"
        subject={`Factura ${anular?.doc_number ?? ""}`}
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
