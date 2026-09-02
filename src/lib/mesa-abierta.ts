import { supabase } from "@/integrations/supabase/client";
import { desdeEc, hastaEc } from "@/lib/fecha-ec";

/** Estados en los que una mesa sigue abierta y admite más productos. */
export const ESTADOS_ABIERTOS = ["abierto", "en_cocina", "listo"] as const;

export type PedidoAbierto = {
  id: string;
  folio: number;
  total: number;
};

/**
 * Busca la cuenta abierta de una mesa (del día actual, Ecuador UTC-5).
 * Una mesa solo se cierra al cobrar: mientras no esté pagada ni anulada,
 * el mesero vuelve a abrir la misma comanda y agrega más productos.
 */
export async function buscarPedidoAbierto(tableId: string): Promise<PedidoAbierto | null> {
  if (!tableId) return null;
  const { data } = await supabase
    .from("orders")
    .select("id, folio, total")
    .eq("table_id", tableId)
    .in("status", ["abierto", "en_cocina", "listo"])
    .gte("created_at", desdeEc())
    .lte("created_at", hastaEc())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, folio: Number(data.folio), total: Number(data.total) };
}

/** Productos ya cargados en una cuenta abierta. */
export async function itemsDePedido(orderId: string) {
  const { data } = await supabase
    .from("order_items")
    .select("id, product_id, product_name, unit_price, quantity, notes, status")
    .eq("order_id", orderId)
    .order("created_at");
  return data ?? [];
}
