import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import {
  bitacoraPlataforma,
  listarEmpresas,
  type EmpresaResumen,
  type MovimientoBitacora,
} from "@/lib/plataforma.functions";
import { fechaEc } from "@/lib/fecha-ec";

export const Route = createFileRoute("/admin/plataforma/bitacora")({
  head: () => ({
    meta: [
      { title: "Bitácora de plataforma | Costea Pro SAAS" },
      {
        name: "description",
        content: "Auditoría global de la plataforma: quién hizo qué, en qué empresa y cuándo.",
      },
      { property: "og:title", content: "Bitácora de plataforma | Costea Pro SAAS" },
      {
        property: "og:description",
        content: "Consulta y exportación de la auditoría de todos los clientes de Costea Pro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BitacoraPage,
});

function BitacoraPage() {
  const { esAdminPlataforma, loading: cargandoPermiso } = usePlatformAdmin();
  const navigate = useNavigate();
  const hoy = fechaEc();
  const [empresas, setEmpresas] = useState<EmpresaResumen[]>([]);
  const [filas, setFilas] = useState<MovimientoBitacora[]>([]);
  const [cargando, setCargando] = useState(false);
  const [filtros, setFiltros] = useState({ companyId: "", desde: hoy, hasta: hoy, texto: "" });

  const cargar = async () => {
    setCargando(true);
    try {
      setFilas(await bitacoraPlataforma({ data: filtros }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar la bitácora");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!esAdminPlataforma) return;
    listarEmpresas().then(setEmpresas).catch(() => setEmpresas([]));
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdminPlataforma]);

  const exportar = () => {
    const nombre = new Map(empresas.map((e) => [e.id, e.trade_name]));
    const datos = filas.map((f) => ({
      Fecha: new Date(f.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" }),
      Empresa: f.company_id ? (nombre.get(f.company_id) ?? f.company_id) : "—",
      Usuario: f.user_email ?? "—",
      Acción: f.action,
      Registro: f.entity,
      Identificador: f.entity_id ?? "",
    }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(datos), "Bitacora");
    XLSX.writeFile(libro, `bitacora-plataforma-${filtros.desde}-${filtros.hasta}.xlsx`);
  };

  if (cargandoPermiso) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Verificando permisos…
      </div>
    );
  }

  if (!esAdminPlataforma) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="size-8 text-muted-foreground" />
        <h1 className="font-display text-xl font-semibold">Acceso denegado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Esta sección es exclusiva de los administradores de la plataforma Costea Pro.
        </p>
        <Button onClick={() => navigate({ to: "/admin/dashboard" })}>Volver al panel general</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/plataforma">
            <Button variant="outline" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Bitácora de plataforma</h1>
            <p className="text-sm text-muted-foreground">
              Registro inalterable de las acciones sensibles de todos los clientes.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cargar} disabled={cargando}>
            <RefreshCw className={cargando ? "size-4 animate-spin" : "size-4"} /> Consultar
          </Button>
          <Button onClick={exportar} disabled={filas.length === 0}>
            <Download className="size-4" /> Exportar a Excel
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Empresa</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={filtros.companyId}
            onChange={(e) => setFiltros({ ...filtros, companyId: e.target.value })}
          >
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.trade_name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input
            type="date"
            value={filtros.desde}
            onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input
            type="date"
            value={filtros.hasta}
            onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Acción contiene</Label>
          <Input
            value={filtros.texto}
            onChange={(e) => setFiltros({ ...filtros, texto: e.target.value })}
            placeholder="crear_empresa, anular…"
          />
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Registro</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="px-4 py-3">
                  {new Date(f.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
                </td>
                <td className="px-4 py-3">
                  {empresas.find((e) => e.id === f.company_id)?.trade_name ?? "—"}
                </td>
                <td className="px-4 py-3">{f.user_email ?? "—"}</td>
                <td className="px-4 py-3">{f.action}</td>
                <td className="px-4 py-3">{f.entity}</td>
              </tr>
            ))}
            {filas.length === 0 && !cargando && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Sin movimientos en el período seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
