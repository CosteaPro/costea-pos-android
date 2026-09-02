# Recalcular = tomar el consumo hasta la fecha y mostrarlo en el P&G

## Regla acordada

Al presionar **Recalcular** y elegir una fecha, el sistema no reconstruye nada
más: simplemente toma el **Consumo $** ya calculado del Reporte de Inventario
desde el día 1 del mes hasta esa fecha y lo muestra como costo en el P&G.

- Saldo inicial del día 1 = inventario físico del día anterior; si no existe ese
  conteo, el inicial es cero.
- El P&G queda alineado al mismo período: día 1 → fecha seleccionada.

## Qué se va a hacer

1. **Recalcular deja de reescribir el mes.** El botón ya no dispara la
   reconstrucción completa de saldos; solo actualiza el consumo del período
   elegido y refresca el reporte.

2. **El P&G usa el consumo hasta la fecha de corte.** El costo de producción
   (y los útiles de limpieza como gasto general) se suman de la columna
   Consumo $ del Reporte de Inventario, del día 1 hasta la fecha señalada, en
   vez de todo el mes.

3. **Aviso claro al terminar.** El mensaje indicará el período usado
   (01 → fecha) y el total de consumo cargado al P&G, para notar de inmediato si
   quedó en cero.

Después del cambio se compara el "Costo de producción" del P&G contra la suma de
la columna Consumo $ del Reporte de Inventario del mismo rango; deben coincidir.

## Detalle técnico

- `src/lib/pyg.ts` → `recalcularMes`: en vez de llamar a
  `recalc_inventory_period`, ejecutar únicamente `recalc_sales_consumption` para
  el período y devolver el total de consumo del rango.
- `src/lib/pyg.ts` → carga del reporte: recibir una `hasta` opcional y sumar el
  consumo con `loadInventoryReport(from = día 1, to = hasta)` en lugar del mes
  completo.
- `src/routes/admin.perdidas-ganancias.tsx`: guardar la fecha de corte elegida,
  pasarla al cálculo del reporte y mostrar el resumen (período + consumo total)
  en el toast.
- Sin cambios de esquema ni en la regla de gastos: útiles de limpieza siguen
  saliendo del consumo y cargándose como gasto general.
