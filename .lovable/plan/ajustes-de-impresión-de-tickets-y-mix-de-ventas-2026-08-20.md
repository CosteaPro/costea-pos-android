# Ajustes de impresión de tickets y mix de ventas

## 1. Copia de control interno más corta

En el ticket de cobro, la segunda copia ("COPIA — CONTROL INTERNO") dejará de imprimir el encabezado del negocio (nombre, RUC, matriz, establecimiento, teléfono, correo, régimen, obligado a llevar contabilidad) y los datos SRI de encabezado. Empezará directamente en el bloque "ORDEN / FACTURA" con: número, fecha, mesa, atendió, identificación, detalle, subtotal, IVA, total, forma de pago, recibido, cambio y observaciones.

La copia del cliente queda exactamente como está hoy, con todos los datos.

## 2. Modificadores y agregadores según el destino

- Copia cliente: solo plato + agregadores con precio (comportamiento actual).
- Copia control interno: plato + modificadores (sin precio) + agregadores con precio, mostrados como sublíneas debajo de cada plato, más las notas del plato.
- Cocina / parrilla / pantalla de cocina: sin cambios de regla — siguen mostrando modificadores y agregadores completos (ya lo hacen); solo se verifica.

Para lograrlo, el ticket de cobro recibirá las líneas con sus opciones anidadas en vez de una lista plana, y cada copia decide qué imprimir.

## 3. Mix de ventas: dos pestañas

En la pantalla de Mix de ventas se agregan dos pestañas:

- **Mix de Ventas**: productos y agregadores con cantidades, precios, costo y contribución. Se excluyen las líneas cuyo tipo de opción sea "modificador".
- **Mix de Modificadores**: tabla simple con nombre del modificador y cantidad total de veces seleccionado, ordenada de mayor a menor. Sin columnas de precio, costo ni subtotal.

El botón Imprimir imprime la pestaña activa: el reporte actual para Mix de Ventas y un listado nombre/cantidad para Mix de Modificadores.

## Detalles técnicos

- `src/lib/receipt.ts`: `ReceiptLine` pasa a aceptar `options?: { name; qty; kind; price }[]` y `notes?`. `ticketSection` recibe una bandera de copia; con `COPIA_CONTROL` omite el bloque de cabecera del negocio y renderiza sublíneas de modificadores/agregadores.
- `src/routes/index.tsx` (`handleCheckout`) y `src/components/CheckoutDialog.tsx` si aplica: construir las líneas agrupando `order_items` por `parent_item_id` en lugar del filtro plano actual, incluyendo `option_kind` y `notes`.
- Revisar `src/components/MobileWaiter.tsx` y `desktop/lib/ticket.cjs` solo para dejar el mismo criterio en la caja descargable si comparten formato (sin reempaquetar instalador en esta etapa).
- `src/routes/admin.mix-ventas.tsx`: la consulta ya trae `order_items`; añadir `option_kind` al select, filtrar modificadores del agregado principal y acumular un segundo mapa nombre → unidades para la nueva pestaña. Nueva función de impresión simple en `src/lib/sales-mix-print.ts`.
