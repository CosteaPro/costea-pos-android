# Alertas de inventario como gráfico interactivo

Reemplazar la lista larga de alertas del tablero por un gráfico de torta con colores de semáforo y detalle bajo demanda.

## Vista principal

- Título: "⚠️ Alertas de Inventario".
- Gráfico de torta con tres secciones:
  - Rojo — Faltantes en exceso (cantidad actual, hoy 19)
  - Amarillo — Stock bajo (12)
  - Verde — Niveles normales (103)
- En el centro del gráfico, el total de ítems analizados en número grande.
- Debajo, leyenda con punto de color, número grande y etiqueta pequeña.
- Ninguna lista visible en la vista principal.

## Interacción

- Clic en la porción roja, en su número o en su leyenda → abre un panel con la lista completa de faltantes en exceso (nombre, magnitud, comparación, explicación, desviación), tal como los datos actuales.
- Clic en amarillo → abre solo la lista de stock bajo.
- Clic en verde → sin acción.
- El panel se cierra con el botón "Cerrar", con la tecla Escape o al hacer clic fuera.
- La lista abierta tiene su propio scroll interno para no empujar el resto del tablero.

## Principios aplicados al tablero

- Número grande primero, texto explicativo en tamaño pequeño.
- Toda lista larga se resume en gráfico o número con "Ver detalle".
- La sección de alertas pasa a ocupar una altura fija y compacta, de modo que las métricas y las alertas quepan en la primera pantalla.
- Colores de semáforo consistentes: rojo alerta, amarillo precaución, verde correcto.

## Detalles técnicos

- Cambios solo en `src/routes/admin.dashboard.tsx`, usando Recharts (`PieChart`/`Pie`/`Cell`), ya presente en el tablero, y el `Dialog` de shadcn para el detalle.
- Se reutilizan los datos existentes de `loadDashboardData` (`data.alertas` con `level`, `magnitud`, `comparacion`, `explicacion`, `desviacionPct`). Sin cambios de datos, cálculos, impresión ni exportación a Excel: el reporte A4 y el Excel siguen incluyendo todas las alertas.
