import { supabase } from "@/integrations/supabase/client";
import { prepLimitFor, type CompanySettings, type OrderWithItems } from "@/lib/pos";

export type DelayLog = {
  id: string;
  order_id: string | null;
  folio: number;
  table_id: string | null;
  table_name: string;
  guests: number;
  service_type: string;
  area: string;
  items_summary: string;
  total: number;
  started_at: string;
  delivered_at: string;
  limit_minutes: number;
  actual_minutes: number;
  over_minutes: number;
  notes: string | null;
  created_at: string;
};

export const serviceLabel = (value: string) =>
  value === "mesa" ? "Mesa" : value === "llevar" ? "Para llevar" : value === "domicilio" ? "Domicilio" : value;

/**
 * Registra en la bitácora un pedido que superó el tiempo límite de preparación.
 * No hace nada si el pedido se entregó dentro del tiempo configurado.
 */
export async function logDelayIfLate(
  order: OrderWithItems,
  company: Pick<
    CompanySettings,
    "prep_limit_minutes" | "prep_limit_mesa" | "prep_limit_llevar" | "prep_limit_domicilio"
  > | null,
  tableName: string,
  deliveredAtIso: string,
) {
  const startedIso = order.kitchen_sent_at ?? order.created_at;
  const limit = prepLimitFor(company, order.service_type);
  const actual = Math.max(
    0,
    Math.round((new Date(deliveredAtIso).getTime() - new Date(startedIso).getTime()) / 60000),
  );
  if (actual <= limit) return null;

  const areas = new Set<string>();
  (order.order_items ?? []).forEach((i) => {
    const area = (i as unknown as { print_area?: string }).print_area;
    if (area) areas.add(area);
  });

  const items_summary = (order.order_items ?? [])
    .map((i) => `${i.quantity}x ${i.product_name}`)
    .join(", ");

  const { error } = await supabase.from("delay_logs").insert({
    order_id: order.id,
    folio: order.folio,
    table_id: order.table_id,
    table_name: tableName,
    guests: Number(order.guests ?? 0),
    service_type: order.service_type,
    area: areas.size ? Array.from(areas).join(" / ") : "cocina",
    items_summary,
    total: Number(order.total ?? 0),
    started_at: startedIso,
    delivered_at: deliveredAtIso,
    limit_minutes: limit,
    actual_minutes: actual,
    over_minutes: actual - limit,
  });
  if (error && !error.message.includes("duplicate")) return null;
  return { actual, limit };
}
