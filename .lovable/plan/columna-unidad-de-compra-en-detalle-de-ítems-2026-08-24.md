# Columna "Unidad de Compra" en Detalle de Ítems

Agregar una columna de solo lectura entre Cantidad y Descripción en la tabla de ítems del formulario "Registrar Nueva Compra".

## Cambio

Nuevo orden de columnas:

```text
CANT. | UNIDAD DE COMPRA | DESCRIPCIÓN DEL ÍTEM | COSTO UNIT. | SUBTOTAL | ACCIÓN
```

- La unidad se llena sola al elegir el ítem: se toma la unidad de compra ya configurada en la ficha del producto (ej. "saco", "libra", "caja").
- No es editable: se muestra como texto en un recuadro gris.
- Si aún no se ha seleccionado ítem, la celda muestra un guion.
- En celular las filas siguen apiladas; la unidad aparece igual con su etiqueta.

## Nota técnica

Solo se edita `src/components/admin/purchasing.tsx`, en la sección "Detalle de Ítems" (encabezado y filas): la grilla pasa de `70px_1fr_120px_110px_44px` a `70px_120px_1fr_120px_110px_44px` y se muestra `item.purchase_unit`. Sin cambios de datos ni de lógica de guardado.
