import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cierra el inventario del día: el inventario físico ajustado pasa a ser el
 * inventario inicial del día siguiente con su costo de última compra.
 * Exclusivo del rol Super Administrador.
 */
export const closeInventoryDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessDate: string; notes?: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.businessDate ?? "")) {
      throw new Error("Fecha de cierre inválida");
    }
    return { businessDate: input.businessDate, notes: input.notes ?? "" };
  })
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "administrador")
      .maybeSingle();
    if (!admin) throw new Error("Solo el Super Administrador puede cerrar el inventario del día.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("close_inventory_day", {
      _business_date: data.businessDate,
      _notes: data.notes || undefined,
    });
    if (error) throw new Error(error.message);

    const row = Array.isArray(result) ? result[0] : result;
    return {
      businessDate: data.businessDate,
      itemsCount: Number(row?.items_count ?? 0),
      totalValue: Number(row?.total_value ?? 0),
    };
  });
