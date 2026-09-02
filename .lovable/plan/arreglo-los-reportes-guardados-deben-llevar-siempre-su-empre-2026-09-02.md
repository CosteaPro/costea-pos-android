# Arreglo: los reportes guardados deben llevar siempre su empresa

## Qué está pasando (verificado)

- La tabla de reportes guardados exige empresa obligatoria y la rellena sola con una función automática.
- Esa función automática solo funcionaba mientras existía **una sola** empresa. Hoy existen dos (Chuzin Chuzon y CeviExpres), así que devuelve vacío y el guardado falla con el error de "company_id no puede ser nulo".
- Los 16 reportes ya guardados **sí** tienen empresa (todos de Chuzin Chuzon), así que no hay datos históricos que reparar.
- Hallazgo adicional importante: el cálculo de Mix, P&G y Panel se ejecuta con permisos de sistema (sin sesión) y **no filtra por empresa**. Con dos clientes activos, los reportes mezclarían ventas de ambos negocios. Se corrige junto con el error.

## Qué se va a hacer

1. **Nunca guardar sin empresa**: al guardar un reporte se envía siempre el identificador de la empresa (y su sucursal). Si no se puede determinar, el proceso se detiene con un mensaje claro en lugar de guardar mal.
2. **Empresa tomada de la sesión**: cuando un usuario abre o regenera un reporte, la empresa sale de su propia sesión, y el cálculo se hace con sus permisos, de modo que solo ve datos de su negocio.
3. **Proceso nocturno por empresa**: la tarea automática de precálculo recorre cada empresa activa y calcula/guarda su propio reporte, filtrando los datos de esa empresa.
4. **Verificación**: se comprueba que Chuzin Chuzon genera Mix, P&G y Panel sin error y que CeviExpres obtiene sus propios totales, separados.

## Detalle técnico

- `src/lib/reportes-cache.server.ts`: `guardar()` y `calcularYGuardar()` reciben `companyId` (y `branchId`) obligatorios y los incluyen en el `upsert`; `recalcularSnapshots(db, companyId, fecha)`.
- `src/lib/reportes-cache.functions.ts` (`obtenerReporte`, `recalcularReportes`): resolver el `company_id` del usuario desde `profiles`/`company_users` con `context.supabase`, y ejecutar el cálculo con `context.supabase` (RLS del usuario) en lugar de `supabaseAdmin`. Se mantiene la validación de rol administrador.
- `src/lib/sales-mix.ts`, `src/lib/pyg.ts`, `src/lib/dashboard-data.ts`: parámetro opcional `companyId` que, cuando llega, añade `.eq("company_id", …)` a las consultas base (pedidos, ítems, gastos, movimientos). Necesario para el modo sistema del cron.
- `src/routes/api/public/cron/precalculo-reportes.ts`: leer `platform_companies` activas y llamar `recalcularSnapshots` por cada una, pasando su id; devolver el resumen por empresa.
- Sin migración de datos: los registros existentes ya tienen empresa. Se deja la restricción NOT NULL tal cual.
