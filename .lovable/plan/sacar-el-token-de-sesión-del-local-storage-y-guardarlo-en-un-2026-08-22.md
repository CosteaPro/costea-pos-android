# Sacar el token de sesión del Local Storage y guardarlo en una cookie segura

Hoy la sesión (access token y refresh token) se guarda en `localStorage` del navegador, donde cualquier script puede leerla. El objetivo es que el token viva solo en una cookie que JavaScript no pueda leer, y que en Local Storage queden únicamente datos no sensibles.

## Qué se hará

1. **Cookie de sesión protegida**
   Se crea una capa en el servidor que guarda la sesión en una cookie con las banderas exigidas:
   - `HttpOnly: true` (invisible para JavaScript)
   - `Secure: true` (solo por HTTPS)
   - `SameSite: Strict`
   - `Max-Age: 86400` (24 horas)
   El contenido de la cookie va cifrado, no en texto plano.

2. **Inicio y cierre de sesión pasan por el servidor**
   - Al entrar con usuario y contraseña, el servidor valida las credenciales, escribe la cookie y devuelve la sesión solo en memoria del navegador.
   - Al cerrar sesión, el servidor borra la cookie y se limpia la caché de datos.
   - Al recargar o reabrir el navegador, la aplicación pide la sesión al servidor (leyendo la cookie) en lugar de leerla del Local Storage.

3. **Local Storage se limpia y se limita a 5 datos no sensibles**
   Quedan únicamente:
   - identificador del equipo (`costea-pos-device-id`)
   - último usuario que usó la caja (`costea.caja.last-user`)
   - caché de rol para arranque rápido
   - dirección del puente de impresión local
   - preferencias/ajustes locales de la caja
   Además, al arrancar se borran automáticamente las claves de sesión antiguas que hubieran quedado guardadas (`sb-*-auth-token`).

4. **Verificación**
   Se comprueba con el navegador: iniciar sesión, cerrar y reabrir, y confirmar que en Local Storage no aparece ningún token y que en Cookies aparece la cookie de sesión con HttpOnly, Secure, SameSite=Strict y expiración de 24 horas. También se revisa que las pantallas protegidas, el panel administrativo y las llamadas al servidor sigan funcionando.

## Detalles técnicos

- Nueva capa `src/lib/session.server.ts` + `src/lib/session.functions.ts` usando `useSession`/`setCookie` de `@tanstack/react-start/server` con `password` desde un secreto (`SESSION_SECRET`), `name: "costea-session"`, `maxAge: 86400`, `httpOnly`, `secure`, `sameSite: "strict"`, `path: "/"`.
- `src/integrations/supabase/client.ts` es autogenerado y no se toca; en su lugar se envuelve el cliente con un adaptador de almacenamiento en memoria configurado desde un módulo propio (`src/integrations/supabase/session-store.ts`), de modo que supabase-js no escriba en `localStorage`.
- Rehidratación: al montar, `useAuth` llama a un server fn `getSession()` que lee la cookie y hace `supabase.auth.setSession(...)` solo en memoria; el refresh token nunca vuelve al Local Storage y la cookie se reescribe cuando Supabase rota el token.
- `attachSupabaseAuth` (autogenerado) sigue funcionando porque `getSession()` de supabase-js lee la sesión en memoria.
- `src/hooks/useAccessGuard.ts` y `useRole.ts` mantienen sus claves actuales; se añade una limpieza única de claves de sesión heredadas.

## Riesgos a tener en cuenta

- Con `SameSite=Strict`, la vista previa dentro del editor (iframe de otro dominio) puede no enviar la cookie; en ese caso la sesión seguiría funcionando en el sitio publicado y en la caja de escritorio, pero en la vista previa habría que volver a iniciar sesión. Si eso molesta, se puede usar `SameSite=Lax` solo en la vista previa.
- La caja descargable (Electron) usa su propio flujo local; se revisa que no dependa del token en Local Storage.
