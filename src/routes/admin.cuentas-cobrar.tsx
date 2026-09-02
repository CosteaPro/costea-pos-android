import { createFileRoute } from "@tanstack/react-router";
import { ReceivablesPanel } from "@/components/admin/accounts";

export const Route = createFileRoute("/admin/cuentas-cobrar")({
  head: () => ({
    meta: [
      { title: "Cuentas por cobrar | Módulo administrativo" },
      {
        name: "description",
        content:
          "Seguimiento de ventas a crédito por cliente con fecha de vencimiento, saldos vencidos y registro de cobro.",
      },
      { property: "og:title", content: "Cuentas por cobrar | Módulo administrativo" },
      { property: "og:description", content: "Control de créditos otorgados a clientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Cuentas por cobrar</h1>
        <p className="text-sm text-muted-foreground">
          Ventas a crédito con cliente, cédula, vencimiento y estado de cobro.
        </p>
      </header>
      <ReceivablesPanel />
    </div>
  ),
});
