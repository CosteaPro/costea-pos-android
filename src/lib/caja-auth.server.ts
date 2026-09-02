/**
 * Autorización de cajas de escritorio.
 * La caja se identifica con Establecimiento + Punto de emisión + Clave de sincronización
 * (se acepta también el código de caja por compatibilidad con instalaciones antiguas).
 */
export type CajaAutorizada = {
  codigo: string;
  nombre: string;
  local: string;
  establishment: string;
  emission_point: string;
  /** Empresa y sucursal dueñas de la caja: mandan sobre todo lo que la caja envía. */
  company_id: string;
  branch_id: string | null;
};

const NO_AUTORIZADA =
  "Caja no autorizada. Regístrela primero en el panel administrativo o verifique la clave de sincronización.";

export async function autorizarCaja(
  request: Request,
): Promise<{ caja: CajaAutorizada } | { error: string; status: number }> {
  const codigo = (request.headers.get("x-caja-codigo") ?? "").trim();
  const clave = (request.headers.get("x-caja-clave") ?? "").trim();
  const establecimiento = (request.headers.get("x-caja-establecimiento") ?? "").trim();
  const punto = (request.headers.get("x-caja-punto") ?? "").trim();
  const tipoLocal = (request.headers.get("x-caja-tipo-local") ?? "").trim();

  if (!clave || (!codigo && !(establecimiento && punto)))
    return { error: "Faltan credenciales de la caja", status: 401 };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("cajas")
    .select("codigo, nombre, local, establishment, emission_point, sync_key, activa, company_id, branch_id");

  query =
    establecimiento && punto
      ? query.eq("establishment", establecimiento).eq("emission_point", punto)
      : query.eq("codigo", codigo);

  const { data: caja } = await query.maybeSingle();

  if (!caja || caja.sync_key !== clave) return { error: NO_AUTORIZADA, status: 401 };
  if (!caja.activa)
    return { error: "La caja está desactivada. Contacte al administrador.", status: 403 };

  // El tipo de local lo decide ÚNICAMENTE la caja: el servidor solo lo almacena.
  const valido = ["rapida", "restaurante", "patio"].includes(tipoLocal);
  await supabaseAdmin
    .from("cajas")
    .update({
      last_seen_at: new Date().toISOString(),
      ...(valido ? { tipo_local: tipoLocal } : {}),
    })
    .eq("codigo", caja.codigo);

  return {
    caja: {
      codigo: caja.codigo,
      nombre: caja.nombre,
      local: caja.local,
      establishment: caja.establishment,
      emission_point: caja.emission_point,
      company_id: caja.company_id,
      branch_id: caja.branch_id ?? null,
    },
  };
}
