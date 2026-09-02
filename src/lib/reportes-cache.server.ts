/**
 * Pre-cálculo de reportes (Mix de ventas, P&G y Panel General).
 *
 * El cálculo pesado corre en el servidor y se guarda en `report_snapshots`:
 *   • el día indicado ("dia")
 *   • el acumulado del mes hasta ese día ("mes_a_fecha")
 * Cuando el usuario abre una pantalla con el rango por defecto, el resultado
 * guardado se muestra al instante.
 *
 * Cada reporte guardado lleva SIEMPRE la empresa a la que pertenece: nunca se
 * guarda con la empresa vacía.
 */
import { computeSalesMix } from "@/lib/sales-mix";
import { loadPyg } from "@/lib/pyg";
import { loadDashboardData } from "@/lib/dashboard-data";
import { fechaEc } from "@/lib/fecha-ec";
import type { Db } from "@/lib/db";

export type SnapshotKind = "mix" | "pyg" | "dashboard";
export type SnapshotScope = "dia" | "mes_a_fecha";

const primeroDelMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

function exigirEmpresa(companyId: string | null | undefined): string {
  if (!companyId) {
    throw new Error(
      "No se pudo determinar la empresa del reporte. Vuelve a iniciar sesión e inténtalo de nuevo.",
    );
  }
  return companyId;
}

async function guardar(
  db: Db,
  companyId: string,
  kind: SnapshotKind,
  scope: SnapshotScope,
  from: string,
  to: string,
  payload: unknown,
) {
  const { error } = await db.from("report_snapshots").upsert(
    {
      company_id: companyId,
      kind,
      scope,
      business_date: to,
      period_from: from,
      period_to: to,
      payload: payload as never,
      computed_at: new Date().toISOString(),
    },
    // La clave incluye empresa y sucursal: cada cliente tiene su propio reporte
    // guardado para el mismo período.
    { onConflict: "company_id,branch_id,kind,scope,period_from,period_to" },
  );
  if (error) throw new Error(error.message);
}

/** Calcula un reporte concreto para el rango pedido. */
export async function calcularReporte(db: Db, kind: SnapshotKind, from: string, to: string) {
  if (kind === "mix") return computeSalesMix(from, to, db);
  if (kind === "dashboard") return loadDashboardData(from, to, db);
  return loadPyg(Number(to.slice(0, 4)), Number(to.slice(5, 7)), to, db);
}

/** Calcula, guarda y devuelve el reporte del rango indicado. */
export async function calcularYGuardar(
  db: Db,
  companyId: string | null | undefined,
  kind: SnapshotKind,
  from: string,
  to: string,
) {
  const empresa = exigirEmpresa(companyId);
  const payload = await calcularReporte(db, kind, from, to);
  const scope: SnapshotScope = from === to ? "dia" : "mes_a_fecha";
  await guardar(db, empresa, kind, scope, from, to, payload);
  return payload;
}

/** Calcula y guarda Mix, P&G y Panel del día y del acumulado mensual. */
export async function recalcularSnapshots(
  db: Db,
  companyId: string | null | undefined,
  fecha?: string,
) {
  const empresa = exigirEmpresa(companyId);
  const dia = fechaEc(fecha);
  const inicio = primeroDelMes(dia);

  await calcularYGuardar(db, empresa, "mix", dia, dia);
  await calcularYGuardar(db, empresa, "mix", inicio, dia);
  await calcularYGuardar(db, empresa, "pyg", inicio, dia);
  await calcularYGuardar(db, empresa, "dashboard", inicio, dia);

  return { dia, desde: inicio, companyId: empresa };
}
