import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, Loader2, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import {
  crearEmpresa,
  listarEmpresas,
  type EmpresaResumen,
} from "@/lib/plataforma.functions";
import {
  ESTADOS,
  MODULOS,
  MODULOS_POR_PLAN,
  PLANES,
  REGIONES,
  type EstadoEmpresa,
  type PlanPlataforma,
} from "@/lib/plataforma";

export const Route = createFileRoute("/admin/plataforma/")({
  head: () => ({
    meta: [
      { title: "Plataforma | Costea Pro SAAS" },
      {
        name: "description",
        content:
          "Panel de SúperAdmin: clientes de la plataforma, planes, módulos contratados y sucursales.",
      },
      { property: "og:title", content: "Plataforma | Costea Pro SAAS" },
      {
        property: "og:description",
        content: "Administración de clientes, planes y módulos de Costea Pro SAAS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlataformaPage,
});

const ESTADO_CLASE: Record<EstadoEmpresa, string> = {
  activa: "bg-emerald-100 text-emerald-800",
  prueba: "bg-amber-100 text-amber-800",
  suspendida: "bg-rose-100 text-rose-800",
};

function PlataformaPage() {
  const { esAdminPlataforma, loading: cargandoPermiso } = usePlatformAdmin();
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState<EmpresaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroPlan, setFiltroPlan] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroRegion, setFiltroRegion] = useState("");
  const [abierto, setAbierto] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      setEmpresas(await listarEmpresas());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar los clientes");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (esAdminPlataforma) void cargar();
  }, [esAdminPlataforma]);

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return empresas.filter(
      (e) =>
        (!t || e.trade_name.toLowerCase().includes(t) || e.ruc.includes(t)) &&
        (!filtroPlan || e.plan === filtroPlan) &&
        (!filtroEstado || e.status === filtroEstado) &&
        (!filtroRegion || e.region === filtroRegion),
    );
  }, [empresas, busqueda, filtroPlan, filtroEstado, filtroRegion]);

  const kpi = {
    activas: empresas.filter((e) => e.status === "activa").length,
    prueba: empresas.filter((e) => e.status === "prueba").length,
    suspendidas: empresas.filter((e) => e.status === "suspendida").length,
    sucursales: empresas.reduce((s, e) => s + e.sucursales, 0),
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
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Clientes de la plataforma</h1>
          <p className="text-sm text-muted-foreground">
            Alta de nuevos clientes, planes contratados y módulos habilitados.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cargar} disabled={cargando}>
            <RefreshCw className={cargando ? "size-4 animate-spin" : "size-4"} /> Actualizar
          </Button>
          <Button onClick={() => setAbierto(true)}>
            <Plus className="size-4" /> Nuevo cliente
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Clientes activos", valor: kpi.activas },
          { label: "En prueba", valor: kpi.prueba },
          { label: "Suspendidos", valor: kpi.suspendidas },
          { label: "Sucursales totales", valor: kpi.sucursales },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{c.valor}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Buscar por nombre o RUC"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={filtroRegion}
          onChange={(e) => setFiltroRegion(e.target.value)}
        >
          <option value="">Todas las regiones</option>
          {REGIONES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={filtroPlan}
          onChange={(e) => setFiltroPlan(e.target.value)}
        >
          <option value="">Todos los planes</option>
          {PLANES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">RUC</th>
              <th className="px-4 py-3">Región</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Sucursales</th>
              <th className="px-4 py-3 text-right">Usuarios</th>
              <th className="px-4 py-3">Alta</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Cargando clientes…
                </td>
              </tr>
            )}
            {!cargando && filtradas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No hay clientes con esos filtros.
                </td>
              </tr>
            )}
            {filtradas.map((e) => (
              <tr key={e.id} className="border-t hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link
                    to="/admin/plataforma/$empresaId"
                    params={{ empresaId: e.id }}
                    className="flex items-center gap-2 font-medium text-primary hover:underline"
                  >
                    <Building2 className="size-4" />
                    {e.trade_name}
                  </Link>
                </td>
                <td className="px-4 py-3">{e.ruc}</td>
                <td className="px-4 py-3">{e.region}</td>
                <td className="px-4 py-3 capitalize">{e.plan}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_CLASE[e.status]}`}>
                    {ESTADOS.find((s) => s.value === e.status)?.label ?? e.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{e.sucursales}</td>
                <td className="px-4 py-3 text-right">{e.usuarios}</td>
                <td className="px-4 py-3">
                  {new Date(e.created_at).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <DialogoAlta
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        onCreado={(id) => {
          setAbierto(false);
          void cargar();
          navigate({ to: "/admin/plataforma/$empresaId", params: { empresaId: id } });
        }}
      />
    </div>
  );
}

function DialogoAlta({
  abierto,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (id: string) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [plan, setPlan] = useState<PlanPlataforma>("pro");
  const [modulos, setModulos] = useState<string[]>(MODULOS_POR_PLAN.pro);
  const [form, setForm] = useState({
    tradeName: "",
    legalName: "",
    ruc: "",
    region: "Quito",
    status: "prueba" as EstadoEmpresa,
    contactEmail: "",
    contactPhone: "",
    branchName: "Matriz",
    branchAddress: "",
    establishment: "001",
    emissionPoint: "001",
    ownerUsername: "",
    ownerPassword: "",
    ownerEmail: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const cambiarPlan = (p: PlanPlataforma) => {
    setPlan(p);
    setModulos(MODULOS_POR_PLAN[p]);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await crearEmpresa({ data: { ...form, plan, modules: modulos } });
      toast.success("Cliente creado y listo para operar");
      onCreado(r.companyId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el cliente");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo cliente de la plataforma</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide">Empresa</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Nombre comercial">
                <Input value={form.tradeName} onChange={(e) => set("tradeName", e.target.value)} />
              </Campo>
              <Campo label="Razón social">
                <Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} />
              </Campo>
              <Campo label="RUC">
                <Input value={form.ruc} onChange={(e) => set("ruc", e.target.value)} inputMode="numeric" />
              </Campo>
              <Campo label="Región">
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.region}
                  onChange={(e) => set("region", e.target.value)}
                >
                  {REGIONES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Plan">
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={plan}
                  onChange={(e) => cambiarPlan(e.target.value as PlanPlataforma)}
                >
                  {PLANES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Estado inicial">
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  {ESTADOS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Correo de contacto">
                <Input value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
              </Campo>
              <Campo label="Teléfono">
                <Input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
              </Campo>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide">Sucursal principal</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Nombre">
                <Input value={form.branchName} onChange={(e) => set("branchName", e.target.value)} />
              </Campo>
              <Campo label="Dirección">
                <Input value={form.branchAddress} onChange={(e) => set("branchAddress", e.target.value)} />
              </Campo>
              <Campo label="Establecimiento SRI">
                <Input value={form.establishment} onChange={(e) => set("establishment", e.target.value)} />
              </Campo>
              <Campo label="Punto de emisión SRI">
                <Input value={form.emissionPoint} onChange={(e) => set("emissionPoint", e.target.value)} />
              </Campo>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide">Propietario</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Usuario">
                <Input value={form.ownerUsername} onChange={(e) => set("ownerUsername", e.target.value)} />
              </Campo>
              <Campo label="Contraseña inicial">
                <Input
                  type="password"
                  value={form.ownerPassword}
                  onChange={(e) => set("ownerPassword", e.target.value)}
                />
              </Campo>
              <Campo label="Correo">
                <Input value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} />
              </Campo>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide">Módulos contratados</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MODULOS.map((m) => (
                <label key={m.key} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={modulos.includes(m.key)}
                    onChange={(e) =>
                      setModulos((prev) =>
                        e.target.checked ? [...prev, m.key] : prev.filter((k) => k !== m.key),
                      )
                    }
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="size-4 animate-spin" />} Crear cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
