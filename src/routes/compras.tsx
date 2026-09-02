import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/compras")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/registro-compras" });
  },
});
