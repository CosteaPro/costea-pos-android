import { supabase } from "@/integrations/supabase/client";
import { empresaPorSlug, resolverAcceso, type EmpresaAcceso } from "@/lib/acceso.functions";
import { loginEmailFor } from "@/lib/usernames";

export type { EmpresaAcceso };

export type ResultadoIngreso =
  | { estado: "ok" }
  | { estado: "elegir-empresa"; empresas: EmpresaAcceso[] };

/**
 * Inicia sesión con nombre de usuario. Si el mismo usuario existe en varias
 * empresas se devuelve la lista para que la persona elija su negocio.
 */
export async function ingresar(
  identificador: string,
  password: string,
  slug?: string,
): Promise<ResultadoIngreso> {
  const valor = identificador.trim();
  let email = valor.includes("@") ? valor.toLowerCase() : "";

  if (!email) {
    const resolucion = await resolverAcceso({ data: { username: valor, slug: slug ?? "" } });
    if (resolucion.tipo === "varias") return { estado: "elegir-empresa", empresas: resolucion.empresas };
    // Sin coincidencias se intenta con el formato heredado para no bloquear a nadie.
    email = resolucion.tipo === "unico" ? resolucion.loginEmail : loginEmailFor(valor, slug ?? null);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Usuario o contraseña incorrectos");
  return { estado: "ok" };
}

/** Datos de la empresa para su pantalla de acceso propia (`/acceso/<slug>`). */
export async function negocioDeEnlace(slug: string) {
  return empresaPorSlug({ data: { slug } });
}
