import { createFileRoute } from "@tanstack/react-router";
import { GastosGeneralesPanel } from "@/components/admin/gastos-generales";

export const Route = createFileRoute("/admin/gastos")({
  head: () => ({
    meta: [
      { title: "Gastos generales | Módulo administrativo" },
      {
        name: "description",
        content:
          "Crea tus rubros mensuales y registra cada gasto con fecha, factura, proveedor y monto. Todo alimenta el Estado de Pérdidas y Ganancias.",
      },
      { property: "og:title", content: "Gastos generales | Módulo administrativo" },
      {
        property: "og:description",
        content: "Arriba creas los rubros, abajo ingresas cada gasto eligiendo el rubro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Gastos generales</h1>
        <p className="text-sm text-muted-foreground">
          Dos pestañas: en "Grupos y rubros" armas tu estructura; en "Ingreso de gastos" registras
          cada factura con base imponible e IVA automático. El P&amp;G lee únicamente de aquí.
        </p>
      </header>

      <GastosGeneralesPanel />
    </div>
  );
}
