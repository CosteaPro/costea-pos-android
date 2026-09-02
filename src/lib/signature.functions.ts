import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SignatureStatus = { id: string | null; hasFile: boolean; hasPassword: boolean; path: string | null };

/**
 * Indica si la firma electrónica está completa sin exponer nunca la contraseña del .p12.
 * Solo administradores y cajeros (quienes facturan) pueden consultarlo.
 */
export const getSignatureStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SignatureStatus> => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const allowed = (roles ?? []).some(
      (r) => r.role === "administrador" || r.role === "cajero",
    );
    if (!allowed) throw new Error("Sin permisos para consultar la firma electrónica");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("company_signature")
      .select("id, p12_path, p12_password")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return {
      id: data?.id ?? null,
      hasFile: Boolean(data?.p12_path),
      hasPassword: Boolean(data?.p12_password?.trim()),
      path: data?.p12_path ?? null,
    };
  });
