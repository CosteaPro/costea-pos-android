import { createFileRoute } from "@tanstack/react-router";
import { MovementsTab } from "@/components/admin/inventory-movements";

export const Route = createFileRoute("/admin/movimientos")({
  head: () => ({
    meta: [
      { title: "Movimientos de inventario | Módulo administrativo" },
      {
        name: "description",
        content:
          "Registro de bajas, consumo de personal, transferencias y salidas por venta, con historial filtrable y exportable.",
      },
      { property: "og:title", content: "Movimientos de inventario | Módulo administrativo" },
      {
        property: "og:description",
        content: "Bajas, lunch, transferencias y ventas valorados al costo de última compra.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MovementsPage,
});

function MovementsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Movimientos de Inventario
        </h1>
        <p className="text-sm text-muted-foreground">
          Registra bajas, consumo de personal, ajustes y transferencias. Todo se valora al costo de
          la última compra registrada.
        </p>
      </header>
      <MovementsTab />
    </div>
  );
}
