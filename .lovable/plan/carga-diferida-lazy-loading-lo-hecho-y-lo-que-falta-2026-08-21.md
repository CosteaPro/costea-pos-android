# Carga diferida (lazy loading) — lo hecho y lo que falta

## Ya implementado (verificado en el código)

- Fotos de producto (`ProductImage`): la imagen y su enlace firmado se piden solo cuando la tarjeta entra en pantalla (margen anticipado de 300 px), con placeholder animado del mismo tamaño para que la cuadrícula no salte, y firmas agrupadas en un solo lote.
- Renderizado por bloques al hacer scroll en: punto de venta (bloques de 24), vista de meseros (20), facturas (40) y órdenes emitidas (40).

## Lo que falta para cumplir "toda la interfaz"

Aplicar el mismo renderizado progresivo a las listas largas que hoy pintan todas sus filas de una vez:

- Reportes de ventas (`src/routes/admin.reportes-ventas.tsx`)
- Mix de ventas (`src/routes/admin.mix-ventas.tsx`)
- Movimientos de inventario (`src/routes/admin.movimientos.tsx`)
- Reportes de inventario (`src/routes/admin.reportes-inventario.tsx`)
- Reportes del POS (`src/routes/reportes.tsx`)
- Editor de menú (`src/routes/menu.tsx`) y bitácora de tiempos (`src/routes/bitacora.tsx`, `src/routes/tiempos.tsx`)

Reglas en cada caso:

- Los totales, sumatorias, impresiones y exportaciones a Excel siguen usando el conjunto completo de datos; solo cambia cuántas filas se pintan.
- Indicador discreto de "cargando más…" al final, sin botones ni paginación visible.
- Al cambiar filtros o búsqueda se vuelve al primer bloque.

## Detalles técnicos

Se reutilizan los hooks existentes `src/hooks/useProgressiveList.ts` y `src/hooks/useInView.ts`. Sin dependencias nuevas, sin cambios de base de datos, precios, impresión ni lógica de venta. La caja descargable (Electron) queda fuera de alcance: sus fotos ya se leen del disco.
