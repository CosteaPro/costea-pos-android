import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LOGIN_DOMAIN, loginEmailFor, normalizeUsername } from "@/lib/usernames";
import { esPantallaValida, pantallaSugerida, type PantallaInicio } from "@/lib/pantallas-inicio";

export type AppRoleName = "administrador" | "admin_operativo" | "cajero" | "mesero" | "cocina";

export type StaffMember = {
  id: string;
  email: string;
  username: string | null;
  contactEmail: string | null;
  created_at: string;
  role: AppRoleName | null;
  /** Pantalla que abre este usuario al entrar. */
  homePath: PantallaInicio | null;
  /** Propietario del sistema: su rol no se puede cambiar desde la lista. */
  isOwner: boolean;
};


const ROLES: AppRoleName[] = ["administrador", "admin_operativo", "cajero", "mesero", "cocina"];


async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "administrador")
    .maybeSingle();
  if (!data) throw new Error("Solo el Super Administrador puede gestionar roles y permisos");
}

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StaffMember[]> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("user_id, role, is_owner");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, username, contact_email, home_path");
    return data.users.map((u) => {
      const prof = profiles?.find((p) => p.id === u.id);
      const fila = roles?.find((r) => r.user_id === u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        username: prof?.username ?? null,
        contactEmail: prof?.contact_email ?? (u.email?.endsWith(`@${LOGIN_DOMAIN}`) ? null : u.email ?? null),
        created_at: u.created_at,
        role: (fila?.role as AppRoleName) ?? null,
        homePath: esPantallaValida(prof?.home_path) ? prof.home_path : null,
        isOwner: Boolean(fila?.is_owner),
      };
    });
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: AppRoleName }) => {
    if (!input?.userId) throw new Error("Usuario requerido");
    if (!ROLES.includes(input.role)) throw new Error("Rol inválido");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // La fila del Propietario solo cambia con la transferencia de propiedad.
    const { data: actual } = await supabaseAdmin
      .from("user_roles")
      .select("is_owner")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (actual?.is_owner) {
      throw new Error(
        "Este usuario es el Propietario del sistema. Usa «Nombrar Propietario» en otro usuario para transferir la propiedad.",
      );
    }
    if (data.role === "administrador") {
      throw new Error(
        "Cada empresa tiene un solo Super Administrador / Propietario. Usa «Nombrar Propietario» para transferir la propiedad.",
      );
    }
    const { data: perfil } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", data.userId)
      .maybeSingle();
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role, company_id: perfil?.company_id ?? undefined });
    if (error) throw error;
    return { ok: true };
  });

/** Transfiere la condición de Super Administrador / Propietario a otro usuario. */
export const transferOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId) throw new Error("Usuario requerido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: soyPropietario } = await context.supabase.rpc("is_system_owner", {
      _user_id: context.userId,
    });
    if (!soyPropietario) {
      throw new Error("Solo el Propietario actual puede transferir la propiedad del sistema");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("transfer_system_ownership", {
      _current_owner: context.userId,
      _target_user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });



/**
 * Crea un usuario de acceso. El correo puede repetirse entre usuarios: solo se
 * guarda como contacto. Lo único irrepetible es el nombre de usuario.
 */
export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      username: string;
      contactEmail: string;
      password: string;
      role: AppRoleName;
      homePath?: string;
    }) => {
      const username = normalizeUsername(input?.username ?? "");
      if (username.length < 3) throw new Error("El nombre de usuario debe tener al menos 3 caracteres");
      if (!input?.password || input.password.length < 6)
        throw new Error("La contraseña debe tener al menos 6 caracteres");
      if (!ROLES.includes(input.role)) throw new Error("Rol inválido");
      if (input.role === "administrador")
        throw new Error(
          "El Super Administrador / Propietario es único: crea el usuario con otro rol y luego usa «Nombrar Propietario».",
        );
      if (input.homePath && !esPantallaValida(input.homePath))
        throw new Error("Pantalla de inicio inválida");

      return {
        username,
        contactEmail: (input.contactEmail ?? "").trim(),
        password: input.password,
        role: input.role,
        homePath: (esPantallaValida(input.homePath)
          ? input.homePath
          : pantallaSugerida(input.role)) as PantallaInicio,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // El usuario nuevo pertenece a la misma empresa de quien lo crea.
    const { data: yo } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    const companyId = yo?.company_id ?? null;
    const { data: empresa } = companyId
      ? await supabaseAdmin
          .from("platform_companies")
          .select("slug")
          .eq("id", companyId)
          .maybeSingle()
      : { data: null };

    // El nombre de usuario solo debe ser único dentro de la empresa.
    let duplicado = supabaseAdmin.from("profiles").select("id").ilike("username", data.username);
    duplicado = companyId ? duplicado.eq("company_id", companyId) : duplicado.is("company_id", null);
    const { data: taken } = await duplicado.maybeSingle();
    if (taken) throw new Error("Ese nombre de usuario ya existe en esta empresa. Elige otro.");

    const loginEmail = loginEmailFor(data.username, empresa?.slug ?? null);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username, contact_email: data.contactEmail },
    });
    if (error) throw new Error(error.message);
    const userId = created.user!.id;

    const { error: profErr } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      username: data.username,
      login_email: loginEmail,
      ...(companyId ? { company_id: companyId } : {}),
      contact_email: data.contactEmail || null,
      home_path: data.homePath,
    });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error("Ese nombre de usuario ya existe en esta empresa. Elige otro.");
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role, company_id: companyId ?? undefined });
    if (roleErr) throw roleErr;

    return { ok: true, userId };
  });

/** Cambia la contraseña, el correo de contacto o la pantalla de inicio de un usuario. */
export const updateStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { userId: string; password?: string; contactEmail?: string; homePath?: string }) => {
      if (!input?.userId) throw new Error("Usuario requerido");
      if (input.password && input.password.length < 6)
        throw new Error("La contraseña debe tener al menos 6 caracteres");
      if (input.homePath !== undefined && !esPantallaValida(input.homePath))
        throw new Error("Pantalla de inicio inválida");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        password: data.password,
      });
      if (error) throw new Error(error.message);
    }
    const patch: { contact_email?: string | null; home_path?: string } = {};
    if (typeof data.contactEmail === "string") patch.contact_email = data.contactEmail.trim() || null;
    if (typeof data.homePath === "string") patch.home_path = data.homePath;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.userId);
      if (error) throw error;
    }
    return { ok: true };
  });
