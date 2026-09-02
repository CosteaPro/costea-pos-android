/**
 * Tipo compartido del cliente de datos.
 *
 * Las funciones de reportes aceptan un cliente opcional para poder ejecutarse
 * tanto en el navegador (sesión del usuario) como en el servidor (proceso
 * nocturno de pre-cálculo, con cliente administrativo).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;
