import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loginEmailFor, normalizeUsername } from "@/lib/usernames";
import { MODULOS_POR_PLAN, slugEmpresa, type EstadoEmpresa, type PlanPlataforma } from "@/lib/plataforma";

export type EmpresaResumen = {
  id: string;
  trade_name: string;
  legal_name: string;
  ruc: string;
  region: string;
  plan: PlanPlataforma;
  status: EstadoEmpresa;
  contact_email: string;
  contact_phone: string;
  created_at: string;
  sucursales: number;
  usuarios: number;
};

export type SucursalPlataforma = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  address: string;
  establishment: string;
  emission_point: string;
  kind: "local" | "bodega";
  is_primary: boolean;
  active: boolean;
};

export type UsuarioEmpresa = {
  user_id: string;
  username: string | null;
  contact_email: string | null;
  role: string | null;
  is_company_owner: boolean;
  active: boolean;
  created_at: string;
};

export type MovimientoBitacora = {
  id: number;
  created_at: string;
  company_id: string | null;
  user_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
};

/** Cada operación del panel se autoriza en el servidor, nunca en el navegador. */
async function exigirAdminPlataforma(supabase: any) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || !data) throw new Error("Solo un administrador de la plataforma puede usar este panel");
}

export const soyAdminPlataforma = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("is_platform_admin");
    return { esAdmin: Boolean(data) };
  });

export const listarEmpresas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmpresaResumen[]> => {
    await exigirAdminPlataforma(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: empresas, error } = await supabaseAdmin
      .from("platform_companies")
      .select("id, trade_name, legal_name, ruc, region, plan, status, contact_email, contact_phone, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const { data: sucursales } = await supabaseAdmin
      .from("platform_branches")
      .select("company_id")
      .is("deleted_at", null);
    const { data: usuarios } = await supabaseAdmin
      .from("company_users")
      .select("company_id")
      .is("deleted_at", null);

    const contar = (filas: { company_id: string }[] | null, id: string) =>
      (filas ?? []).filter((f) => f.company_id === id).length;

    return (empresas ?? []).map((e) => ({
      ...(e as any),
      sucursales: contar(sucursales as any, e.id),
      usuarios: contar(usuarios as any, e.id),
    }));
  });

export const detalleEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => {
    if (!input?.companyId) throw new Error("Empresa requerida");
    return input;
  })
  .handler(async ({ data, context }) => {
    await exigirAdminPlataforma(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: empresa, error } = await supabaseAdmin
      .from("platform_companies")
      .select("*")
      .eq("id", data.companyId)
      .maybeSingle();
    if (error) throw error;
    if (!empresa) throw new Error("La empresa no existe");

    const { data: sucursales } = await supabaseAdmin
      .from("platform_branches")
      .select("id, company_id, code, name, address, establishment, emission_point, kind, is_primary, active")
      .eq("company_id", data.companyId)
      .is("deleted_at", null)
      .order("code");

    const { data: modulos } = await supabaseAdmin
      .from("company_modules")
      .select("module_key, enabled")
      .eq("company_id", data.companyId);

    const { data: vinculos } = await supabaseAdmin
      .from("company_users")
      .select("user_id, is_company_owner, active, created_at")
      .eq("company_id", data.companyId)
      .is("deleted_at", null);

    const ids = (vinculos ?? []).map((v) => v.user_id);
    const { data: perfiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, username, contact_email").in("id", ids)
      : { data: [] as any[] };
    const { data: roles } = ids.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as any[] };

    const usuarios: UsuarioEmpresa[] = (vinculos ?? []).map((v) => ({
      user_id: v.user_id,
      username: perfiles?.find((p: any) => p.id === v.user_id)?.username ?? null,
      contact_email: perfiles?.find((p: any) => p.id === v.user_id)?.contact_email ?? null,
      role: roles?.find((r: any) => r.user_id === v.user_id)?.role ?? null,
      is_company_owner: v.is_company_owner,
      active: v.active,
      created_at: v.created_at,
    }));

    const { data: actividad } = await supabaseAdmin
      .from("audit_log")
      .select("id, created_at, company_id, user_email, action, entity, entity_id")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(30);

    return {
      empresa: empresa as any,
      sucursales: (sucursales ?? []) as SucursalPlataforma[],
      modulos: (modulos ?? []) as { module_key: string; enabled: boolean }[],
      usuarios,
      actividad: (actividad ?? []) as MovimientoBitacora[],
    };
  });

export const crearEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      tradeName: string;
      legalName?: string;
      ruc: string;
      region: string;
      plan: PlanPlataforma;
      status: EstadoEmpresa;
      contactEmail?: string;
      contactPhone?: string;
      branchName?: string;
      branchAddress?: string;
      establishment?: string;
      emissionPoint?: string;
      ownerUsername: string;
      ownerPassword: string;
      ownerEmail?: string;
      modules?: string[];
    }) => {
      const tradeName = (input?.tradeName ?? "").trim();
      if (tradeName.length < 3) throw new Error("El nombre comercial es obligatorio");
      const ruc = (input?.ruc ?? "").trim();
      if (!/^\d{10,13}$/.test(ruc)) throw new Error("El RUC debe tener entre 10 y 13 dígitos");
      const ownerUsername = normalizeUsername(input?.ownerUsername ?? "");
      if (ownerUsername.length < 3) throw new Error("El usuario del propietario debe tener al menos 3 caracteres");
      if (!input?.ownerPassword || input.ownerPassword.length < 6)
        throw new Error("La contraseña del propietario debe tener al menos 6 caracteres");
      return {
        tradeName,
        legalName: (input.legalName ?? "").trim(),
        ruc,
        region: (input.region ?? "Quito").trim(),
        plan: input.plan,
        status: input.status,
        contactEmail: (input.contactEmail ?? "").trim(),
        contactPhone: (input.contactPhone ?? "").trim(),
        branchName: (input.branchName ?? "Matriz").trim(),
        branchAddress: (input.branchAddress ?? "").trim(),
        establishment: (input.establishment ?? "001").trim(),
        emissionPoint: (input.emissionPoint ?? "001").trim(),
        ownerUsername,
        ownerPassword: input.ownerPassword,
        ownerEmail: (input.ownerEmail ?? "").trim(),
        modules: input.modules?.length ? input.modules : MODULOS_POR_PLAN[input.plan],
      };
    },
  )
  .handler(async ({ data, context }) => {
    await exigirAdminPlataforma(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // El usuario del propietario solo debe ser único dentro de su propia empresa,
    // que aún no existe: por eso aquí no hay comprobación global.

    let slug = slugEmpresa(data.tradeName) || `cliente-${Date.now().toString(36)}`;
    const { data: slugTomado } = await supabaseAdmin
      .from("platform_companies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (slugTomado) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const { data: companyId, error: errEmpresa } = await supabaseAdmin.rpc("create_platform_company", {
      _actor: context.userId,
      _owner_user_id: null as unknown as string,
      _trade_name: data.tradeName,
      _legal_name: data.legalName,
      _ruc: data.ruc,
      _region: data.region,
      _plan: data.plan,
      _status: data.status,
      _slug: slug,
      _contact_email: data.contactEmail,
      _contact_phone: data.contactPhone,
      _branch_name: data.branchName,
      _branch_address: data.branchAddress,
      _establishment: data.establishment,
      _emission_point: data.emissionPoint,
      _modules: data.modules,
    });
    if (errEmpresa) throw new Error(errEmpresa.message);

    const revertir = async (motivo: string) => {
      await supabaseAdmin.from("platform_companies").delete().eq("id", companyId as string);
      throw new Error(motivo);
    };

    // El correo interno incluye la empresa: cada cliente puede tener su propio
    // "administrador" sin chocar con los usuarios de otros clientes.
    const loginEmail = loginEmailFor(data.ownerUsername, slug);

    const { data: creado, error: errUsuario } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail,
      password: data.ownerPassword,
      email_confirm: true,
      user_metadata: { username: data.ownerUsername, contact_email: data.ownerEmail },
    });
    if (errUsuario || !creado?.user) await revertir(errUsuario?.message ?? "No se pudo crear el propietario");
    const userId = creado!.user!.id;

    const limpiar = async (motivo: string) => {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      await revertir(motivo);
    };

    const { error: errPerfil } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      username: data.ownerUsername,
      login_email: loginEmail,
      contact_email: data.ownerEmail || null,
      home_path: "/admin/dashboard",
      company_id: companyId as string,
    });
    if (errPerfil) await limpiar("Ese nombre de usuario ya existe en esta empresa. Elige otro.");

    const { error: errVinculo } = await supabaseAdmin.from("company_users").insert({
      company_id: companyId as string,
      user_id: userId,
      is_company_owner: true,
      active: true,
      created_by: context.userId,
      updated_by: context.userId,
    });
    if (errVinculo) await limpiar(errVinculo.message);

    // Regla de oro: el primer usuario de la empresa es SúperAdministrador Propietario.
    const { error: errRol } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "administrador", is_owner: true, company_id: companyId as string });
    if (errRol) await limpiar(errRol.message);


    return { ok: true, companyId: companyId as string };
  });

export const actualizarEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      tradeName?: string;
      legalName?: string;
      ruc?: string;
      region?: string;
      plan?: PlanPlataforma;
      status?: EstadoEmpresa;
      contactEmail?: string;
      contactPhone?: string;
    }) => {
      if (!input?.companyId) throw new Error("Empresa requerida");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await exigirAdminPlataforma(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, any> = { updated_by: context.userId, updated_at: new Date().toISOString() };
    if (data.tradeName !== undefined) patch.trade_name = data.tradeName.trim();
    if (data.legalName !== undefined) patch.legal_name = data.legalName.trim();
    if (data.ruc !== undefined) patch.ruc = data.ruc.trim();
    if (data.region !== undefined) patch.region = data.region;
    if (data.plan !== undefined) patch.plan = data.plan;
    if (data.status !== undefined) patch.status = data.status;
    if (data.contactEmail !== undefined) patch.contact_email = data.contactEmail.trim();
    if (data.contactPhone !== undefined) patch.contact_phone = data.contactPhone.trim();

    const { error } = await supabaseAdmin.from("platform_companies").update(patch as any).eq("id", data.companyId);
    if (error) throw error;

    await supabaseAdmin.from("audit_log").insert({
      company_id: data.companyId,
      user_id: context.userId,
      action: "actualizar_empresa",
      entity: "platform_companies",
      entity_id: data.companyId,
      changes: patch as any,
    });
    return { ok: true };
  });

export const guardarSucursal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      branchId?: string;
      code: string;
      name: string;
      address?: string;
      establishment?: string;
      emissionPoint?: string;
      kind: "local" | "bodega";
      active?: boolean;
    }) => {
      if (!input?.companyId) throw new Error("Empresa requerida");
      if (!input?.name?.trim()) throw new Error("El nombre de la sucursal es obligatorio");
      if (!input?.code?.trim()) throw new Error("El código de la sucursal es obligatorio");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await exigirAdminPlataforma(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fila = {
      company_id: data.companyId,
      code: data.code.trim(),
      name: data.name.trim(),
      address: data.address?.trim() ?? "",
      establishment: data.establishment?.trim() || "001",
      emission_point: data.emissionPoint?.trim() || "001",
      kind: data.kind,
      active: data.active ?? true,
      updated_by: context.userId,
    };
    if (data.branchId) {
      const { error } = await supabaseAdmin.from("platform_branches").update(fila).eq("id", data.branchId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("platform_branches")
        .insert({ ...fila, created_by: context.userId });
      if (error) throw error;
    }
    await supabaseAdmin.from("audit_log").insert({
      company_id: data.companyId,
      user_id: context.userId,
      action: data.branchId ? "actualizar_sucursal" : "crear_sucursal",
      entity: "platform_branches",
      entity_id: data.branchId ?? null,
      changes: fila as any,
    });
    return { ok: true };
  });

export const guardarModulos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; modules: Record<string, boolean> }) => {
    if (!input?.companyId) throw new Error("Empresa requerida");
    if (!input?.modules) throw new Error("Módulos requeridos");
    return input;
  })
  .handler(async ({ data, context }) => {
    await exigirAdminPlataforma(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const filas = Object.entries(data.modules).map(([module_key, enabled]) => ({
      company_id: data.companyId,
      module_key,
      enabled,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin
      .from("company_modules")
      .upsert(filas, { onConflict: "company_id,module_key" });
    if (error) throw error;
    await supabaseAdmin.from("audit_log").insert({
      company_id: data.companyId,
      user_id: context.userId,
      action: "actualizar_modulos",
      entity: "company_modules",
      entity_id: data.companyId,
      changes: data.modules as any,
    });
    return { ok: true };
  });

export const crearUsuarioEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      username: string;
      password: string;
      role: string;
      contactEmail?: string;
    }) => {
      if (!input?.companyId) throw new Error("Empresa requerida");
      const username = normalizeUsername(input?.username ?? "");
      if (username.length < 3) throw new Error("El nombre de usuario debe tener al menos 3 caracteres");
      if (!input?.password || input.password.length < 6)
        throw new Error("La contraseña debe tener al menos 6 caracteres");
      const roles = ["administrador", "admin_operativo", "cajero", "mesero", "cocina"];
      if (!roles.includes(input.role)) throw new Error("Rol inválido");
      return { ...input, username, contactEmail: (input.contactEmail ?? "").trim() };
    },
  )
  .handler(async ({ data, context }) => {
    await exigirAdminPlataforma(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Único dentro de la empresa, no en todo el sistema.
    const { data: tomado } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("company_id", data.companyId)
      .ilike("username", data.username)
      .maybeSingle();
    if (tomado) throw new Error("Ese nombre de usuario ya existe en esta empresa. Elige otro.");

    const { data: empresa } = await supabaseAdmin
      .from("platform_companies")
      .select("slug")
      .eq("id", data.companyId)
      .maybeSingle();
    const loginEmail = loginEmailFor(data.username, empresa?.slug ?? null);

    const { data: creado, error } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username, contact_email: data.contactEmail },
    });
    if (error || !creado?.user) throw new Error(error?.message ?? "No se pudo crear el usuario");
    const userId = creado.user.id;

    const { error: errPerfil } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      username: data.username,
      login_email: loginEmail,
      contact_email: data.contactEmail || null,
      company_id: data.companyId,
    });
    if (errPerfil) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error("Ese nombre de usuario ya existe en esta empresa. Elige otro.");
    }
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role as any, company_id: data.companyId });
    await supabaseAdmin.from("company_users").insert({
      company_id: data.companyId,
      user_id: userId,
      active: true,
      created_by: context.userId,
      updated_by: context.userId,
    });
    return { ok: true, userId };
  });

export const restablecerClaveUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) => {
    if (!input?.userId) throw new Error("Usuario requerido");
    if (!input?.password || input.password.length < 6)
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    return input;
  })
  .handler(async ({ data, context }) => {
    await exigirAdminPlataforma(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bitacoraPlataforma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string; desde?: string; hasta?: string; texto?: string }) => input ?? {})
  .handler(async ({ data, context }): Promise<MovimientoBitacora[]> => {
    await exigirAdminPlataforma(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("audit_log")
      .select("id, created_at, company_id, user_email, action, entity, entity_id")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.companyId) q = q.eq("company_id", data.companyId);
    if (data.desde) q = q.gte("created_at", `${data.desde}T00:00:00-05:00`);
    if (data.hasta) q = q.lte("created_at", `${data.hasta}T23:59:59-05:00`);
    if (data.texto) q = q.ilike("action", `%${data.texto}%`);
    const { data: filas, error } = await q;
    if (error) throw error;
    return (filas ?? []) as MovimientoBitacora[];
  });
