# Plan: eliminar definitivamente el token de Local Storage

## Objetivo
Al iniciar sesión, recargar o volver a abrir el navegador, no debe existir ninguna clave `sb-*-auth-token` ni ningún JWT en Local Storage. La sesión persistente debe depender únicamente de la cookie segura del servidor.

## Diagnóstico confirmado
- La captura muestra una clave real `sb-dpk…-auth-token` con tokens dentro de Local Storage.
- El proyecto ya crea la cookie cifrada `costea-session` con `HttpOnly`, `Secure`, `SameSite=Strict` y duración de 24 horas.
- El bloqueo actual depende de reemplazar `window.localStorage` mediante un `Proxy`; es una solución frágil y no constituye una garantía suficiente para el cliente de autenticación.
- En una sesión nueva y anónima, la versión publicada no presenta la clave. Falta validar el caso determinante: inicio de sesión, recarga y reapertura con una sesión autenticada, incluyendo un navegador que conserva datos/caché de una versión anterior.

## Cambios
1. Reemplazar la interceptación global de `window.localStorage` por un almacén de autenticación explícito y exclusivamente en memoria.
2. Mantener la cookie `costea-session` como única persistencia de credenciales y conservar sus cuatro atributos de seguridad requeridos.
3. Ejecutar una limpieza temprana e idempotente de todas las claves históricas de sesión antes de inicializar el cliente de autenticación.
4. Revisar inicio de sesión, rehidratación, renovación y cierre de sesión para que ninguna ruta vuelva a escribir credenciales en Local Storage.
5. Asegurar que una actualización de la aplicación/PWA retire el código antiguo y elimine el token heredado sin borrar los datos locales no sensibles permitidos.
6. Mantener en Local Storage únicamente los datos operativos no sensibles ya autorizados; no almacenar access tokens, refresh tokens ni sesiones completas.

## Verificación
- Iniciar sesión y comprobar en F12 que no existe `sb-*-auth-token`.
- Recargar la página y confirmar que la sesión se restaura sin recrear esa clave.
- Cerrar y abrir un contexto de navegador, restaurar la sesión mediante la cookie y repetir la comprobación.
- Simular una instalación antigua con una clave heredada y verificar que se elimina automáticamente.
- Confirmar desde el navegador que `costea-session` existe con `HttpOnly`, `Secure`, `SameSite=Strict` y `Max-Age=86400`; al ser HttpOnly, no debe aparecer en `document.cookie`, pero sí en Application > Cookies.
- Confirmar que cerrar sesión elimina la cookie y que las funciones protegidas continúan recibiendo autenticación correctamente.
- Revisar la versión publicada después del cambio para descartar que un Service Worker o caché antiguo siga sirviendo el flujo anterior.

## Nota visible en F12
La categoría “Local Storage” siempre aparecerá en DevTools porque es una función normal del navegador. El resultado correcto es que dentro de ella no aparezca ninguna clave de autenticación ni contenido JWT.
