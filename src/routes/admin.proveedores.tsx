import { createFileRoute } from "@tanstack/react-router";
import { SuppliersTab, usePurchasingData } from "@/components/admin/purchasing";

export const Route = createFileRoute("/admin/proveedores")({
  head: () => ({
    meta: [
      { title: "Proveedores | Módulo administrativo" },
      {
        name: "description",
        content:
          "Gestión de proveedores del restaurante: código automático, RUC, contacto, rubro y estado.",
      },
      { property: "og:title", content: "Proveedores | Módulo administrativo" },
      { property: "og:description", content: "Alta, edición y búsqueda de proveedores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const { suppliers, loadSuppliers } = usePurchasingData();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Proveedores</h1>
        <p className="text-sm text-muted-foreground">
          Código automático, identificación, contacto, rubro y estado.
        </p>
      </header>
      <SuppliersTab rows={suppliers} reload={loadSuppliers} />
    </div>
  );
}
