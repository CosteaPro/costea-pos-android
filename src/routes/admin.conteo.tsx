import { createFileRoute } from "@tanstack/react-router";
import { PhysicalCountTab } from "@/components/admin/inventory-movements";

export const Route = createFileRoute("/admin/conteo")({
  head: () => ({
    meta: [
      { title: "Conteo físico y cierre | Módulo administrativo" },
      {
        name: "description",
        content:
          "Ingreso de cantidades físicas, cálculo de diferencias, ajuste de inventario y cierre del día con saldo al día siguiente.",
      },
      { property: "og:title", content: "Conteo físico y cierre | Módulo administrativo" },
      {
        property: "og:description",
        content: "Ajuste por conteo físico y traslado del saldo al día siguiente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CountPage,
});

function CountPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Conteo físico y cierre
        </h1>
        <p className="text-sm text-muted-foreground">
          Ingresa las cantidades contadas, ajusta las diferencias y confirma el cierre: el
          inventario físico pasa como inventario inicial del día siguiente.
        </p>
      </header>
      <PhysicalCountTab />
    </div>
  );
}
