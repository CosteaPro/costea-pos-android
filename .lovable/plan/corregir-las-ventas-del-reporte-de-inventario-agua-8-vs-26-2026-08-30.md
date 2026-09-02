# Corregir las ventas del reporte de inventario (Agua: 8 vs 26)

## Qué está pasando (confirmado con datos reales)

Del 24 al 29 de agosto:
- Mix de ventas: 26 unidades de Agua vendidas (verificado en pedidos cobrados).
- Movimientos de inventario: también existen 26 unidades descontadas, repartidas por día
  (24: 3, 25: 1, 26: 8, 27: 4, 28: 5, 29: 5).

Es decir, el descuento de inventario está bien. Lo que falla es la **lectura** del reporte:
en ese rango hay 2.600 movimientos y la consulta del reporte trae como máximo 1.000 filas
(límite del servidor de datos). Se cortan los días y solo sobrevive una parte — por eso
aparece 8 en vez de 26.

Es exactamente el mismo problema que ya se corrigió en Mix de ventas, P&G, Tablero y
Reporte de cajas con el ayudante de paginación, pero el reporte de inventario quedó sin
esa corrección.

## Qué se va a hacer

1. En `src/lib/inventory.movements.ts`, dentro de `loadInventoryReport`, traer los
   movimientos con `fetchAllRows` (paginación automática) en lugar de una sola consulta.
2. Aplicar lo mismo a las demás consultas del mismo reporte que pueden superar 1.000 filas:
   - `inventory_items`
   - `inventory_opening_balances`
   - `purchase_items` (por `purchase_id`, y también en `costoHeredadoPorItem`)
   - `purchases` (ids del rango)
   - `inventory_physical_counts` (conteo físico del día)
3. Verificar con datos: el reporte del 24 al 29 debe mostrar 26 unidades de Agua y coincidir
   con Mix de ventas.

## Detalles técnicos

- Reutilizar `fetchAllRows` de `src/lib/utils.ts`, que ya pagina con `.range(a, b)`.
- Para las consultas con `.in("purchase_id", ids)`, mantener además el troceado de ids
  cuando la lista sea grande, para no exceder el largo de la URL.
- Sin cambios de esquema ni de la lógica de descuento: solo lectura.
