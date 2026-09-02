# Dos vistas rápidas de inventario en Reportes de inventario

Debajo del botón **Generar reporte del período** se agregan dos botones nuevos, uno al lado del otro, que abren vistas simples del inventario disponible al final del rango elegido.

## Botón "Inventario por Ítem" (verde)

Lista limpia, sin dinero:

- Nombre del ítem
- Cantidad disponible
- Unidad de medida

## Botón "Inventario Costeado" (ámbar)

Lista con valoración:

- Nombre del ítem
- Cantidad disponible
- Costo unitario
- Costo total (cantidad x costo unitario)
- Fila final con el total valorizado

## Comportamiento común

- Respetan el rango de fechas y la categoría ya seleccionados en la pantalla.
- Cada vista se abre como hoja blanca (igual que el reporte actual), con botones **Imprimir**, **Regresar** y **Exportar Excel**.
- Encabezado con nombre del negocio, título de la vista, rango de fechas y categoría.
- Mismo estilo visual y tipografía que el reporte de período existente.

## Detalles técnicos

- Archivo: `src/components/admin/inventory-movements.tsx` (componente `InventoryReportsTab`).
  - Nuevo estado `simpleView: "none" | "items" | "costeado"`, renderizado antes de la pantalla de trabajo, reutilizando `PRINT_CSS` y el patrón de hoja blanca del reporte actual.
  - Los botones fijan `setRange({ from, to })` antes de abrir, igual que el botón actual.
- Datos: se reutilizan las filas ya cargadas (`rows`, filtradas por categoría) de `loadInventoryReport`.
  - Cantidad disponible = cantidad física del conteo cuando existe (`physical[item_id]`), si no, `qtyFinal` (inventario final calculado).
  - Costo unitario = valor final / cantidad final del ítem (0 cuando la cantidad es 0).
  - Costo total = cantidad disponible x costo unitario.
- Exportación: dos funciones nuevas en `src/lib/inventory.movements.ts` (`exportInventoryByItem` y `exportInventoryCosted`) siguiendo el formato de `exportInventoryReport` (mismo formateo de números con `montoEC` y nombre de archivo con rango de fechas).

No se modifica el reporte de 25 columnas ni ninguna fórmula de costo existente.
