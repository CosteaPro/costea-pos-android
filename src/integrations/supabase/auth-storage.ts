/** Almacén efímero para la sesión: nunca escribe credenciales en el navegador. */
const sessionMemory = new Map<string, string>();
let signingOut = false;

const LEGACY_AUTH_KEYS = [
  /^sb-.*-auth-token$/,
  /^supabase\.auth\.token$/,
];

function isLegacyAuthKey(key: string) {
  return LEGACY_AUTH_KEYS.some((pattern) => pattern.test(key));
}

/** Elimina sesiones persistidas por versiones antiguas sin tocar datos operativos. */
export function clearLegacyAuthStorage() {
  if (typeof window === "undefined") return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && isLegacyAuthKey(key)) window.localStorage.removeItem(key);
    }
  } catch {
    // El almacenamiento puede estar deshabilitado por la política del navegador.
  }
}

export const memoryAuthStorage = {
  getItem(key: string) {
    return sessionMemory.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    sessionMemory.set(key, value);
  },
  removeItem(key: string) {
    sessionMemory.delete(key);
  },
};

export function clearMemoryAuthStorage() {
  sessionMemory.clear();
}

export function setSigningOut(value: boolean) {
  signingOut = value;
}

export function isSigningOut() {
  return signingOut;
}