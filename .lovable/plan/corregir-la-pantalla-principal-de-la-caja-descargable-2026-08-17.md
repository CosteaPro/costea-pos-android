# Corregir la pantalla principal de la caja descargable

## Diagnóstico confirmado
- Electron sí abre la aplicación integrada desde `127.0.0.1` y no la URL del servidor central (`desktop/main.cjs`).
- El paquete `desktop/web-app` sí contiene la ruta `/`, la pantalla “Pedido nuevo”, productos y carrito.
- La ruta principal todavía ejecuta varios hooks y consultas del sistema central (sesión, roles, configuración, bloqueo diario y pedidos), mientras que el catálogo local depende del puente Electron. La causa exacta del render en blanco en Windows aún debe capturarse porque Electron actualmente descarta la salida del servidor embebido y no registra errores del renderizador.

## Cambios
1. **Hacer observable el fallo real**
   - Registrar en un archivo local los errores del servidor integrado, carga de ruta, consola del renderizador y cierres inesperados.
   - Mostrar una pantalla de error útil con opción de reintentar, en vez de dejar la vista principal en blanco.

2. **Separar completamente el POS local del servidor central**
   - Detectar el puente Electron antes de aplicar redirecciones o esperas de autenticación.
   - En la ruta `/`, usar configuración, catálogo, estado de turno, permisos y persistencia locales cuando se ejecuta en la caja.
   - Evitar que una consulta remota pendiente o fallida bloquee el montaje de productos, carrito y cobro.
   - Mantener las consultas actuales sin cambios para el POS web.

3. **Fortalecer la carga del catálogo**
   - Cargar primero la copia local y renderizar inmediatamente.
   - Sincronizar en segundo plano solo cuando haya conexión.
   - Mostrar un estado claro si la caja aún no tiene catálogo, con botón para reintentar la descarga, sin ocultar toda la pantalla.

4. **Recompilar y validar la aplicación integrada**
   - Regenerar `desktop/web-app` y confirmar que la ruta `/` del paquete nuevo contiene los cambios.
   - Probar dentro de Electron, no solo en navegador: inicio con internet, inicio sin internet, productos visibles, agregar al carrito, cobrar y facturar/guardar localmente.
   - Confirmar que Configuración, Cuadre, Cierre y Pendientes siguen funcionando.

5. **Entregar una nueva portable**
   - Incrementar la versión de corrección, empaquetar Electron y generar un ZIP portable nuevo únicamente después de superar las pruebas anteriores.

## Resultado esperado
Al abrir “Punto de venta”, Electron siempre muestra la interfaz de venta integrada. La conexión al servidor central queda limitada a sincronización en segundo plano y nunca decide si la pantalla principal puede renderizarse.