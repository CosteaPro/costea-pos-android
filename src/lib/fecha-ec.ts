/**
 * Utilidades de fecha para la zona horaria oficial de Ecuador (UTC-5).
 *
 * Regla: los límites de rango SIEMPRE deben salir completos
 * (`AAAA-MM-DDTHH:MM:SS-05:00`). Si la fecha viene vacía o incompleta,
 * nunca se debe generar algo como `T00:00:00-05:00`, porque Postgres
 * responde "invalid input syntax for type timestamp with time zone".
 */
import { ecBusinessDate } from "@/lib/caja";

/** Normaliza cualquier entrada a AAAA-MM-DD; si no es válida devuelve hoy (UTC-5). */
export function fechaEc(d?: string | Date | null): string {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return ecBusinessDate(d);
  const s = String(d ?? "").trim();
  // AAAA-MM-DD (posiblemente con hora pegada)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // DD/MM/AAAA
  const ec = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ec) return `${ec[3]}-${ec[2]}-${ec[1]}`;
  return ecBusinessDate(new Date());
}

/** Inicio del día contable en Ecuador: AAAA-MM-DDT00:00:00-05:00 */
export const desdeEc = (d?: string | Date | null) => `${fechaEc(d)}T00:00:00-05:00`;

/** Fin del día contable en Ecuador: AAAA-MM-DDT23:59:59.999-05:00 */
export const hastaEc = (d?: string | Date | null) => `${fechaEc(d)}T23:59:59.999-05:00`;

/** Indica si la cadena es una fecha AAAA-MM-DD utilizable. */
export const esFechaValida = (d?: string | null) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
