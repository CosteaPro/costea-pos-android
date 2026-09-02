import { createFileRoute } from "@tanstack/react-router";
import { SettingsScreen } from "@/routes/configuracion";

export const Route = createFileRoute("/admin/ajustes")({
  head: () => ({
    meta: [
      { title: "Configuración general | Módulo administrativo" },
      {
        name: "description",
        content:
          "Datos fiscales del SRI, firma electrónica, impresoras y modo de operación del restaurante.",
      },
      { property: "og:title", content: "Configuración general | Módulo administrativo" },
      { property: "og:description", content: "Parámetros fiscales y operativos del sistema." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SettingsScreen />,
});
