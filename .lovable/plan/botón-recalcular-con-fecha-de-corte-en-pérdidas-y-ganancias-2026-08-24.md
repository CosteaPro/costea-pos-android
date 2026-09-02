# Botón "Recalcular" con fecha de corte en Pérdidas y Ganancias

## Qué hace

Junto a los botones actuales (Actualizar, Imprimir) se agrega un botón **Recalcular**. Al pulsarlo se abre una ventana con:

- Un selector de fecha (calendario), limitado al mes que se está viendo, con el día de hoy como valor inicial (o el último día del mes si se consulta un mes pasado).
- El texto "Se recalculará desde el 1 de {mes} hasta la fecha elegida".
- Botones Cancelar y Recalcular.

Al confirmar:

1. Reprocesa el consumo de inventario generado por las ventas cobradas desde el inicio del mes.
2. Reconstruye los saldos diarios de inventario día por día, del 1 del mes hasta la fecha elegida.
3. Vuelve a cargar el P&G para mostrar el costo ya recalculado.
4. Muestra un aviso con el resultado (pedidos y movimientos reprocesados) o el error si algo falla.

Mientras corre, el botón queda deshabilitado con la etiqueta "Recalculando…" para evitar dobles ejecuciones.

## Aclaración sobre el cálculo

El costo del P&G no está guardado en ninguna tabla: se lee en vivo de la columna **Consumo $** del reporte de inventario del mes completo. El botón no cambia esa regla — lo que hace es regenerar los datos de inventario (movimientos de venta y saldos por día) sobre los que esa columna se apoya, para que el mes quede consistente cuando se cargaron ventas o compras con retraso.

**Útiles de limpieza** sigue exactamente la misma regla: su monto también sale de la columna Consumo $ de esa categoría de inventario; la única diferencia es que no se suma al costo de producción, sino que se carga como gasto general. El recálculo lo actualiza igual que el resto de categorías.

## Detalle técnico

- Nueva función en `src/lib/pyg.ts`: `recalcularMes(year, month, hasta)` que usa `monthRange` para el inicio y la fecha recibida como corte; llama por RPC a `recalc_sales_consumption({ _desde: from })` y luego `recalc_inventory_period({ _from: from, _to: hasta })`, devolviendo pedidos, movimientos y días recalculados.
- En `src/routes/admin.perdidas-ganancias.tsx`: `Dialog` con el `Calendar` de shadcn (clase `pointer-events-auto`), estados `recalculando` y `fechaCorte`, handler que ejecuta `recalcularMes` y luego `cargar()`, con `toast.success` / `toast.error`. Fechas manejadas en horario Ecuador con los ayudantes existentes.
- Sin cambios de base de datos: ambas funciones ya existen y son `security definer`.
