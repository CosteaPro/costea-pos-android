/**
 * Unidades de medida del inventario.
 * - Unidad de compra: flexible (listado maestro ampliable por el usuario).
 * - Unidad de inventario: lista cerrada.
 * - Unidad de receta: derivada automáticamente de la unidad de inventario.
 */

export type InventoryUnit =
  | "unidad"
  | "kilo"
  | "libra"
  | "litro"
  | "mililitro"
  | "gramo"
  | "onza"
  | "metro";

/** Lista cerrada de unidades de inventario permitidas. */
export const INVENTORY_UNITS: { value: InventoryUnit; label: string }[] = [
  { value: "unidad", label: "Unidad" },
  { value: "kilo", label: "Kilo" },
  { value: "libra", label: "Libra" },
  { value: "litro", label: "Litro" },
  { value: "mililitro", label: "Mililitro" },
  { value: "gramo", label: "Gramo" },
  { value: "onza", label: "Onza" },
  { value: "metro", label: "Metro" },
];

/** Conversión automática a la unidad mínima de receta. */
export const RECIPE_BY_INVENTORY_UNIT: Record<
  InventoryUnit,
  { recipeUnit: string; factor: number }
> = {
  unidad: { recipeUnit: "unidad", factor: 1 },
  kilo: { recipeUnit: "gramo", factor: 1000 },
  libra: { recipeUnit: "gramo", factor: 1000 / 2.20462 },
  litro: { recipeUnit: "mililitro", factor: 1000 },
  mililitro: { recipeUnit: "mililitro", factor: 1 },
  gramo: { recipeUnit: "gramo", factor: 1 },
  onza: { recipeUnit: "gramo", factor: 1000 / 2.20462 / 16 },
  metro: { recipeUnit: "centimetro", factor: 100 },
};

export const isInventoryUnit = (u: string): u is InventoryUnit =>
  INVENTORY_UNITS.some((x) => x.value === u);

/** Devuelve la unidad de receta y su factor para una unidad de inventario. */
export const recipeFor = (unit: string) =>
  isInventoryUnit(unit) ? RECIPE_BY_INVENTORY_UNIT[unit] : { recipeUnit: unit, factor: 1 };

export const unitLabel = (u: string) =>
  INVENTORY_UNITS.find((x) => x.value === u)?.label ?? u;

/** Unidades de compra sugeridas por defecto (el maestro se guarda en la base de datos). */
export const DEFAULT_PURCHASE_UNITS = [
  "unidad",
  "caja",
  "paquete",
  "funda",
  "saco",
  "quintal",
  "kilo",
  "libra",
  "gramo",
  "litro",
  "mililitro",
  "galon",
  "onza",
  "docena",
  "bandeja",
  "botella",
  "lata",
  "metro",
];

/* ───────────────── Conversión oficial entre unidades ───────────────── */

/**
 * Equivalencia de cada unidad en su unidad base por dimensión.
 * Peso → gramo · Volumen → mililitro · Longitud → centímetro · Conteo → unidad.
 * Factor oficial: 1 kilo = 2.20462 libras (1 libra = 453.59237 g).
 */
const LIBRA_EN_GRAMOS = 1000 / 2.20462; // 1 kilo = 2.20462 libras (factor oficial)

const UNIT_BASE: Record<string, { dim: string; base: number }> = {
  gramo: { dim: "peso", base: 1 },
  kilo: { dim: "peso", base: 1000 },
  libra: { dim: "peso", base: LIBRA_EN_GRAMOS },
  onza: { dim: "peso", base: LIBRA_EN_GRAMOS / 16 },
  quintal: { dim: "peso", base: LIBRA_EN_GRAMOS * 100 },
  mililitro: { dim: "volumen", base: 1 },
  litro: { dim: "volumen", base: 1000 },
  galon: { dim: "volumen", base: 3785.411784 },
  centimetro: { dim: "longitud", base: 1 },
  metro: { dim: "longitud", base: 100 },
  unidad: { dim: "conteo", base: 1 },
  par: { dim: "conteo", base: 2 },
  docena: { dim: "conteo", base: 12 },
};

/**
 * Cuántas unidades de inventario entrega 1 unidad de compra.
 * Devuelve null cuando la conversión no es automática (caja, saco, funda…),
 * en cuyo caso el usuario debe declarar el contenido manualmente.
 */
export function autoPurchaseFactor(purchaseUnit: string, inventoryUnit: string): number | null {
  const p = UNIT_BASE[(purchaseUnit || "").toLowerCase()];
  const i = UNIT_BASE[(inventoryUnit || "").toLowerCase()];
  if (!p || !i || p.dim !== i.dim) return null;
  return p.base / i.base;
}
