/** Catálogo de módulos y planes de la plataforma Costea Pro (uso compartido cliente/servidor). */

export type PlanPlataforma = "junior" | "pro" | "premium";
export type EstadoEmpresa = "activa" | "prueba" | "suspendida";

export const PLANES: { value: PlanPlataforma; label: string }[] = [
  { value: "junior", label: "Junior" },
  { value: "pro", label: "Pro" },
  { value: "premium", label: "Premium" },
];

export const ESTADOS: { value: EstadoEmpresa; label: string }[] = [
  { value: "activa", label: "Activa" },
  { value: "prueba", label: "En prueba" },
  { value: "suspendida", label: "Suspendida" },
];

export const REGIONES = ["Quito", "Guayaquil", "Cuenca", "Quevedo", "Ambato", "Manta", "Otra"];

/** Módulos que se pueden encender o apagar por empresa. */
export const MODULOS: { key: string; label: string }[] = [
  { key: "cajas", label: "Cajas y punto de venta" },
  { key: "facturacion", label: "Facturación electrónica SRI" },
  { key: "app_meseros", label: "Aplicación de meseros" },
  { key: "inventario", label: "Inventario" },
  { key: "compras", label: "Compras y proveedores" },
  { key: "recetas", label: "Recetas y producción" },
  { key: "mix_ventas", label: "Mix de ventas" },
  { key: "pyg", label: "Pérdidas y ganancias" },
  { key: "contabilidad", label: "Contabilidad" },
  { key: "nomina", label: "Nómina y talento humano" },
  { key: "exportacion", label: "Exportación a Excel" },
  { key: "auditoria_local", label: "Auditoría local" },
  { key: "ia_asistente", label: "Asistente inteligente y Telegram" },
];

/** Conjunto de módulos que propone cada plan (se puede ajustar por cliente). */
export const MODULOS_POR_PLAN: Record<PlanPlataforma, string[]> = {
  junior: ["cajas", "facturacion", "app_meseros", "exportacion"],
  pro: [
    "cajas",
    "facturacion",
    "app_meseros",
    "inventario",
    "compras",
    "recetas",
    "mix_ventas",
    "exportacion",
    "auditoria_local",
  ],
  premium: MODULOS.map((m) => m.key),
};

export const ETIQUETA_MODULO = (key: string) =>
  MODULOS.find((m) => m.key === key)?.label ?? key;

/** Convierte un nombre comercial en un identificador corto y estable. */
export function slugEmpresa(nombre: string) {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
