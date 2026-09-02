import { createHash, randomBytes } from "crypto";

/**
 * Clave de administrador que piden las cajas para abrir su configuración.
 * Se guarda SIEMPRE cifrada (nunca en texto claro) y jamás se comprueba
 * iniciando sesión con cuentas reales: así esta pantalla no sirve para
 * adivinar contraseñas de nadie.
 */

const SEPARADOR = "$";

function derivar(pin: string, sal: string) {
  // Encadenado de SHA-256: costoso de recorrer y sin dependencias nativas.
  let valor = `${sal}${SEPARADOR}${pin}`;
  for (let i = 0; i < 60000; i += 1) {
    valor = createHash("sha256").update(valor).digest("hex");
  }
  return valor;
}

/** Convierte la clave en el texto cifrado que se guarda en la base. */
export function cifrarPin(pin: string): string {
  const sal = randomBytes(16).toString("hex");
  return `v1${SEPARADOR}${sal}${SEPARADOR}${derivar(pin, sal)}`;
}

/** Comprueba una clave contra el texto cifrado guardado. */
export function verificarPin(pin: string, guardado: string): boolean {
  const partes = guardado.split(SEPARADOR);
  if (partes.length !== 3 || partes[0] !== "v1") return false;
  const [, sal, hash] = partes as [string, string, string];
  return derivar(pin, sal) === hash;
}
