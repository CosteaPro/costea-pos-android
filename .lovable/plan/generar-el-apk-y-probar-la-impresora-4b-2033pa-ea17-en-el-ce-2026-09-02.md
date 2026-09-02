# Generar el APK y probar la impresora 4B-2033PA-EA17 en el celular

## Situación

El proyecto ya tiene todo lo necesario para la app Android: `capacitor.config.ts`, el proyecto nativo en `mobile/android`, el plugin Bluetooth SPP y el flujo de impresión nativa.

Lo que falta: el APK no se puede compilar dentro de Lovable. El entorno de Lovable no tiene Java ni el SDK de Android instalados (verificado: `ANDROID_HOME` vacío, sin `java`). Tampoco existe forma de conectar una impresora Bluetooth física desde aquí. La compilación y la prueba real se hacen fuera: con GitHub Actions (ya hay un flujo listo) o en una computadora con Android Studio.

## Qué haré en el proyecto

1. **Pantalla de diagnóstico Bluetooth** dentro de Configuración (visible solo en la app nativa):
   - Estado de permisos Bluetooth y botón para solicitarlos.
   - Lista de dispositivos encontrados con nombre, dirección MAC y señal.
   - Botón "Conectar" y "Imprimir prueba" con resultado detallado (éxito, error exacto, tiempo).
   - Registro de los últimos eventos de impresión para poder diagnosticar sin cable.

2. **Robustez de la conexión SPP** en la impresión nativa:
   - Reintento automático de conexión antes de fallar.
   - Corte del ticket y avance de papel al final, compatibles con impresoras 58/80 mm.
   - Mensajes de error en español claros ("impresora apagada", "permiso denegado", "fuera de alcance").

3. **Guía de instalación y prueba** en `mobile/LEEME.md`, paso a paso:
   - Cómo lanzar el flujo de GitHub Actions y descargar el APK.
   - Cómo instalar el APK en el celular (orígenes desconocidos).
   - Cómo emparejar `4B-2033PA-EA17` con PIN `0000` desde Ajustes de Android antes de abrir la app.
   - Cómo ejecutar la prueba desde la pantalla de diagnóstico y qué revisar si falla.

4. **Verificación del flujo de compilación**: confirmar que `bun run build:mobile` produce los archivos web y sincroniza Android correctamente dentro de Lovable (esa parte sí se puede validar aquí), de modo que el paso de Gradle en GitHub Actions tenga todo listo.

## Lo que usted tendrá que hacer

- Conectar el proyecto a GitHub (si aún no lo está) y ejecutar el flujo "Android APK" desde la pestaña Actions; el APK queda como artefacto descargable.
- Instalarlo en el celular, emparejar la impresora y ejecutar la prueba desde la pantalla de diagnóstico.
- Si algo falla, la pantalla mostrará el error exacto y lo corrijo con esa información.

## Detalles técnicos

- Archivos a modificar: `src/lib/native-print.ts` (reintentos, corte de papel, errores traducidos), `src/components/MobilePrintCard.tsx` (bloque de diagnóstico), `mobile/LEEME.md` (guía).
- No se toca: base de datos, SRI, reportes, impresión de escritorio ni los tres métodos web para tabletas/PC.
- El flujo `.github/workflows/android.yml` ya usa Bun con `--frozen-lockfile` y `bun.lock`, Java 17 y `assembleDebug`; el `gradlew` ya tiene permiso de ejecución. No requiere cambios salvo que la compilación falle.
