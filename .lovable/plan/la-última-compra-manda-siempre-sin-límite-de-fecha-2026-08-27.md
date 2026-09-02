# La última compra manda siempre, sin límite de fecha

## Qué se revisó

- El costo que usan las recetas sale de `inventory_items` (costo de la última compra registrada). No hay ningún filtro por mes, por rango del reporte ni por antigüedad: la compra más reciente de todo el historial es la que rige, aunque sea de hace meses.
- Al registrar una compra, el costo se actualiza en el ítem y se propaga automáticamente a todas las recetas y subrecetas.
- Al anular o eliminar una compra, se vuelve al costo de la compra anterior del historial completo (no a cero).
- El único punto que mira fechas es la valoración histórica del reporte diario de inventario: para un día anterior a la primera compra usa el costo actual del ítem, nunca $0.00 por el paso del tiempo. Ese comportamiento se mantiene.

Conclusión: la regla "la última compra = siempre" ya se cumple. No hay costos que caduquen.

## El problema real que sí existe

Hay una línea de receta desfasada, y no es por fechas: es por **unidad**.

- Arroz: última compra vigente, costo $0.881848 por kilo, equivalente a $0.00088 por gramo.
- La receta "Arroz Terminado" usa 4 **kilos** y guarda $0.881848 por kilo (correcto).
- La actualización automática después de una compra escribe siempre el costo en la unidad de receta del ítem (gramo). Si esa línea se recalculara hoy, el arroz pasaría a $0.00088 por kilo: mil veces más barato.

Es decir: la propagación de costos ignora la unidad en la que está escrita cada línea de la receta.

## Qué se va a corregir

- La actualización automática de costos convertirá el costo a la unidad exacta en la que está guardada cada línea de receta (kilo, gramo, litro, mililitro, unidad, etc.) antes de escribirlo, y recalculará el subtotal con ese costo convertido.
- Si una unidad no es convertible con la del ítem, la línea se deja intacta en vez de escribir un valor erróneo.
- Se ejecuta una pasada de sincronización sobre todas las recetas y subrecetas existentes con la regla corregida, para que ninguna quede desfasada ni con la unidad equivocada.
- No se toca nada de la búsqueda de la última compra: sigue siendo la más reciente de todo el historial, sin límite de tiempo.

## Detalles técnicos

- Migración sobre `public.repropagate_item_cost(_item_id uuid)`:
  - Las líneas `source_type = 'item'` pasan a usar `inventory_items.cost_per_recipe_unit * public.unit_convert_factor(item.recipe_unit, recipe_items.unit)` en lugar del costo crudo por unidad de receta; `subtotal = ROUND(quantity * costo_convertido, 6)`.
  - Cuando `unit_convert_factor` devuelve NULL o 0 (unidades incompatibles), la línea se excluye del `UPDATE`.
  - Misma conversión en los dos bloques en cascada que actualizan líneas de subreceta y de ítem espejo, usando la unidad de la línea destino.
  - Se conserva la cascada de 6 niveles y la sincronización del ítem espejo de cada subreceta.
- Ajuste único posterior: `PERFORM public.repropagate_item_cost(id)` para todos los ítems con líneas de receta, dejando la línea de Arroz en $0.881848/kilo (subtotal $3.53).
- Sin cambios en `apply_purchase_stock`, `revert_purchase`, `recalc_inventory_period`, `close_inventory_day` ni en el código de reportes: ninguno filtra compras por período al costear recetas.
