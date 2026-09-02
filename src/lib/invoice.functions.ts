import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InvoiceSequential = {
  establishment: string;
  emission_point: string;
  sequential: number;
};

/** Reserva el siguiente secuencial de factura. Solo administradores o cajeros. */
export const nextInvoiceSequential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvoiceSequential> => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const allowed = (roles ?? []).some(
      (r) => r.role === "administrador" || r.role === "cajero",
    );
    if (!allowed) throw new Error("Solo caja o administración puede facturar");


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("next_invoice_sequential");
    if (error) throw new Error(`No se pudo reservar el secuencial: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("No se pudo obtener el secuencial");
    return {
      establishment: row.establishment,
      emission_point: row.emission_point,
      sequential: Number(row.sequential),
    };
  });
