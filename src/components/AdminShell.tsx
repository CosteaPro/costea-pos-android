import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AlarmClock,
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  CalendarClock,
  ChefHat,
  ChevronDown,
  ClipboardCheck,
  Factory,
  HandCoins,
  Home,
  LayoutDashboard,
  Menu,
  Monitor,
  ScrollText,
  Scale,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useCompany } from "@/hooks/useCompany";
import { useAccessGuard } from "@/hooks/useAccessGuard";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import { EcuadorClock } from "@/components/EcuadorClock";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Truck;
  exact?: boolean;
  superOnly?: boolean;
};

type NavGroup = {
  /** Identificador del módulo; sirve para activarlo o desactivarlo por empresa. */
  id: string;
  /** Solo visible para los administradores de la plataforma (SúperAdmin). */
  platformOnly?: boolean;
  title: string;
  icon: typeof Truck;
  /** Los módulos siempre inician cerrados salvo el de inicio. */
  collapsible?: boolean;
  items: NavItem[];
};

/** Menú lateral por módulos desplegables e independientes. */
const navGroups: NavGroup[] = [
  {
    id: "inicio",
    title: "Inicio",
    icon: Home,
    collapsible: false,
    items: [{ to: "/admin/dashboard", label: "Panel general", icon: LayoutDashboard, exact: true }],
  },
  {
    id: "inventario",
    title: "Módulo de inventario",
    icon: Boxes,
    items: [
      { to: "/admin/inventario", label: "Inventario / Ítems", icon: Boxes },
      { to: "/admin/proveedores", label: "Proveedores", icon: Truck },
      { to: "/admin/registro-compras", label: "Compras", icon: ShoppingCart },
      { to: "/admin/movimientos", label: "Movimientos de Inventario", icon: ArrowLeftRight },
      { to: "/admin/conteo", label: "Conteo y cierre", icon: ClipboardCheck },
    ],
  },
  {
    id: "produccion",
    title: "Módulo de producción y costeos",
    icon: ChefHat,
    items: [
      { to: "/admin/recetas-finales", label: "Recetas y subrecetas", icon: ChefHat },
      { to: "/admin/produccion", label: "Ingreso de producción", icon: Factory },
    ],
  },
  {
    id: "ventas",
    title: "Módulo de ventas y caja",
    icon: Store,
    items: [
      { to: "/", label: "Punto de Venta", icon: Store, exact: true },
      { to: "/menu", label: "Menú y productos", icon: BookOpen },
      { to: "/mesas", label: "Mesas y pedidos", icon: UtensilsCrossed },
      { to: "/cocina", label: "Comandas y cocina", icon: AlarmClock },
      { to: "/caja", label: "Caja: cobrar y cerrar", icon: Monitor },
    ],
  },
  {
    id: "analisis",
    title: "ANÁLISIS Y REPORTES",
    icon: BarChart3,
    items: [
      { to: "/admin/reportes-inventario", label: "Reporte de Inventario", icon: Boxes },
      { to: "/admin/reportes-ventas", label: "Reporte de Ventas", icon: BarChart3 },
      { to: "/admin/reporte-cajas", label: "Reporte de Venta por Caja", icon: Monitor },
      { to: "/admin/ventas-semanales", label: "Reporte de Ventas Semanal", icon: BarChart3 },
      { to: "/admin/mix-ventas", label: "Mix de Ventas", icon: BarChart3 },
      { to: "/admin/perdidas-ganancias", label: "Pérdidas y Ganancias", icon: Scale },
      { to: "/admin/flujo-caja", label: "Flujo de Caja", icon: Wallet },
    ],
  },
  {
    id: "finanzas",
    title: "Módulo de finanzas locales",
    icon: Scale,
    items: [
      { to: "/admin/gastos", label: "Gastos generales", icon: Wallet },
      { to: "/admin/cuentas-cobrar", label: "Cuentas por cobrar", icon: HandCoins },
    ],
  },
  {
    id: "talento",
    title: "Módulo de talento humano",
    icon: Users,
    items: [
      { to: "/admin/personal", label: "Personal / Empleados", icon: Users },
      { to: "/admin/usuarios", label: "Roles y permisos", icon: UserCog, superOnly: true },
      { to: "/admin/horarios", label: "Horarios y asistencia", icon: CalendarClock },
    ],
  },
  {
    id: "plataforma",
    title: "Plataforma (SúperAdmin)",
    icon: Building2,
    platformOnly: true,
    items: [
      { to: "/admin/plataforma", label: "Clientes de la plataforma", icon: Building2, exact: true },
      { to: "/admin/plataforma/bitacora", label: "Bitácora de plataforma", icon: ScrollText },
    ],
  },
  {
    id: "configuracion",
    title: "Configuración",
    icon: Settings,
    items: [
      { to: "/admin/cajas", label: "Cajas autorizadas", icon: Monitor, superOnly: true },
      { to: "/admin/accesos", label: "Registro de accesos", icon: ScrollText, superOnly: true },
      { to: "/admin/ajustes", label: "Configuración general", icon: Settings, superOnly: true },
    ],
  },
];


export function AdminShell({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const {
    isAdmin,
    isSuperAdmin,
    loading: loadingRole,
    error: errorRol,
    reintentar,
  } = useRole();
  const { company } = useCompany();
  const { esAdminPlataforma } = usePlatformAdmin();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  // Todos los módulos inician cerrados; el usuario abre el que necesita.
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));


  // Bitácora de accesos y cierre de sesión remoto.
  useAccessGuard();

  // Paleta administrativa clara mientras se permanece en el módulo.
  useEffect(() => {
    document.documentElement.classList.add("admin-theme");
    return () => document.documentElement.classList.remove("admin-theme");
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (!loading && session && !loadingRole && !isAdmin && errorRol) {
    return (
      <div className="admin-theme flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <ShieldCheck className="size-8 text-muted-foreground" />
        <h1 className="font-display text-xl font-semibold">No se pudo confirmar tus permisos</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{errorRol}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reintentar}>Reintentar</Button>
          <Button variant="outline" onClick={() => navigate({ to: "/auth" })}>
            Volver al acceso
          </Button>
        </div>
      </div>
    );
  }

  if (loading || loadingRole || !session) {
    return (
      <div className="admin-theme flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Cargando…
      </div>
    );
  }


  if (!isAdmin) {
    return (
      <div className="admin-theme flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <ShieldCheck className="size-8 text-muted-foreground" />
        <h1 className="font-display text-xl font-semibold">Acceso restringido</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          El Módulo Administrativo es exclusivo de los roles administrativos.
        </p>
        <Button onClick={() => navigate({ to: "/" })}>Volver al Punto de venta</Button>
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar-bg text-sidebar-fg">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-sm font-semibold tracking-tight">
            Costea Pro
          </span>
          <span className="block truncate text-xs text-sidebar-muted">
            {company?.trade_name || company?.business_name || "Módulo administrativo"}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto rounded-md p-1 text-sidebar-muted lg:hidden"
          aria-label="Cerrar menú"
        >
          <X className="size-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          if (group.platformOnly && !esAdminPlataforma) return null;
          const items = group.items.filter((i) => !i.superOnly || isSuperAdmin);
          if (!items.length) return null;

          const links = (
            <div className="space-y-0.5">
              {items.map((item) => {
                const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-fg/85 hover:bg-white/8 hover:text-sidebar-fg",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );

          if (group.collapsible === false) {
            return (
              <div key={group.id} className="pb-1">
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                  {group.title}
                </p>
                {links}
              </div>
            );
          }

          const expanded = openGroups.includes(group.id);
          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  expanded
                    ? "bg-white/10 text-sidebar-fg"
                    : "text-sidebar-fg/85 hover:bg-white/8 hover:text-sidebar-fg",
                )}
              >
                <group.icon className="size-4 shrink-0" />
                <span className="truncate text-left">{group.title}</span>
                <ChevronDown
                  className={cn(
                    "ml-auto size-4 shrink-0 transition-transform duration-200",
                    expanded && "rotate-180",
                  )}
                />
              </button>
              <div
                className={cn(
                  "grid transition-all duration-300 ease-in-out",
                  expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <div className="mt-0.5 ml-4 border-l border-sidebar-border pl-2">{links}</div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );


  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebar}</div>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg border border-border p-2 text-muted-foreground lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <h2 className="truncate font-display text-sm font-semibold tracking-tight">
                Módulo administrativo
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {company?.trade_name || company?.business_name || "Costea Pro"}
              </p>
            </div>
            <EcuadorClock className="hidden md:flex" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-3 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>

    </div>
  );
}
