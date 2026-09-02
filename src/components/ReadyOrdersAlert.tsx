import { useState } from "react";
import { BellRing, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { ReadyOrder } from "@/hooks/useKitchenAlerts";

function destino(r: ReadyOrder) {
  if (r.table_name) return `MESA ${r.table_name}`;
  if (r.service_type === "llevar") return "PARA LLEVAR";
  if (r.service_type === "domicilio") return "A DOMICILIO";
  return `PEDIDO #${r.folio}`;
}

/**
 * Aviso visible para el MESERO: lista de órdenes listas en cocina con
 * botón para confirmar que ya se retiraron (detiene los recordatorios de voz).
 */
export function ReadyOrdersAlert({
  ready,
  onChange,
}: {
  ready: ReadyOrder[];
  onChange?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  if (ready.length === 0) return null;

  const retirar = async (r: ReadyOrder) => {
    setBusy(r.id);
    const deliveredAt = new Date().toISOString();
    await supabase.from("order_items").update({ status: "entregado" }).eq("order_id", r.id);
    const { error } = await supabase
      .from("orders")
      .update({ delivered_at: deliveredAt })
      .eq("id", r.id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${destino(r)} · retirada`);
    onChange?.();
  };

  return (
    <div className="space-y-2 border-b border-primary/40 bg-primary/10 p-3">
      {ready.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-3 rounded-xl border border-primary/50 bg-surface px-3 py-3"
        >
          <BellRing className="size-6 shrink-0 animate-pulse text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold leading-tight">
              📢 {destino(r)} — ORDEN LISTA
            </p>
            <p className="text-xs text-muted-foreground">Comanda #{r.folio}</p>
          </div>
          <Button
            size="sm"
            className="h-11 shrink-0 font-bold"
            disabled={busy === r.id}
            onClick={() => retirar(r)}
          >
            <Check className="size-4" /> RETIRADA
          </Button>
        </div>
      ))}
    </div>
  );
}
