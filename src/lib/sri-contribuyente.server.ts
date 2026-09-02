/**
 * Consulta pública del catastro del SRI (solo servidor).
 * Devuelve los datos del contribuyente a partir de una cédula o RUC.
 * Nunca lanza por problemas de red: si el SRI no responde, devuelve `null`
 * para que la caja pueda seguir facturando con datos escritos a mano.
 */

const CATASTRO =
  "https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc";
const ESTABLECIMIENTOS =
  "https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Establecimiento/consultarEstablecimientosPorNumeroRuc";

export type ContribuyenteSri = {
  identificacion: string;
  tipoIdentificacion: "cedula" | "ruc";
  razonSocial: string;
  direccion: string | null;
  telefono: string | null;
  estado: string | null;
  tipoContribuyente: string | null;
  obligadoContabilidad: boolean;
  fuente: "sri";
};

const soloDigitos = (v: string) => String(v ?? "").replace(/\D/g, "");

const pedir = async (url: string, ms: number): Promise<unknown | null> => {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: control.signal,
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Costea POS)" },
    });
    if (!res.ok) return null;
    const texto = await res.text();
    if (!texto.trim().startsWith("[") && !texto.trim().startsWith("{")) return null;
    return JSON.parse(texto) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
};

/** Dirección de la matriz; el servicio es lento, por eso se consulta con poca espera. */
const direccionMatriz = async (ruc: string): Promise<{ direccion: string | null; telefono: string | null }> => {
  const data = await pedir(`${ESTABLECIMIENTOS}?numeroRuc=${ruc}`, 4000);
  const lista = Array.isArray(data)
    ? (data as Array<Record<string, unknown>>)
    : ((data as Record<string, unknown> | null)?.["establecimientos"] as Array<Record<string, unknown>> | undefined) ??
      [];
  const matriz =
    lista.find((e) => String(e["matriz"] ?? "").toUpperCase() === "SI") ?? lista[0] ?? null;
  if (!matriz) return { direccion: null, telefono: null };
  const dir = String(matriz["direccionCompleta"] ?? matriz["direccion"] ?? "").trim();
  const tel = String(matriz["numeroTelefono"] ?? matriz["telefono"] ?? "").trim();
  return { direccion: dir || null, telefono: tel || null };
};

export async function consultarContribuyenteSri(identificacionCruda: string): Promise<ContribuyenteSri | null> {
  const id = soloDigitos(identificacionCruda);
  if (id.length !== 10 && id.length !== 13) return null;
  const esCedula = id.length === 10;
  const ruc = esCedula ? `${id}001` : id;

  const data = await pedir(`${CATASTRO}?&ruc=${ruc}`, 8000);
  const fila = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (!fila || !fila["razonSocial"]) return null;

  const { direccion, telefono } = await direccionMatriz(ruc);

  return {
    identificacion: id,
    tipoIdentificacion: esCedula ? "cedula" : "ruc",
    razonSocial: String(fila["razonSocial"]).trim(),
    direccion,
    telefono,
    estado: fila["estadoContribuyenteRuc"] ? String(fila["estadoContribuyenteRuc"]) : null,
    tipoContribuyente: fila["tipoContribuyente"] ? String(fila["tipoContribuyente"]) : null,
    obligadoContabilidad: String(fila["obligadoLlevarContabilidad"] ?? "").toUpperCase() === "SI",
    fuente: "sri",
  };
}
