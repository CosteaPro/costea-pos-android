# Tarjetas de producto, pestañas de categorías, pantalla de cobro y tipo de local

## 1. Tarjetas de producto en el POS (`src/routes/index.tsx`)
- Imagen dentro de un contenedor relativo.
- Precio en badge circular sobre la foto, esquina superior derecha (`bg-primary`, círculo, sombra suave, legible de lejos).
- Nombre del producto abajo, letra más grande y en negrita, en **blanco puro** (nuevo token `--color-product-name: #ffffff` en `src/styles.css` para no romper el sistema de diseño).
- Descripción secundaria en una línea; se oculta cuando no cabe para priorizar el nombre.
- Ajustes responsivos: círculo y nombre un poco mayores en pantallas grandes, legibles en pequeñas.
- Se conservan clic para agregar, hover, `active:scale` y transiciones.

## 2. Pestañas de categorías
- Agrandar el tamaño de letra de las pestañas en el POS (`src/routes/index.tsx`) y en la vista móvil (`src/components/MobileWaiter.tsx`).
- Cambiar el color del texto de **todas** las categorías a blanco puro para que resalten sobre el fondo oscuro.
- Mantener el fondo actual de la categoría activa/seleccionada (fondo primario con texto primario-foreground).
- Asegurar que el contraste siga siendo alto en ambos estados (activa e inactiva).

## 3. Montos siempre con 2 decimales
- `currency()` en `src/lib/pos.ts` se fija con `minimumFractionDigits: 2` y `maximumFractionDigits: 2` para que todo muestre `$10.00`, `$0.00`, `$3.50`.
- Revisión de puntos donde el monto se arma a mano (círculo de precio, subtotales, IVA, totales, panel de pedido, carrito móvil) para que todos usen `currency()`.

## 4. Pantalla de cobro (`src/components/CheckoutDialog.tsx`)
- Texto en negro sólido y de mayor grosor (peso 600/700) para eliminar la sensación de borroso: se refuerza la clase `.light-panel` / se añade una clase equivalente para el diálogo en `src/styles.css`.
- Etiquetas, montos y campos con tamaño de letra mayor y contraste alto.
- Todos los importes con el formato de 2 decimales.

## 5. Tipo de local en Configuración
En `src/lib/pos.ts` se amplía `OPERATION_MODES` a tres opciones (`operation_mode` ya es texto libre en la base, no requiere migración):

| Modo | Pestañas visibles | Comportamiento |
|---|---|---|
| `rapida` — Restaurante sin mesas | Solo "Punto de Venta" | Pedido directo, sin mesa |
| `restaurante` — Con salón / mesas | "Punto de Venta" + "Mapa de Mesas" | Igual que hoy |
| `patio` — Patio de comidas | Solo "Punto de Venta" | Vista simplificada con campo **Etiqueta del pedido** |

- `src/routes/configuracion.tsx` y `src/components/SetupWizard.tsx` muestran las tres tarjetas con su descripción.
- `src/components/AppShell.tsx`: la pestaña "Mesas" solo aparece en modo `restaurante`.
- `src/routes/mesas.tsx` mantiene el aviso cuando el modo no usa mesas.

## 6. Etiquetas de mesa / pedido
- En modo `patio` (y en llevar/domicilio) el panel de pedido muestra el campo **Etiqueta del pedido** (ej.: "Juan – gorra roja"), editable en cualquier momento antes de cobrar.
- La etiqueta se guarda en el pedido, por lo que se ve en todas las cajas y en cocina al leer del servidor central.
- La etiqueta se imprime en la comanda (`src/lib/print.ts`) y en el ticket de cobro (`src/lib/receipt.ts`), en el lugar donde hoy va la mesa.
- El mapa de mesas (`src/routes/mesas.tsx`) sigue leyendo el estado en tiempo real del servidor central; los nombres de mesa se editan desde su pantalla de gestión y se reflejan en todas las cajas.

## Notas técnicas
- Sin cambios de esquema: se reutiliza el campo de nombre/etiqueta del pedido ya existente en `orders`; si hiciera falta un campo propio se agrega `order_label` con su GRANT y política correspondientes.
- No se toca la lógica de facturación SRI ni el cálculo de impuestos, solo el formato de presentación.
