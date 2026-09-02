# Variantes de receta gestionadas desde el producto

Se elimina la creación de variantes dentro de Recetas y Subrecetas. Las recetas vuelven a ser independientes y cada producto simplemente apunta a las recetas que quiere ofrecer como variantes.

## Reglas acordadas

- Las recetas se crean, editan y cuestan solo en Recetas y Subrecetas.
- Cada receta de plato guarda su propio precio de venta; ese precio se usa cuando se vende como variante, en cualquier producto donde esté asignada.
- Solo se pueden asignar recetas de tipo plato (no subrecetas) como variantes.
- Una misma receta puede ser variante de varios productos; nunca se duplica.
- Sin variantes asignadas, el producto funciona con su receta principal, como siempre.
- Al vender: sin elegir variante se usa la receta principal; al elegir una, esa sustituye la receta, nombre, código y precio de esa línea. Modificadores y agregadores se aplican sobre lo que quedó seleccionado.

## Qué cambia en pantalla

**Recetas finales (administración)**: desaparece el bloque "Variantes de este plato", el botón "Agregar variante", el nombre de variante y el precio de variante. Vuelve a ser una receta por plato, con sus insumos, costo, % de costo y margen. Se añade el campo de precio de venta de la receta (usado cuando la receta se vende como variante de un producto).

**Menú → editar producto**: nueva sección "Variantes de receta" bajo la receta principal. Un buscador lista las recetas de plato existentes; al elegir una queda vinculada y aparece en una lista con su código, nombre y precio, con botón para quitarla. También se muestra/selecciona la Receta principal del producto.

**Punto de venta y meseros**: si el producto tiene variantes asignadas, la ventana de personalización muestra arriba la lista "Receta": la principal (marcada por defecto) y cada variante con su precio. Al elegir una, el encabezado y el total de la línea cambian a los de la variante. Cerrar sin elegir deja el producto principal.

**Cocina, tickets, factura y Mix de ventas**: la línea muestra el nombre y código de lo realmente vendido (principal o variante).

## Detalles técnicos

**Base de datos (una migración):**
- Nueva tabla `product_recipe_variants` (`product_id`, `recipe_id`, `sort_order`), única por par producto-receta, con GRANT a `authenticated`/`service_role`, RLS y políticas equivalentes a las de `products`/`recipes`.
- `recipes`: se retira el uso de `kind = 'variante'` y de `variant_name` (columna queda sin uso; no hay filas de ese tipo). `sale_price` se conserva como precio de venta propio de la receta.
- `set_recipe_code()`: vuelve al comportamiento previo (código heredado del producto para la receta del plato, `RC####` para el resto).
- `apply_sales_consumption()`: si la línea de venta trae `recipe_id`, consume esa receta; si no, la receta asociada al producto. Se mantiene idempotente por pedido.

**Frontend:**
- `src/components/admin/final-recipes.tsx`: se elimina toda la lógica y UI de variantes (estado, guardado, listas) y se deja el precio de venta de la receta.
- `src/routes/menu.tsx`: sección de asignación de variantes por producto (buscar receta, vincular, desvincular) y selección de receta principal.
- `src/components/ProductOptionsDialog.tsx`: selector de receta (principal + variantes) arriba, con reinicio limpio en cada apertura.
- `src/routes/index.tsx` y `src/components/MobileWaiter.tsx`: la línea del carrito guarda `recipe_id`, nombre, código y precio efectivos, y los escribe en `order_items` al guardar el pedido.
- `src/lib/receipt.ts`, `src/lib/print.ts`, `src/routes/cocina.tsx`, `src/routes/admin.mix-ventas.tsx`: usan el nombre/código de la línea tal como quedó registrado.

Alcance: caja web, panel administrativo y sistema de meseros. La caja descargable (Electron) queda para una segunda etapa.
