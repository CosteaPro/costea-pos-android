# Tablero de mando responsivo (celular, tablet y computadora)

Ajustes solo visuales en el Tablero de mando. No cambian datos, cálculos, impresión ni exportaciones.

## 1. Tarjetas de resumen (Venta Bruta, Venta Neta, Costo Real, Utilidad)

- En celular: una sola columna a todo el ancho, sin márgenes sobrantes (el contenedor pasa de 16 px a 12 px de margen lateral en pantallas pequeñas).
- Etiqueta arriba ("Venta Bruta") más pequeña, en gris oscuro.
- Monto grande y protagonista, sin cortarse ni desbordar.
- Porcentaje de cambio debajo, en tamaño pequeño: "↑ 31.7% vs. período anterior"; en pantallas muy angostas el texto "vs. período anterior" se acorta a "vs. anterior".
- Espaciado uniforme y compacto entre tarjetas.
- Tablet: dos columnas. Computadora: cuatro columnas (como hoy).

## 2. Alertas de inventario

- Todo en una sola fila también en celular: gráfico circular más pequeño a la izquierda, leyenda a la derecha centrada verticalmente.
- Cada línea de la leyenda: punto de color, número grande, etiqueta pequeña y "Ver detalle" al final, en el color del nivel.
- Si el ancho es muy justo, la etiqueta se recorta con puntos suspensivos en vez de romper la fila.

## 3. Mix de ventas

- Los filtros ("Más vendidos", "Mayor ingreso", etc.) pasan de amontonarse a una fila con desplazamiento horizontal con el dedo, sin barra de scroll visible.
- Botón activo: fondo de color de marca con texto claro. Inactivos: fondo gris claro y texto gris oscuro.
- El gráfico y su lista mantienen el formato de una fila, con nombres recortados si hace falta.

## 4. Encabezado y filtros de fecha

- En celular el título ocupa su línea y los campos Desde / Hasta se reparten el ancho a mitades, con el botón "Actualizar" a todo el ancho debajo.

## 5. Gráficos grandes y asistente

- "Ventas vs. costos por día" y "Composición de costos": altura menor en celular (unos 240 px) para que quepan sin apretar; en computadora se mantienen como están.
- Asistente de Costea: la caja de pregunta, el botón de micrófono y "Preguntar" se apilan bien en celular; los botones de sugerencia ocupan el ancho disponible.
- "Acciones rápidas" (reporte, PDF, Excel): botones a todo el ancho en celular, en fila en pantallas mayores.

## 6. Reglas generales

- Una sola columna en celular, dos en tablet, hasta cuatro en computadora.
- Sin texto cortado ni desbordes horizontales en toda la página.
- Espaciado uniforme entre secciones.

## Detalles técnicos

- Cambios en `src/routes/admin.dashboard.tsx`: clases responsivas de Tailwind (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`, tamaños `text-*` con variantes `sm:`, `min-w-0`/`truncate`, alturas de gráfico `h-60 sm:h-80`), filtros del mix en un contenedor `flex overflow-x-auto` con `snap` y `[&::-webkit-scrollbar]:hidden`, y `flex-wrap`/`w-full sm:w-auto` en las barras de botones.
- Ajuste menor en `src/components/AdminShell.tsx`: `px-3` en móvil para el `main` (hoy `px-4`), manteniendo `sm:px-6`.
- No se toca `loadDashboardData`, el asistente IA, Telegram, el reporte A4 ni el Excel.
