# Costea POS para Android

Esta carpeta contiene la app Android que imprime directamente en impresoras térmicas Bluetooth clásicas (SPP), incluyendo la **4B-2033PA-EA17**.

## Generar el APK desde GitHub Actions

El proyecto incluye el flujo **Android APK** en `.github/workflows/android.yml`.

1. Sube los cambios a GitHub.
2. Abre la pestaña **Actions** del repositorio.
3. Selecciona **Android APK** y pulsa **Run workflow**.
4. Cuando termine, abre la ejecución completada y descarga el artefacto **costea-pos-android**.
5. Descomprime el artefacto; el archivo es `app-debug.apk`.

El APK de prueba no está firmado para publicar en Play Store. Para una distribución pública, configura una firma de lanzamiento en Android Studio o en CI sin guardar contraseñas ni archivos de firma en el repositorio.

## Compilar localmente

1. Instala Bun, Java 17 y Android Studio con Android SDK 34.
2. Clona el repositorio y ejecuta `bun install`.
3. Ejecuta `bun run build:mobile`.
4. Ejecuta `cd mobile/android && ./gradlew assembleDebug`.
5. El APK quedará en `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

## Primera conexión con 4B-2033PA-EA17

1. En el celular abre **Ajustes → Bluetooth**.
2. Enciende la impresora, busca `4B-2033PA-EA17` y emparéjala con PIN **0000**. El modo debe ser **Sencillo / ESC-POS**.
3. Instala y abre el APK de Costea POS.
4. Entra a **Configuración → Impresión en celular**.
5. Pulsa **Activar Bluetooth y permisos** si Android lo solicita.
6. Pulsa **Buscar dispositivos Bluetooth**.
7. En `4B-2033PA-EA17`, confirma que la dirección mostrada sea la de tu impresora y pulsa **Conectar**.
8. La app enviará un ticket de prueba automáticamente. Luego puedes pulsar **Probar impresión** para repetirlo.

La app guarda la impresora elegida y reintenta conectarse al abrirse. El bloque **Diagnóstico** conserva los últimos intentos, tiempos y errores en el teléfono para facilitar soporte.

## Si no conecta

- Confirma que la impresora esté encendida, tenga papel y no esté conectada a otro celular.
- Desemparéjala y vuelve a emparejarla desde Ajustes de Android con PIN `0000`.
- En **Ajustes → Aplicaciones → Costea POS → Permisos**, activa **Dispositivos cercanos**.
- Cierra otras aplicaciones que puedan estar usando la impresora y vuelve a pulsar **Conectar**.
- Comparte el texto que aparece en **Diagnóstico**; no compartas contraseñas ni códigos de acceso.

Las tabletas y computadoras siguen usando la versión web y sus métodos de impresión actuales; esta app nativa solo cambia el flujo de celulares Android.