# Desbloquear el acceso del Super Administrador

## Qué encontré (verificado en la base de datos)

| Cuenta (correo de acceso) | Nombre de usuario | Rol | Propietario | Último ingreso |
|---|---|---|---|---|
| administrador@costeapro.com | (sin nombre de usuario) | Super Administrador | Sí | nunca |
| info@costeapro.com | (sin nombre de usuario) | Administrador Operativo | No | hoy |
| cajero1@costeapos.local | cajero1 | Cajero | No | ayer |
| mesero1@costeapos.local | mesero1 | Mesero | No | — |
| mateolopez@costeapos.local | mateolopez | Cajero | No | ayer |
| chuzinchuzon@gmail.com | (sin nombre de usuario) | Cajero | No | — |

Dos hallazgos importantes:

1. La cuenta propietaria **sí tiene contraseña registrada**, pero **nunca ha iniciado sesión**, así que esa clave es desconocida hoy.
2. La cuenta propietaria **no tiene nombre de usuario registrado**. En la pantalla de acceso, escribir `administrador` se traduce internamente a una cuenta que no existe (`administrador@costeapos.local`); para entrar hoy habría que escribir el correo completo `administrador@costeapro.com`. Esto explica el "usuario o contraseña incorrectos" aunque la cuenta exista.

## Qué se va a hacer (Opción B, sin quitarle nada a nadie)

1. **Asignar una contraseña temporal a la cuenta propietaria** `administrador@costeapro.com` y mostrártela en el chat para que entres de inmediato. Deberás cambiarla desde el sistema apenas ingreses.
2. **Registrar el nombre de usuario `administrador`** para esa cuenta, de modo que puedas entrar escribiendo simplemente `administrador` (como el resto del personal) y que aparezca correctamente en Roles y permisos.
3. **Dejar los roles como los definiste**: `administrador` = Super Administrador / Propietario con acceso total; `info@costeapro.com` = Administrador Operativo, que sigue entrando con su propia clave a la operación diaria.
4. **Comprobación**: iniciar sesión con `administrador` debe abrir el Tablero de Mando (escritorio y celular) y dar acceso a Configuración y a Roles y permisos.

No se toca la propiedad del sistema ni se degrada ninguna cuenta, así que no hace falta la Opción A.

## Detalle técnico

- Cambio de clave mediante la API de administración de autenticación (`auth.admin.updateUserById`) sobre el id de `administrador@costeapro.com`; no se guarda la clave en ninguna tabla ni en el código.
- Alta de la fila correspondiente en `public.profiles` con `username = 'administrador'` y `contact_email = 'info@costeapro.com'`, para que el acceso por nombre de usuario (`loginEmailFor`) funcione. Como el correo real de la cuenta es `@costeapro.com` y no `@costeapos.local`, se ajusta la resolución de acceso para que un nombre de usuario existente en `profiles` use el correo real de su cuenta en lugar de construirlo por convención — así conviven las cuentas antiguas por correo y las nuevas por usuario.
- Sin cambios en `user_roles`, en el disparador `protect_owner_role` ni en `transfer_system_ownership`.
