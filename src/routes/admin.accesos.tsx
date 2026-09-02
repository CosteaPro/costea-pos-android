import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LogOut, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRole } from "@/hooks/useRole";
import { ecBusinessDate } from "@/lib/caja";
import { ROLE_LABEL, type AppRole } from "@/hooks/useRole";
import type { AccessRow } from "@/lib/access-log.functions";
import { useProgressiveList } from "@/hooks/useProgressiveList";

export const Route = createFileRoute("/admin/accesos")({
  head: () => ({
    meta: [
      { title: "Registro de accesos | Módulo administrativo" },
      {
        name: "description",
        content:
          "Auditoría de inicios de sesión en Costea POS: usuario, rol, equipo, ubicación y cierre de sesión remoto.",
      },
      { property: "og:title", content: "Registro de accesos | Módulo administrativo" },
      {
        property: "og:description",
        content: "Historial de accesos con detección de equipos nuevos y sesiones simultáneas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccessLogPage,
});

const iso = (d: Date) => ecBusinessDate(d);
const fmt = (v: string) =>
  new Date(v).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function AccessLogPage() {
  const { isSuperAdmin, loading: loadingRole } = useRole();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [busqueda, setBusqueda] = useState("");
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const { listAccessLog } = await import("@/lib/access-log.functions");
      setRows(await listAccessLog({ data: { from, to } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el registro");
    }
    setLoading(false);
  }, [from, to, isSuperAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.user_email, r.role, r.device_label, r.city, r.country, r.ip]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, busqueda]);

  // Carga diferida: se pintan las filas visibles y el resto al hacer scroll.
  const { rendered: visibles, hasMore: hayMas, sentinelRef } = useProgressiveList(filtered, 40);

  const cerrarRemoto = async (row: AccessRow) => {
    if (!confirm(`¿Cerrar la sesión de ${row.user_email} en ${row.device_label}?`)) return;
    try {
      const { revokeAccessSession } = await import("@/lib/access-log.functions");
      await revokeAccessSession({ data: { sessionId: row.id } });
      toast.success("Sesión cerrada. El equipo saldrá en menos de un minuto.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar la sesión");
    }
  };

  if (loadingRole) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <ShieldCheck className="size-8 text-muted-foreground" />
        <h1 className="font-display text-xl font-semibold">Acceso restringido</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          El registro de accesos es exclusivo del Super Administrador / Propietario.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Registro de accesos</h1>
          <p className="text-sm text-muted-foreground">
            Quién entró, desde qué equipo y desde dónde. Puedes cerrar cualquier sesión a distancia.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className="size-4" /> Actualizar
        </Button>
      </header>

      <div className="rounded-lg border bg-card p-4 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hasta">Hasta</Label>
          <Input id="hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="buscar">Buscar</Label>
          <Input
            id="buscar"
            placeholder="Usuario, equipo, ciudad…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando accesos…</p>}
      {!loading && filtered.length === 0 && (
        <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Sin accesos registrados en el período seleccionado.
        </p>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha y hora</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Equipo</th>
                <th className="px-3 py-2">Ubicación</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmt(r.created_at)}</td>
                  <td className="px-3 py-2 font-medium">{r.user_email || "—"}</td>
                  <td className="px-3 py-2">{ROLE_LABEL[r.role as AppRole] ?? r.role}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{r.device_label || "Equipo"}</span>
                      {r.is_new_device && (
                        <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
                          NUEVO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{r.ip ?? "IP no disponible"}</p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>
                        {[r.city, r.country].filter(Boolean).join(", ") || "Desconocida"}
                      </span>
                      {r.is_new_location && (
                        <ShieldAlert className="size-4 text-destructive" aria-label="Ubicación distinta" />
                      )}
                    </div>
                    {r.concurrent && (
                      <p className="text-xs text-destructive">Sesión simultánea</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.status === "activa" ? "Activa" : "Cerrada por administrador"}
                    <p className="text-xs text-muted-foreground">
                      Última actividad {fmt(r.last_seen_at)}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "activa" && (
                      <Button size="sm" variant="destructive" onClick={() => cerrarRemoto(r)}>
                        <LogOut className="size-4" /> Cerrar sesión
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hayMas && (
            <p ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
              Cargando más registros…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
