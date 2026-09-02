import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const validateId = (input: { purchaseId: string }) => {
  if (!input?.purchaseId) throw new Error("Compra requerida");
  return { purchaseId: input.purchaseId };
};


/** Revierte stock y costos de una compra. Solo Administrador. */
export const revertPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateId)
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "administrador")
      .maybeSingle();
    if (!admin) throw new Error("Solo el Administrador puede modificar compras.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("revert_purchase", { _purchase_id: data.purchaseId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Elimina una compra y revierte todos sus movimientos. Solo Administrador. */
export const deletePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateId)
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "administrador")
      .maybeSingle();
    if (!admin) throw new Error("Solo el Administrador puede eliminar compras.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("delete_purchase", { _purchase_id: data.purchaseId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
