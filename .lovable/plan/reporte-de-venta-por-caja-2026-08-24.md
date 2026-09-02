# Reporte de Venta por Caja

Rediseño de la pantalla existente para que coincida con la referencia visual y sume la Caja Web como caja independiente.

## Ubicación
- Menú lateral, dentro de **Análisis y Reportes**: nueva entrada **Reporte de Venta por Caja** (hoy la pantalla existe pero no está enlazada).

## Origen de los datos (solo lectura)
- Las cajas se leen de las **Cajas Autorizadas** de Configuración. El reporte nunca crea, edita ni elimina cajas.
- Cada caja de escritorio suma sus comprobantes sincronizados (evitando duplicar orden + factura del mismo cobro y excluyendo rechazados/anulados).
- La **Caja Web** se agrega siempre como fila adicional: son las ventas emitidas desde la aplicación web (no provienen de una caja descargable) y se excluyen las anuladas.
- Una caja autorizada sin movimientos en el período aparece con $0.00 y la leyenda "Sin movimientos"; nunca se oculta.

## Filtros y acciones (barra superior)
- Fecha Inicio, Fecha Fin, selector **Seleccionar Caja** con casilla **Todas las cajas**, botón **Buscar**, **Imprimir** (A4) y **Excel**.

## Tarjetas resumen
Total General · Transacciones · Cajas Activas · Promedio por Caja.

## Tabla
Columnas: Caja · Total Vendido · Efectivo · Tarjeta · Transferencia · Otros · N° Transacciones · Último Movimiento · Acciones (👁️ Ver).
- Fila final **TOTALES** con la suma de todas las cajas (único lugar donde se consolidan).
- Ícono distinto para cajas de escritorio y para la Caja Web.
- Paginación de 10 cajas por página con el texto "Mostrando 1 a N de N cajas".
- Nota al pie: "El arqueo de cada caja es independiente. La suma de todas las cajas se muestra únicamente en este reporte."

## Ver detalle
Al pulsar 👁️ se abre una ventana con el arqueo de esa caja en el período: totales por forma de pago y el listado de sus operaciones (fecha/hora, tipo, número, cliente, forma de pago, total), con opción de imprimir. Solo lectura.

## Detalle técnico
- Se reescribe `src/routes/admin.reporte-cajas.tsx`; se agrega el enlace en `src/components/AdminShell.tsx`.
- Formas de pago agrupadas en Efectivo / Tarjeta / Transferencia / Otros (crédito y apps caen en Otros).
- Rangos de fecha con `desdeEc`/`hastaEc` (zona horaria de Ecuador) y actualización en tiempo real al sincronizar una caja.
- Impresión con `printReportA4` y exportación con XLSX, como en el resto de reportes.
- Sin cambios de base de datos.
