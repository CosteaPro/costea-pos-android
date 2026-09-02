# Los ingredientes de producción bajan como Venta

Hoy, al registrar una producción de subreceta, los ingredientes se descuentan con un tipo de movimiento aparte ("Consumo por producción"). Ese tipo **no se suma en ninguna columna** del reporte de inventario por período (solo se consideran Compras, Bajas, Lunch, Transferencias y Ventas), así que el inventario final del reporte queda descuadrado frente al stock real.

La corrección: esos ingredientes se registran como **Venta**, igual que cualquier otra venta.

## Qué cambia

- Al registrar una producción, cada ingrediente consumido se guarda con tipo **Venta**, con el texto "CONSUMO POR VENTA · <nombre de la subreceta>", en la misma fila de Ventas del reporte.
- La entrada de la subreceta terminada al inventario **no cambia** (sigue entrando como producción/compra, como hasta ahora).
- Se dejan de crear movimientos de tipo "Consumo por producción". El tipo desaparece del selector de movimientos.
- Los 19 movimientos históricos de "Consumo por producción" (17/08 al 01/09) se convierten a **Venta** para que el histórico cuadre. No se altera cantidad, valor, fecha ni ítem: solo la etiqueta del tipo.
- Anular o editar una producción sigue funcionando igual: se revierten sus movimientos por el vínculo con la producción, sin importar el tipo.

## Qué NO cambia

- No se crean productos, categorías ni tipos de movimiento nuevos.
- No se toca la lógica de ventas de pedidos, ni compras, ni conteo físico, ni el cálculo del P&G.

## Detalle técnico

1. `src/lib/production.ts`: en el arreglo de movimientos, el ingrediente pasa de `movement_type: "consumo_produccion"` a `"venta"` y su `reason` a `CONSUMO POR VENTA · <receta> (<n> lote(s))`.
2. `src/lib/inventory.movements.ts`: quitar `consumo_produccion` de las opciones seleccionables (se conserva en el tipo TS para leer datos antiguos si quedaran).
3. `src/components/admin/inventory-movements.tsx`: ajustar el color/etiqueta ya que ese tipo deja de generarse.
4. Migración de datos: `UPDATE public.inventory_movements SET movement_type = 'venta' WHERE movement_type = 'consumo_produccion'` (19 filas), más el ajuste del texto a "CONSUMO POR VENTA · …". Sin cambios de esquema; el valor del enum se deja en la base para no romper funciones existentes.
5. Verificación: comprobar que el reporte de inventario por período recalcula igual que el stock actual tras el cambio.
