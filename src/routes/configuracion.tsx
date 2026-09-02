import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, FileKey, Loader2, Printer, Save, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getSignatureStatus } from "@/lib/signature.functions";
import {
  getNotificationSettings,
  saveNotificationSettings,
  testTelegramConnection,
  registrarWebhookTelegram,
  type NotificationSettingsInput,
} from "@/lib/notifications.functions";

import { AppShell } from "@/components/AppShell";
import { PrintBridgeField } from "@/components/PrintBridgeField";
import { MobilePrintCard } from "@/components/MobilePrintCard";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompany } from "@/hooks/useCompany";
import { useRole } from "@/hooks/useRole";
import { CAMPO_LABEL, validarConfiguracion } from "@/lib/company-settings.schema";
import {
  listCompanySettingsAudit,
  runRlsSelfTest,
  updateCompanySettings,
  type PruebaRls,
  type RegistroAuditoria,
} from "@/lib/company-settings.functions";
import {
  createStaffUser,
  listStaff,
  setStaffRole,
  transferOwnership,
  updateStaffUser,

  type AppRoleName,
  type StaffMember,
} from "@/lib/staff.functions";
import {
  PANTALLAS_INICIO,
  esEtiquetaValida,
  esPantallaValida,
  etiquetaPantalla,
  pantallaSugerida,
} from "@/lib/pantallas-inicio";
import { type CompanySettings } from "@/lib/pos";


export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración SRI y usuarios | Costea POS" },
      {
        name: "description",
        content:
          "Configura los datos tributarios de tu restaurante en Ecuador, la numeración autorizada del SRI y los roles del personal.",
      },
      { property: "og:title", content: "Configuración SRI y usuarios | Costea POS" },
      {
        property: "og:description",
        content: "Datos de la empresa, numeración autorizada SRI y roles de administrador, cajero y mesero.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <SettingsScreen />
    </AppShell>
  ),
});

const REGIMES = ["RIMPE Emprendedor", "RIMPE Negocio Popular", "Régimen General", "Contribuyente Especial"];

export function SettingsScreen() {
  const { company, loading, reload } = useCompany();
  const { isSuperAdmin } = useRole();
  const [form, setForm] = useState<CompanySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [seqText, setSeqText] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const guardarConfiguracion = useServerFn(updateCompanySettings);

  useEffect(() => {
    if (company) {
      setForm(company);
      setSeqText(String(company.next_sequential).padStart(9, "0"));
    }
  }, [company]);




  const set = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (!form) return;
    const revision = validarConfiguracion({
      business_name: form.business_name,
      trade_name: form.trade_name,
      ruc: form.ruc,
      address: form.address,
      branch_address: form.branch_address ?? "",
      phone: form.phone,
      email: form.email,
      tax_regime: form.tax_regime,
      special_taxpayer: form.special_taxpayer,
      accounting_required: form.accounting_required,
      establishment: form.establishment,
      emission_point: form.emission_point,
      next_sequential: form.next_sequential,
      environment: form.environment,
      emission_type: form.emission_type,
      iva_rate: form.iva_rate,
      service_charge_rate: form.service_charge_rate,
      printer_kitchen: form.printer_kitchen ?? "",
      printer_grill: form.printer_grill ?? "",
      printer_pos: form.printer_pos ?? "",
      printer_copies: form.printer_copies ?? 2,
      prep_limit_minutes: form.prep_limit_minutes ?? 20,
      prep_limit_mesa: form.prep_limit_mesa ?? 0,
      prep_limit_llevar: form.prep_limit_llevar ?? 0,
      prep_limit_domicilio: form.prep_limit_domicilio ?? 0,
    });
    setErrores(revision.errors);
    if (!revision.ok) {
      toast.error("Revisa los datos marcados antes de guardar");
      return;
    }

    setSaving(true);
    try {
      await guardarConfiguracion({ data: { id: form.id, values: revision.values } });
      toast.success("Configuración guardada");
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>;

  if (!form)
    return (
      <div className="panel mx-auto max-w-md space-y-2 p-6 text-center">
        <h1 className="font-display text-lg font-semibold">Configuración no disponible</h1>
        <p className="text-sm text-muted-foreground">
          No se pudo crear la configuración de la empresa. Pide a un administrador que ingrese primero para
          inicializar los datos del restaurante.
        </p>
        <Button variant="secondary" onClick={reload}>
          Reintentar
        </Button>
      </div>
    );


  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">Configuración</h1>

      <Tabs defaultValue="empresa">
        <TabsList>
          <TabsTrigger value="empresa">Empresa y SRI</TabsTrigger>
          <TabsTrigger value="notificaciones">Notificaciones</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios y roles</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="empresa" className="mt-4 space-y-4">
          <section className="panel space-y-4 p-4">
            <h2 className="font-display text-base font-semibold">Datos del contribuyente</h2>
            <div className="grid gap-3">
              <Field label="Razón social" value={form.business_name} onChange={(v) => set("business_name", v)} />
              <Field label="Nombre del Restaurante" value={form.trade_name} onChange={(v) => set("trade_name", v)} />
              <Field label="RUC (13 dígitos)" value={form.ruc} onChange={(v) => set("ruc", v)} />
              <Field label="Teléfono" value={form.phone} onChange={(v) => set("phone", v)} />
              <Field label="Dirección matriz" value={form.address} onChange={(v) => set("address", v)} />
              <Field label="Correo" value={form.email} onChange={(v) => set("email", v)} />
              <Field
                label="Dirección del establecimiento / sucursal"
                value={form.branch_address ?? ""}
                onChange={(v) => set("branch_address", v)}
              />
              <div className="space-y-1">
                <Label>¿Obligado a llevar contabilidad?</Label>
                <Select
                  value={form.accounting_required ? "si" : "no"}
                  onValueChange={(v) => set("accounting_required", v === "si")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="si">Sí</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Régimen tributario</Label>
                <Select value={form.tax_regime} onValueChange={(v) => set("tax_regime", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIMES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field
                label="Contribuyente especial (resolución)"
                value={form.special_taxpayer ?? ""}
                onChange={(v) => set("special_taxpayer", v)}
              />
            </div>
          </section>




          <section className="panel space-y-4 p-4">
            <h2 className="font-display text-base font-semibold">Numeración autorizada SRI</h2>




            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Establecimiento" value={form.establishment} onChange={(v) => set("establishment", v)} />
              <Field label="Punto de emisión" value={form.emission_point} onChange={(v) => set("emission_point", v)} />
              <div className="space-y-1">
                <Label>Siguiente secuencial</Label>
                <Input
                  inputMode="numeric"
                  value={seqText}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                    setSeqText(digits);
                    set("next_sequential", Number(digits) || 0);
                  }}
                  onBlur={() => setSeqText(String(form.next_sequential).padStart(9, "0"))}
                />
                <p className="text-xs text-muted-foreground">
                  Próximo comprobante:{" "}
                  {`${String(form.establishment).padStart(3, "0")}-${String(form.emission_point).padStart(3, "0")}-${String(
                    form.next_sequential,
                  ).padStart(9, "0")}`}
                </p>
              </div>

              <div className="space-y-1">
                <Label>Ambiente</Label>
                <Select value={form.environment} onValueChange={(v) => set("environment", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 · Pruebas</SelectItem>
                    <SelectItem value="2">2 · Producción</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field
                label="IVA (%)"
                type="number"
                value={String(form.iva_rate)}
                onChange={(v) => set("iva_rate", Number(v))}
              />
              <Field
                label="Servicio (%)"
                type="number"
                value={String(form.service_charge_rate)}
                onChange={(v) => set("service_charge_rate", Number(v))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              La clave de acceso de 49 dígitos se genera con estos datos al emitir cada factura.
            </p>
          </section>

          <section className="panel space-y-3 p-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Printer className="size-4 text-primary" /> Áreas de impresión
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Impresora Cocina General"
                value={form.printer_kitchen ?? ""}
                onChange={(v) => set("printer_kitchen", v)}
              />
              <Field
                label="Impresora Parrilla"
                value={form.printer_grill ?? ""}
                onChange={(v) => set("printer_grill", v)}
              />
              <Field
                label="Impresora Punto de Venta (Cobro)"
                value={form.printer_pos ?? ""}
                onChange={(v) => set("printer_pos", v)}
              />
              <Field
                label="Copias por ticket (orden o factura)"
                type="number"
                value={String(form.printer_copies ?? 2)}
                onChange={(v) => set("printer_copies", Math.min(Math.max(Number(v) || 1, 1), 5))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Cada producto se asigna a Cocina, Parrilla o ambas desde el Menú. Todas las comandas se imprimen
              con el mismo número de orden y mesa. La impresora de Punto de Venta se usa para tickets de
              cobro, facturas, recibos de pago y cierres de caja.
            </p>
            <PrintBridgeField />
            <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Impresión automática (sin ventana)</p>
              <p>
                Con el agente de impresión instalado y detectado arriba, el ticket sale de inmediato por la
                impresora indicada: sin vista previa, sin cuadro de Windows y sin clics adicionales.
              </p>
              <p className="mt-1">
                Alternativa sin instalar nada: abra el navegador en modo impresión directa con un acceso
                directo así:
              </p>
              <p className="mt-1 break-all rounded bg-background px-2 py-1 font-mono text-[11px] text-foreground">
                chrome.exe --kiosk-printing --app=https://costea-pos-master.lovable.app
              </p>
              <p className="mt-1">
                Cada equipo imprime en su propia impresora predeterminada, por eso conviene dejar la POS-80 de
                cobro en la computadora de caja y la de comandas en la de cocina o parrilla.
              </p>
            </div>

            <MobilePrintCard negocio={form.business_name ?? ""} />
          </section>


          <SignaturePanel isAdmin={isSuperAdmin} />

          <Button onClick={save} disabled={saving || !isSuperAdmin}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar
          </Button>
          {!isSuperAdmin && (
            <p className="text-xs text-muted-foreground">
              Solo el Super Administrador puede modificar estos datos.
            </p>
          )}

          {Object.keys(errores).length > 0 && (
            <section className="panel space-y-1 border-destructive/50 p-4">
              <h2 className="font-display text-base font-semibold text-destructive">Corrige antes de guardar</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                {Object.entries(errores).map(([campo, mensaje]) => (
                  <li key={campo}>
                    <strong>{CAMPO_LABEL[campo] ?? campo}:</strong> {mensaje}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </TabsContent>

        <TabsContent value="notificaciones" className="mt-4">
          <NotificationPanel />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-4">
          <StaffPanel />
        </TabsContent>

        <TabsContent value="auditoria" className="mt-4">
          <AuditPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

type NotificationSettings = {
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  chat_id_owner: string | null;
  chat_id_admin: string | null;
  chat_id_inventory: string | null;
  chat_id_kitchen: string | null;
  alert_order_ready: boolean;
  alert_cash_closure: boolean;
  alert_low_stock: boolean;
};

function NotificationPanel() {
  const { isSuperAdmin } = useRole();
  const testConnection = useServerFn(testTelegramConnection);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activando, setActivando] = useState(false);
  const registrarWebhook = useServerFn(registrarWebhookTelegram);

  const activarBot = async () => {
    setActivando(true);
    try {
      await registrarWebhook({ data: { url: window.location.origin } });
      toast.success("Bot activado: ya responde a mensajes y botones");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo activar el bot");
    } finally {
      setActivando(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setSettings(
        (data as NotificationSettings) ?? {
          telegram_bot_token: null,
          telegram_chat_id: null,
          chat_id_owner: null,
          chat_id_admin: null,
          chat_id_inventory: null,
          chat_id_kitchen: null,
          alert_order_ready: false,
          alert_cash_closure: false,
          alert_low_stock: false,
        },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar las notificaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (patch: Partial<NotificationSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("notification_settings")
        .select("id")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      const payload = {
        telegram_bot_token: settings.telegram_bot_token,
        telegram_chat_id: settings.telegram_chat_id,
        chat_id_owner: settings.chat_id_owner,
        chat_id_admin: settings.chat_id_admin,
        chat_id_inventory: settings.chat_id_inventory,
        chat_id_kitchen: settings.chat_id_kitchen,
        alert_order_ready: settings.alert_order_ready,
        alert_cash_closure: settings.alert_cash_closure,
        alert_low_stock: settings.alert_low_stock,
      };
      if (existing) {
        const { error } = await supabase.from("notification_settings").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_settings").insert(payload);
        if (error) throw error;
      }
      toast.success("Configuración de notificaciones guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await testConnection({ data: {} });
      toast.success("Mensaje de prueba enviado a Telegram");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar el mensaje de prueba");
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>;
  if (!settings)
    return <p className="py-10 text-center text-sm text-muted-foreground">No se pudieron cargar las notificaciones.</p>;

  return (
    <div className="space-y-4">
      <section className="panel space-y-4 p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Bell className="size-4 text-primary" /> Telegram Bot
        </h2>
        <p className="text-xs text-muted-foreground">
          Configura un bot de Telegram para recibir alertas operativas. El token y el chat ID se
          guardan en la base de datos y nunca se exponen al navegador.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Token del bot"
            value={settings.telegram_bot_token ?? ""}
            onChange={(v) => update({ telegram_bot_token: v || null })}
          />
          <Field
            label="Chat ID"
            value={settings.telegram_chat_id ?? ""}
            onChange={(v) => update({ telegram_chat_id: v || null })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Chat ID del dueño"
            value={settings.chat_id_owner ?? ""}
            onChange={(v) => update({ chat_id_owner: v || null })}
          />
          <Field
            label="Chat ID del administrador"
            value={settings.chat_id_admin ?? ""}
            onChange={(v) => update({ chat_id_admin: v || null })}
          />
          <Field
            label="Chat ID del encargado de inventario"
            value={settings.chat_id_inventory ?? ""}
            onChange={(v) => update({ chat_id_inventory: v || null })}
          />
          <Field
            label="Chat ID del jefe de cocina"
            value={settings.chat_id_kitchen ?? ""}
            onChange={(v) => update({ chat_id_kitchen: v || null })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Cada persona debe escribir <code>/iniciar</code> al bot: el bot le responde con su chat ID
          para pegarlo aquí. Comandos disponibles: /iniciar, /estado, /alertas, /ayuda.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving || !isSuperAdmin}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar
          </Button>
          <Button variant="secondary" onClick={test} disabled={testing || !isSuperAdmin}>
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Probar
          </Button>
          <Button variant="secondary" onClick={activarBot} disabled={activando || !isSuperAdmin}>
            {activando ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />} Activar bot
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Usa “Activar bot” si el bot deja de responder a los mensajes o botones: vuelve a
          conectarlo con este sistema.
        </p>
        {!isSuperAdmin && (
          <p className="text-xs text-muted-foreground">Solo el Super Administrador puede modificar estas alertas.</p>
        )}
      </section>

      <section className="panel space-y-4 p-4">
        <h2 className="font-display text-base font-semibold">Alertas activas</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Pedido listo en cocina</p>
              <p className="text-xs text-muted-foreground">Avisar cuando un pedido se marque como listo.</p>
            </div>
            <Switch
              checked={settings.alert_order_ready}
              disabled={!isSuperAdmin}
              onCheckedChange={(v) => update({ alert_order_ready: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Cierre de caja</p>
              <p className="text-xs text-muted-foreground">Enviar resumen al cerrar el día definitivamente.</p>
            </div>
            <Switch
              checked={settings.alert_cash_closure}
              disabled={!isSuperAdmin}
              onCheckedChange={(v) => update({ alert_cash_closure: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Stock bajo</p>
              <p className="text-xs text-muted-foreground">Avisar cuando un ítem de inventario esté por debajo del mínimo.</p>
            </div>
            <Switch
              checked={settings.alert_low_stock}
              disabled={!isSuperAdmin}
              onCheckedChange={(v) => update({ alert_low_stock: v })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

export function StaffPanel() {
  const fetchStaff = useServerFn(listStaff);
  const saveRole = useServerFn(setStaffRole);
  const addUser = useServerFn(createStaffUser);
  const editUser = useServerFn(updateStaffUser);
  const pasarPropiedad = useServerFn(transferOwnership);

  const { isSuperAdmin } = useRole();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({
    username: "",
    contactEmail: "",
    password: "",
    role: "cajero" as AppRoleName,
    homePath: pantallaSugerida("cajero") as string,
  });
  const [busy, setBusy] = useState(false);


  const load = useCallback(async () => {
    try {
      setStaff(await fetchStaff());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el personal");
    }
  }, [fetchStaff]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (userId: string, role: AppRoleName) => {
    try {
      await saveRole({ data: { userId, role } });
      toast.success("Rol actualizado");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  };

  /** Verifica que la pantalla elegida exista tal cual en el sistema. */
  const pantallaConfirmada = (valor: string): string | null => {
    const nombre = etiquetaPantalla(valor);
    if (!esPantallaValida(valor) || !nombre || !esEtiquetaValida(nombre)) {
      toast.error("La pantalla seleccionada no coincide con ninguna pantalla del sistema");
      return null;
    }
    return nombre;
  };

  const crear = async () => {
    if (!pantallaConfirmada(nuevo.homePath)) return;
    setBusy(true);
    try {
      await addUser({ data: nuevo });
      toast.success(`Usuario ${nuevo.username} creado`);
      setNuevo({
        username: "",
        contactEmail: "",
        password: "",
        role: "cajero",
        homePath: pantallaSugerida("cajero"),
      });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el usuario");
    } finally {
      setBusy(false);
    }
  };

  const cambiarClave = async (s: StaffMember) => {
    const clave = window.prompt(`Nueva contraseña para ${s.username ?? s.email}`);
    if (!clave) return;
    try {
      await editUser({ data: { userId: s.id, password: clave } });
      toast.success("Contraseña actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar la contraseña");
    }
  };

  const cambiarPantalla = async (userId: string, homePath: string) => {
    const nombre = pantallaConfirmada(homePath);
    if (!nombre) return;
    setStaff((prev) =>
      prev.map((s) => (s.id === userId ? { ...s, homePath: homePath as StaffMember["homePath"] } : s)),
    );
    try {
      await editUser({ data: { userId, homePath } });
      toast.success("Pantalla de inicio actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la pantalla de inicio");
      load();
    }
  };



  const nombrarPropietario = async (s: StaffMember) => {
    const nombre = s.username ?? s.email;
    const ok = window.confirm(
      `¿Nombrar a "${nombre}" como Super Administrador / Propietario?\n\nTu usuario actual pasará a ser Administrador Operativo.`,
    );
    if (!ok) return;
    try {
      await pasarPropiedad({ data: { userId: s.id } });
      toast.success(`Ahora "${nombre}" es el Super Administrador / Propietario`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo transferir la propiedad");
    }
  };


  if (error) return <p className="panel p-4 text-sm text-muted-foreground">{error}</p>;

  return (
    <div className="space-y-4">
      {isSuperAdmin && (
        <section className="panel space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <ShieldCheck className="size-4 text-primary" /> Crear usuario
          </h2>
          <p className="text-xs text-muted-foreground">
            El nombre de usuario no se repite. El correo sí puede repetirse: sirve solo para avisos y
            notificaciones.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Nombre de usuario</Label>
              <Input
                value={nuevo.username}
                placeholder="caja01"
                autoCapitalize="none"
                onChange={(e) => setNuevo({ ...nuevo, username: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Correo de contacto</Label>
              <Input
                type="email"
                value={nuevo.contactEmail}
                placeholder="costea@tuempresa.com"
                onChange={(e) => setNuevo({ ...nuevo, contactEmail: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Contraseña</Label>
              <Input
                type="password"
                value={nuevo.password}
                autoComplete="new-password"
                onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Rol</Label>
              <Select
                value={nuevo.role}
                onValueChange={(v) =>
                  setNuevo({
                    ...nuevo,
                    role: v as AppRoleName,
                    homePath: pantallaSugerida(v),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin_operativo">Administrador Operativo</SelectItem>

                  <SelectItem value="cajero">Cajero</SelectItem>
                  <SelectItem value="mesero">Mesero</SelectItem>
                  <SelectItem value="cocina">Cocina</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Pantalla de inicio</Label>
              <Select
                value={nuevo.homePath}
                onValueChange={(v) => setNuevo({ ...nuevo, homePath: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PANTALLAS_INICIO.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Es la pantalla que se abre al iniciar sesión. Se sugiere según el rol y se puede cambiar.
              </p>
            </div>
          </div>
          <Button onClick={crear} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Crear usuario
          </Button>
        </section>
      )}

      <div className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ShieldCheck className="size-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Personal</h2>
        </div>
        {!isSuperAdmin && (
          <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            Solo el Super Administrador puede crear usuarios y cambiar roles.
          </p>
        )}
        <div className="divide-y divide-border">
          {staff.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {s.username ?? s.email}
                  {s.isOwner && (
                    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Propietario
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Correo informativo: {s.contactEmail ?? "sin correo"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isSuperAdmin && (
                  <Button variant="secondary" size="sm" onClick={() => cambiarClave(s)}>
                    Clave
                  </Button>
                )}
                {isSuperAdmin && !s.isOwner && (
                  <Button variant="outline" size="sm" onClick={() => nombrarPropietario(s)}>
                    Nombrar Propietario
                  </Button>
                )}
                {s.isOwner ? (
                  <p className="w-56 text-right text-sm font-medium sm:text-left">
                    Super Administrador / Propietario
                  </p>
                ) : (
                  <Select
                    value={s.role ?? ""}
                    disabled={!isSuperAdmin}
                    onValueChange={(v) => update(s.id, v as AppRoleName)}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Sin rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin_operativo">Administrador Operativo</SelectItem>
                      <SelectItem value="cajero">Cajero</SelectItem>
                      <SelectItem value="mesero">Mesero</SelectItem>
                      <SelectItem value="cocina">Cocina</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Select
                  value={s.homePath ?? ""}
                  disabled={!isSuperAdmin}
                  onValueChange={(v) => cambiarPantalla(s.id, v)}
                >
                  <SelectTrigger className="w-56" aria-label="Pantalla de inicio">
                    <SelectValue placeholder="Pantalla de inicio (según rol)" />
                  </SelectTrigger>
                  <SelectContent>
                    {PANTALLAS_INICIO.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
          {staff.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Aún no hay usuarios registrados.</p>
          )}
        </div>

      </div>
    </div>
  );
}



function SignaturePanel({ isAdmin }: { isAdmin: boolean }) {
  const checkSignature = useServerFn(getSignatureStatus);
  const [id, setId] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const [hasPassword, setHasPassword] = useState(false);

  const load = useCallback(async () => {
    // La tabla de la firma ya no es legible desde el navegador: el estado llega
    // del servidor y nunca incluye la contraseña del .p12.
    try {
      const status = await checkSignature();
      setId(status.id);
      setPath(status.path);
      setHasPassword(status.hasPassword);
    } catch {
      setHasPassword(false);
    }
  }, [checkSignature]);


  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      let storedPath = path;
      if (file) {
        if (!file.name.toLowerCase().endsWith(".p12")) throw new Error("El archivo debe ser .p12");
        const key = `firma/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("firmas").upload(key, file, { upsert: true });
        if (error) throw error;
        storedPath = key;
      }
      // La contraseña solo se envía cuando se escribe una nueva: nunca se lee de vuelta.
      const payload: { p12_path: string | null; p12_password?: string } = { p12_path: storedPath };
      if (password.trim()) payload.p12_password = password.trim();
      const { error } = id
        ? await supabase.from("company_signature").update(payload).eq("id", id)
        : await supabase.from("company_signature").insert(payload);
      if (error) throw error;
      setPassword("");

      setFile(null);
      toast.success("Firma electrónica guardada");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la firma");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <FileKey className="size-4 text-primary" /> Firma electrónica (.p12)
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Archivo .p12</Label>
          <Input
            type="file"
            accept=".p12"
            disabled={!isAdmin}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {path && !file && (
            <p className="text-xs text-muted-foreground">Archivo cargado: {path.split("/").pop()}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Contraseña de la firma</Label>
          <Input
            type="password"
            value={password}
            disabled={!isAdmin}
            placeholder={hasPassword ? "•••••••• (guardada)" : "Escribe la contraseña"}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            {hasPassword
              ? "Contraseña guardada. Escribe una nueva solo si deseas reemplazarla."
              : "Aún no se ha guardado ninguna contraseña."}
          </p>
        </div>

      </div>
      <Button onClick={save} disabled={busy || !isAdmin} variant="secondary">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar firma
      </Button>
      <p className="text-xs text-muted-foreground">
        El archivo se guarda en almacenamiento privado y solo los administradores pueden verlo.
      </p>
    </section>
  );
}

function AuditPanel() {
  const cargarBitacora = useServerFn(listCompanySettingsAudit);
  const ejecutarPrueba = useServerFn(runRlsSelfTest);
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [pruebas, setPruebas] = useState<PruebaRls[]>([]);
  const [probando, setProbando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await cargarBitacora({ data: { limit: 50 } });
      setRegistros(rows as RegistroAuditoria[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar la bitácora");
    } finally {
      setLoading(false);
    }
  }, [cargarBitacora]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const probar = async () => {
    try {
      setProbando(true);
      const resultado = await ejecutarPrueba({});
      setPruebas(resultado.pruebas);
      if (resultado.ok) toast.success("Todas las reglas de seguridad están correctas");
      else toast.error("Se encontraron reglas de seguridad incorrectas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo ejecutar la prueba");
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="panel space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Prueba de seguridad (RLS)</h2>
            <p className="text-xs text-muted-foreground">
              Verifica que la configuración y su bitácora estén protegidas contra accesos indebidos.
            </p>
          </div>
          <Button variant="secondary" onClick={probar} disabled={probando}>
            {probando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Ejecutar prueba
          </Button>
        </div>
        {pruebas.length > 0 && (
          <ul className="space-y-1 text-sm">
            {pruebas.map((p) => (
              <li key={p.nombre} className={p.ok ? "text-emerald-500" : "text-destructive"}>
                {p.ok ? "✓" : "✗"} {p.nombre} — <span className="text-muted-foreground">{p.detalle}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="font-display text-base font-semibold">Bitácora de cambios</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : registros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay cambios registrados.</p>
        ) : (
          <ul className="space-y-3">
            {registros.map((r) => (
              <li key={r.id} className="rounded-md border border-border/60 p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {new Date(r.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })} ·{" "}
                    {r.user_email || "usuario"} ({r.user_role})
                  </span>
                  <span>IP {r.ip ?? "—"}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {(r.changes ?? []).map((c, i) => (
                    <li key={`${r.id}-${i}`}>
                      <strong>{CAMPO_LABEL[c.campo] ?? c.campo}:</strong>{" "}
                      <span className="text-muted-foreground line-through">{String(c.antes ?? "—")}</span>{" "}
                      → <span>{String(c.despues ?? "—")}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
