import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Lee TODAS las filas de una consulta, en páginas de 1000.
 * El servidor limita cada respuesta a 1000 registros: sin paginar, los reportes
 * con muchos pedidos mostraban solo una parte de las ventas.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += size) {
    const { data, error } = await page(offset, offset + size - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < size) break;
  }
  return all;
}
