/** Pantallas de inicio que se pueden asignar a un usuario. */
export const PANTALLAS_INICIO = [
  { value: "/admin/dashboard", label: "Panel General" },
  { value: "/caja", label: "Módulo de Caja" },
  { value: "/", label: "Módulo de Salonero / Mesas" },
  { value: "/cocina", label: "Pantalla de Cocina" },
] as const;

export type PantallaInicio = (typeof PANTALLAS_INICIO)[number]["value"];

export const PANTALLAS_VALIDAS: string[] = PANTALLAS_INICIO.map((p) => p.value);

export function esPantallaValida(valor: unknown): valor is PantallaInicio {
  return typeof valor === "string" && PANTALLAS_VALIDAS.includes(valor);
}

/** Nombre exacto de la pantalla tal como aparece en el sistema. */
export function etiquetaPantalla(valor: unknown): string | null {
  return PANTALLAS_INICIO.find((p) => p.value === valor)?.label ?? null;
}

/** Comprueba que un nombre coincida EXACTAMENTE con una pantalla existente. */
export function esEtiquetaValida(label: unknown): boolean {
  return typeof label === "string" && PANTALLAS_INICIO.some((p) => p.label === label);
}

/** Sugerencia según el rol; el Super Administrador puede cambiarla libremente. */
export function pantallaSugerida(role: string | null): PantallaInicio {
  switch (role) {
    case "cajero":
      return "/caja";
    case "mesero":
      return "/";
    case "cocina":
      return "/cocina";
    default:
      return "/admin/dashboard";
  }
}
