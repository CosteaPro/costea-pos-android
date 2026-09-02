# Carga diferida (lazy loading) en la caja web

Hoy cada tarjeta de producto pide su foto firmada al backend en cuanto se monta la cuadrícula: con cientos de productos se disparan cientos de peticiones al abrir la pantalla de venta. Las listas largas (facturas, órdenes, reportes) renderizan todas sus filas de una vez.

## 1. Imágenes que solo se cargan cuando se ven

Cambios en `src/components/ProductImage.tsx` (lo usan el POS, el editor de menú y el diálogo de personalización, así que se arregla todo de una vez):

- Un observador de visibilidad (IntersectionObserver) por tarjeta, con margen anticipado de ~300 px para que la foto ya esté lista justo antes de entrar en pantalla.
- Mientras no sea visible: no se pide la URL firmada ni se descarga nada.
- Al entrar en vista: se solicita la URL y se muestra la imagen con una transición suave de aparición.
- Placeholder elegante mientras carga: bloque con el mismo alto/ancho definitivo y animación sutil (skeleton), de modo que la cuadrícula nunca "salte".
- Se mantiene la caché en memoria por ruta de foto y el uso directo de fotos locales de la caja descargable (`costea-img://`), que no requieren red.
- Firma agrupada: cuando varias tarjetas entran a la vez, se piden sus URLs en un solo lote (evita ráfagas de peticiones al hacer scroll rápido).

## 2. Listas largas: solo se renderiza lo visible

- Cuadrícula de productos en el punto de venta (`src/routes/index.tsx`) y vista de meseros (`src/components/MobileWaiter.tsx`): renderizado progresivo por bloques — se pinta un primer bloque y se añaden más automáticamente al acercarse al final del scroll.
- Listas de facturas (`src/routes/admin.facturas.tsx`), órdenes emitidas (`src/components/admin/ordenes-emitidas.tsx`) y tablas de reportes largas: mismo patrón, con un indicador discreto de "cargando más" al final.
- Todo automático al hacer scroll: sin botones de "ver más", sin paginación visible, sin cambios en filtros ni en los totales (los cálculos siguen usando el conjunto completo de datos, no solo lo renderizado).

## 3. Detalles técnicos

- Hook nuevo `src/hooks/useInView.ts` (IntersectionObserver reutilizable) y `src/hooks/useProgressiveList.ts` (tamaño de bloque configurable, por defecto 40 elementos).
- `loading="lazy"` y `decoding="async"` en las imágenes; alto reservado por CSS para evitar reflow.
- Sin dependencias nuevas ni cambios de esquema, backend, precios, impresión ni lógica de venta.

## Fuera de alcance

- Caja descargable (Electron) y generación de instalador: este cambio es solo de interfaz web; las fotos locales ya se leen del disco.
