/**
 * Descuento de inventario por venta.
 *
 * REGLA DE ORO:
 *  • Vender = consumir. SIEMPRE. Aunque el inventario esté en 0 o quede negativo.
 *  • El CÓDIGO DE VENTA del producto es fijo: la receta solo se ASOCIA a él (recipes.product_id).
 *  • Al cobrar un pedido: cantidad vendida × cantidad de cada ingrediente = descuento de inventario,
 *    convirtiendo la unidad de receta a la unidad de inventario antes de restar.
 *  • Las subrecetas NO se descomponen: bajan como un solo producto terminado.
 *    Sus ingredientes solo se descuentan al registrar la PRODUCCIÓN.
 *
 * El cálculo vive en la base de datos (funciones apply_sales_consumption /
 * recalc_sales_consumption) para que se aplique con los mismos permisos sin
 * importar el rol del usuario que cobra, y sea idempotente por pedido.
 */
import { supabase } from "@/integrations/supabase/client";

/** Descuenta los insumos de un pedido cobrado. Idempotente por pedido. */
export async function descontarInventarioPorVenta(
  orderId: string,
  _opts: { userId?: string | null; folio?: number | null } = {},
): Promise<number> {
  const { data, error } = await supabase.rpc("apply_sales_consumption", {
    _order_id: orderId,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * Recalcula el consumo de TODAS las ventas ya cobradas.
 * Los pedidos que ya descontaron se omiten (idempotente).
 */
export async function recalcularConsumoHistorico(
  opts: { desde?: string | null; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ pedidos: number; movimientos: number }> {
  const { data, error } = await supabase.rpc("recalc_sales_consumption", {
    _desde: opts.desde ?? undefined,
  });

  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  const pedidos = Number(row?.pedidos ?? 0);
  const movimientos = Number(row?.movimientos ?? 0);
  opts.onProgress?.(pedidos, pedidos);
  return { pedidos, movimientos };
}
