# Costo Unitario por período con herencia solo del número

## Qué pasa hoy (verificado)

- La columna **Costo Unit.** del reporte de inventario NO mira el período: toma el campo guardado `unit_cost` del ítem, que siempre es el de la **última compra registrada en todo el historial** (`src/lib/inventory.movements.ts`, línea 280).
- Consecuencia: si consulto agosto y en septiembre hubo una compra más cara, agosto muestra el costo de septiembre. Y si el ítem nunca tuvo compra, muestra "—" (hoy hay 12 ítems así, sin ninguna compra ni historial: Romero, Ají, Mostaza, etc.).
- Recetas y Mix de ventas ya leen un solo número heredado (el costo por unidad de receta que se actualiza con cada compra), así que ahí la herencia ya funciona; lo que falta es que el reporte por período use exactamente la misma lógica y que ese número quede documentado como fuente única.

## Regla que se va a implementar

Para cada ítem y cada rango de fechas seleccionado:

```text
1. Sumar compras del rango:  $ recibidos  y  unidades recibidas (en unidad de inventario)
2. ¿Hubo compras en el rango?
   SÍ -> Costo Unitario = $ del rango ÷ unidades del rango   (promedio ponderado del período)
   NO -> Costo Unitario = último costo unitario conocido con fecha ANTERIOR al fin del rango
         (solo se hereda el número: nada de cantidades, movimientos ni registros)
3. Ese número es el que muestran el reporte, las recetas y el Mix de ventas
```

- El costo heredado se mantiene sin caducidad: si la última compra fue en marzo y estamos en octubre, marzo manda.
- Nunca se muestra 0 si existe algún costo anterior. Solo aparece "—" cuando el ítem jamás tuvo una compra.
- Nunca se usa una compra POSTERIOR al rango consultado: los reportes históricos dejan de "contaminarse" con precios futuros.

## Cambios

1. **Cálculo del costo por período** (`src/lib/inventory.movements.ts`, en `loadInventoryReport`):
   - Ya se leen las compras del rango; se acumula además `unidades del rango` y `$ del rango` por ítem para obtener el promedio ponderado.
   - Si el ítem no tuvo compras en el rango, se consulta el último costo anterior al fin del rango a partir del historial de costos y de las compras (`item_cost_history` y `purchase_items` unidos a la fecha de la compra), tomando la fecha más reciente disponible sin límite de antigüedad.
   - Si tampoco hay nada anterior, se cae al costo guardado del ítem y, si ese es 0, se muestra "—".
   - `ReportRow.unitCost` pasa a ser este valor; las columnas de pantalla, Excel e impresión no cambian de forma, solo de contenido.

2. **Herencia visible en recetas y Mix**: se mantiene el número guardado por ítem (se actualiza únicamente cuando entra una compra nueva) y se documenta que esa es la fuente única, para que reporte, recetas y Mix muestren el mismo valor.

3. **Comprobación**: consultar un mes con compras y un mes sin compras del mismo ítem y confirmar que el segundo hereda exactamente el costo del último mes con compra, y que ningún ítem con historial muestra 0.

## Detalle técnico

- Nueva función auxiliar `costoHeredadoPorItem(items, hastaFecha)` en `src/lib/inventory.movements.ts`: una sola consulta por rango que devuelve, por ítem, el costo por unidad de inventario de la compra más reciente con `purchased_at <= fin del rango`.
- El promedio del período se calcula como `valCompras / qtyCompras` cuando `qtyCompras > 0` (mismos datos ya cargados de `purchase_items`), redondeado a 6 decimales internos y mostrado a 2.
- Las entradas por producción también suman a compras del período, así que su costo entra en el promedio igual que una compra.
- Sin cambios de base de datos ni migraciones; sin cambios en cantidades, movimientos ni saldos.
