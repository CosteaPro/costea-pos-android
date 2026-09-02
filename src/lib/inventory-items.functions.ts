import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const validateId = (input: { itemId: string }) => {
  if (!input?.itemId) throw new Error("Ítem requerido");
  return { itemId: input.itemId };
};

/** Verifica que quien llama sea el Propietario / Super Administrador del sistema. */
async function assertOwner(context: { supabase: { from: (t: string) => any }; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role, is_owner")
    .eq("user_id", context.userId)
    .eq("role", "administrador")
    .eq("is_owner", true)
    .maybeSingle();
  if (!data) {
    throw new Error("Solo el Super Administrador / Propietario puede eliminar ítems.");
  }
}

/**
 * Eliminación lógica de un ítem de inventario.
 * El registro se conserva: el historial queda intacto y el código nunca se reutiliza.
 */
export const deleteInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateId)
  .handler(async ({ data, context }) => {
    await assertOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("soft_delete_inventory_item", {
      _item_id: data.itemId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Restaura un ítem eliminado (conserva su mismo código). */
export const restoreInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateId)
  .handler(async ({ data, context }) => {
    await assertOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("restore_inventory_item", { _item_id: data.itemId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
