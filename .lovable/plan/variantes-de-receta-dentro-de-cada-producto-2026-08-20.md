# Variantes de receta dentro de cada producto

Cada producto del menú podrá tener recetas alternativas ("variantes") con su propio nombre, código, costo y precio. En la pantalla de venta se sigue viendo un solo botón por producto; las variantes solo aparecen al abrir el atajo dentro de ese producto.

## Reglas acordadas

- Sin variantes creadas → el producto funciona exactamente como hoy.
- El atajo es opcional: si se abre la lista y no se elige nada, se vende el producto principal.
- Al elegir una variante, esta sustituye por completo al producto principal: nombre, código, costo y precio de la variante. Nada se mezcla.
- Modificadores y agregadores se aplican igual, sobre lo que quedó seleccionado (principal o variante).
- Cada variante descuenta su propia receta de inventario.
- En factura, cocina y reportes la variante aparece con su nombre y código propios, en línea propia del Mix de ventas.
- Las variantes nunca se convierten en botones sueltos de la cuadrícula. Quien quiera botones separados, crea productos independientes como siempre.

## Alcance de esta etapa

Caja web, panel administrativo y sistema de meseros (móvil). La caja descargable (Electron) y su instalador quedan para una segunda etapa, una vez validado en web.

## Cómo se verá

**Administración → Recetas finales**: dentro de la receta de un plato se añade el bloque "Variantes de este plato". Botón "Agregar variante" que pide nombre y precio de venta; cada variante abre su propio armado de ingredientes (mismo editor que ya existe) y muestra su costo, % de costo y margen. Código automático propio (RC0001, RC0002…).

**Punto de venta y meseros**: el botón del producto mantiene su esquina de personalización. Si el producto tiene variantes, la ventana muestra arriba una lista "Receta" con: la receta base (marcada por defecto) y cada variante con su precio. Al elegir una, el encabezado de la ventana pasa a mostrar el nombre y precio de la variante, y el total de la línea se recalcula. Cerrar sin elegir deja el producto principal.

**Panel de pedido / cocina / tickets**: la línea muestra el nombre y código de lo realmente vendido (principal o variante), con sus modificadores y agregadores debajo, tal como hoy.

## Detalles técnicos

**Base de datos (una migración):**
- `recipes`: nuevo `kind = 'variante'`, con `product_id` apuntando al producto padre y nuevas columnas `sale_price numeric` y `variant_name text` (el nombre visible). Se ajusta `set_recipe_code()` para que las variantes conserven código propio (`RC####`) y solo la receta base siga heredando el código del producto.
- `order_items`: nuevas columnas `recipe_id uuid` (variante vendida, nulo = receta base) e `item_code text` (código impreso/reportado).
- `apply_sales_consumption()`: si la línea trae `recipe_id`, se consume esa receta; si no, la receta base del producto (`kind = 'plato'`). Se excluyen las variantes del emparejamiento por `product_id` para que nunca se dupliquen consumos.
- GRANT/RLS: se reutilizan las políticas existentes de `recipes` y `order_items`; no se crean tablas nuevas.

**Frontend:**
- `src/lib/pos.ts`: tipo `RecipeVariant` y helper `precioDeVenta(producto, variante, canal)` — el precio por canal sigue aplicando al producto principal; la variante usa su propio precio (si el canal tiene precio configurado para el producto, se conserva la diferencia solo en el principal).
- `src/components/admin/final-recipes.tsx`: gestión de variantes (crear, renombrar, precio, ingredientes, costo y margen).
- `src/components/ProductOptionsDialog.tsx`: selector de receta (base + variantes) en la parte superior, con reinicio limpio en cada apertura.
- `src/routes/index.tsx` y `src/components/MobileWaiter.tsx`: la línea del carrito guarda `recipe_id`, nombre, código y precio efectivos; al guardar el pedido se escriben en `order_items`.
- `src/lib/print.ts`, `src/lib/receipt.ts`, `src/routes/cocina.tsx`: imprimen el nombre/código de la línea tal como quedó registrado (sin cambios de formato).
- `src/routes/admin.mix-ventas.tsx`: agrupa por código de línea, de modo que cada variante aparece como su propio renglón.
