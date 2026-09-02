/**
 * Reglas de acceso: el usuario es único DENTRO de su empresa; el correo es
 * solo contacto y puede repetirse.
 *
 * El correo interno de acceso incluye el identificador de la empresa
 * (`usuario@mi-negocio.costeapos.local`) para que dos clientes distintos
 * puedan tener el mismo nombre de usuario. Los usuarios creados antes de la
 * separación por empresa conservan el formato antiguo (`usuario@costeapos.local`),
 * guardado en el perfil como `login_email`.
 */
export const LOGIN_DOMAIN = "costeapos.local";

export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

/** Correo interno de acceso. Con `companySlug` queda separado por empresa. */
export function loginEmailFor(username: string, companySlug?: string | null): string {
  const usuario = normalizeUsername(username);
  const slug = (companySlug ?? "").trim().toLowerCase();
  return slug ? `${usuario}@${slug}.${LOGIN_DOMAIN}` : `${usuario}@${LOGIN_DOMAIN}`;
}

/** Verdadero para los correos internos del sistema (no son correos de contacto). */
export function esCorreoInterno(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(LOGIN_DOMAIN));
}
