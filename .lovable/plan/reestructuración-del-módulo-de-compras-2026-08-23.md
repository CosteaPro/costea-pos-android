# Reestructuración del Módulo de Compras

Se sigue la foto de referencia: cabecera con título y botón azul "Registrar Compra" a
la derecha, barra de filtros en tarjeta blanca, tabla limpia con filas separadas y pie
de paginación.


## 1. Menú lateral

"Registro de compras" pasa a llamarse solo **"Compras"** (la dirección de la pantalla
se mantiene igual para no romper accesos directos ni enlaces guardados).

## 2. Pantalla principal — Historial de Compras

- Título: **Historial de Compras**
- Subtítulo: "Gestione y revise todos los registros de compras a proveedores."
- Arriba a la derecha, botón azul **Registrar Compra**, que abre el formulario de nueva
  compra ya existente (plantilla "Registrar Nueva Compra", sin cambios).

## 3. Barra de filtros

Una sola fila con: **Buscar Proveedor o Factura** (campo de texto con lupa),
**Fecha Inicio**, **Fecha Fin**, **Filtros Avanzados** y **Imprimir**.

"Filtros Avanzados" despliega los filtros actuales que hoy están siempre visibles
(proveedor e ítem). "Imprimir" genera el reporte del listado filtrado.

## 4. Tabla de compras

Se reemplaza el listado actual de tarjetas expandidas por una tabla:

```text
Fecha | Proveedor | N° Factura | Total | Acción
```

## 5. Acciones por fila

Como en la foto: botón azul claro **Ver** con ícono de ojo y botón rojo con ícono de
papelera, alineados a la derecha.

- 👁️ **Ver** — abre la factura completa (proveedor, comprobante, fecha, detalle de
  ítems, base, IVA y total) en una ventana, con botón 🖨️ **Imprimir** dentro
  (térmico y A4/PDF, que ya existen).
- 🗑️ **Eliminar** — pide confirmación antes de borrar y revierte stock y costos,
  como hoy. Sigue restringido al superadministrador.
- Se conserva **Editar** para el superadministrador dentro de la ventana "Ver",
  para no perder esa función.

## 6. Paginación

Pie de tabla igual a la foto: a la izquierda "Mostrando 1 a 5 de XXX registros" y a la
derecha flechas anterior/siguiente con números de página (página activa en azul y
puntos suspensivos cuando hay muchas). 5 registros por página.


## Detalle técnico

- Etiqueta del menú en `src/components/AdminShell.tsx`; la ruta
  `/admin/registro-compras` se mantiene.
- Encabezado y subtítulo en `src/routes/admin.registro-compras.tsx`.
- `PurchasesTab` en `src/components/admin/purchasing.tsx` se reescribe: barra de
  filtros con búsqueda por texto (proveedor o N° factura), tabla, diálogo "Ver
  factura" reutilizando `printPurchaseTicket` / `printPurchaseA4`, diálogo de
  confirmación de borrado existente y paginación local sobre las filas filtradas.
- El formulario de registro/edición de compra no se toca.

## Verificación final

Al terminar entro al sitio con el usuario administrador, abro Compras y compruebo
contra la foto: título, botón azul, barra de filtros, columnas de la tabla, botones
Ver/Eliminar y el pie de paginación.

