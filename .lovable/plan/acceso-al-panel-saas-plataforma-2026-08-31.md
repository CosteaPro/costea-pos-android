# Acceso al panel SaaS (Plataforma)

## Cómo se entra hoy

1. Iniciar sesión en Costea POS.
2. En el menú lateral del panel administrativo aparece la sección **Plataforma**, o se entra directo a `/admin/plataforma`.
3. La bitácora global está en `/admin/plataforma/bitacora`.

La sección solo es visible para las cuentas registradas como administradores de plataforma.

## Situación actual

Revisando la base de datos, hoy solo una cuenta tiene ese permiso:

- `administrador@costeapos.local` → sí es admin de plataforma
- `info@costeapro.com` → **no** tiene el permiso todavía

Es decir: si entras con `Info@costeapro.com` no verás la sección Plataforma.

## Cambio propuesto

Habilitar `info@costeapro.com` como administrador de plataforma, para que pueda:

- Ver la lista de clientes (empresas) con sus KPIs
- Crear nuevos clientes y sucursales
- Activar/desactivar módulos y planes
- Consultar la bitácora global

## Detalle técnico

- Migración que inserta la fila correspondiente en `public.platform_admins` con el `user_id` de `info@costeapro.com` (buscado por correo en `auth.users`), con `ON CONFLICT DO NOTHING`.
- No se toca ninguna política RLS ni el resto del esquema; la función `is_platform_admin()` ya resuelve la visibilidad del menú y de las rutas `/admin/plataforma*`.

Tras aplicar el cambio, basta cerrar y volver a iniciar sesión con esa cuenta para ver la sección Plataforma.
