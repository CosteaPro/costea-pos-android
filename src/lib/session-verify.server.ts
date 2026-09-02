import { createClient } from "@supabase/supabase-js";

function isNewSupabaseApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/** Devuelve el identificador del usuario dueño del token, o null si no es válido. */
export async function usuarioDeToken(accessToken: string): Promise<string | null> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  if (accessToken.split(".").length !== 3) return null;

  const cliente = createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });

  const { data, error } = await cliente.auth.getClaims(accessToken);
  if (error) return null;
  const sub = data?.claims?.sub;
  return typeof sub === "string" && sub ? sub : null;
}

/** Comprueba contra el servidor de autenticación que el token pertenece a un usuario real. */
export async function verificarToken(accessToken: string): Promise<boolean> {
  return (await usuarioDeToken(accessToken)) !== null;
}
