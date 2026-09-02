import { createFileRoute, redirect } from "@tanstack/react-router";

/** Las categorías ahora viven como pestaña dentro de Inventario / Ítems. */
export const Route = createFileRoute("/admin/categorias-inventario")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/inventario", replace: true });
  },
});
