import { createFileRoute } from "@tanstack/react-router";
import { ProductionEntryScreen } from "@/components/admin/production-entry";

export const Route = createFileRoute("/admin/produccion")({
  head: () => ({
    meta: [
      { title: "Ingreso de producción | Costea POS" },
      {
        name: "description",
        content:
          "Registra la producción de subrecetas por lotes: ingresa la cantidad producida al inventario y descuenta los insumos consumidos.",
      },
      { property: "og:title", content: "Ingreso de producción | Costea POS" },
      {
        property: "og:description",
        content: "Producción de subrecetas por lotes con costo total, costo unitario y comprobante.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductionPage,
});

function ProductionPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Ingreso de producción</h1>
        <p className="text-sm text-muted-foreground">
          Selecciona la subreceta, indica cuántos lotes se produjeron y confirma: la producción entra
          al inventario y los ingredientes se descuentan automáticamente.
        </p>
      </header>
      <ProductionEntryScreen />
    </div>
  );
}
