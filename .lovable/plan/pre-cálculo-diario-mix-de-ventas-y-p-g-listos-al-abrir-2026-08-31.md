# Pre-cálculo diario: Mix de ventas y P&G listos al abrir

Objetivo: que al entrar a **Mix de ventas** y a **Estado de resultados (P&G)** la vista por defecto
(**del 1° del mes a hoy**) aparezca de inmediato, leyendo un resultado ya guardado, en lugar de
calcularlo en el momento.

## Cómo va a funcionar

1. **Cada noche (00:15 hora Ecuador) y en cada cierre de caja definitivo**, el sistema calcula y
   guarda:
   - costo unitario vigente de los ítems,
   - Mix de ventas del día,
   - P&G del día,
   - el acumulado del mes: del 1° hasta esa fecha.
2. **Al abrir Mix o P&G**: el período por defecto es "del 1° de [mes] al [hoy]" y se pinta al
   instante desde lo guardado. Si por alguna razón no existe el guardado (primer uso, día sin
   cierre), se calcula al vuelo una sola vez y se guarda.
3. **Períodos personalizados**: si el usuario cambia las fechas a algo distinto del acumulado del
   mes, se calcula en vivo (puede tardar unos segundos) y se muestra un aviso discreto
   "calculando…".
4. **Compras y movimientos**:
   - Si se edita/registra algo con fecha de **hoy** → se guarda sin preguntar y el recálculo del
     acumulado corre en segundo plano.
   - Si se edita/registra algo con fecha **anterior a hoy** → aviso: "Este cambio afecta reportes
     ya cerrados. ¿Guardar y recalcular?". Al aceptar se guarda y se recalculan el día afectado y
     el acumulado del mes.
5. **"Recalcular todo"** sigue disponible en P&G para el propietario, ahora también refrescando
   los guardados.

## Detalle técnico

### Base de datos (migración)

Tabla nueva `report_snapshots`:

```text
id, kind ('mix' | 'pyg'), scope ('dia' | 'mes_a_fecha'),
business_date date, period_from date, period_to date,
payload jsonb, computed_at timestamptz, created_at, updated_at
unique (kind, scope, period_from, period_to)
```

- GRANT `SELECT` a `authenticated`, `ALL` a `service_role`; RLS activada, lectura solo para roles
  administrativos (`has_role` administrador / admin_operativo / propietario), escritura solo por
  service role.
- Índice por `(kind, scope, period_to)`.

### Cálculo y guardado

- Nuevo `src/lib/reportes-cache.ts`: funciones puras `computeMix(from, to)` y `computePyg(...)`
  extraídas de la lógica actual de `admin.mix-ventas.tsx` (el `load()` del componente) y de
  `loadPyg` en `src/lib/pyg.ts`, para poder ejecutarlas también en el servidor.
- Nuevo `src/lib/reportes-cache.functions.ts` (`createServerFn`):
  - `snapshotLeer({ kind, from, to })` — devuelve el payload guardado o `null`.
  - `snapshotRecalcular({ fecha })` — recalcula día + acumulado del mes y hace upsert (usa
    `supabaseAdmin` cargado dentro del handler, tras verificar rol).
- Nuevo endpoint `src/routes/api/public/cron/precalculo.ts` protegido por cabecera secreta
  (`CRON_SECRET`, se pedirá con el gestor de secretos) para la corrida nocturna; se programa con
  `pg_cron` + `pg_net` a las 00:15 Ecuador contra la URL estable del proyecto.

### Pantallas

- `src/routes/admin.mix-ventas.tsx`: fechas por defecto `from = 1° del mes`, `to = hoy` (ya usa
  `ecBusinessDate`); primero intenta `snapshotLeer`, si hay payload lo pinta sin spinner; si no,
  cae al cálculo actual y dispara el guardado.
- `src/routes/admin.perdidas-ganancias.tsx`: misma lógica sobre `loadPyg`, con corte por defecto
  = hoy, y etiqueta visible "Del 1 de [mes] al [hoy]".
- `src/components/admin/purchasing.tsx`: al guardar/editar, comparar la fecha con `fechaEc()`;
  fecha pasada → diálogo de confirmación y luego `snapshotRecalcular`; fecha de hoy → guardar y
  llamar `snapshotRecalcular` sin bloquear la interfaz.
- Los cierres de caja definitivos (`src/routes/caja.tsx` / `src/lib/caja.functions.ts`) invocan
  `snapshotRecalcular` del día cerrado al finalizar.

### Qué no cambia

- Las fórmulas de Mix, costo y P&G se mantienen idénticas: el guardado es solo una copia del
  mismo resultado.
- Los períodos personalizados siguen calculándose en vivo.
