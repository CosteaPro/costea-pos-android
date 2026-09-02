import { createFileRoute } from "@tanstack/react-router";
import { PurchasesTab, usePurchasingData } from "@/components/admin/purchasing";

export const Route = createFileRoute("/admin/registro-compras")({
  head: () => ({
    meta: [
      { title: "Compras | Módulo administrativo" },
      {
        name: "description",
        content:
          "Historial de compras a proveedores con filtros por fecha, detalle del comprobante e impresión.",
      },
      { property: "og:title", content: "Compras | Módulo administrativo" },
      { property: "og:description", content: "Compras con conversión automática a inventario." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchasesPage,
});

function PurchasesPage() {
  const { items, suppliers, loadItems } = usePurchasingData();
  return <PurchasesTab suppliers={suppliers} items={items} onSaved={loadItems} />;
}

