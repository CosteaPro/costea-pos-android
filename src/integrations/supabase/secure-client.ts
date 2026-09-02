import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { clearLegacyAuthStorage, memoryAuthStorage } from "./auth-storage";

function isOpaqueApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function secureFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isOpaqueApiKey(apiKey) && headers.get("Authorization") === `Bearer ${apiKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

function createSecureClient() {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const apiKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !apiKey) throw new Error("Falta la configuración de Lovable Cloud.");

  clearLegacyAuthStorage();
  return createClient<Database>(url, apiKey, {
    global: { fetch: secureFetch(apiKey) },
    auth: {
      storage: memoryAuthStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

let client: ReturnType<typeof createSecureClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSecureClient>, {
  get(_, property, receiver) {
    client ??= createSecureClient();
    return Reflect.get(client, property, receiver);
  },
});