import { createServerFn } from "@tanstack/react-start";
import { loginEmailFor, normalizeUsername } from "@/lib/usernames";
import { MODULOS_POR_PLAN, slugEmpresa } from "@/lib/plataforma";

/**
 * Registro de un cliente nuevo desde la pantalla de acceso.
 *
 * Regla de oro: el primer usuario de cada empresa nace SúperAdministrador
 * Propietario, con todos los permisos y sin que nadie tenga que intervenir.
 */
export const registrarEmpresa = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { negocio: string; username: string; password: string; contactEmail?: string }) => {
      const negocio = (input?.negocio ?? "").trim();
      if (negocio.length < 3) throw new Error("El nombre del negocio es obligatorio");
      const username = normalizeUsername(input?.username ?? "");
      if (username.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres");
      if (!input?.password || input.password.length < 6)
        throw new Error("La contraseña debe tener al menos 6 caracteres");
      return {
        negocio,
        username,
        password: input.password,
        contactEmail: (input.contactEmail ?? "").trim(),
      };
    },
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Identificador único del negocio.
    let slug = slugEmpresa(data.negocio) || `cliente-${Date.now().toString(36)}`;
    const { data: tomado } = await supabaseAdmin
      .from("platform_companies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (tomado) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const { data: empresa, error: errEmpresa } = await supabaseAdmin
      .from("platform_companies")
      .insert({
        trade_name: data.negocio,
        legal_name: data.negocio,
        ruc: "",
        region: "Quito",
        plan: "junior",
        status: "prueba",
        slug,
        contact_email: data.contactEmail,
        contact_phone: "",
      })
      .select("id")
      .single();
    if (errEmpresa || !empresa) throw new Error(errEmpresa?.message ?? "No se pudo crear el negocio");
    const companyId = empresa.id as string;

    const revertir = async (motivo: string): Promise<never> => {
      await supabaseAdmin.from("platform_companies").delete().eq("id", companyId);
      throw new Error(motivo);
    };

    const { data: sucursal } = await supabaseAdmin
      .from("platform_branches")
      .insert({
        company_id: companyId,
        code: "S001",
        name: "Matriz",
        address: "",
        establishment: "001",
        emission_point: "001",
        kind: "local",
        is_primary: true,
        active: true,
      })
      .select("id")
      .maybeSingle();

    for (const modulo of MODULOS_POR_PLAN.junior) {
      await supabaseAdmin
        .from("company_modules")
        .upsert({ company_id: companyId, module_key: modulo, enabled: true }, { onConflict: "company_id,module_key" });
    }

    await supabaseAdmin.from("company_settings").insert({
      company_id: companyId,
      business_name: data.negocio,
      trade_name: data.negocio,
      ruc: "",
      establishment: "001",
      emission_point: "001",
    });

    await supabaseAdmin.from("document_sequences").insert({
      company_id: companyId,
      doc_type: "factura",
      establishment: "001",
      emission_point: "001",
      next_sequential: 1,
    });

    const loginEmail = loginEmailFor(data.username, slug);
    const { data: creado, error: errUsuario } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username, contact_email: data.contactEmail },
    });
    if (errUsuario || !creado?.user) {
      await revertir(errUsuario?.message ?? "No se pudo crear el usuario propietario");
    }
    const userId = creado!.user!.id;

    const limpiar = async (motivo: string): Promise<never> => {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return revertir(motivo);
    };

    const { error: errPerfil } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      username: data.username,
      login_email: loginEmail,
      contact_email: data.contactEmail || null,
      home_path: "/admin/dashboard",
      company_id: companyId,
    });
    if (errPerfil) await limpiar("No se pudo crear el usuario propietario. Intenta con otro nombre.");

    const { error: errVinculo } = await supabaseAdmin.from("company_users").insert({
      company_id: companyId,
      branch_id: sucursal?.id ?? null,
      user_id: userId,
      is_company_owner: true,
      active: true,
    });
    if (errVinculo) await limpiar(errVinculo.message);

    // Propietario de la empresa: SúperAdministrador con todos los permisos.
    const { error: errRol } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "administrador", is_owner: true, company_id: companyId });
    if (errRol) await limpiar(errRol.message);

    return { ok: true, slug, loginEmail };
  });
