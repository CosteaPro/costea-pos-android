import { deleteCookie, useSession } from "@tanstack/react-start/server";

/** Datos mínimos de la sesión que se guardan cifrados dentro de la cookie. */
export type SesionCookie = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
};

/** Duración de la cookie para roles administrativos: 8 horas (se cierra por inactividad). */
export const SESION_MAX_AGE = 28800;
/** Duración para caja, mesero y cocina: 30 días, la pantalla queda siempre abierta. */
export const SESION_MAX_AGE_TURNO = 2592000;

function config(maxAge: number = SESION_MAX_AGE) {
  const password = process.env["SESSION_SECRET"];
  if (!password) {
    throw new Error("Falta la clave SESSION_SECRET para cifrar la sesión.");
  }
  return {
    password,
    name: "costea-session",
    maxAge,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "strict" as const,
      path: "/",
      maxAge,
    },
  };
}

export async function guardarSesionCookie(datos: SesionCookie, maxAge?: number) {
  const sesion = await useSession<SesionCookie>(config(maxAge));
  await sesion.update(datos);
}

export async function leerSesionCookie(): Promise<SesionCookie | null> {
  const sesion = await useSession<SesionCookie>(config());
  const datos = sesion.data as Partial<SesionCookie> | undefined;
  if (!datos?.access_token || !datos.refresh_token) return null;
  return {
    access_token: datos.access_token,
    refresh_token: datos.refresh_token,
    expires_at: datos.expires_at,
  };
}

export async function borrarSesionCookie() {
  const sesion = await useSession<SesionCookie>(config());
  await sesion.clear();
  // Garantiza la eliminación usando los mismos atributos con que fue creada.
  deleteCookie("costea-session", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
  });
}
