# El usuario entra a Caja porque su nombre de usuario no tiene el rol de Super Administrador

## Qué encontré (verificado en la base de datos)

La pantalla de inicio se calcula desde el rol guardado para el usuario. Hoy los roles registrados son:

| Nombre de usuario | Rol actual | Propietario |
|---|---|---|
| info | Super Administrador | Sí |
| administrador | Cajero | No |
| mateolopez | Cajero | No |
| cajero1 | Cajero | No |
| mesero1 | Mesero | No |
| chuzinchuzon | Cajero | No |

Es decir: la cuenta cuyo **nombre de usuario** es `administrador` está guardada como **Cajero**, así que el sistema la envía a Caja. No es un fallo de la redirección: la redirección está haciendo lo correcto con el rol que hay.

Además, la propiedad del sistema (Super Administrador inamovible) quedó en la cuenta `info`, creada durante la puesta en marcha, y hoy no existe forma de moverla: una regla de la base de datos impide cambiar o quitar el rol del propietario, y la pantalla de Roles y permisos no puede tocar esa fila.

## Qué se va a hacer

1. **Transferir la propiedad al nombre de usuario correcto**
   Se pasa el rol de Super Administrador / Propietario de `info` al usuario `administrador` (el que se usa para entrar). La cuenta anterior queda como Administrador Operativo, sin perder acceso a la operación diaria.
   Si el usuario con el que entras no es `administrador` sino otro (por ejemplo `mateolopez`), indícalo y se aplica sobre ese nombre de usuario.

2. **Permitir transferir la propiedad desde la pantalla de Roles y permisos**
   Se habilita una acción "Nombrar Super Administrador / Propietario" visible solo para el propietario actual. Al usarla, la propiedad se mueve de forma atómica: nunca queda el sistema sin propietario ni con dos.

3. **Mostrar el nombre de usuario como identificador principal**
   En Roles y permisos, el nombre de usuario pasa a ser el dato principal de cada fila y el correo se muestra debajo como dato informativo, para evitar confundir cuentas con correos repetidos.

4. **Comprobación tras el cambio**
   Se verifica que, al iniciar sesión con ese nombre de usuario, la aplicación abra el Tablero de Mando tanto en computadora como en celular, y que desde el panel administrativo se pueda seguir entrando a Caja y al Punto de venta.

## Detalle técnico

- Migración: reemplazar el disparador `protect_owner_role` por una versión que siga impidiendo dejar el sistema sin propietario, pero permita la transferencia dentro de una función `transfer_system_ownership(_target_user_id uuid)` con `SECURITY DEFINER`, que valida que quien la invoca es el propietario actual, marca `is_owner = false` + rol `admin_operativo` en la fila antigua e inserta/actualiza la nueva fila con `role = 'administrador'`, `is_owner = true`. Permisos: solo `service_role`.
- `src/lib/staff.functions.ts`: nueva función de servidor `transferOwnership` con `requireSupabaseAuth`, que comprueba `is_system_owner(context.userId)` antes de llamar al RPC mediante `supabaseAdmin`. `setStaffRole` sigue rechazando cambios sobre la fila del propietario.
- `StaffPanel` (en `src/routes/configuracion.tsx`, usada por `/admin/usuarios`): botón de transferencia con diálogo de confirmación, y fila que muestra `username` en primer plano y `contactEmail` en texto secundario.
- Aplicación puntual del cambio de datos actual para el usuario `administrador` mediante la nueva función, no editando `user_roles` a mano.
- `src/hooks/useRole.ts` y `src/routes/index.tsx` no cambian: la lógica de `homePath` ya es correcta.
