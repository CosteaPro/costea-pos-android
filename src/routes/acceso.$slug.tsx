import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { ingresar, negocioDeEnlace } from "@/lib/acceso";

export const Route = createFileRoute("/acceso/$slug")({
  loader: async ({ params }) => ({ empresa: await negocioDeEnlace(params.slug) }),
  head: ({ loaderData }) => {
    const nombre = loaderData?.empresa?.nombre ?? "Costea POS";
    return {
      meta: [
        { title: `Acceso ${nombre} | Costea POS` },
        {
          name: "description",
          content: `Ingresa con tu usuario y contraseña al punto de venta de ${nombre}.`,
        },
        { property: "og:title", content: `Acceso ${nombre} | Costea POS` },
        {
          property: "og:description",
          content: `Ingresa con tu usuario y contraseña al punto de venta de ${nombre}.`,
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  errorComponent: () => <Aviso texto="No se pudo abrir esta pantalla de acceso." />,
  notFoundComponent: () => <Aviso texto="Este enlace de acceso no existe." />,
  component: AccesoEmpresa,
});

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

function AccesoEmpresa() {
  const { slug } = Route.useParams();
  const { empresa } = Route.useLoaderData();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { homePath, resuelto } = useRole();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [forzar, setForzar] = useState(false);

  useEffect(() => {
    if (loading || !session || resuelto) return;
    const t = window.setTimeout(() => setForzar(true), 5000);
    return () => window.clearTimeout(t);
  }, [loading, session, resuelto]);

  useEffect(() => {
    if (loading) return;
    if (session && (resuelto || forzar)) navigate({ to: homePath, replace: true });
  }, [loading, session, resuelto, forzar, homePath, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await ingresar(usuario, password, slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setBusy(false);
    }
  };

  if (!empresa) return <Aviso texto="Este enlace de acceso no existe o el negocio está suspendido." />;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold">{empresa.nombre}</h1>
          <p className="text-sm text-muted-foreground">Punto de venta · Costea POS</p>
        </div>

        <form onSubmit={submit} className="panel space-y-4 p-5 shadow-panel">
          <div className="space-y-2">
            <Label htmlFor="usuario">Nombre de usuario</Label>
            <Input
              id="usuario"
              required
              autoCapitalize="none"
              autoComplete="username"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="administrador"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Un momento…" : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
