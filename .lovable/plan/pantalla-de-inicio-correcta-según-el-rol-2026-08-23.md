# Pantalla de inicio correcta según el rol

## Problema

Hoy la redirección por rol solo ocurre dentro de la pantalla de inicio de sesión (`/auth`). Si la sesión ya existe —caso típico en celular, donde la app se abre desde el ícono o desde la última pestaña en `/`— nadie reenvía al usuario a su pantalla. El superadministrador cae en el punto de venta / caja en lugar del Tablero de Mando.

## Qué se va a hacer

1. **Entrada única por rol**
   Al abrir la aplicación en la raíz (`/`) con sesión iniciada, el sistema envía al usuario a su pantalla inicial una sola vez por sesión de navegador:
   - Superadministrador y Administrador Operativo → Tablero de Mando
   - Cajero → Módulo de Caja
   - Salonero / Mesero → Punto de venta (mesas)
   - Cocinero → Pantalla de Cocina

   Se aplica igual en computadora y en celular (la vista de mesero del celular solo se muestra a quien corresponde).

2. **La redirección no bloquea la navegación**
   Es solo la pantalla de arranque. Después el superadministrador puede entrar a Caja o al Punto de venta cuantas veces quiera sin ser devuelto al tablero.

3. **Acceso visible a Caja desde el panel administrativo**
   En el menú administrativo se agrega un acceso directo claro a **Caja (cobrar)** y a **Punto de venta**, para operar como cajero cuando haga falta.

4. **Sin parpadeos**
   Mientras se leen los permisos no se pinta la pantalla equivocada: se muestra el estado de carga hasta saber el rol.

## Detalle técnico

- `src/routes/index.tsx`: en `PosRoute`, usar `useRole()`; si `!loading` y `homePath !== "/"`, hacer `navigate({ to: homePath, replace: true })` una sola vez, marcado con una bandera en `sessionStorage` (`costea.inicio-rol`) para no reenviar en navegaciones posteriores. Mientras `loading` sea verdadero, render de carga.
- `src/routes/auth.tsx`: se mantiene la redirección actual con `homePath` (ya espera a `loadingRole`).
- `src/hooks/useRole.ts`: sin cambios de lógica de roles; `homePath` ya devuelve `/admin/dashboard` para administradores.
- `src/components/AdminShell.tsx`: añadir en el grupo "Módulo de ventas y caja" los enlaces a `/caja` (cobrar / cierre) y `/` (Punto de venta).
