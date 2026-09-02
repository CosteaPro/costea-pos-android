import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccessRow = {
  id: string;
  user_id: string;
  user_email: string;
  role: string;
  device_id: string;
  device_label: string;
  ip: string | null;
  city: string | null;
  country: string | null;
  is_new_device: boolean;
  is_new_location: boolean;
  concurrent: boolean;
  status: string;
  created_at: string;
  last_seen_at: string;
};

export type RecordLoginResult = {
  sessionId: string;
  role: string;
  city: string;
  country: string;
  isNewDevice: boolean;
  isNewLocation: boolean;
  concurrent: boolean;
};

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "administrador")
    .maybeSingle();
  if (!data) throw new Error("Solo el Super Administrador puede ver el registro de accesos");
}

/** Registra el inicio de sesión con equipo y ubicación aproximada. */
export const recordLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { deviceId: string; deviceLabel: string; userAgent: string }) => {
    if (!input?.deviceId) throw new Error("Equipo no identificado");
    return {
      deviceId: input.deviceId.slice(0, 80),
      deviceLabel: (input.deviceLabel ?? "").slice(0, 120),
      userAgent: (input.userAgent ?? "").slice(0, 400),
    };
  })
  .handler(async ({ data, context }): Promise<RecordLoginResult> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const headers = request?.headers;
    const ip =
      headers?.get("cf-connecting-ip") ??
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;

    let city = "";
    let country = "";
    if (ip) {
      try {
        const res = await fetch(`https://ipwho.is/${ip}`);
        if (res.ok) {
          const geo = (await res.json()) as { city?: string; country?: string; success?: boolean };
          if (geo.success !== false) {
            city = geo.city ?? "";
            country = geo.country ?? "";
          }
        }
      } catch {
        /* la ubicación es informativa: si falla, se registra igual */
      }
    }

    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const role = roleRows?.[0]?.role ?? "sin rol";

    const { data: history } = await context.supabase
      .from("login_sessions")
      .select("device_id, city, status, last_seen_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);

    const previous = history ?? [];
    const isNewDevice = !previous.some((r) => r.device_id === data.deviceId);
    const knownCities = previous.map((r) => (r.city ?? "").trim()).filter(Boolean);
    const isNewLocation = Boolean(city) && knownCities.length > 0 && !knownCities.includes(city);

    const limite = Date.now() - 15 * 60 * 1000;
    const concurrent = previous.some(
      (r) =>
        r.status === "activa" &&
        r.device_id !== data.deviceId &&
        new Date(r.last_seen_at).getTime() > limite,
    );

    const { data: inserted, error } = await context.supabase
      .from("login_sessions")
      .insert({
        user_id: context.userId,
        user_email: (context.claims as { email?: string })?.email ?? "",
        role,
        device_id: data.deviceId,
        device_label: data.deviceLabel,
        user_agent: data.userAgent,
        ip,
        city,
        country,
        is_new_device: isNewDevice,
        is_new_location: isNewLocation,
        concurrent,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return {
      sessionId: inserted.id,
      role,
      city,
      country,
      isNewDevice,
      isNewLocation,
      concurrent,
    };
  });

/** Bitácora completa de accesos: exclusiva del Super Administrador. */
export const listAccessLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string }) => input)
  .handler(async ({ data, context }): Promise<AccessRow[]> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("login_sessions")
      .select(
        "id, user_id, user_email, role, device_id, device_label, ip, city, country, is_new_device, is_new_location, concurrent, status, created_at, last_seen_at",
      )
      .gte("created_at", `${data.from}T00:00:00-05:00`)
      .lte("created_at", `${data.to}T23:59:59-05:00`)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (rows ?? []) as AccessRow[];
  });

/** Cierra a distancia la sesión de un equipo sin afectar la sesión propia. */
export const revokeAccessSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string }) => {
    if (!input?.sessionId) throw new Error("Sesión requerida");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("login_sessions")
      .update({
        status: "cerrada_remoto",
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
        revoked_by_email: (context.claims as { email?: string })?.email ?? "",
      })
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
