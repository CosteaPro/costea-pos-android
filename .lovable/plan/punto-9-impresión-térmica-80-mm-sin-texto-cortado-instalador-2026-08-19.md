# Punto 9 — Impresión térmica 80 mm sin texto cortado + instalador v1.8.9

## Qué está pasando

El contenido del ticket se compone hoy sobre un ancho de 70–72 mm y el margen de página es de 2–3 mm. En papel de 80 mm el área realmente imprimible de la mayoría de cabezales es de 72 mm, y el driver suma su propio margen: por eso las últimas 2 o 3 letras de cada línea (sobre todo la columna de precios, que va pegada al borde derecho) se salen del papel.

## Corrección

Aplicar un mismo formato "seguro" a todos los documentos térmicos:

- Ancho útil del contenido: 66 mm, centrado, con margen simétrico de 4 mm a cada lado.
- Tablas con columnas de ancho fijo (cantidad / descripción / precio / total), en vez de que el precio empuje la línea hacia la derecha. Las cifras nunca se parten y la descripción es la que se ajusta o baja de línea.
- Columna de importes con ancho reservado suficiente para valores tipo `$ 1.234,56`, alineada al borde derecho del ancho útil (no del papel).
- Tamaños de letra sin cambios en la jerarquía actual (solo se recalculan los anchos), para no perder legibilidad.

## Dónde se aplica

- `desktop/lib/ticket.cjs` — los tres formatos de la caja descargable: factura/orden para el cliente, ticket de control interno y ticket de cierre/cuadre, más el ticket de "ORDEN ANULADA".
- `src/lib/receipt.ts` — el mismo recibo cuando se imprime desde la caja web, para que ambos salgan idénticos.
- Revisión rápida de los demás formatos térmicos que comparten estilos (`src/lib/print.ts` para comandas de cocina/parrilla) para que no queden con el ancho antiguo.

## Verificación

Se generan los HTML de una factura de cliente y de su copia de control interno con nombres de producto largos y un total de 4 cifras, y se comprueba que ninguna línea supere el ancho útil de 66 mm.

## Instalador

Al terminar, subir la versión a **1.8.9** en `desktop/package.json`, reconstruir la interfaz web embebida (`scripts/build-desktop.mjs`) y empaquetar la caja.

Nota: el instalador `.exe` de Windows se arma con el script `desktop/construir-instalador.bat` en una máquina Windows. Desde aquí se entrega el paquete de la caja listo (carpeta `desktop/` con la interfaz web ya integrada y la versión actualizada) y, si el empaquetado en este entorno lo permite, también el comprimido descargable.
