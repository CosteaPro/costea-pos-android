/** Datos de soporte técnico de Costea POS. */
export const SOPORTE_WHATSAPP = "593978959809";

const PANTALLAS: Array<{ match: RegExp; label: string }> = [
  { match: /^\/$/, label: "Punto de venta" },
  { match: /^\/mesas/, label: "Mesas" },
  { match: /^\/cocina/, label: "Cocina" },
  { match: /^\/caja/, label: "Caja" },
  { match: /^\/clientes/, label: "Clientes" },
  { match: /^\/reportes/, label: "Reportes" },
  { match: /^\/tiempos/, label: "Tiempos y demoras" },
  { match: /^\/bitacora/, label: "Bitácora de demoras" },
  { match: /^\/menu/, label: "Menú" },
  { match: /^\/configuracion/, label: "Configuración" },
  { match: /^\/admin\/accesos/, label: "Registro de accesos" },
  { match: /^\/admin\/([a-z-]+)/, label: "" },
  { match: /^\/admin/, label: "Módulo administrativo" },
];

/** Nombre legible de la pantalla abierta a partir de la ruta actual. */
export function nombrePantalla(pathname: string): string {
  for (const p of PANTALLAS) {
    const m = pathname.match(p.match);
    if (!m) continue;
    if (p.label) return p.label;
    const slug = m[1] ?? "";
    return "Administración · " + slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
  return pathname;
}

export function fechaHoraEc(date = new Date()): string {
  return date.toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type SoporteMensaje = {
  local: string;
  usuario: string;
  pantalla: string;
  problema: string;
  adjunto: boolean;
};

const LINEA = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

export function armarMensajeSoporte(m: SoporteMensaje): string {
  return [
    LINEA,
    "🔔 SOPORTE — COSTEA POS",
    LINEA,
    `🏪 Local: ${m.local}`,
    `👤 Usuario: ${m.usuario}`,
    `📅 Fecha y hora: ${fechaHoraEc()}`,
    `📄 Pantalla: ${m.pantalla}`,
    "",
    "📝 PROBLEMA:",
    `→ ${m.problema.trim()}`,
    "",
    `📎 Adjunto: ${m.adjunto ? "✅ Sí" : "❌ No"}`,
    LINEA,
  ].join("\n");
}

export type AlertaSeguridad = {
  usuario: string;
  rol: string;
  ciudad: string;
  pais: string;
  equipoNuevo: boolean;
  motivo: string;
};

export function armarAlertaSeguridad(a: AlertaSeguridad): string {
  return [
    "⚠️ ALERTA DE SEGURIDAD — COSTEA POS",
    `Usuario: ${a.usuario} — Rol: ${a.rol}`,
    `Fecha y hora: ${fechaHoraEc()}`,
    `Ubicación: ${a.ciudad || "Desconocida"}, ${a.pais || "—"}`,
    `Equipo: ${a.equipoNuevo ? "NUEVO" : "registrado"}`,
    `Motivo: ${a.motivo}`,
    "",
    "¿Fuiste tú? Si no fuiste tú → cierra la sesión de inmediato",
  ].join("\n");
}

export function whatsappUrl(texto: string): string {
  return `https://wa.me/${SOPORTE_WHATSAPP}?text=${encodeURIComponent(texto)}`;
}
