// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Variables de entorno del servidor (sin prefijo VITE_) para las rutas de servidor.
// No se exponen al navegador.
const serverEnv = loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

const compilacionEscritorio = process.env["DESKTOP_BUILD"] === "1";

export default defineConfig({
  // La caja descargable necesita un servidor Node embebido; la web usa Cloudflare.
  nitro: compilacionEscritorio ? { preset: "node-server" } : undefined,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [
        {
          find: /^@\/integrations\/supabase\/client$/,
          replacement: path.resolve(process.cwd(), "src/integrations/supabase/secure-client.ts"),
        },
        {
          find: "entities/lib/decode.js",
          replacement: path.resolve(process.cwd(), "node_modules/entities/lib/decode.js"),
        },
        {
          find: "entities/lib/encode.js",
          replacement: path.resolve(process.cwd(), "node_modules/entities/lib/encode.js"),
        },
        { find: "entities", replacement: path.resolve(process.cwd(), "node_modules/entities") },
      ],
    },
  },
});
