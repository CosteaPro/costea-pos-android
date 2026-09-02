import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Caja = {
  id: string;
  codigo: string;
  nombre: string;
  local: string;
  sync_key: string;
  establishment: string;
  emission_point: string;
  tipo_local: string;
  activa: boolean;
  last_seen_at: string | null;
  created_at: string;
};

/** El tipo de local se configura en cada caja descargable; aquí solo se consulta. */
const TIPOS_LOCAL: Record<string, string> = {
  rapida: "Restaurante sin mesas",
  restaurante: "Restaurante con salón y mesas",
  patio: "Patio de comidas",
};

export const Route = createFileRoute("/admin/cajas")({
  head: () => ({
    meta: [
      { title: "Cajas autorizadas | Costea POS" },
      {
        name: "description",
        content:
          "Registro y autorización de cajas de escritorio: establecimiento, punto de emisión y clave de sincronización.",
      },
      { property: "og:title", content: "Cajas autorizadas | Costea POS" },
      {
        property: "og:description",
        content: "Panel exclusivo del Superadministrador para autorizar cajas descargables.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CajasPage,
});

const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 3);
const rellenar = (v: string) => v.padStart(3, "0");

function nuevaClave() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  bytes.forEach((b, i) => {
    out += abc[b % abc.length];
    if (i % 5 === 4 && i < 19) out += "-";
  });
  return out;
}

const vacia = {
  nombre: "",
  local: "",
  establishment: "001",
  emission_point: "001",
  sync_key: "",
  activa: true,
};

function CajasPage() {
  const { isSuperAdmin, loading: loadingRole } = useRole();
  const [rows, setRows] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...vacia });
  const [visibles, setVisibles] = useState<Record<string, boolean>>({});

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cajas")
      .select("*")
      .order("establishment")
      .order("emission_point");
    if (error) toast.error("No se pudieron cargar las cajas");
    setRows((data as Caja[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isSuperAdmin) void cargar();
  }, [isSuperAdmin, cargar]);

  if (loadingRole) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
        <ShieldAlert className="size-8 text-muted-foreground" />
        <h1 className="font-display text-lg font-semibold">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">
          No tienes permiso para gestionar cajas. Solo el Superadministrador puede realizar esta
          acción.
        </p>
      </div>
    );
  }

  function abrirNueva() {
    setEditId(null);
    setForm({ ...vacia, sync_key: nuevaClave() });
    setOpen(true);
  }

  function abrirEdicion(c: Caja) {
    setEditId(c.id);
    setForm({
      nombre: c.nombre,
      local: c.local,
      establishment: c.establishment,
      emission_point: c.emission_point,
      sync_key: c.sync_key,
      activa: c.activa,
    });
    setOpen(true);
  }

  async function guardar() {
    const establishment = rellenar(form.establishment);
    const emission_point = rellenar(form.emission_point);
    if (!form.nombre.trim()) return toast.error("Escriba el nombre de la caja");
    if (establishment.length !== 3 || emission_point.length !== 3)
      return toast.error("Establecimiento y punto de emisión deben tener 3 dígitos");
    if (!form.sync_key.trim()) return toast.error("Genere o escriba la clave de sincronización");

    const duplicada = rows.some(
      (r) =>
        r.id !== editId && r.establishment === establishment && r.emission_point === emission_point,
    );
    if (duplicada)
      return toast.error(
        "Ya existe una caja con ese establecimiento y punto de emisión. Cada caja debe tener su propio punto de emisión único según la normativa del SRI.",
      );

    setSaving(true);
    const payload = {
      nombre: form.nombre.trim(),
      local: form.local.trim() || form.nombre.trim(),
      establishment,
      emission_point,
      sync_key: form.sync_key.trim(),
      activa: form.activa,
      codigo: `CAJA-${establishment}${emission_point}`,
      updated_at: new Date().toISOString(),
    };

    const { error } = editId
      ? await supabase.from("cajas").update(payload).eq("id", editId)
      : await supabase.from("cajas").insert(payload);
    setSaving(false);

    if (error) {
      const dup = error.code === "23505";
      toast.error(
        dup
          ? "Ya existe una caja con ese establecimiento y punto de emisión. Cada caja debe tener su propio punto de emisión único según la normativa del SRI."
          : error.message,
      );
      return;
    }
    toast.success(editId ? "Caja actualizada" : "Caja registrada y autorizada");
    setOpen(false);
    void cargar();
  }

  async function alternar(c: Caja) {
    const { error } = await supabase
      .from("cajas")
      .update({ activa: !c.activa, updated_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(!c.activa ? "Caja activada" : "Caja desactivada");
    void cargar();
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Cajas autorizadas</h1>
          <p className="text-sm text-muted-foreground">
            Cada caja descargable debe estar registrada aquí con su punto de emisión único y su
            clave de sincronización.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void cargar()} disabled={loading}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Actualizar
          </Button>
          <Button onClick={abrirNueva}>
            <Plus className="size-4" /> Agregar caja
          </Button>
        </div>
      </header>

      <ClaveDeCajas />



      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nombre de caja</th>
              <th className="px-3 py-2">Establecimiento</th>
              <th className="px-3 py-2">Punto de emisión</th>
              <th className="px-3 py-2">Tipo de local</th>
              <th className="px-3 py-2">Clave de sincronización</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Fecha de alta</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  Aún no hay cajas registradas.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <span className="font-medium">{c.nombre}</span>
                  <span className="block text-xs text-muted-foreground">{c.codigo}</span>
                </td>
                <td className="px-3 py-2 font-mono">{c.establishment}</td>
                <td className="px-3 py-2 font-mono">{c.emission_point}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {TIPOS_LOCAL[c.tipo_local] ?? "Restaurante con salón y mesas"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">
                      {visibles[c.id] ? c.sync_key : "••••••••••"}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground"
                      aria-label="Mostrar clave"
                      onClick={() => setVisibles((v) => ({ ...v, [c.id]: !v[c.id] }))}
                    >
                      {visibles[c.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      c.activa
                        ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600"
                        : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    }
                  >
                    {c.activa ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("es-EC", {
                    timeZone: "America/Guayaquil",
                  })}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => abrirEdicion(c)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void alternar(c)}>
                      {c.activa ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar caja" : "Agregar caja"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nombre identificador</Label>
              <Input
                value={form.nombre}
                placeholder="Caja Principal"
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Local / sucursal</Label>
              <Input
                value={form.local}
                placeholder="Matriz"
                onChange={(e) => setForm({ ...form, local: e.target.value })}
              />
            </div>
            <div>
              <Label>Establecimiento (3 dígitos)</Label>
              <Input
                inputMode="numeric"
                value={form.establishment}
                onChange={(e) => setForm({ ...form, establishment: soloDigitos(e.target.value) })}
              />
            </div>
            <div>
              <Label>Punto de emisión (3 dígitos)</Label>
              <Input
                inputMode="numeric"
                value={form.emission_point}
                onChange={(e) => setForm({ ...form, emission_point: soloDigitos(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Clave de sincronización</Label>
              <div className="flex gap-2">
                <Input
                  value={form.sync_key}
                  className="font-mono"
                  onChange={(e) => setForm({ ...form, sync_key: e.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm({ ...form, sync_key: nuevaClave() })}
                >
                  Generar
                </Button>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Copie esta clave en la configuración de la caja descargable.
              </p>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                checked={form.activa}
                onCheckedChange={(v) => setForm({ ...form, activa: v })}
              />
              <span className="text-sm">Caja activa</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void guardar()} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Clave que piden las cajas de escritorio para abrir su configuración.
 * Es una clave propia del sistema (no la contraseña personal de nadie) y se
 * guarda cifrada en el servidor central.
 */
function ClaveDeCajas() {
  const [definida, setDefinida] = useState<boolean | null>(null);
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { hayClaveCajas } = await import("@/lib/caja-admin-pin.functions");
        const res = await hayClaveCajas();
        setDefinida(res.definida);
      } catch {
        setDefinida(false);
      }
    })();
  }, []);

  const guardar = async () => {
    if (clave !== repetir) return toast.error("Las dos claves no coinciden");
    setGuardando(true);
    try {
      const { guardarClaveCajas } = await import("@/lib/caja-admin-pin.functions");
      await guardarClaveCajas({ data: { clave } });
      setClave("");
      setRepetir("");
      setDefinida(true);
      toast.success("Clave de cajas guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la clave");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-display text-lg font-semibold">Clave de administrador de las cajas</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Es la clave que se pide en las cajas descargables para entrar a su configuración. No es la
        contraseña personal de ningún usuario y se guarda cifrada.{" "}
        {definida === false && (
          <span className="font-medium text-destructive">Aún no está definida.</span>
        )}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label>Nueva clave (mínimo 8 caracteres)</Label>
          <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Repetir clave</Label>
          <Input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </div>
        <Button onClick={() => void guardar()} disabled={guardando || clave.length < 8}>
          {guardando && <Loader2 className="size-4 animate-spin" />}{" "}
          {definida ? "Cambiar clave" : "Definir clave"}
        </Button>
      </div>
    </section>
  );
}

