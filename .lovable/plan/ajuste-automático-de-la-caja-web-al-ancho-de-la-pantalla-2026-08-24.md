# Ajuste automático de la Caja Web al ancho de la pantalla

## Qué pasa hoy

La pantalla de ventas no se "amplía" por zoom: sus medidas están fijas y son grandes para pantallas de laptop.

Verificado en el código:

- El meta viewport ya existe y es correcto (`width=device-width, initial-scale=1`), así que ese punto no es la causa.
- La rejilla de ventas usa `lg:grid-cols-[1fr_430px]`: el panel de pedido tiene 430 px fijos y la segunda columna solo aparece a partir de 1024 px. En pantallas entre 1024 y 1280 px, las tarjetas quedan apretadas o el panel empuja el ancho.
- Elementos con tamaños grandes fijos: fotos de producto de 128–160 px de alto, botones de categoría `text-base` con `px-5 py-3`, buscador `h-12 text-base`, botón de cobro `h-12`.
- El contenedor principal limita a `max-w-[1600px]`, pero no hay `overflow-x: hidden` global ni `min-w-0` en las columnas, así que un elemento ancho puede desbordar horizontalmente.

## Qué se va a hacer (solo presentación)

1. **Panel de pedido fluido en vez de 430 px fijos**
   - Cambiar la rejilla a un ancho relativo con tope: columna de pedido `clamp(320px, 30%, 430px)`, columna de productos `minmax(0, 1fr)`.
   - Bajar el punto de quiebre de `lg` (1024 px) a `xl` real de uso: mostrar dos columnas desde 1024 px pero con el ancho fluido anterior, de modo que sumen exactamente el 100 % disponible.
   - Añadir `min-w-0` a ambas columnas para que nada empuje el ancho.

2. **Densidad adaptativa (que todo quepa sin tocar el zoom)**
   - Alturas de imagen de producto y tipografías de tarjetas con escalones responsivos: más compactas por debajo de 1440 px, tamaño actual en monitores grandes.
   - Buscador, pestañas de categoría y botones del panel con altura/padding escalonado (compacto en laptop, cómodo en pantalla grande).
   - Rejilla de productos con `auto-fill` y ancho mínimo relativo, para que el número de columnas se calcule según el espacio real.

3. **Sin desbordamiento horizontal**
   - `overflow-x: hidden` y `max-width: 100%` en `html, body` dentro de `@layer base` de `src/styles.css`.
   - Revisar el `AppShell` para que el contenedor principal use `w-full max-w-full` además del tope de 1600 px, y que la barra superior no fuerce anchos mínimos.

## Alcance

- Archivos: `src/routes/index.tsx` (rejilla y tarjetas), `src/components/AppShell.tsx` (contenedor), `src/styles.css` (base sin desbordamiento).
- Sin cambios de lógica de venta, precios, impresión ni base de datos.
- La vista móvil de mesero (`MobileWaiter`) se mantiene igual.

## Verificación

Revisar la caja web con el navegador a 1024, 1280, 1366 y 1920 px de ancho: dos columnas completas, sin barra de desplazamiento horizontal y sin necesidad de cambiar el zoom.
