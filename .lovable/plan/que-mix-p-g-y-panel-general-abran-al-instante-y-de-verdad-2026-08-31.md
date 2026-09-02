# Que Mix, P&G y Panel General abran al instante (y de verdad)

## Qué está pasando hoy (verificado)

- En la tabla de resultados guardados solo existen tres registros, todos con corte al **28 de agosto** (guardados hoy al editar una compra de esa fecha).
- Hoy en Ecuador es **30 de agosto**, así que el rango por defecto es "1 al 30". Como no hay nada guardado para ese corte, las tres pantallas calculan todo en vivo en el navegador: por eso siguen demorando.
- La tarea nocturna quedó programada pero **aún no se ha ejecutado ninguna vez** (se creó hoy). Además, tal como está, corre a las 00:15 y guarda el día que recién empieza: a media mañana ese guardado ya está vencido y la pantalla vuelve a calcular en vivo.
- El **Panel General** no usa nada de esto: siempre calcula en vivo (ventas, inventario, mix, alertas) desde el navegador.

## Qué se va a hacer

1. **Calcular en el servidor, no en el navegador.** Mix, P&G y Panel General pedirán el resultado a una única función de servidor. Ahí las consultas van directo a la base de datos, sin decenas de viajes desde el equipo del usuario.
2. **Guardado siempre fresco:**
   - Al abrir una pantalla: si hay un resultado guardado se pinta al instante.
   - Si ese guardado tiene más de 10 minutos, se refresca en segundo plano y la pantalla se actualiza sola (aviso discreto "actualizando…").
   - Si no hay guardado, se calcula una vez en el servidor y se guarda.
3. **El Panel General entra al mismo esquema**, con su rango por defecto (del 1° del mes a hoy): KPIs, comparativo con el período anterior, serie diaria, mix y alertas de inventario.
4. **Tarea nocturna corregida:** a las 00:15 (Ecuador) guardará el **día anterior ya cerrado** y su acumulado mensual, además de dejar preparado el arranque del nuevo mes.
5. Se mantienen los recálculos que ya existen: cierre definitivo de caja, registro/edición de compras (con el aviso "¿Guardar y recalcular?" para fechas pasadas) y el botón Recalcular del P&G. Ahora también refrescarán el Panel General.
6. **Verificación en vivo:** se ingresará al sistema con el usuario administrador y se medirá el tiempo de apertura de Mix, P&G y Panel General, dejando constancia de los tiempos antes y después.

## Detalle técnico

- `src/lib/reportes-cache.server.ts`: agregar `computeDashboard` (reutilizando `loadDashboardData` con cliente inyectable, como ya se hizo con `computeSalesMix`/`loadPyg`) y guardar `kind = 'dashboard'`. `src/lib/dashboard-data.ts` pasa a recibir `db: Db` opcional en vez de usar el cliente del navegador fijo.
- Nueva función de servidor `obtenerReporte({ kind, from, to })` en `src/lib/reportes-cache.functions.ts`: busca en `report_snapshots`; si falta o está vencido (>10 min y el corte es hoy), calcula, guarda y devuelve. Devuelve `{ payload, computedAt, stale }`.
- Migración: agregar `'dashboard'` al check de `kind` en `report_snapshots` (o dejarlo libre) y un índice por `(kind, period_from, period_to)`.
- Pantallas `admin.mix-ventas.tsx`, `admin.perdidas-ganancias.tsx` y `admin.dashboard.tsx`: pintar el guardado de inmediato y disparar el refresco en segundo plano cuando `stale` sea verdadero; los rangos personalizados siguen calculándose por la misma función de servidor.
- `src/routes/api/public/cron/precalculo-reportes.ts`: aceptar `fecha` opcional y, sin parámetro, procesar el **día anterior** (`fechaEc(hoy) - 1`) más su acumulado y el dashboard.
- Verificación con navegador automatizado: inicio de sesión como administrador y medición de carga en las tres pantallas.

## Nota sobre costos

La tarea programada seguirá corriendo **una vez al día**; no se añaden revisiones periódicas al servidor. El refresco de 10 minutos ocurre solo cuando alguien abre la pantalla, así que no hay trabajo recurrente cuando nadie usa el sistema.
