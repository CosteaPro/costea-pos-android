import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { autorizarCaja } from "@/lib/caja-auth.server";
import { ingerirDocumentosCaja, type DocumentoCaja } from "@/lib/caja-ingesta.server";

/**
 * Recepción de documentos emitidos por una caja de escritorio.
 * El servidor SOLO recibe y consolida: la numeración es de la caja.
 * Cada venta llega como ORDEN + FACTURA y se confirma documento por documento.
 */
const documento = z.object({
  tipo: z.string().max(20),
  doc_number: z.string().min(1).max(40),
  venta_id: z.string().max(60).nullable().optional(),
  clave_acceso: z.string().max(49).nullable().optional(),
  fecha_emision: z.string().min(4).max(40),
  cliente_identificacion: z.string().max(30).nullable().optional(),
  cliente_nombre: z.string().max(200).nullable().optional(),
  cliente_email: z.string().max(200).nullable().optional(),
  subtotal: z.number(),
  iva: z.number(),
  total: z.number(),
  forma_pago: z.string().max(40).nullable().optional(),
  estado_sri: z.string().max(30).default("pendiente"),
  numero_autorizacion: z.string().max(60).nullable().optional(),
  fecha_autorizacion: z.string().max(40).nullable().optional(),
  mensajes_sri: z.string().max(2000).nullable().optional(),
  xml_firmado: z.string().max(1_000_000).nullable().optional(),
  xml_autorizado: z.string().max(1_000_000).nullable().optional(),
  mesa: z.string().max(60).nullable().optional(),
  mesero: z.string().max(120).nullable().optional(),
  orden_numero: z.number().int().nullable().optional(),
  doc_relacionado: z.string().max(40).nullable().optional(),
  items: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
});

const cuerpo = z.object({
  documentos: z.array(documento).max(500),
  totales: z
    .object({
      fecha: z.string().min(8).max(10),
      ventas: z.number(),
      transacciones: z.number().int(),
      formas_pago: z.record(z.string(), z.number()).default({}),
    })
    .optional(),
});

export const Route = createFileRoute("/api/public/caja/sincronizar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await autorizarCaja(request);
        if ("error" in auth) return json({ error: auth.error }, auth.status);
        const codigo = auth.caja.codigo;

        const parsed = cuerpo.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Datos inválidos" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // La empresa la manda la caja autorizada, nunca la sesión del navegador.
        const empresaId = auth.caja.company_id;
        const sucursalId = auth.caja.branch_id;

        const { data: empresa } = await supabaseAdmin
          .from("company_settings")
          .select("iva_rate")
          .eq("company_id", empresaId)
          .maybeSingle();

        const confirmaciones = await ingerirDocumentosCaja(
          supabaseAdmin,
          codigo,
          parsed.data.documentos as DocumentoCaja[],
          Number(empresa?.iva_rate ?? 15),
          empresaId,
          sucursalId,
        );

        if (parsed.data.totales) {
          const t = parsed.data.totales;
          await supabaseAdmin.from("caja_totales_diarios").upsert(
            {
              company_id: empresaId,
              branch_id: sucursalId,
              caja_codigo: codigo,
              fecha: t.fecha,
              ventas: t.ventas,
              transacciones: t.transacciones,
              formas_pago: t.formas_pago as never,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "company_id,caja_codigo,fecha" },
          );
        }

        await supabaseAdmin
          .from("cajas")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("codigo", codigo);

        // Correo automático de la factura autorizada (mismo servicio del sistema web).
        const origen = new URL(request.url).origin;
        const autorizadas = parsed.data.documentos.filter(
          (d) => d.tipo === "factura" && d.estado_sri === "autorizado" && d.cliente_email,
        );
        if (autorizadas.length > 0) {
          const { enviarFacturaCajaAutorizada } = await import("@/lib/caja-email.server");
          await Promise.all(
            autorizadas.map((d) =>
              enviarFacturaCajaAutorizada(
                {
                  claveAcceso: d.clave_acceso ?? "",
                  docNumber: d.doc_number,
                  fechaEmision: d.fecha_emision,
                  total: d.total,
                  clienteNombre: d.cliente_nombre ?? null,
                  clienteEmail: d.cliente_email ?? null,
                  numeroAutorizacion: d.numero_autorizacion ?? null,
                },
                origen,
              ).catch(() => null),
            ),
          );
        }

        const ok = confirmaciones.filter((c) => c.registrado && !c.error);
        return json({
          recibidos: parsed.data.documentos.length,
          registrados: ok.length,
          ordenes: ok.filter((c) => c.tipo !== "factura").length,
          facturas: ok.filter((c) => c.tipo === "factura").length,
          confirmaciones,
        });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
