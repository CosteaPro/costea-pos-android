import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ChefHat,
  LayoutGrid,
  Receipt,
  BarChart3,
  LogOut,
  Settings,
  Calculator,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useRole } from "@/hooks/useRole";
import { useKitchenAlerts } from "@/hooks/useKitchenAlerts";
import { ReadyOrdersAlert } from "@/components/ReadyOrdersAlert";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EcuadorClock } from "@/components/EcuadorClock";

import { useAccessGuard } from "@/hooks/useAccessGuard";
import { esCajaLocal, puenteCaja } from "@/lib/caja-local";
import { cerrarSesionSegura } from "@/lib/auth-session";

const nav = [
  { to: "/", label: "Punto de venta", icon: Receipt, permission: "tomarPedidos" },
  { to: "/mesas", label: "Mesas", icon: LayoutGrid, tablesOnly: true, permission: "tomarPedidos" },
  { to: "/cocina", label: "Cocina", icon: ChefHat, permission: "verCocina" },
  { to: "/caja", label: "Caja", icon: Calculator, permission: "cobrar" },
  { to: "/menu", label: "Menú", icon: BookOpen, permission: "configurar" },
  { to: "/admin", label: "Administración", icon: ShieldCheck, permission: "gestionarCompras" },

  { to: "/configuracion", label: "Configuración", icon: Settings, permission: "configurar" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const { company } = useCompany();
  const { can, soloCaja, soloCocina, loading: loadingRole } = useRole();
  // Bitácora de accesos y cierre de sesión remoto.
  useAccessGuard();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // El aviso de "orden lista" es para el MESERO: en cocina no suena ni habla.
  const enCocina = pathname.startsWith("/cocina");
  const { ready, reload: reloadReady } = useKitchenAlerts({ sound: !enCocina && !soloCocina });
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);

  // En la caja descargable el punto de venta es local: se vende con o sin internet
  // y sin depender de la sesión del servidor central.
  const [cajaLocal, setCajaLocal] = useState(false);
  useEffect(() => setCajaLocal(esCajaLocal()), []);

  useEffect(() => {
    if (!loading && !session && online && !cajaLocal) navigate({ to: "/auth" });
  }, [loading, session, online, cajaLocal, navigate]);

  // El usuario de Cocina solo puede estar en su pantalla.
  useEffect(() => {
    if (!loadingRole && soloCocina && !pathname.startsWith("/cocina")) {
      navigate({ to: "/cocina" });
    }
  }, [loadingRole, soloCocina, pathname, navigate]);

  // La caja descargable nunca se queda esperando al servidor central: su POS es local.
  if (!cajaLocal && (loading || (!session && online))) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }

  const withTables = (company?.operation_mode ?? "restaurante") === "restaurante";


  // Entorno de caja: el cajero solo ve Punto de venta y Caja.
  const cajaOnly = ["/", "/caja", "/mesas"];
  // En la caja descargable el cierre, las facturas y las órdenes son LOCALES:
  // se abren en sus propias ventanas y no se muestra el cierre del sistema web.
  const ocultoEnCajaLocal = ["/caja", "/menu", "/reportes", "/tiempos", "/admin", "/configuracion"];
  const items = nav.filter(
    (i) =>
      (!cajaLocal || !ocultoEnCajaLocal.includes(i.to)) &&
      (!("tablesOnly" in i && i.tablesOnly) || withTables) &&
      (loadingRole || can[i.permission as keyof typeof can]) &&
      (!soloCaja || cajaOnly.includes(i.to)) &&
      (!soloCocina || i.to === "/cocina"),
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {!online && (
        <div className="bg-primary px-3 py-1 text-center text-xs font-semibold text-primary-foreground">
          Trabajando sin conexión · los datos se guardan en esta computadora
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full min-w-0 max-w-[1600px] items-center gap-3 px-3 py-2.5 sm:px-5">
          <Link to={soloCocina ? "/cocina" : "/"} className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
              CP
            </span>
            <span className="hidden max-w-[220px] truncate font-display text-base font-semibold tracking-tight sm:block">
              {company?.trade_name || company?.business_name || "Costea POS"}
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
            {items.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <item.icon className="size-3.5" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
            {cajaLocal && (
              <>
                {[
                  { label: "Órdenes", icon: Receipt, accion: () => puenteCaja()?.abrirOrdenes?.() },
                  { label: "Facturas SRI", icon: BarChart3, accion: () => puenteCaja()?.abrirPendientes?.() },
                  { label: "Cierre de caja", icon: Calculator, accion: () => puenteCaja()?.abrirCierre?.() },
                  { label: "Configuración", icon: Settings, accion: () => puenteCaja()?.abrirConfiguracion?.() },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={b.accion}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <b.icon className="size-3.5" />
                    <span className="hidden lg:inline">{b.label}</span>
                  </button>
                ))}
              </>
            )}
          </nav>

          <EcuadorClock className="hidden sm:flex" />



          {!cajaLocal && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cerrar sesión"
              onClick={async () => {
                await cerrarSesionSegura();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
      </header>

      {!enCocina && <ReadyOrdersAlert ready={ready} onChange={reloadReady} />}

      <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-3 py-4 sm:px-5">{children}</main>

    </div>
  );
}
