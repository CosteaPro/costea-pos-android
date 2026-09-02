# Las ventas se cortan a la mitad: causa confirmada

## Qué encontré

Revisé la base de datos y los reportes. En agosto hay **1.860 pedidos pagados no anulados** que suman **$12.962,96** (Caja Web $10.875,45 + caja local/descargable $1.004,85 + otras cajas $1.082,66). Ese es el número real.

El Mix de Ventas y el P&G muestran ~$6.000 porque **el servidor entrega como máximo 1.000 registros por consulta** y ninguno de esos reportes pide las páginas siguientes. Con 1.860 pedidos en el mes, se pierden 860: casi exactamente la mitad. No hay ninguna división por dos, ni un filtro de más, ni un problema de sincronización de cajas — los datos están completos en el servidor, el reporte solo lee la primera página.

Confirmado también: los filtros son correctos (solo pagados, se excluyen anulados) y las cajas descargables sí están subiendo sus ventas.

## Qué se va a corregir

Todos los reportes de ventas pasarán a leer **todos** los pedidos del período, en páginas de 1.000 hasta terminar:

- Estado de Resultados (P&G)
- Mix de Ventas (y su pestaña de modificadores)
- Tablero / Panel general
- Flujo de Caja (ventas, créditos cobrados y compras)
- Reporte de Venta por Caja (Caja Web y cajas autorizadas)
- Reportes de ventas del mes en el módulo de Reportes

Resultado: lo que se ve en la caja = lo que se ve en el Mix = lo que se ve en el P&G, para cualquier rango de fechas y para todo el histórico, sin necesidad de recalcular nada (los datos guardados están correctos; solo se leían incompletos).

## Detalles técnicos

- Nuevo helper `fetchAllRows(builderFactory)` en `src/lib/utils.ts` (o `src/lib/pos.ts`): recorre con `.range(offset, offset + 999)` hasta que una página devuelve menos de 1.000 filas, y devuelve el arreglo completo; propaga cualquier error.
- Reemplazar las consultas sin paginar por ese helper en:
  - `src/lib/pyg.ts` (orders del mes en `loadPyg`)
  - `src/routes/admin.mix-ventas.tsx` (orders + order_items anidados)
  - `src/lib/dashboard-data.ts` (ambas consultas de orders)
  - `src/lib/flujo-caja.ts` (ventas, créditos cobrados, compras)
  - `src/routes/admin.reporte-cajas.tsx` (orders de Caja Web y `caja_documentos` de cajas autorizadas)
  - `src/routes/reportes.tsx` (consultas del período y del mes; la lista paginada de la línea 337 se deja igual)
- Se mantienen sin cambio todos los filtros actuales (`status = 'pagado'`, exclusión de `doc_status = 'anulado'`) y las fórmulas de IVA/subtotal.
- Sin cambios de base de datos ni migraciones.
