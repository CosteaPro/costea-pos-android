import { createFileRoute } from "@tanstack/react-router";
import { ItemsTab, usePurchasingData } from "@/components/admin/purchasing";
import {
  InventoryCategoriesTab,
  useInventoryCategories,
} from "@/components/admin/inventory-categories";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/inventario")({
  head: () => ({
    meta: [
      { title: "Inventario e ítems | Módulo administrativo" },
      {
        name: "description",
        content:
          "Ítems de inventario con código automático, stock mínimo, costo unitario y categorías internas en una sola pantalla con pestañas.",
      },
      { property: "og:title", content: "Inventario e ítems | Módulo administrativo" },
      { property: "og:description", content: "Control de existencias, conversiones y categorías." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { items, suppliers, loadItems } = usePurchasingData();
  const { categories, loadCategories } = useInventoryCategories();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Inventario / Ítems</h1>
        <p className="text-sm text-muted-foreground">
          Stock mínimo con alerta visual, costo unitario, conversiones por ítem y las categorías
          internas de inventario, todo en la misma pantalla.
        </p>
      </header>

      <Tabs defaultValue="items" className="space-y-4">
        <TabsList>
          <TabsTrigger value="items">📋 Inventario / Ítems</TabsTrigger>
          <TabsTrigger value="categorias">🏷️ Categorías</TabsTrigger>
        </TabsList>
        <TabsContent value="items">
          <ItemsTab items={items} suppliers={suppliers} reload={loadItems} />
        </TabsContent>
        <TabsContent value="categorias">
          <InventoryCategoriesTab rows={categories} reload={loadCategories} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
