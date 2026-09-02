# El costo del P&G siempre sale de la columna "Consumo $"

## Qué cambia

La versión anterior cortaba el costo en el último conteo físico del mes y, si no había conteo, mostraba el costo en 0 con un aviso. Eso se elimina.

A partir de este ajuste:

1. El costo de producción del P&G es **siempre** la suma de la columna **Consumo $** del reporte de inventario, exactamente igual a como se ve en la pantalla de Reportes de inventario (foto de referencia).
2. El período es el mes completo (del día 1 al último día del mes), sin cortes por fecha de conteo.
3. El inventario físico se usa tal como esté registrado; si un ítem no tiene conteo, cuenta como 0, igual que en el reporte de inventario.
4. Se quita el aviso "Falta el conteo físico del período" y la fecha de corte que se mostraba junto a "COSTO DE PRODUCCIÓN" (pantalla e impresión A4).
5. Se mantiene el desglose por categoría y la separación de útiles de limpieza hacia gastos generales.

## Detalle técnico

- `src/lib/pyg.ts` (`loadPyg`): eliminar `ultimoConteoFisico` y el uso de `corte`; volver a `loadInventoryReport(from, to)` y `loadPhysicalCounts(to)` con el rango completo del mes. Quitar `costeadoHasta` de `PygData`.
- `src/routes/admin.perdidas-ganancias.tsx`: quitar la fecha de corte junto al título del costo y el aviso por falta de conteo.
- Sin cambios en base de datos ni en la lógica de inventario.
