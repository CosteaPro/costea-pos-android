# Panel de SúperAdmin — Etapa 2

## Qué resuelve

Hoy la base ya es multiempresa: Chusin Chuzón es el Cliente #1, cada tabla tiene empresa y sucursal, y el aislamiento entre clientes funciona. Lo que falta es la **pantalla** para administrar la plataforma: hoy no hay ningún lugar donde ver la lista de clientes ni crear el Cliente #2.

Esta etapa construye ese panel, visible únicamente para nosotros (SúperAdmin de plataforma). Ningún cliente lo ve ni sabe que existe.

## Cómo se entra

Una sección nueva **Plataforma** en el menú administrativo, que solo aparece si el usuario está registrado como administrador de plataforma. Para todos los demás usuarios el menú se ve exactamente igual que hoy.

Ruta: `/admin/plataforma`.

## Pantallas

### 1. Lista de clientes

Tabla con todas las empresas: nombre comercial, RUC, región, plan (Junior / Pro / Premium), estado (activa, prueba, suspendida), número de sucursales, número de usuarios y fecha de alta. Buscador por nombre o RUC y filtros por región, plan y estado.

Arriba, cuatro indicadores: clientes activos, en prueba, suspendidos y total de sucursales.

### 2. Alta de cliente nuevo

Un formulario en un solo paso que deja al cliente listo para operar:

- Datos de la empresa: nombre comercial, razón social, RUC, región, plan, estado inicial.
- Sucursal principal: nombre, dirección, establecimiento y punto de emisión SRI.
- Propietario: nombre, usuario, correo y contraseña inicial.

Al guardar, el sistema crea la empresa, la sucursal, el usuario propietario con su rol, los módulos según el plan, las secuencias de facturación y la configuración base. Todo o nada: si algo falla, no queda un cliente a medias.

### 3. Ficha de cliente

Al abrir una empresa de la lista:

- **Datos generales**: editar nombre, RUC, región, plan y estado. Suspender un cliente le corta el acceso a todos sus usuarios de inmediato.
- **Sucursales**: agregar, editar y desactivar sucursales (local o bodega), con su establecimiento y punto de emisión.
- **Módulos**: interruptores por módulo (ventas, caja, cocina, inventario, compras, recetas, finanzas, reportes, facturación SRI, Telegram…). El plan propone el conjunto y se puede ajustar módulo por módulo para ese cliente.
- **Usuarios**: ver los usuarios de la empresa, su rol y su último ingreso; crear un usuario adicional y restablecer contraseñas.
- **Actividad**: últimos movimientos de la bitácora de esa empresa.

### 4. Bitácora de plataforma

Vista de la auditoría global filtrada por empresa, usuario, tipo de acción y fechas, con exportación a Excel.

## Seguridad

- Todo el panel se apoya en un solo criterio: estar en la lista de administradores de plataforma. Se verifica **en el servidor** en cada operación, no solo al pintar el menú.
- Un administrador de un cliente que intente entrar a `/admin/plataforma` a mano recibe pantalla de acceso denegado, y las operaciones son rechazadas por el servidor aunque fuerce la llamada.
- Crear clientes, cambiar planes, encender módulos y suspender cuentas quedan registrados en la bitácora, incluyendo quién y desde qué dirección.

## Detalles técnicos

- **Ruta**: `src/routes/admin.plataforma.tsx` (lista + alta) y `src/routes/admin.plataforma.$empresaId.tsx` (ficha), dentro del `AdminShell` actual, con guarda por `is_platform_admin()`.
- **Servidor**: nuevo `src/lib/plataforma.functions.ts` con `createServerFn` + `requireSupabaseAuth`; cada handler llama primero a `is_platform_admin()` con el cliente del usuario y recién después carga `supabaseAdmin` dentro del handler. Nada de decidir el permiso en el navegador.
- **Alta de cliente**: función de base de datos `create_platform_company(...)` `SECURITY DEFINER` que hace en una sola transacción empresa, sucursal, módulos, `document_sequences` y `company_settings`; el usuario propietario se crea antes con `auth.admin.createUser` y se enlaza en `company_users` + `user_roles` (rol dentro de la empresa, nunca en el perfil).
- **Módulos**: catálogo de claves de módulo con el conjunto por plan; se guardan en `company_modules` y se consultan con la función existente `company_has_module()`, aplicada tanto en el menú como en las server functions de cada módulo.
- **Suspensión**: `platform_companies.status = 'suspendida'` bloquea en `current_company_id()`/RLS, de modo que el corte es de base de datos y no de pantalla.
- **Hook nuevo** `usePlatformAdmin()` para mostrar u ocultar la sección Plataforma en `AdminShell`.
- **Sin tocar** la operación de Chusin Chuzón: no se modifican rutas, reportes ni funciones existentes de negocio.

## Orden de trabajo

1. Guarda de plataforma y sección en el menú (con pantalla vacía).
2. Lista de clientes con filtros e indicadores.
3. Alta de cliente completa y verificada creando un Cliente #2 de prueba.
4. Ficha: datos generales, sucursales, módulos, usuarios.
5. Bitácora de plataforma con exportación.
6. Prueba final: ingresar como propietario del Cliente #2 y confirmar que no ve ni un dato de Chusin Chuzón, y viceversa.
