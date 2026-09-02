# Abrir el Panel General al iniciar sesión como administrador (web)

## Qué pasa hoy

Las pantallas de inicio están bien guardadas en la base de datos:

- `administrador` → Panel General (`/admin/dashboard`)
- `mateolopez` (info) → Panel General
- `cajero1` → Módulo de Caja
- `mesero1` → Módulo de Salonero / Mesas

El fallo está en el momento del arranque, no en los datos. Al abrir la pantalla de acceso sin sesión, el sistema marca la carga de permisos como "terminada" con la lista de roles vacía. Al iniciar sesión, esa marca sigue en "terminada" durante el instante en que aún se están leyendo el rol y la pantalla asignada, así que la aplicación calcula la pantalla con datos vacíos y manda al usuario a la pantalla genérica de venta. Cuando el rol de administrador ya llegó, la aplicación considera que "ya entró" y no vuelve a redirigir. Resultado: el administrador aparece en Caja / Punto de venta en vez del Panel General.

## Qué se va a hacer

1. Marcar los permisos como "cargando" mientras se leen el rol y la pantalla asignada del usuario recién autenticado, para que nadie sea redirigido con datos incompletos.
2. Redirigir después del inicio de sesión solo cuando el rol y la pantalla asignada estén confirmados.
3. Si el usuario ya cayó en la pantalla genérica pero su pantalla asignada es otra, enviarlo a la correcta en cuanto se confirme (sin volver a moverlo después, para que pueda navegar libre).
4. Comprobar el flujo real en el navegador: iniciar sesión con `administrador` y confirmar que abre el Tablero de mando; luego con `cajero1` (Caja) y `mesero1` (Mesas).

## Detalle técnico

- `src/hooks/useRole.ts`: poner `setLoading(true)` al iniciar la lectura para un usuario nuevo y exponer una bandera de "resuelto" (roles y `home_path` leídos) además de `loading`.
- `src/routes/auth.tsx`: la redirección post-login espera esa bandera de resuelto, no solo `loading === false`.
- `src/routes/index.tsx`: la bandera de sesión `costea.inicio-rol` se marca únicamente cuando la pantalla de inicio ya está resuelta, evitando que se "queme" con el valor por defecto `/`.
- Sin cambios en base de datos ni en la app de escritorio.
