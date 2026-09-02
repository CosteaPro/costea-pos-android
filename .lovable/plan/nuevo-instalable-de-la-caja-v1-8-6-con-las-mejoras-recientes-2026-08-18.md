# Nuevo instalable de la Caja (v1.8.6) con las mejoras recientes

Objetivo: generar un ZIP descargable de "Costea POS Caja" para Windows que ya incluya los cambios de esta sesión.

## Qué incluirá esta versión

- Tarjetas de producto rediseñadas: precio en círculo naranja arriba a la derecha y nombre en blanco puro, más grande.
- Pestañas de categorías más grandes y en blanco puro.
- Pantalla de cobro con texto negro grueso y todos los montos con 2 decimales.
- Tipo de local configurable: sin mesas, con salón/mesas, o patio de comidas.
- Etiqueta de pedido editable en modo patio (POS y vista móvil), guardada en el servidor, visible en cocina en tiempo real e impresa en comanda y ticket.

## Pasos

1. Subir la versión de la Caja de 1.8.5 a 1.8.6 (nombre del archivo y pantalla "Acerca de").
2. Compilar la interfaz web actualizada y copiarla dentro del programa de escritorio.
3. Empaquetar la versión portable de Windows (x64).
4. Comprimir y publicar el archivo como `CosteaPOS-Caja-1.8.6-windows-x64-portable.zip` para descarga directa.
5. Verificar que el ZIP contenga la interfaz web nueva (revisión del contenido empaquetado) antes de entregarlo.

## Notas técnicas

- Se usa el flujo existente `scripts/build-desktop.mjs` + `desktop/package.json` (`dist:portable` con electron-builder). Si electron-builder no puede correr en este entorno, se empaqueta la carpeta portable manualmente con `zip`, manteniendo la misma estructura que las versiones anteriores.
- El archivo se escribe en la carpeta de documentos del proyecto para que aparezca como descarga.
- No se generará `.exe` de instalador salvo que lo pidas; el portable es el más rápido y no requiere permisos de administrador.
