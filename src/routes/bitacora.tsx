import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlarmClock, Download, Save } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRole } from "@/hooks/useRole";
import { currency } from "@/lib/pos";
import { ecBusinessDate } from "@/lib/caja";
import { serviceLabel, type DelayLog } from "@/lib/delays";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";
import { useProgressiveList } from "@/hooks/useProgressiveList";

export const Route = createFileRoute("/bitacora")({
  head: () => ({
    meta: [
      { title: "Bitácora de demoras | Costea POS" },
      {
        name: "description",
        content:
          "Historial de pedidos que superaron el tiempo límite de preparación, con mesa, productos, tiempos y observaciones.",
      },
      { property: "og:title", content: "Bitácora de demoras | Costea POS" },
      {
        property: "og:description",
        content: "Historial de demoras con filtros por fecha, mesa y área de preparación.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <DelayLogScreen />
    </AppShell>
  ),
});

/** Fecha (AAAA-MM-DD) y límites del rango fijados a UTC-5 Ecuador. */
const iso = (d: Date) => ecBusinessDate(d);
const fmt = (value: string) =>
  new Date(value).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function DelayLogScreen() {
  const { isAdmin } = useRole();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [mesa, setMesa] = useState("");
  const [area, setArea] = useState("");
  const [rows, setRows] = useState<DelayLog[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("delay_logs")
      .select("*")
      .gte("delivered_at", desdeEc(from))
      .lte("delivered_at", hastaEc(to))
      .order("delivered_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as DelayLog[]) ?? []);
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mesa.trim() ||
            r.table_name.toLowerCase().includes(mesa.trim().toLowerCase()) ||
            String(r.folio).includes(mesa.trim())) &&
          (!area.trim() || r.area.toLowerCase().includes(area.trim().toLowerCase())),
      ),
    [rows, mesa, area],
  );

  const promedio = filtered.length
    ? Math.round(filtered.reduce((s, r) => s + r.over_minutes, 0) / filtered.length)
    : 0;

  const saveNote = async (row: DelayLog) => {
    const value = notes[row.id] ?? row.notes ?? "";
    const { error } = await supabase.from("delay_logs").update({ notes: value }).eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Observación guardada");
      load();
    }
  };

  const exportar = () => {
    const data = filtered.map((r) => ({
      Fecha: fmt(r.started_at),
      Entrega: fmt(r.delivered_at),
      Pedido: r.folio,
      Mesa: r.table_name || serviceLabel(r.service_type),
      Personas: r.guests,
      Área: r.area,
      Productos: r.items_summary,
      "Límite (min)": r.limit_minutes,
      "Real (min)": r.actual_minutes,
      "Exceso (min)": r.over_minutes,
      Total: Number(r.total),
      Observaciones: r.notes ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Demoras");
    XLSX.writeFile(wb, `bitacora-demoras-${from}-a-${to}.xlsx`);
  };

  // Renderizado progresivo: las metricas y la exportacion usan todos los registros.
  const { rendered: visibles, hasMore: hayMas, sentinelRef } = useProgressiveList(filtered, 20);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Bitácora de demoras</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos entregados fuera del tiempo límite configurado.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link to="/reportes">Volver a reportes</Link>
          </Button>
          <Button onClick={exportar} disabled={!filtered.length}>
            <Download className="size-4" /> Exportar Excel
          </Button>
        </div>
      </div>

      <div className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hasta">Hasta</Label>
          <Input id="hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mesa">Mesa o pedido</Label>
          <Input
            id="mesa"
            placeholder="Ej. Mesa 4"
            value={mesa}
            onChange={(e) => setMesa(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="area">Área</Label>
          <Input
            id="area"
            placeholder="Cocina, parrilla…"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Demoras</p>
          <p className="tabular font-display text-2xl font-bold">{filtered.length}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Exceso promedio</p>
          <p className="tabular font-display text-2xl font-bold">{promedio} min</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Peor caso</p>
          <p className="tabular font-display text-2xl font-bold">
            {filtered.length ? Math.max(...filtered.map((r) => r.over_minutes)) : 0} min
          </p>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!loading && filtered.length === 0 && (
        <p className="panel p-10 text-center text-sm text-muted-foreground">
          Sin demoras registradas en el período seleccionado.
        </p>
      )}

      <div className="space-y-3">
        {visibles.map((r) => (
          <article key={r.id} className="panel space-y-2 p-4">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold">
                  {r.table_name || serviceLabel(r.service_type)} · Pedido #{r.folio}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Inicio {fmt(r.started_at)} · Entrega {fmt(r.delivered_at)} ·{" "}
                  {r.guests > 0 ? `${r.guests} personas` : serviceLabel(r.service_type)} · Área{" "}
                  {r.area}
                </p>
              </div>
              <span className="tabular flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground">
                <AlarmClock className="size-3.5" /> {r.actual_minutes}/{r.limit_minutes} min (+
                {r.over_minutes})
              </span>
            </header>
            <p className="text-sm">{r.items_summary || "Sin detalle"}</p>
            <p className="tabular text-sm text-muted-foreground">{currency(Number(r.total))}</p>
            {isAdmin ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1 space-y-1">
                  <Label htmlFor={`obs-${r.id}`}>Observaciones</Label>
                  <Input
                    id={`obs-${r.id}`}
                    placeholder="Motivo de la demora, acción tomada…"
                    value={notes[r.id] ?? r.notes ?? ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                  />
                </div>
                <Button variant="secondary" onClick={() => saveNote(r)}>
                  <Save className="size-4" /> Guardar
                </Button>
              </div>
            ) : (
              r.notes && <p className="text-sm text-muted-foreground">Obs.: {r.notes}</p>
            )}
          </article>
        ))}
        {hayMas && (
          <p ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
            Cargando más registros…
          </p>
        )}
      </div>
    </div>
  );
}
