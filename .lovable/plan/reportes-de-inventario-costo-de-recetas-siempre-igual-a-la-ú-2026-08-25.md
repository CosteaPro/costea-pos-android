# Reportes de inventario + costo de recetas siempre igual a la última compra

## Parte A — Reportes de inventario

### 1. Nueva columna "Costo Unit."

En la tabla del reporte del período se agrega una columna, ubicada entre **"Inv. Inicial $"** y **"Compras"**:

- Nombre corto: **Costo Unit.**, con 2 decimales ($0.00).
- Valor: último costo de compra del ítem convertido a su unidad de inventario (el mismo costo con el que hoy se valoran compras, bajas, lunch, transferencias, ventas e inventario final).
- Si el ítem no tiene compras registradas, se muestra **—**.
- Es informativa: no cambia ningún total ni cálculo existente. También aparece en el Excel, en la misma posición.

### 2. Los dos botones muestran el MISMO reporte

Los botones "Inventario por Ítem" (verde) e "Inventario Costeado" (ámbar) abren el reporte completo del período, con idéntico formato, orden, diseño y pie de página:

- 🟢 **Inventario por Ítem**: oculta todas las columnas en dólares y también "Costo Unit.". Quedan Código, Descripción, Categoría, Unidad Inv, Inv. Inicial, Compras, Bajas, Lunch, Transf. Pos, Transf. Neg, Ventas, Inv. Sistema, Inv. Físico, S/F Cant.
- 🟡 **Inventario Costeado**: muestra todo, cantidades más columnas en dólares y "Costo Unit.".

Reglas comunes: respetan rango de fechas y categoría, encabezado con negocio/título/rango/categoría, botones Imprimir, Regresar y Exportar Excel (el Excel exporta exactamente las columnas visibles). "Generar reporte del período" no cambia; solo suma la nueva columna.

## Parte B — El costo de recetas y subrecetas solo cambia con una compra nueva

Hoy el costo de cada insumo de una receta queda congelado en el momento en que se guardó la receta: al registrar una compra nueva el ítem sí actualiza su costo, pero las recetas ya guardadas siguen con el costo viejo hasta que alguien las vuelve a guardar a mano. Hoy hay **31 de 54 líneas de receta desfasadas** respecto a la última compra.

Se corrige así:

- Al registrar una compra, el costo de ese producto se actualiza automáticamente en TODAS las recetas y subrecetas que lo usan, y se recalcula el subtotal de cada línea.
- Las recetas que usan subrecetas heredan el nuevo costo de la subreceta recalculada.
- Si se anula o elimina una compra, se vuelve al costo de la compra anterior (o a cero si no había ninguna).
- Nada más toca el costo: ni generar reportes, ni conteos físicos, ni cierres de día, ni el paso del tiempo.
- Se hace un ajuste único inicial para dejar las recetas actuales al costo de su última compra.

Ejemplo: arroz comprado hoy a $0.50 → la receta queda en $0.50 y se mantiene aunque pasen días o se hagan inventarios; solo cambia a $0.55 cuando se registre esa compra nueva.

## Detalles técnicos

### Reportes

- `src/components/admin/inventory-movements.tsx` (`InventoryReportsTab`): `HEADERS` pasa a 26 columnas con "Costo Unit." en la posición 6 y un mapa de columnas con bandera `money`; el render de la hoja se unifica con un parámetro `hideMoney`. `simpleView` (`"none" | "items" | "costeado"`) renderiza esa misma hoja con `hideMoney = simpleView === "items"`; se elimina la tabla resumida de 3/5 columnas. Con `hideMoney` se omiten las filas de pie monetarias (Costo real total y % de costo) y los `colSpan` se calculan desde las columnas visibles.
- `src/lib/inventory.movements.ts`: `exportInventoryReport` agrega la clave `"Costo Unit."` tras `"Inv. Inicial $"` y acepta `hideMoney`; `exportInventoryByItem` / `exportInventoryCosted` delegan en ella conservando sus nombres de archivo.
- Fuente del costo unitario: `inventory_items.unit_cost`, ya presente en `ReportRow.unitCost`. Sin cambios de base de datos para esta parte.

### Recosteo por compra (migración)

- Nueva función `public.repropagate_item_cost(_item_id uuid)` (SECURITY DEFINER, `search_path = public`):
  1. `UPDATE recipe_items SET unit_cost = i.cost_per_recipe_unit, subtotal = ROUND(quantity * i.cost_per_recipe_unit, 6)` para `source_type = 'item'` con ese `item_id`.
  2. Recalcula el costo unitario de las subrecetas afectadas (`SUM(subtotal) / yield_quantity`) y actualiza las líneas `source_type IN ('subreceta','receta')` que las referencian, en cascada acotada (máx. 5 niveles, sin ciclos).
  3. Sincroniza `inventory_items.unit_cost` / `cost_per_recipe_unit` del ítem espejo de cada subreceta recalculada.
- El trigger existente `apply_purchase_stock` (AFTER de `purchase_items`) invoca `repropagate_item_cost(NEW.item_id)` después de escribir `inventory_items` e `item_cost_history`; se añade también en `revert_purchase` y `void_purchase` tras restaurar el costo anterior.
- Ajuste único: llamar `repropagate_item_cost` sobre todos los ítems con líneas de receta desfasadas.
- No se modifica `recalc_inventory_period`, `close_inventory_day`, `apply_physical_count_as_opening` ni ningún camino de conteo/reporte: hoy ya no tocan `unit_cost` del ítem y siguen igual.
- Sin cambios en `src/components/admin/final-recipes.tsx`: al leer `recipe_items` ya recibirá el costo actualizado.
