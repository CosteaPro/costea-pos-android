# App nativa de celular con impresión Bluetooth clásica (SPP)

## La idea aprobada

- **Celular → app nativa Android**: se conecta directo a la impresora `4B-2033PA-EA17` por Bluetooth clásico (SPP), sin apps intermedias ni puentes.
- **Tablet → web**: se quedan los tres caminos actuales (app de impresión, BLE, compartir). Sin cambios.
- **Computadora → web**: impresión USB / agente local como hoy. Sin cambios.

Es exactamente la misma aplicación: la app nativa carga el POS que ya existe y solo agrega la capacidad de hablar con la impresora Bluetooth.

## Qué se va a construir

1. **Envoltura nativa Android (Capacitor)** dentro del proyecto, en una carpeta `mobile/`. La app abre el POS y funciona con la sesión, ventas, facturación y SRI ya existentes.
2. **Puente de impresión nativo**: la app nativa expone al POS tres acciones — *buscar impresoras emparejadas*, *conectar* e *imprimir ESC/POS*. Aquí sí aparece la lista de dispositivos vinculados del teléfono (incluida `4B-2033PA-EA17`), porque es código Android, no navegador.
3. **Detección automática del entorno**: cuando el POS se ejecuta dentro de la app nativa, imprime directo por Bluetooth. Cuando se ejecuta en el navegador (tablet o PC), sigue con lo que ya hay. Una sola base de código, sin duplicar pantallas.
4. **Pantalla de impresora en Configuración**: dentro de la app nativa la tarjeta “Impresión en celular” cambia a **Impresoras emparejadas** con lista real, botón *Conectar*, *Probar impresión* y guardado de la impresora predeterminada. En navegador se ve igual que hoy.
5. **Reconexión automática**: al abrir la app se reconecta sola a la impresora guardada; si está apagada, avisa en español claro y permite reintentar.

## Cómo se instala en el celular

La app se genera como archivo **APK** y se instala en el teléfono (o se sube a Google Play más adelante). El APK no se puede compilar dentro de Lovable: se compila desde el proyecto exportado a GitHub. Se dejará listo:

- La configuración de Capacitor y el proyecto Android.
- Un flujo de **GitHub Actions** que arma el APK automáticamente en cada cambio y lo deja disponible para descargar, sin necesidad de instalar Android Studio.
- Un instructivo corto en español (`mobile/LEEME.md`).

## Detalle técnico

- Dependencias: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` y el plugin de Bluetooth serial clásico (`@e-is/capacitor-bluetooth-serial` o equivalente mantenido; se fija versión al instalar).
- `capacitor.config.ts`: `server.url` apuntando a la URL publicada del POS (`https://costea-pos-master.lovable.app`) con `cleartext: false`, para que la app siempre traiga la última versión sin recompilar el APK.
- Permisos en `AndroidManifest.xml`: `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `BLUETOOTH`, `BLUETOOTH_ADMIN` y solicitud en tiempo de ejecución (Android 12+).
- Nuevo `src/lib/native-print.ts`:
  - `esAppNativa()` — detecta `Capacitor.isNativePlatform()` mediante importación dinámica, para no romper SSR ni el bundle web.
  - `listarEmparejadas()`, `conectar(address)`, `imprimirNativo(bytes)` — envío ESC/POS en bloques, reutilizando `ticketEscPos()` y `ticketPruebaEscPos()` que ya existen en `src/lib/bluetooth-print.ts`.
  - Dirección MAC y nombre guardados en `localStorage` (`costea.impresora-nativa`).
- `src/lib/receipt.ts`: `printReceipt` prueba primero la ruta nativa; si no está en la app o falla, cae al flujo móvil actual y luego a `silentPrint`. Escritorio intacto.
- `src/components/MobilePrintCard.tsx`: modo nativo con lista de dispositivos emparejados; modo navegador igual que hoy.
- Sin cambios en base de datos, facturación electrónica, SRI, reportes ni impresión de escritorio.
