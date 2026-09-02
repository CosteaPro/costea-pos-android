# Ajustes al módulo de Compras y Proveedores

## 1. Proveedores: botón Eliminar (se va Activar/Desactivar)

- En cada fila de proveedor queda: **Editar** y **🗑️ Eliminar** (rojo, con confirmación).
- Eliminar es un retiro lógico: el proveedor deja de aparecer en la lista y en los
  selectores de nueva compra, pero **todas las compras históricas se conservan
  intactas** (mantienen el nombre del proveedor y sus movimientos de inventario).
- Se quita la columna "Estado" y el botón Activar/Desactivar de la tabla, y también el
  campo "Estado" del formulario de proveedor.

## 2. Proveedores: paginación de 10 en 10

- La tabla muestra 10 proveedores por página.
- Pie con "Mostrando X a Y de N registros" y números de página, igual al historial de
  compras.
- Al buscar, los resultados filtrados también se paginan de 10 en 10 y vuelven a la
  página 1.

## 3. Historial de Compras: 10 registros por página

- Pasa de 5 a 10 filas por página; el pie y las flechas siguen igual.

## 4. Menú: quitar "Órdenes de compra"

- Se elimina esa opción del menú lateral del módulo de inventario. Toda la gestión
  queda en "Compras".

## Detalle técnico

- Migración: agregar `deleted_at timestamptz` a `public.suppliers` (borrado lógico que
  respeta las llaves foráneas de `purchases`, `expenses` e `inventory_items`).
- `usePurchasingData().loadSuppliers` en `src/components/admin/purchasing.tsx` filtra
  `deleted_at is null`, con lo que desaparece del listado y de los selectores de compra.
- `SuppliersTab`: quitar `toggleActive` y la columna Estado, agregar `deleteSupplier`
  (update `deleted_at = now()`) con `AlertDialog` de confirmación, y paginación local de
  10 con el mismo pie que `PurchasesTab`.
- `PurchasesTab`: `PAGE_SIZE` de 5 → 10.
- `src/components/AdminShell.tsx`: quitar el ítem `/admin/ordenes-compra` (la ruta
  permanece en el proyecto, solo sale del menú).

## Verificación

Al terminar entro con el usuario administrador, abro Proveedores (elimino uno de prueba
y confirmo que la compra histórica sigue apareciendo), reviso la paginación de 10 en
ambas pantallas y que el menú ya no muestre "Órdenes de compra".
