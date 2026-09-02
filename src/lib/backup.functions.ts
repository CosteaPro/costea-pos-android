import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_TABLES = [
  "company_settings",
  "measurement_units",
  "categories",
  "products",
  "restaurant_tables",
  "customers",
  "suppliers",
  "inventory_categories",
  "inventory_items",
  "item_cost_history",
  "purchases",
  "purchase_items",
  "inventory_movements",
  "inventory_opening_balances",
  "inventory_day_closures",
  "orders",
  "order_items",
  "cash_closures",
  "delay_logs",
] as const;

type AllowedTable = (typeof ALLOWED_TABLES)[number];

const assertAdmin = async (context: { supabase: { from: (t: string) => any }; userId: string }) => {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "administrador")
    .maybeSingle();
  if (!data) throw new Error("Solo el Super Administrador puede importar o exportar respaldos.");
};

/**
 * Importa un bloque de filas de una tabla del respaldo.
 * Usa el id original para evitar duplicados y conservar el historial intacto.
 */
export const importBackupTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { table: string; rows: Record<string, unknown>[] }) => {
    if (!ALLOWED_TABLES.includes(input?.table as AllowedTable)) {
      throw new Error(`Tabla no permitida en la importación: ${input?.table}`);
    }
    if (!Array.isArray(input.rows)) throw new Error("Datos inválidos");
    return { table: input.table as AllowedTable, rows: input.rows };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.rows.length === 0) return { table: data.table, inserted: 0, skipped: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Se omiten filas ya existentes (mismo id) para no duplicar ni pisar historial.
    const ids = data.rows.map((r) => r["id"]).filter(Boolean) as string[];
    let existing = new Set<string>();
    if (ids.length) {
      const { data: found } = await supabaseAdmin
        .from(data.table)
        .select("id")
        .in("id", ids);
      existing = new Set((found ?? []).map((r: { id: string }) => r.id));
    }
    const nuevas = data.rows.filter((r) => !existing.has(String(r["id"])));
    if (nuevas.length === 0) {
      return { table: data.table, inserted: 0, skipped: data.rows.length };
    }

    const { error } = await supabaseAdmin.from(data.table).insert(nuevas as never);
    if (error) throw new Error(`${data.table}: ${error.message}`);
    return { table: data.table, inserted: nuevas.length, skipped: data.rows.length - nuevas.length };
  });

/** Reanuda la numeración secuencial desde el último registro existente. */
export const resyncSequences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("resync_sequences");
    if (error) throw new Error(error.message);
    return data as Record<string, number>;
  });
