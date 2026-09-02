/**
 * Lectura de reportes pre-calculados (Mix, P&G y Panel General).
 *
 * La pantalla pinta al instante el resultado guardado y, si ya está vencido
 * (o no existe), pide al servidor que lo recalcule en segundo plano.
 */
import { supabase } from "@/integrations/supabase/client";
import { fechaEc } from "@/lib/fecha-ec";
import type { MixData } from "@/lib/sales-mix";
import type { PygData } from "@/lib/pyg";
import type { DashboardData } from "@/lib/dashboard-data";

export type SnapshotKind = "mix" | "pyg" | "dashboard";

/** Un guardado se considera vencido pasados 10 minutos. */
export const VENCE_MS = 10 * 60 * 1000;

export type Guardado<T> = { payload: T; computedAt: string; vencido: boolean };

/** Rango por defecto: del 1° del mes actual hasta hoy (hora de Ecuador). */
export function rangoPorDefecto() {
  const hoy = fechaEc(new Date());
  return { from: `${hoy.slice(0, 7)}-01`, to: hoy };
}

export async function leerSnapshot<T>(
  kind: SnapshotKind,
  from: string,
  to: string,
): Promise<Guardado<T> | null> {
  const { data, error } = await supabase
    .from("report_snapshots")
    .select("payload, computed_at")
    .eq("kind", kind)
    .eq("period_from", from)
    .eq("period_to", to)
    .maybeSingle();
  if (error || !data?.payload) return null;
  const computedAt = String(data.computed_at);
  const vencido = Date.now() - Date.parse(computedAt) > VENCE_MS;
  return { payload: data.payload as T, computedAt, vencido };
}

export const leerMixGuardado = (from: string, to: string) => leerSnapshot<MixData>("mix", from, to);
export const leerPygGuardado = (from: string, to: string) => leerSnapshot<PygData>("pyg", from, to);
export const leerPanelGuardado = (from: string, to: string) =>
  leerSnapshot<DashboardData>("dashboard", from, to);
