import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { esCajaLocal } from "@/lib/caja-local";
import { esPantallaValida } from "@/lib/pantallas-inicio";

export type AppRole = "administrador" | "admin_operativo" | "cajero" | "mesero" | "cocina";

export const ROLE_LABEL: Record<AppRole, string> = {
  administrador: "Super Administrador / Propietario",
  admin_operativo: "Administrador Operativo",
  cajero: "Cajero",
  mesero: "Mesero",
  cocina: "Cocina",
};

const ROLE_CACHE_KEY = "costea.caja.roles";

function cachedRoles(userId: string): AppRole[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const cache = JSON.parse(localStorage.getItem(ROLE_CACHE_KEY) ?? "{}") as Record<string, AppRole[]>;
    return cache[userId] ?? [];
  } catch {
    return [];
  }
}

function cacheRoles(userId: string, roles: AppRole[]) {
  try {
    const cache = JSON.parse(localStorage.getItem(ROLE_CACHE_KEY) ?? "{}") as Record<string, AppRole[]>;
    localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ ...cache, [userId]: roles }));
  } catch {
    /* la aplicación conserva los permisos ya disponibles en memoria */
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useRole() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [anyAdmin, setAnyAdmin] = useState(true);
  const [loading, setLoading] = useState(true);
  /** Verdadero solo cuando ya se leyeron el rol y la pantalla asignada del usuario. */
  const [resuelto, setResuelto] = useState(false);
  /** Mensaje visible cuando no se pudieron confirmar los permisos. */
  const [error, setError] = useState<string | null>(null);
  /** Contador para volver a intentar la lectura a pedido del usuario. */
  const [intento, setIntento] = useState(0);
  /** Pantalla de inicio asignada al usuario en su ficha (manda sobre la sugerencia por rol). */
  const [pantallaAsignada, setPantallaAsignada] = useState<string | null>(null);
  /** Propietario de su empresa: SúperAdministrador con todos los permisos. */
  const [esPropietario, setEsPropietario] = useState(false);

  const reintentar = () => setIntento((n) => n + 1);

  useEffect(() => {
    if (esCajaLocal()) {
      setRoles(["cajero"]);
      setAnyAdmin(false);
      setLoading(false);
      setResuelto(true);
      return;
    }
    if (authLoading) return;
    if (!user) {
      setRoles([]);
      setPantallaAsignada(null);
      setLoading(false);
      setResuelto(false);
      setError(null);
      return;
    }
    // Mientras se leen rol y pantalla del usuario recién autenticado nadie debe
    // ser redirigido con datos incompletos.
    setLoading(true);
    setResuelto(false);
    setError(null);
    localStorage.setItem("costea.caja.last-user", user.id);

    (async () => {
      let fallo = false;
      try {
        const guardados = cachedRoles(user.id);
        if (!navigator.onLine) {
          setRoles(guardados);
          // Sin internet se trabaja con los permisos ya conocidos del equipo.
          fallo = guardados.length === 0;
          if (fallo) setError("Sin conexión: no se pudieron confirmar tus permisos.");
          return;
        }
        const read = async () => {
          const { data, error: err } = await supabase
            .from("user_roles")
            .select("user_id, role, is_owner")
            .eq("user_id", user.id);
          if (err) throw err;
          setEsPropietario((data ?? []).some((r) => r.is_owner));
          return (data ?? []).map((r) => r.role as AppRole);
        };

        /** Hasta 3 intentos con espera corta: una falla puntual no debe bloquear el ingreso. */
        const readConReintentos = async () => {
          let ultimo: unknown;
          for (let i = 0; i < 3; i += 1) {
            try {
              return await read();
            } catch (e) {
              ultimo = e;
              if (i < 2) await espera(600 * (i + 1));
            }
          }
          throw ultimo;
        };

        let mine: AppRole[];
        try {
          mine = await readConReintentos();
        } catch {
          // La sesión pudo caducar: se intenta renovar una vez antes de rendirse.
          const { data: renovada } = await supabase.auth.refreshSession();
          if (!renovada?.session) {
            setRoles(guardados);
            if (guardados.length > 0) {
              // Con permisos guardados se puede seguir trabajando sin expulsar al usuario.
              fallo = false;
              setError("No se pudieron confirmar tus permisos; se usan los últimos conocidos.");
              return;
            }
            fallo = true;
            setError("Tu sesión caducó. Vuelve a ingresar con tu contraseña.");
            const { cerrarSesionSegura } = await import("@/lib/auth-session");
            await cerrarSesionSegura();
            if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
              window.location.assign("/auth");
            }
            return;
          }
          try {
            mine = await readConReintentos();
          } catch {
            // No se pierde el rol conocido por un error puntual del servidor.
            setRoles(guardados);
            fallo = guardados.length === 0;
            setError(
              guardados.length > 0
                ? "No se pudieron confirmar tus permisos; se usan los últimos conocidos."
                : "No se pudo confirmar tus permisos. Reintenta en unos segundos.",
            );
            return;
          }
        }

        if (mine.length === 0 && navigator.onLine) {
          try {
            const { claimSystemOwnership } = await import("@/lib/ownership.functions");
            const res = await claimSystemOwnership();
            if (res?.claimed) mine = await read();
          } catch {
            /* sin propietario asignable */
          }
        }
        setRoles(mine);
        // Nunca se guarda una lista vacía: borraría los permisos ya conocidos.
        if (mine.length > 0) cacheRoles(user.id, mine);
        setAnyAdmin(true);
        try {
          const { data: perfil } = await supabase
            .from("profiles")
            .select("home_path")
            .eq("id", user.id)
            .maybeSingle();
          const asignada = perfil?.home_path;
          setPantallaAsignada(esPantallaValida(asignada) ? asignada : null);
        } catch {
          // La pantalla asignada es una preferencia: si falla se usa la del rol.
          setPantallaAsignada(null);
        }
      } finally {
        setLoading(false);
        setResuelto(!fallo);
      }

    })();

  }, [user, authLoading, intento]);

  // Bienvenida única para el Propietario de la empresa.
  useEffect(() => {
    if (!user || !esPropietario) return;
    const clave = `costea.bienvenida.${user.id}`;
    try {
      if (localStorage.getItem(clave)) return;
      localStorage.setItem(clave, "1");
    } catch {
      return;
    }
    import("sonner").then(({ toast }) =>
      toast.success("👑 Bienvenido a Costea Pro. Eres el SúperAdministrador Propietario de tu empresa."),
    );
  }, [user, esPropietario]);





  const has = (role: AppRole) => roles.includes(role);

  /** El rol 'administrador' es el creador/configurador: Super Administrador / Propietario. */
  const isSuperAdmin = has("administrador");
  /** Administrador Operativo: toda la operación diaria, sin configuración crítica ni comprobantes SRI. */
  const isAdminOperativo = has("admin_operativo");
  /** Acceso al módulo administrativo (gestión). */
  const isAdmin = isSuperAdmin || isAdminOperativo;

  const isCajero = has("cajero");
  const isMesero = has("mesero");
  const isCocina = has("cocina");

  /** Cajero puro: solo entorno de caja (cobrar), sin administración ni cocina. */
  const soloCaja = isCajero && !isAdmin && !isMesero && !isCocina;
  /** Cocina pura: solo la pantalla de comandas. */
  const soloCocina = isCocina && !isAdmin && !isCajero && !isMesero;

  /**
   * Pantalla de inicio: manda la asignada en la ficha del usuario. Si no tiene
   * ninguna, se sugiere según el rol
   * (Admin → Panel general · Cocina → Cocina · Cajero → Caja · Mesero → Punto de venta).
   */
  const homePath =
    pantallaAsignada ??
    (isAdmin
      ? "/admin/dashboard"
      : soloCocina
        ? "/cocina"
        : isCajero && !isMesero
          ? "/caja"
          : "/");


  return {
    roles,
    /** Propietario de su empresa (SúperAdministrador Propietario). */
    esPropietario,
    soloCaja,
    soloCocina,
    homePath,
    /** Rol y pantalla de inicio ya confirmados: recién ahí se puede redirigir. */
    resuelto,
    /** Aviso legible cuando no se pudieron leer los permisos. */
    error,
    /** Vuelve a intentar la lectura de rol y pantalla. */
    reintentar,


    isSuperAdmin,
    isAdminOperativo,
    isAdmin,
    isCajero,
    isMesero,
    isCocina,
    has,
    anyAdmin,
    loading,
    can: {
      /** Panel de Configuración General y datos tributarios: solo el Propietario. */
      configurar: isSuperAdmin,
      /** Comprobantes emitidos, claves de acceso, XML/RIDE y acciones SRI: solo el Propietario. */
      verComprobantes: isSuperAdmin,
      /** Gestión diaria completa: compras, proveedores, inventario, movimientos. */
      gestionarCompras: isAdmin,
      /** Roles y permisos: exclusivo del Super Administrador. */
      gestionarUsuarios: isSuperAdmin,
      gestionarMenu: isAdmin,
      gestionarMesas: isAdmin,
      /** Recetas y subrecetas: el Administrador Operativo solo consulta. */
      verRecetas: isAdmin,
      editarRecetas: isSuperAdmin,
      /** Gestión de Tiempos y Demoras. */
      gestionarTiempos: isAdmin,
      /** Cajero, operativo y propietario cobran y cierran caja. */
      cobrar: isAdmin || isCajero,
      /** Reportes financieros: no los ven el mesero ni el cajero. */
      verReportes: isAdmin,
      /** Pantalla de cocina: no la usa el cajero. */
      verCocina: isAdmin || isMesero || isCocina,
      /** Cocina no toma pedidos: solo prepara. */
      tomarPedidos: !soloCocina,
    },
  };
}
