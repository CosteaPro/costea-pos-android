/**
 * Ingesta de las ventas que llegan desde las cajas de escritorio.
 *
 * Cada venta llega como DOS registros independientes pero asociados:
 *   · la ORDEN   → productos y cantidades  → descuenta inventario
 *   · la FACTURA → clave de acceso, cliente, IVA, forma de pago → contabilidad
 *
 * En el sistema central ambos se consolidan en UN solo pedido (public.orders)
 * identificado por la venta (client_uid), para que el inventario se descuente
 * una sola vez y las ventas no se dupliquen en reportes, P&G ni cierres.
 * El detalle crudo de cada documento queda en public.caja_documentos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

export type DocumentoCaja = {
  tipo: string;
  doc_number: string;
  venta_id?: string | null;
  clave_acceso?: string | null;
  fecha_emision: string;
  cliente_identificacion?: string | null;
  cliente_nombre?: string | null;
  cliente_email?: string | null;
  subtotal: number;
  iva: number;
  total: number;
  forma_pago?: string | null;
  estado_sri: string;
  numero_autorizacion?: string | null;
  fecha_autorizacion?: string | null;
  mensajes_sri?: string | null;
  xml_firmado?: string | null;
  mesa?: string | null;
  mesero?: string | null;
  orden_numero?: number | null;
  doc_relacionado?: string | null;
  items: Array<Record<string, unknown>>;
};

export type ConfirmacionDoc = {
  tipo: string;
  doc_number: string;
  registrado: boolean;
  order_id: string | null;
  inventario_descontado: number;
  error: string | null;
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const itemLinea = (raw: Record<string, unknown>) => ({
  codigo: String(raw["codigo"] ?? raw["code"] ?? "").trim(),
  nombre: String(raw["descripcion"] ?? raw["nombre"] ?? raw["product_name"] ?? "Producto"),
  cantidad: Math.max(num(raw["cantidad"] ?? raw["quantity"]), 0),
  precio: num(raw["precioUnitario"] ?? raw["unit_price"] ?? raw["precio"]),
});

/** Clave única de la venta: agrupa la orden y su factura. */
const claveVenta = (caja: string, d: DocumentoCaja) =>
  `caja:${caja}:${d.venta_id || d.doc_relacionado || `${d.tipo}:${d.doc_number}`}`;

/**
 * Registra los documentos de una caja: guarda el crudo, consolida el pedido
 * y descuenta el inventario. Devuelve una confirmación por documento.
 */
export async function ingerirDocumentosCaja(
  supabaseAdmin: Admin,
  cajaCodigo: string,
  documentos: DocumentoCaja[],
  ivaRate: number,
  /** Empresa y sucursal dueñas de la caja: todo lo recibido se guarda dentro de ellas. */
  empresaId: string,
  sucursalId: string | null,
): Promise<ConfirmacionDoc[]> {
  const confirmaciones = new Map<string, ConfirmacionDoc>();
  const llave = (d: DocumentoCaja) => `${d.tipo}|${d.doc_number}`;
  for (const d of documentos) {
    confirmaciones.set(llave(d), {
      tipo: d.tipo,
      doc_number: d.doc_number,
      registrado: false,
      order_id: null,
      inventario_descontado: 0,
      error: null,
    });
  }

  // 1) Documentos crudos de la caja (auditoría y respaldo del XML).
  if (documentos.length > 0) {
    const filas = documentos.map((d) => ({
      company_id: empresaId,
      branch_id: sucursalId,
      caja_codigo: cajaCodigo,
      tipo: d.tipo,
      doc_number: d.doc_number,
      clave_acceso: d.clave_acceso ?? null,
      fecha_emision: d.fecha_emision,
      cliente_identificacion: d.cliente_identificacion ?? null,
      cliente_nombre: d.cliente_nombre ?? null,
      cliente_email: d.cliente_email ?? null,
      subtotal: d.subtotal,
      iva: d.iva,
      total: d.total,
      forma_pago: d.forma_pago ?? null,
      estado_sri: d.estado_sri,
      numero_autorizacion: d.numero_autorizacion ?? null,
      fecha_autorizacion: d.fecha_autorizacion ?? null,
      mensajes_sri: d.mensajes_sri ?? null,
      xml_firmado: d.xml_firmado ?? null,
      mesa: d.mesa ?? null,
      mesero: d.mesero ?? null,
      orden_numero: d.orden_numero ?? null,
      doc_relacionado: d.doc_relacionado ?? null,
      items: d.items as never,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin
      .from("caja_documentos")
      .upsert(filas, { onConflict: "company_id,caja_codigo,tipo,doc_number" });
    if (error) {
      for (const c of confirmaciones.values()) c.error = error.message;
      return [...confirmaciones.values()];
    }
    for (const c of confirmaciones.values()) c.registrado = true;
  }

  // 1.b) Órdenes anuladas en la caja: se marcan como anuladas también en el central
  // y dejan de sumar en los reportes (nunca se borran).
  for (const d of documentos) {
    if (d.estado_sri !== "anulado") continue;
    const clave = claveVenta(cajaCodigo, d);
    await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelado",
        doc_status: "anulado",
        void_reason: d.mensajes_sri ?? "Anulada en la caja",
        voided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", empresaId)
      .eq("client_uid", clave);
  }

  // 2) Consolidación por venta: orden + factura → un solo pedido.
  const ventas = new Map<string, DocumentoCaja[]>();
  for (const d of documentos) {
    if (d.estado_sri === "rechazado" || d.estado_sri === "anulado") continue;
    const k = claveVenta(cajaCodigo, d);
    ventas.set(k, [...(ventas.get(k) ?? []), d]);
  }

  for (const [clientUid, docs] of ventas) {
    const factura = docs.find((d) => d.tipo === "factura") ?? null;
    const orden = docs.find((d) => d.tipo !== "factura") ?? null;
    const fiscal = factura ?? orden;
    const conItems = docs.find((d) => (d.items ?? []).length > 0) ?? fiscal;
    if (!fiscal) continue;

    try {
      const orderId = await consolidarPedido(supabaseAdmin, {
        clientUid,
        cajaCodigo,
        factura,
        orden,
        fiscal,
        items: (conItems?.items ?? []).map((i) => itemLinea(i as Record<string, unknown>)),
        ivaRate,
        empresaId,
        sucursalId,
      });

      let consumidos = 0;
      const { data: mov } = await supabaseAdmin.rpc("apply_sales_consumption", {
        _order_id: orderId,
      });
      consumidos = Number(mov ?? 0);

      for (const d of docs) {
        const c = confirmaciones.get(llave(d));
        if (c) {
          c.order_id = orderId;
          c.inventario_descontado = consumidos;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const d of docs) {
        const c = confirmaciones.get(llave(d));
        if (c) c.error = msg;
      }
    }
  }

  return [...confirmaciones.values()];
}

async function consolidarPedido(
  supabaseAdmin: Admin,
  input: {
    clientUid: string;
    cajaCodigo: string;
    factura: DocumentoCaja | null;
    orden: DocumentoCaja | null;
    fiscal: DocumentoCaja;
    items: Array<{ codigo: string; nombre: string; cantidad: number; precio: number }>;
    ivaRate: number;
    empresaId: string;
    sucursalId: string | null;
  },
): Promise<string> {
  const { clientUid, cajaCodigo, factura, orden, fiscal, items, ivaRate, empresaId, sucursalId } =
    input;
  const emitido = new Date(fiscal.fecha_emision).toISOString();

  const pedido = {
    company_id: empresaId,
    branch_id: sucursalId,
    client_uid: clientUid,
    origin: "caja",
    sales_channel: "caja",
    service_type: orden?.mesa || factura?.mesa ? "mesa" : "llevar",
    customer_name: fiscal.cliente_nombre ?? null,
    customer_id_number: fiscal.cliente_identificacion ?? null,
    customer_email: fiscal.cliente_email ?? null,
    status: "pagado" as const,
    doc_status: factura ? "emitido" : "interno",
    doc_type: factura ? "factura" : "nota_venta",
    doc_number: factura ? factura.doc_number : (orden?.doc_number ?? null),
    access_key: factura?.clave_acceso ?? null,
    authorization_number: factura?.numero_autorizacion ?? null,
    sri_status: factura ? factura.estado_sri : "no_aplica",
    sri_message: factura?.mensajes_sri ?? null,
    sri_authorized_at: factura?.fecha_autorizacion ? emitido : null,
    xml_signed: factura?.xml_firmado ?? null,
    xml_authorized: (factura as Record<string, any> | undefined)?.xml_autorizado ?? null,
    payment_method: fiscal.forma_pago ?? "efectivo",
    subtotal: num(fiscal.subtotal),
    tax_amount: num(fiscal.iva),
    total: num(fiscal.total),
    iva_rate: ivaRate,
    notes: [orden?.doc_number ? `Orden ${orden.doc_number}` : null, orden?.mesero ? `Mesero ${orden.mesero}` : null]
      .filter(Boolean)
      .join(" · ") || `Caja ${cajaCodigo}`,
    issued_at_device: emitido,
    paid_at: emitido,
    created_at: emitido,
    updated_at: new Date().toISOString(),
  };

  // El índice único de client_uid es parcial: se resuelve buscar → actualizar/insertar.
  const { data: existente } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("company_id", empresaId)
    .eq("client_uid", clientUid)
    .maybeSingle();

  let orderId: string;
  if (existente) {
    orderId = existente.id;
    const { error } = await supabaseAdmin
      .from("orders")
      .update(pedido as never)
      .eq("id", orderId);
    if (error) throw new Error(error.message);
  } else {
    const { data: fila, error } = await supabaseAdmin
      .from("orders")
      .insert(pedido as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    orderId = fila.id as string;
  }

  // Detalle del pedido (se reemplaza para mantenerlo igual al de la caja).
  if (items.length > 0) {
    const codigos = [...new Set(items.map((i) => i.codigo).filter(Boolean))];
    const { data: productos } = codigos.length
      ? await supabaseAdmin
          .from("products")
          .select("id, code")
          .eq("company_id", empresaId)
          .in("code", codigos)
      : { data: [] as Array<{ id: string; code: string | null }> };
    const porCodigo = new Map((productos ?? []).map((p) => [p.code ?? "", p.id]));

    await supabaseAdmin.from("order_items").delete().eq("order_id", orderId);
    const { error: errItems } = await supabaseAdmin.from("order_items").insert(
      items.map((i) => ({
        company_id: empresaId,
        branch_id: sucursalId,
        order_id: orderId,
        product_id: porCodigo.get(i.codigo) ?? null,
        product_name: i.nombre,
        unit_price: i.precio,
        quantity: Math.max(Math.round(i.cantidad), 1),
        status: "entregado" as const,
        tax_rate: ivaRate,
      })),
    );
    if (errItems) throw new Error(errItems.message);
  }

  // Enlaza los documentos crudos con el pedido consolidado.
  const numeros = [factura?.doc_number, orden?.doc_number].filter(Boolean) as string[];
  if (numeros.length > 0) {
    await supabaseAdmin
      .from("caja_documentos")
      .update({ order_id: orderId })
      .eq("company_id", empresaId)
      .eq("caja_codigo", cajaCodigo)
      .in("doc_number", numeros);
  }

  return orderId;
}
