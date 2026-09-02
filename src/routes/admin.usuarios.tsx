import { createFileRoute } from "@tanstack/react-router";
import { StaffPanel } from "@/routes/configuracion";

export const Route = createFileRoute("/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuarios y permisos | Módulo administrativo" },
      {
        name: "description",
        content:
          "Administración de usuarios del restaurante y asignación de roles: administrador, cajero y mesero.",
      },
      { property: "og:title", content: "Usuarios y permisos | Módulo administrativo" },
      { property: "og:description", content: "Roles y accesos del personal del restaurante." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Usuarios y permisos</h1>
        <p className="text-sm text-muted-foreground">
          Solo el Super Administrador asigna roles: Super Administrador / Propietario (acceso total y configuración),
          Administrador Operativo (operación diaria), Cajero (cobros y cierre) y Mesero (pedidos).
        </p>
      </header>
      <StaffPanel />
    </div>
  );
}
