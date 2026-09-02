# El ingreso se queda en la pantalla de acceso

## Qué comprobé

- Tus credenciales están bien: el servidor de acceso registró varios ingresos correctos (200) del usuario `administrador` desde tu conexión, e incluso uno fallido antes (clave mal escrita en un intento).
- Tu ficha está completa: rol `administrador`, propietario del sistema y pantalla de inicio "Panel General".
- Reproduje el ingreso con ese usuario en la vista previa y en el sitio publicado: en ambos entra y llega al Panel general (tardó unos 12 segundos por la carga pesada del panel).

Conclusión: la sesión sí se abre; lo que falla es el **salto de pantalla** después de entrar. El sistema solo te lleva a tu pantalla cuando confirma rol y pantalla asignada; si esa lectura falla una sola vez (red lenta, corte momentáneo o token en renovación), la aplicación se queda callada en el formulario para siempre, sin mensaje y sin reintento. Eso encaja exactamente con "entré varias veces y no pasa nada".

## Qué voy a hacer

1. **Salto garantizado tras entrar.** En cuanto haya sesión activa, la pantalla de acceso te lleva a tu pantalla de inicio. Si el rol aún no se confirma en 5 segundos, entra igual con la pantalla asignada en tu ficha (o el Panel general si eres administrador), en vez de quedarse esperando.
2. **Reintento en lugar de bloqueo silencioso.** Si la lectura de rol falla, se reintenta automáticamente hasta 3 veces con pequeña espera antes de darla por perdida, y el estado "resuelto" deja de quedarse trabado en falso cuando hay roles guardados de un ingreso anterior.
3. **Mensaje visible.** Si después de los reintentos aún no se puede leer tu rol, aparece un aviso claro ("No se pudo confirmar tus permisos, reintentar") con botón para reintentar y para cerrar sesión y limpiar los datos guardados del navegador, en vez de dejar el formulario mudo.
4. **Botón de emergencia "Limpiar datos de este equipo"** en la pantalla de acceso: borra la caché de roles, la sesión guardada y recarga. Útil cuando el navegador quedó con datos viejos de una versión anterior.
5. **Arranque más liviano del Panel general.** El panel dispara muchas consultas al abrirse; mostraré la estructura de inmediato con indicadores de carga por tarjeta, para que nunca se vea una pantalla "cargando" completa mientras llegan los datos.

## Detalle técnico

- `src/routes/auth.tsx`: redirigir cuando `session` existe, con temporizador de respaldo de 5 s si `resuelto` no llega; usar `replace: true`.
- `src/hooks/useRole.ts`: reintentos con espera corta en la lectura de `user_roles`; no dejar `resuelto` en falso cuando hay roles en caché; exponer `error` y una función `reintentar()`.
- `src/components/AdminShell.tsx`: cambiar el bloqueo total "Cargando…" por un estado con mensaje de error y acción de reintento cuando la lectura de rol falla.
- No se toca la lógica de facturación, inventarios ni reportes.
