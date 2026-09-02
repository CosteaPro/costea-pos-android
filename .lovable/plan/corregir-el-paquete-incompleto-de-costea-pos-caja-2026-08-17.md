# Corregir el paquete incompleto de Costea POS Caja

## Problema confirmado
La versión 1.8.4 que se ejecuta desde `C:\Caja-POS-10\win-unpacked` sí contiene el sello nuevo, pero el paquete final perdió dos archivos necesarios de `tslib` dentro de `web-app/node_modules`. Por eso la validación preventiva bloquea correctamente la pantalla de venta antes de que aparezca otro error 500.

## Cambios
1. **Empaquetar la interfaz local como recurso completo**
   - Separar `web-app` del filtrado normal de dependencias del empaquetador.
   - Copiarla como recurso extra de Windows para conservar también sus dependencias trazadas.
   - Ajustar la ruta de arranque para leer esa ubicación tanto instalada como portable, manteniendo la ruta actual durante desarrollo.

2. **Fortalecer la construcción**
   - Mantener la limpieza profunda, el sello de versión y la revisión de imports.
   - Añadir una comprobación específica de las dependencias trazadas requeridas por `server/package.json`.
   - Hacer que la construcción falle antes de entregar si falta cualquier archivo requerido.

3. **Validar el artefacto real**
   - Generar la siguiente versión de la caja.
   - Revisar el contenido de `win-unpacked` después del empaquetado, incluido `tslib`.
   - Arrancar el servidor desde esa carpeta final y comprobar que la pantalla principal responde correctamente, no solamente desde `desktop/web-app`.

4. **Entregar reemplazo limpio**
   - Generar un ZIP portable nuevo con número de versión incrementado.
   - Indicar que debe descomprimirse en una carpeta nueva, sin mezclarla con `Caja-POS-10`; los datos locales permanecen fuera de la carpeta del programa.

## Resultado esperado
La caja abrirá la interfaz de venta integrada sin internet y el paquete final conservará todos los módulos requeridos. Si una futura construcción pierde un archivo, el proceso de empaquetado se detendrá antes de generar un ZIP o instalador defectuoso.