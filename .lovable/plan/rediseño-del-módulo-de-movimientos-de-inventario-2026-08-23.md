# Rediseño del módulo de Movimientos de Inventario

Reconstruir la pantalla `/admin/movimientos` con dos pestañas siguiendo las imágenes de referencia.

## 1. Menú lateral
Renombrar "Movimientos y bajas" a **"Movimientos de Inventario"**.

## 2. Encabezado
Título "Movimientos de Inventario" y subtítulo "Bajas, consumo de personal, transferencias y salidas por venta. Todo se valora al costo de la última compra registrada.", con dos pestañas: **Registrar movimiento** y **Historial de Bajas/Consumos**.

## 3. Pestaña "Registrar movimiento"
- Fila superior: **Tipo de movimiento** (Baja / Merma, Consumo de personal, Ajuste negativo, Transferencia positiva, Transferencia negativa) y **Fecha contable** (dd/mm/aaaa).
- Bloque "Agregar productos al movimiento": botones **Ítems / Subrecetas / Recetas**, buscador desplegable "Selecciona un producto…", campo **Cantidad** y botón **+ Agregar**.
- Tabla de productos agregados con columnas: Código/Producto · Cantidad · Unidad · Costo · Total · Acciones (🗑️ quitar la línea).
- Debajo: "Costo de última compra: $0,00 · Valor del movimiento: $0,00" (suma de todas las líneas).
- Campo **Motivo / observación** (texto libre).
- Botones inferiores: **🖨️ Imprimir** y **💾 Guardar**.
- Al guardar se registra una línea de movimiento por cada producto de la tabla, con el mismo tipo, fecha y motivo; el inventario se descuenta automáticamente (lógica actual ya existente) y la tabla se limpia.

## 4. Pestaña "Historial de Bajas/Consumos"
- Filtros: Desde · Hasta · Tipo de movimiento · Buscar producto o motivo.
- Botones: **Imprimir**, **Exportar Excel**, **Consultar**.
- Tabla: Fecha · Código · Descripción · Categoría · Tipo · Cantidad · Valor Total · Acciones.
- Etiquetas de tipo con color: Baja/Merma en rojo, Consumo en verde, Ajuste negativo en gris, Transferencia en azul, Venta en ámbar.
- Paginación: selector "Mostrar: 10 ▼ de XXX registros" (10/25/50) y números de página.
- Acción única **👁️ Ver detalle**: modal de solo lectura con todos los datos del movimiento y botón para reimprimir. Se retiran de esta pantalla los botones de editar y eliminar (historial de solo lectura).
- El botón "Recalcular consumo de ventas" se mantiene disponible para administradores dentro de la barra de filtros.

## Notas técnicas
- Se reescribe `MovementsTab` en `src/components/admin/inventory-movements.tsx` usando el componente `Tabs` de shadcn; el resto del archivo (conteo físico y reportes) no cambia.
- El carrito de líneas es estado local; al guardar se hace un `insert` múltiple en `inventory_movements` (los triggers existentes aplican el stock).
- El tipo "Ajuste negativo" usa el tipo `ajuste` con signo negativo; el resto conserva el mapeo actual de `MANUAL_MOVEMENTS`.
- Impresión: se reutiliza el generador de reportes A4 existente (`report-print`) para el comprobante del movimiento y para el listado del historial.
- Sin cambios de base de datos.
