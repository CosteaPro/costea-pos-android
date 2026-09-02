/**
 * Consulta de datos del contribuyente en el SRI desde la interfaz.
 * Funciona igual en el panel central y en la caja descargable.
 * Si no hay internet o el SRI no responde, devuelve null y los datos
 * se escriben a mano sin bloquear la facturación.
 */
export type ContribuyenteSriCliente = {
  identificacion: string;
  tipoIdentificacion: "cedula" | "ruc";
  razonSocial: string;
  direccion: string | null;
  telefono: string | null;
  estado: string | null;
};

export async function consultarContribuyente(
  identificacion: string,
): Promise<ContribuyenteSriCliente | null> {
  const id = String(identificacion ?? "").replace(/\D/g, "");
  if (id.length !== 10 && id.length !== 13) return null;
  try {
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), 12000);
    const res = await fetch(`/api/public/sri/contribuyente?identificacion=${id}`, {
      signal: control.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as { encontrado?: boolean; contribuyente?: ContribuyenteSriCliente | null };
    return json.encontrado && json.contribuyente ? json.contribuyente : null;
  } catch {
    return null;
  }
}
