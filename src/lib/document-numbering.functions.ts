import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SriDocumentType = "factura" | "nota_debito" | "nota_credito";

export type SequenceBlock = {
  doc_type: SriDocumentType;
  establishment: string;
  emission_point: string;
  first_sequential: number;
  last_sequential: number;
};

export type NextSequencePeek = {
  establishment: string;
  emission_point: string;
  next_sequential: number;
};

export const reserveDocumentSequenceBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { docType: SriDocumentType; blockSize?: number }) => data)
  .handler(async ({ data, context }): Promise<SequenceBlock> => {
    const { data: rows, error } = await context.supabase.rpc("reserve_document_sequence_block", {
      _doc_type: data.docType,
      _block_size: data.blockSize ?? 100,
    });
    if (error) throw new Error(`No se pudo reservar la numeración: ${error.message}`);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("No se recibió un bloque de numeración");
    return {
      doc_type: row.doc_type as SriDocumentType,
      establishment: row.establishment,
      emission_point: row.emission_point,
      first_sequential: Number(row.first_sequential),
      last_sequential: Number(row.last_sequential),
    };
  });

/**
 * Configuración es la fuente única: devuelve EXACTAMENTE el número que toca
 * emitir, sin sumarle nada y sin mirar comprobantes anteriores.
 */
export const peekDocumentSequence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NextSequencePeek> => {
    const { data: company } = await context.supabase
      .from("company_settings")
      .select("establishment, emission_point, next_sequential")
      .order("created_at")
      .limit(1)
      .maybeSingle();

    const { data: seq } = await context.supabase
      .from("document_sequences")
      .select("establishment, emission_point, next_sequential")
      .eq("doc_type", "factura")
      .maybeSingle();

    return {
      establishment: company?.establishment || seq?.establishment || "001",
      emission_point: company?.emission_point || seq?.emission_point || "001",
      next_sequential: Math.max(Number(company?.next_sequential ?? seq?.next_sequential ?? 1), 1),
    };
  });

/**
 * Se llama DESPUÉS de guardar la venta: deja Configuración en el número
 * emitido + 1. Nunca retrocede.
 */
export const commitDocumentSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sequential: number }) => data)
  .handler(async ({ data, context }): Promise<{ next_sequential: number }> => {
    const siguiente = Math.max(Math.floor(Number(data.sequential) || 0) + 1, 1);

    // Caja también emite facturas: se valida el rol y luego se escribe con
    // privilegios, porque Configuración solo la puede editar el administrador.
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const permitido = (roles ?? []).some(
      (r) => r.role === "administrador" || r.role === "cajero",
    );
    if (!permitido) throw new Error("Solo caja o administración puede avanzar la numeración");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("id, next_sequential")
      .order("created_at")
      .limit(1)
      .maybeSingle();

    let actual = Number(company?.next_sequential ?? 0);
    if (company && actual < siguiente) {
      const { error } = await supabaseAdmin
        .from("company_settings")
        .update({ next_sequential: siguiente })
        .eq("id", company.id);
      if (error) throw new Error(`No se pudo avanzar la numeración: ${error.message}`);
      actual = siguiente;
    }

    const { data: seq } = await supabaseAdmin
      .from("document_sequences")
      .select("next_sequential")
      .eq("doc_type", "factura")
      .maybeSingle();
    if (seq && Number(seq.next_sequential ?? 0) < siguiente) {
      await supabaseAdmin
        .from("document_sequences")
        .update({ next_sequential: siguiente })
        .eq("doc_type", "factura");
    }

    return { next_sequential: Math.max(siguiente, actual) };
  });


