import { createFileRoute } from "@tanstack/react-router";
import { InventoryReportsTab } from "@/components/admin/inventory-movements";

export const Route = createFileRoute("/admin/reportes-inventario")({
  head: () => ({
    meta: [
      { title: "Reportes de inventario | Módulo administrativo" },
      {
        name: "description",
        content:
          "Inventario costeado, por ítems y combinado con filtro por rango de fechas y exportación a Excel.",
      },
      { property: "og:title", content: "Reportes de inventario | Módulo administrativo" },
      {
        property: "og:description",
        content: "Tres vistas de inventario: costeado, por ítems y combinado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryReportsPage,
});

function InventoryReportsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Reportes de inventario
        </h1>
        <p className="text-sm text-muted-foreground">
          Inventario inicial, compras, bajas, lunch, transferencias, ventas e inventario final por
          rango de fechas.
        </p>
      </header>
      <InventoryReportsTab />
    </div>
  );
}
