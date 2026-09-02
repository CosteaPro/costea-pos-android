import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { normalizeUsername } from "@/lib/usernames";
import { ingresar, type EmpresaAcceso } from "@/lib/acceso";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso al sistema | Costea POS" },
      {
        name: "description",
        content: "Inicia sesión con tu usuario y contraseña para tomar pedidos, ver mesas y cobrar.",
      },
      { property: "og:title", content: "Acceso al sistema | Costea POS" },
      {
        property: "og:description",
        content: "Inicia sesión con tu usuario y contraseña para tomar pedidos, ver mesas y cobrar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { homePath, resuelto: rolResuelto, error: errorRol, reintentar } = useRole();
  const [mode, setMode] = useState<"login" | "signup" | "recover">("login");
  const [identifier, setIdentifier] = useState("");
  /** Nombre del negocio del cliente nuevo que se registra. */
  const [negocio, setNegocio] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  /** Cuando el mismo usuario existe en varias empresas hay que elegir el negocio. */
  const [empresas, setEmpresas] = useState<EmpresaAcceso[]>([]);
  const [empresaSlug, setEmpresaSlug] = useState("");
  /** Cuando el rol tarda demasiado, se entra igual con la pantalla disponible. */
  const [forzarEntrada, setForzarEntrada] = useState(false);

  useEffect(() => {
    if (loading || !session || rolResuelto) return;
    // Respaldo: si el rol no se confirma en 5 segundos nadie se queda atrapado aquí.
    const t = window.setTimeout(() => setForzarEntrada(true), 5000);
    return () => window.clearTimeout(t);
  }, [loading, session, rolResuelto]);

  useEffect(() => {
    if (loading) return;
    if (session && (rolResuelto || forzarEntrada)) {
      // Cada rol entra directo a su pantalla, ya con rol y pantalla confirmados.
      navigate({ to: homePath, replace: true });
    }
  }, [loading, session, rolResuelto, forzarEntrada, homePath, navigate]);

  /** Borra permisos guardados y sesión de este navegador y recarga la pantalla. */
  const limpiarEquipo = async () => {
    try {
      const { cerrarSesionSegura } = await import("@/lib/auth-session");
      await cerrarSesionSegura();
    } catch {
      /* aunque falle el cierre remoto se limpia el equipo */
    }
    try {
      localStorage.removeItem("costea.caja.roles");
      localStorage.removeItem("costea.caja.last-user");
      sessionStorage.clear();
    } catch {
      /* almacenamiento bloqueado por el navegador */
    }
    window.location.replace("/auth");
  };


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const res = await ingresar(identifier, password, empresaSlug || undefined);
        if (res.estado === "elegir-empresa") {
          setEmpresas(res.empresas);
          toast.info("Ese usuario existe en varios negocios. Elige el tuyo y vuelve a entrar.");
          return;
        }
        // La redirección por rol la resuelve el efecto anterior.
      } else if (mode === "recover") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent(true);
        toast.success("Te enviamos las instrucciones a tu correo.");
      } else {
        const username = normalizeUsername(identifier);
        if (username.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres");
        if (negocio.trim().length < 3) throw new Error("Escribe el nombre de tu negocio");
        // Todo cliente nuevo nace con su empresa y su SúperAdministrador Propietario.
        const { registrarEmpresa } = await import("@/lib/registro.functions");
        const res = await registrarEmpresa({
          data: { negocio: negocio.trim(), username, password, contactEmail: email.trim() },
        });
        toast.success("👑 Bienvenido a Costea Pro. Eres el SúperAdministrador Propietario de tu empresa.");
        const entrada = await ingresar(username, password, res.slug);
        if (entrada.estado === "elegir-empresa") {
          setEmpresas(entrada.empresas);
          setEmpresaSlug(res.slug);
          setMode("login");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo continuar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground">
            BR
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold">Costea POS</h1>
            <p className="text-sm text-muted-foreground">Punto de venta para restaurante</p>
          </div>
        </div>

        {session && errorRol && (
          <div className="panel mb-4 space-y-3 border border-destructive/40 p-4 text-sm">
            <p className="font-medium">No se pudo confirmar tus permisos</p>
            <p className="text-muted-foreground">{errorRol}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={reintentar}>
                Reintentar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={limpiarEquipo}>
                Limpiar datos de este equipo
              </Button>
            </div>
          </div>
        )}



        <form onSubmit={submit} className="panel space-y-4 p-5 shadow-panel">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="negocio">Nombre de tu negocio</Label>
              <Input
                id="negocio"
                required
                value={negocio}
                onChange={(e) => setNegocio(e.target.value)}
                placeholder="Mi Restaurante"
              />
              <p className="text-xs text-muted-foreground">
                Serás el SúperAdministrador Propietario de este negocio.
              </p>
            </div>
          )}

          {mode !== "recover" && (
            <div className="space-y-2">
              <Label htmlFor="identifier">Nombre de usuario</Label>
              <Input
                id="identifier"
                required
                autoCapitalize="none"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="caja01"
              />
              <p className="text-xs text-muted-foreground">
                Se entra con usuario y contraseña. El correo solo sirve para avisos.
              </p>
            </div>
          )}

          {mode === "login" && empresas.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="empresa">Negocio</Label>
              <select
                id="empresa"
                required
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={empresaSlug}
                onChange={(e) => setEmpresaSlug(e.target.value)}
              >
                <option value="">Elige tu negocio…</option>
                {empresas.map((e) => (
                  <option key={e.slug} value={e.slug}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}



          {mode !== "login" && (
            <div className="space-y-2">
              <Label htmlFor="email">Correo de contacto</Label>
              <Input
                id="email"
                type="email"
                required={mode === "recover"}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="costea@tuempresa.com"
              />
              {mode === "signup" && (
                <p className="text-xs text-muted-foreground">
                  El mismo correo puede repetirse en varios usuarios.
                </p>
              )}
            </div>
          )}

          {mode !== "recover" && (
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {mode === "recover" && (
            <p className="text-xs text-muted-foreground">
              La recuperación por correo funciona solo para cuentas creadas con correo. Si entras con
              nombre de usuario, pide al Super Administrador que te asigne una nueva contraseña.
            </p>
          )}
          {mode === "recover" && sent && (
            <p className="text-sm text-muted-foreground">
              Revisa tu correo y sigue el enlace para crear una nueva contraseña.
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy
              ? "Un momento…"
              : mode === "login"
                ? "Entrar"
                : mode === "signup"
                  ? "Crear cuenta"
                  : "Enviar instrucciones"}
          </Button>

          {mode === "login" && (
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setSent(false);
                setMode("recover");
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              setSent(false);
              setMode(mode === "login" ? "signup" : "login");
            }}
          >
            {mode === "login" ? "Registrar un nuevo usuario" : "Volver a iniciar sesión"}
          </button>
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={limpiarEquipo}
          >
            Limpiar datos de este equipo
          </button>
        </form>

      </div>
    </div>
  );
}
