import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlarmClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { serviceLabel, type DelayLog } from "@/lib/delays";
import { ecBusinessDate } from "@/lib/caja";


/** Aviso destacado de demoras del día para el administrador. */
export function DelayAlerts() {
  const [rows, setRows] = useState<DelayLog[]>([]);

  useEffect(() => {
    const load = async () => {
      // El "hoy" de las demoras es el día contable de Ecuador (UTC-5).
      const desde = `${ecBusinessDate()}T00:00:00-05:00`;
      const { data } = await supabase
        .from("delay_logs")
        .select("*")
        .gte("delivered_at", desde)
        .order("delivered_at", { ascending: false });

      setRows((data as DelayLog[]) ?? []);
    };
    load();
    const channel = supabase
      .channel("bitacora-demoras")
      .on("postgres_changes", { event: "*", schema: "public", table: "delay_logs" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="panel flex flex-wrap items-center gap-3 border-destructive bg-destructive/10 p-4">
      <AlarmClock className="size-5 text-destructive" />
      <div className="min-w-[200px] flex-1">
        <p className="font-display font-bold text-destructive">
          {rows.length} {rows.length === 1 ? "demora registrada hoy" : "demoras registradas hoy"}
        </p>
        <p className="text-xs text-muted-foreground">
          Última: {rows[0]?.table_name || serviceLabel(rows[0]?.service_type ?? "mesa")} · pedido #
          {rows[0]?.folio} · {rows[0]?.actual_minutes} min (límite {rows[0]?.limit_minutes} min)
        </p>
      </div>
      <Button variant="secondary" asChild>
        <Link to="/bitacora">Ver bitácora</Link>
      </Button>
    </div>
  );
}
