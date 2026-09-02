# Corrección: cadena diaria de inventario (Final de ayer = Inicial de hoy)

## Qué encontré

- Sí existe un saldo por día en agosto (del 02 al 24), es decir, la cadena diaria ya se guarda día a día. **Falta el saldo del 01 de agosto**, por eso los reportes que empiezan el día 1 arrancan en cero.
- El problema real de "retroactividad": cuando se recalcula, **todos los días del período se vuelven a valorar con el costo unitario de HOY** (`inventory_items.unit_cost`). Por eso un reporte del día 15 cambia de valor con el paso del tiempo, aunque las cantidades sean correctas.
- El cierre de día toma el **stock actual del sistema** (no el cierre calculado de esa fecha) y lo escribe como inicial del día siguiente. Si se cierra un día pasado con retraso, se le mete el valor de hoy.
- El recálculo, cuando no encuentra el saldo exacto del día inicial, busca "el último saldo anterior o igual", lo que puede arrastrar un saldo de otra fecha en lugar de respetar la regla acordada.

## Regla que quedará implementada

```text
Inicial día 1 del mes = conteo físico del día anterior (si no existe → 0)
Final día X          = Inicial X + Compras + Producción + Transf(+) − Bajas − Lunch − Transf(−) − Ventas
                       (si hay conteo físico del día X, el físico manda)
Inicial día X+1      = Final día X          ← siempre, sin excepción
```

Y además: **cada día se valora con el costo vigente de ese día**, no con el costo de hoy. Un reporte histórico ya calculado no vuelve a cambiar.

## Cambios

### 1. Base de datos — `recalc_inventory_period`
- Punto de partida: usar el saldo guardado **de la fecha exacta** `_from`. Si no existe, tomar el conteo físico del día anterior; si tampoco existe, arrancar en cero. Nunca heredar un saldo de otra fecha cualquiera.
- Valoración por día: el costo unitario de cada día se toma del último costo de compra registrado **hasta ese día** (`item_cost_history` / última compra ≤ día), con el costo actual solo como último recurso. Así el valor de un día pasado queda congelado.
- Borrado acotado: seguir eliminando solo los saldos dentro del rango recalculado; nunca tocar fechas anteriores a `_from`.
- El stock actual del ítem solo se actualiza cuando el recálculo llega hasta el día de hoy.

### 2. Base de datos — `close_inventory_day`
- En lugar de copiar el stock actual, calcular el cierre real de la fecha cerrada (recálculo de ese día) y escribir ese resultado como inicial del día siguiente.

### 3. Base de datos — `apply_physical_count_as_opening`
- Mantener "el físico manda", pero valorando con el costo vigente de esa fecha y encadenando hacia adelante únicamente desde el día siguiente al conteo.

### 4. Aplicación (`src/lib/inventory.movements.ts`)
- El reporte sigue leyendo el saldo inicial de la **fecha exacta** del inicio del rango (sin buscar fechas posteriores), para que el histórico quede fijo. Si no hay saldo para esa fecha, inicial = 0.

### 5. Reconstrucción de agosto
- Ejecutar una sola vez la cadena desde el 01/08 hasta hoy con la nueva regla, para dejar los saldos diarios coherentes y con el saldo del 01/08 creado.

## Detalle técnico

- Migración que reemplaza las tres funciones (`recalc_inventory_period`, `close_inventory_day`, `apply_physical_count_as_opening`) manteniendo `SECURITY DEFINER` y la validación de rol `can_manage_movements`.
- Costo por día vía `LEFT JOIN LATERAL` sobre `item_cost_history` (último registro con `created_at::date <= d`), con respaldo en `inventory_items.unit_cost`.
- No cambia el contrato de `loadInventoryReport`, `consumoOf` ni el P&G: el Costo de ventas sigue saliendo de la columna "Consumo $".
