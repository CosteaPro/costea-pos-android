import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlarmClock, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/hooks/useCompany";
import { useRole } from "@/hooks/useRole";
import { DelayLogScreen } from "@/routes/bitacora";

export const Route = createFileRoute("/tiempos")({
  head: () => ({
    meta: [
      { title: "Gestión de tiempos y demoras | Costea POS" },
      {
        name: "description",
        content:
          "Configura los tiempos máximos de preparación por tipo de servicio y revisa la bitácora de demoras del restaurante.",
      },
      { property: "og:title", content: "Gestión de tiempos y demoras | Costea POS" },
      {
        property: "og:description",
        content: "Límites de preparación por servicio y bitácora de pedidos que superaron el tiempo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <TimeManagementScreen />
    </AppShell>
  ),
});

type Limits = {
  prep_limit_minutes: number;
  prep_limit_mesa: number;
  prep_limit_llevar: number;
  prep_limit_domicilio: number;
};

function TimeManagementScreen() {
  const { company, reload } = useCompany();
  const { can } = useRole();
  const [form, setForm] = useState<Limits>({
    prep_limit_minutes: 20,
    prep_limit_mesa: 0,
    prep_limit_llevar: 0,
    prep_limit_domicilio: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    setForm({
      prep_limit_minutes: company.prep_limit_minutes ?? 20,
      prep_limit_mesa: company.prep_limit_mesa ?? 0,
      prep_limit_llevar: company.prep_limit_llevar ?? 0,
      prep_limit_domicilio: company.prep_limit_domicilio ?? 0,
    });
  }, [company]);

  const set = (key: keyof Limits, value: string) =>
    setForm((f) => ({ ...f, [key]: Number(value.replace(/\D/g, "")) || 0 }));

  const save = async () => {
    if (!company) return;
    setSaving(true);
    const { error } = await supabase.from("company_settings").update(form).eq("id", company.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tiempos máximos actualizados");
    reload();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <AlarmClock className="size-6 text-primary" />
        <div>
          <h1 className="font-display text-xl font-semibold">Gestión de tiempos y demoras</h1>
          <p className="text-sm text-muted-foreground">
            Módulo independiente: define los límites de preparación y consulta la bitácora de demoras.
          </p>
        </div>
      </header>

      {can.gestionarTiempos && (
        <section className="panel space-y-3 p-4">
          <h2 className="font-display text-base font-semibold">Tiempos máximos de preparación</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>General (minutos)</Label>
              <Input
                value={String(form.prep_limit_minutes)}
                onChange={(e) => set("prep_limit_minutes", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mesa (0 = usar general)</Label>
              <Input value={String(form.prep_limit_mesa)} onChange={(e) => set("prep_limit_mesa", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Para llevar (0 = general)</Label>
              <Input
                value={String(form.prep_limit_llevar)}
                onChange={(e) => set("prep_limit_llevar", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Domicilio (0 = general)</Label>
              <Input
                value={String(form.prep_limit_domicilio)}
                onChange={(e) => set("prep_limit_domicilio", e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            El conteo inicia cuando el pedido se envía a cocina. Al superar el límite, la comanda y la mesa se
            resaltan en rojo con el aviso “TIEMPO SUPERADO”.
          </p>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 size-4" /> {saving ? "Guardando…" : "Guardar tiempos"}
          </Button>
        </section>
      )}

      <DelayLogScreen />
    </div>
  );
}
