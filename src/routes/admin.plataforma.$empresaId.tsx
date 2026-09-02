import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import {
  actualizarEmpresa,
  crearUsuarioEmpresa,
  detalleEmpresa,
  guardarModulos,
  guardarSucursal,
  restablecerClaveUsuario,
  type MovimientoBitacora,
  type SucursalPlataforma,
  type UsuarioEmpresa,
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

export const Route = createFileRoute("/admin/plataforma/$empresaId")({
  head: () => ({
    meta: [
      { title: "Ficha del cliente | Costea Pro SAAS" },
      {
        name: "description",
        content: "Datos generales, sucursales, módulos, usuarios y actividad de un cliente de la plataforma.",
      },
      { property: "og:title", content: "Ficha del cliente | Costea Pro SAAS" },
      {
        property: "og:description",
        content: "Gestión de plan, módulos, sucursales y usuarios de un cliente de Costea Pro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FichaEmpresa,
});

const ROLES = [
  { value: "administrador", label: "Propietario / Administrador" },
  { value: "admin_operativo", label: "Administrador operativo" },
  { value: "cajero", label: "Cajero" },
  { value: "mesero", label: "Mesero" },
  { value: "cocina", label: "Cocina" },
];

function FichaEmpresa() {
  const { empresaId } = Route.useParams();
  const { esAdminPlataforma, loading: cargandoPermiso } = usePlatformAdmin();
  const navigate = useNavigate();

  const [cargando, setCargando] = useState(true);
  const [empresa, setEmpresa] = useState<any>(null);
  const [sucursales, setSucursales] = useState<SucursalPlataforma[]>([]);
  const [modulos, setModulos] = useState<Record<string, boolean>>({});
  const [usuarios, setUsuarios] = useState<UsuarioEmpresa[]>([]);
  const [actividad, setActividad] = useState<MovimientoBitacora[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [sucursalEdit, setSucursalEdit] = useState<Partial<SucursalPlataforma> | null>(null);
  const [nuevoUsuario, setNuevoUsuario] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const d = await detalleEmpresa({ data: { companyId: empresaId } });
      setEmpresa(d.empresa);
      setSucursales(d.sucursales);
      setUsuarios(d.usuarios);
      setActividad(d.actividad);
      const mapa: Record<string, boolean> = {};
      for (const m of MODULOS) mapa[m.key] = false;
      for (const m of d.modulos) mapa[m.module_key] = m.enabled;
      setModulos(mapa);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cargar el cliente");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (esAdminPlataforma) void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdminPlataforma, empresaId]);

  if (cargandoPermiso || cargando) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Cargando…
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

  if (!empresa) return null;

  const guardarDatos = async () => {
    setGuardando(true);
    try {
      await actualizarEmpresa({
        data: {
          companyId: empresaId,
          tradeName: empresa.trade_name,
          legalName: empresa.legal_name,
          ruc: empresa.ruc,
          region: empresa.region,
          plan: empresa.plan as PlanPlataforma,
          status: empresa.status as EstadoEmpresa,
          contactEmail: empresa.contact_email,
          contactPhone: empresa.contact_phone,
        },
      });
      toast.success("Datos del cliente actualizados");
      void cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const guardarModulosEmpresa = async () => {
    setGuardando(true);
    try {
      await guardarModulos({ data: { companyId: empresaId, modules: modulos } });
      toast.success("Módulos actualizados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const aplicarPlan = () => {
    const base = MODULOS_POR_PLAN[empresa.plan as PlanPlataforma] ?? [];
    const mapa: Record<string, boolean> = {};
    for (const m of MODULOS) mapa[m.key] = base.includes(m.key);
    setModulos(mapa);
  };

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
            <h1 className="font-display text-2xl font-semibold tracking-tight">{empresa.trade_name}</h1>
            <p className="text-sm text-muted-foreground">
              RUC {empresa.ruc} · {empresa.region} · Plan {empresa.plan}
            </p>
          </div>
        </div>
        {empresa.slug && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Enlace de acceso:</span>
            <code className="rounded bg-muted px-2 py-1">/acceso/{empresa.slug}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/acceso/${empresa.slug}`;
                void navigator.clipboard?.writeText(url);
                toast.success("Enlace copiado para enviarlo al cliente");
              }}
            >
              Copiar
            </Button>
          </div>
        )}
      </header>

      <Tabs defaultValue="datos">
        <TabsList className="flex-wrap">
          <TabsTrigger value="datos">Datos generales</TabsTrigger>
          <TabsTrigger value="sucursales">Sucursales</TabsTrigger>
          <TabsTrigger value="modulos">Módulos</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="actividad">Actividad</TabsTrigger>
        </TabsList>

        <TabsContent value="datos" className="mt-4 space-y-4 rounded-xl border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombre comercial">
              <Input
                value={empresa.trade_name ?? ""}
                onChange={(e) => setEmpresa({ ...empresa, trade_name: e.target.value })}
              />
            </Campo>
            <Campo label="Razón social">
              <Input
                value={empresa.legal_name ?? ""}
                onChange={(e) => setEmpresa({ ...empresa, legal_name: e.target.value })}
              />
            </Campo>
            <Campo label="RUC">
              <Input value={empresa.ruc ?? ""} onChange={(e) => setEmpresa({ ...empresa, ruc: e.target.value })} />
            </Campo>
            <Campo label="Región">
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={empresa.region ?? ""}
                onChange={(e) => setEmpresa({ ...empresa, region: e.target.value })}
              >
                {REGIONES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Plan">
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={empresa.plan}
                onChange={(e) => setEmpresa({ ...empresa, plan: e.target.value })}
              >
                {PLANES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Estado">
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={empresa.status}
                onChange={(e) => setEmpresa({ ...empresa, status: e.target.value })}
              >
                {ESTADOS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Correo de contacto">
              <Input
                value={empresa.contact_email ?? ""}
                onChange={(e) => setEmpresa({ ...empresa, contact_email: e.target.value })}
              />
            </Campo>
            <Campo label="Teléfono">
              <Input
                value={empresa.contact_phone ?? ""}
                onChange={(e) => setEmpresa({ ...empresa, contact_phone: e.target.value })}
              />
            </Campo>
          </div>
          <p className="text-xs text-muted-foreground">
            Suspender un cliente corta el acceso de todos sus usuarios de inmediato.
          </p>
          <Button onClick={guardarDatos} disabled={guardando}>
            {guardando && <Loader2 className="size-4 animate-spin" />} Guardar cambios
          </Button>
        </TabsContent>

        <TabsContent value="sucursales" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setSucursalEdit({ kind: "local", active: true, code: "", name: "" })}>
              <Plus className="size-4" /> Nueva sucursal
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Dirección</th>
                  <th className="px-4 py-3">Estab. / Pto.</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sucursales.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-3">{s.code}</td>
                    <td className="px-4 py-3 font-medium">
                      {s.name} {s.is_primary && <span className="text-xs text-muted-foreground">(principal)</span>}
                    </td>
                    <td className="px-4 py-3">{s.address || "—"}</td>
                    <td className="px-4 py-3">
                      {s.establishment} / {s.emission_point}
                    </td>
                    <td className="px-4 py-3 capitalize">{s.kind}</td>
                    <td className="px-4 py-3">{s.active ? "Activa" : "Inactiva"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => setSucursalEdit(s)}>
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
                {sucursales.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Este cliente aún no tiene sucursales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="modulos" className="mt-4 space-y-4 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              El plan propone un conjunto de módulos; puedes ajustarlos uno por uno para este cliente.
            </p>
            <Button variant="outline" onClick={aplicarPlan}>
              Aplicar módulos del plan {empresa.plan}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MODULOS.map((m) => (
              <div key={m.key} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm">{m.label}</span>
                <Switch
                  checked={Boolean(modulos[m.key])}
                  onCheckedChange={(v) => setModulos((prev) => ({ ...prev, [m.key]: v }))}
                />
              </div>
            ))}
          </div>
          <Button onClick={guardarModulosEmpresa} disabled={guardando}>
            {guardando && <Loader2 className="size-4 animate-spin" />} Guardar módulos
          </Button>
        </TabsContent>

        <TabsContent value="usuarios" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setNuevoUsuario(true)}>
              <Plus className="size-4" /> Nuevo usuario
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Correo</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Propietario</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.user_id} className="border-t">
                    <td className="px-4 py-3 font-medium">{u.username ?? "—"}</td>
                    <td className="px-4 py-3">{u.contact_email ?? "—"}</td>
                    <td className="px-4 py-3">{ROLES.find((r) => r.value === u.role)?.label ?? u.role ?? "—"}</td>
                    <td className="px-4 py-3">{u.is_company_owner ? "Sí" : "No"}</td>
                    <td className="px-4 py-3 text-right">
                      <BotonClave userId={u.user_id} />
                    </td>
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Este cliente aún no tiene usuarios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="actividad" className="mt-4">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Registro</th>
                </tr>
              </thead>
              <tbody>
                {actividad.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-4 py-3">
                      {new Date(a.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
                    </td>
                    <td className="px-4 py-3">{a.user_email ?? "—"}</td>
                    <td className="px-4 py-3">{a.action}</td>
                    <td className="px-4 py-3">{a.entity}</td>
                  </tr>
                ))}
                {actividad.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Sin movimientos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <DialogoSucursal
        companyId={empresaId}
        sucursal={sucursalEdit}
        onCerrar={() => setSucursalEdit(null)}
        onGuardado={() => {
          setSucursalEdit(null);
          void cargar();
        }}
      />

      <DialogoUsuario
        companyId={empresaId}
        abierto={nuevoUsuario}
        onCerrar={() => setNuevoUsuario(false)}
        onGuardado={() => {
          setNuevoUsuario(false);
          void cargar();
        }}
      />
    </div>
  );
}

function BotonClave({ userId }: { userId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      await restablecerClaveUsuario({ data: { userId, password: clave } });
      toast.success("Contraseña actualizada");
      setAbierto(false);
      setClave("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        Restablecer clave
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva contraseña</DialogTitle>
          </DialogHeader>
          <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || clave.length < 6}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DialogoSucursal({
  companyId,
  sucursal,
  onCerrar,
  onGuardado,
}: {
  companyId: string;
  sucursal: Partial<SucursalPlataforma> | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [form, setForm] = useState<Partial<SucursalPlataforma>>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setForm(sucursal ?? {});
  }, [sucursal]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarSucursal({
        data: {
          companyId,
          branchId: form.id,
          code: form.code ?? "",
          name: form.name ?? "",
          address: form.address ?? "",
          establishment: form.establishment ?? "001",
          emissionPoint: form.emission_point ?? "001",
          kind: (form.kind ?? "local") as "local" | "bodega",
          active: form.active ?? true,
        },
      });
      toast.success("Sucursal guardada");
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la sucursal");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={Boolean(sucursal)} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar sucursal" : "Nueva sucursal"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Código">
            <Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Campo>
          <Campo label="Nombre">
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Campo>
          <Campo label="Dirección">
            <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Campo>
          <Campo label="Tipo">
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.kind ?? "local"}
              onChange={(e) => setForm({ ...form, kind: e.target.value as "local" | "bodega" })}
            >
              <option value="local">Local</option>
              <option value="bodega">Bodega</option>
            </select>
          </Campo>
          <Campo label="Establecimiento">
            <Input
              value={form.establishment ?? "001"}
              onChange={(e) => setForm({ ...form, establishment: e.target.value })}
            />
          </Campo>
          <Campo label="Punto de emisión">
            <Input
              value={form.emission_point ?? "001"}
              onChange={(e) => setForm({ ...form, emission_point: e.target.value })}
            />
          </Campo>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.active ?? true}
              onCheckedChange={(v) => setForm({ ...form, active: v })}
            />
            <span className="text-sm">Sucursal activa</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="size-4 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoUsuario({
  companyId,
  abierto,
  onCerrar,
  onGuardado,
}: {
  companyId: string;
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [form, setForm] = useState({ username: "", password: "", role: "cajero", contactEmail: "" });
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      await crearUsuarioEmpresa({ data: { companyId, ...form } });
      toast.success("Usuario creado");
      setForm({ username: "", password: "", role: "cajero", contactEmail: "" });
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el usuario");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo usuario del cliente</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Usuario">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Campo>
          <Campo label="Contraseña">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Campo>
          <Campo label="Correo de contacto">
            <Input
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            />
          </Campo>
          <Campo label="Rol">
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="size-4 animate-spin" />} Crear usuario
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
