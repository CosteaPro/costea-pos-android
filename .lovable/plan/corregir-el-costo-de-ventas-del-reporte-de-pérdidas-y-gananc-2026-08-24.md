# Corregir el costo de ventas del reporte de Pérdidas y Ganancias

## Qué está pasando hoy

El P&G ya toma el costo de la columna **Consumo $** del reporte de inventario, pero la calcula contra el conteo físico del **último día del mes** (por ejemplo 31/08). Como todavía no existe conteo físico de esa fecha, el sistema asume inventario final = 0 y la fórmula queda:

```text
Consumo = Inventario inicial + Compras + Transferencias(+) − Transferencias(−) − Consumo personal − Inventario físico(0)
```

Es decir, todas las compras del mes caen como costo. Verificado en los datos: los conteos físicos más recientes son del 23/08 y 16/08; no hay conteo del 31/08.

## La corrección

1. El costo del P&G se toma de la columna **Consumo $**, calculada contra el **último conteo físico realmente registrado** dentro del mes (hoy, el del 23/08), no contra una fecha sin conteo.
2. El período de inventario que alimenta el reporte se corta en esa misma fecha, para que inventario inicial, compras, transferencias y físico correspondan al mismo tramo y las compras posteriores al último conteo no se conviertan en costo.
3. Si en el mes no hay ningún conteo físico, el costo de producción se muestra en 0 con un aviso en pantalla ("Falta el conteo físico del período") en vez de imputar todas las compras como costo.
4. Debajo del costo de producción se mantiene el desglose por categoría de inventario, con el mismo formato actual.
5. Se muestra junto al título del costo la fecha del conteo usado, para que quede claro hasta qué día está costeado el mes.

## Detalle técnico

- En `src/lib/pyg.ts` (`loadPyg`): antes de cargar el reporte, consultar en `inventory_physical_counts` la última `business_date` dentro del rango del mes; usar esa fecha como cierre para `loadInventoryReport(from, fechaConteo)` y para `loadPhysicalCounts(fechaConteo)`.
- `PygData` incorpora `costeadoHasta: string | null`; sin conteo, `costoCategorias` vacío, `costoTotal` 0 y `utilesLimpieza` 0.
- En `src/routes/admin.perdidas-ganancias.tsx`: mostrar la fecha de corte junto a "COSTO DE PRODUCCIÓN" (y en la impresión A4) y el aviso cuando falte el conteo.
- Sin cambios en base de datos ni en la lógica de movimientos de inventario.
