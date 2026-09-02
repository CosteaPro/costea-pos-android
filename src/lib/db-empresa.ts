/**
 * Cliente de datos limitado a una sola empresa.
 *
 * Los procesos automáticos (pre-cálculo nocturno) usan el cliente
 * administrativo, que no tiene sesión y por lo tanto ve los datos de todos los
 * clientes. Este envoltorio añade el filtro de empresa a cada lectura para que
 * cada negocio obtenga únicamente sus propios reportes.
 */
import type { Db } from "@/lib/db";

export function empresaScoped(db: Db, companyId: string): Db {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => {
          const base = (target as unknown as { from: (t: string) => unknown }).from(table) as Record<
            string,
            unknown
          >;
          return new Proxy(base, {
            get(t, p, r) {
              const valor = Reflect.get(t, p, r);
              if (p === "select" && typeof valor === "function") {
                return (...args: unknown[]) => {
                  const q = (valor as (...a: unknown[]) => { eq: (c: string, v: string) => unknown })
                    .apply(t, args);
                  return q.eq("company_id", companyId);
                };
              }
              return typeof valor === "function" ? valor.bind(t) : valor;
            },
          });
        };
      }
      const valor = Reflect.get(target, prop, receiver);
      return typeof valor === "function" ? valor.bind(target) : valor;
    },
  }) as Db;
}
