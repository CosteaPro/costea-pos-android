import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { armarAlertaSeguridad, whatsappUrl } from "@/lib/soporte";
import { esCajaLocal } from "@/lib/caja-local";
import { cerrarSesionSegura } from "@/lib/auth-session";

const DEVICE_KEY = "costea-pos-device-id";
const SESSION_KEY = "costea-pos-session-row";

/** Identificador estable del equipo (se guarda en este navegador). */
export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `EQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** Nombre legible del equipo a partir del navegador y el sistema. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const so = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/i.test(ua)
        ? "iOS"
        : /Mac OS X/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Equipo";
  const nav = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua)
      ? "Chrome"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "Navegador";
  return `${so} · ${nav}`;
}

/**
 * Registra el acceso en la bitácora, avisa de equipos o ubicaciones nuevas
 * y cierra la sesión al instante cuando el administrador la revoca a distancia.
 */
export function useAccessGuard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const registered = useRef(false);

  useEffect(() => {
    if (esCajaLocal()) return;
    if (loading || !user) return;
    let stop = false;

    const run = async () => {
      let rowId = sessionStorage.getItem(SESSION_KEY);

      if (!rowId && !registered.current) {
        registered.current = true;
        try {
          const { recordLogin } = await import("@/lib/access-log.functions");
          const res = await recordLogin({
            data: {
              deviceId: deviceId(),
              deviceLabel: deviceLabel(),
              userAgent: navigator.userAgent,
            },
          });
          rowId = res.sessionId;
          sessionStorage.setItem(SESSION_KEY, rowId);

          const esAdmin = res.role === "administrador" || res.role === "admin_operativo";
          const motivos = [
            res.isNewDevice ? "equipo nunca antes registrado" : "",
            res.isNewLocation ? "ciudad o país diferente al habitual" : "",
            res.concurrent ? "el mismo usuario está conectado en otro equipo" : "",
          ].filter(Boolean);

          if (esAdmin && motivos.length) {
            const texto = armarAlertaSeguridad({
              usuario: user.email ?? "",
              rol: res.role === "administrador" ? "Superadmin" : "Admin",
              ciudad: res.city,
              pais: res.country,
              equipoNuevo: res.isNewDevice,
              motivo: motivos.join(" · "),
            });
            toast.warning("Alerta de seguridad en este acceso", {
              description: motivos.join(" · "),
              duration: 15000,
              action: {
                label: "Avisar por WhatsApp",
                onClick: () => window.open(whatsappUrl(texto), "_blank", "noopener"),
              },
            });
          }
        } catch {
          /* la bitácora no debe bloquear el trabajo diario */
        }
      }

      if (!rowId) return;

      const check = async () => {
        if (stop) return;
        const { data } = await supabase
          .from("login_sessions")
          .select("status")
          .eq("id", rowId!)
          .maybeSingle();
        if (data?.status === "cerrada_remoto") {
          stop = true;
          sessionStorage.removeItem(SESSION_KEY);
          await cerrarSesionSegura();
          toast.error("Sesión cerrada por el administrador", {
            description: "Vuelve a ingresar con tu contraseña.",
            duration: 20000,
          });
          navigate({ to: "/auth", replace: true });
          return;
        }
        await supabase
          .from("login_sessions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", rowId!);
      };

      await check();
      const timer = window.setInterval(check, 30000);
      return () => window.clearInterval(timer);
    };

    let cleanup: (() => void) | undefined;
    run().then((c) => {
      if (stop) c?.();
      else cleanup = c;
    });

    return () => {
      stop = true;
      cleanup?.();
    };
  }, [user, loading, navigate]);
}
