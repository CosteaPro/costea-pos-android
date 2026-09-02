# Arreglo: los reportes no cargan ("no se pudo guardar el reporte")

## Qué encontré (verificado entrando al sistema)

Entré al panel como administrador de Chuzin Chuzon y abrí Mix de Ventas, Pérdidas y Ganancias y Reportes de Inventario. En las tres pantallas aparece el mismo error, repetido varias veces:

```text
new row violates row-level security policy for table "report_snapshots"
```

El Panel general sí carga (usa datos ya guardados), pero cualquier pantalla que necesite calcular y guardar un reporte nuevo falla.

Causa confirmada en la base de datos: la tabla de reportes guardados tiene dos reglas de acceso:

- una regla permisiva que **solo permite leer**;
- la regla de aislamiento por empresa, que es **restrictiva** (limita, pero no habilita nada por sí sola).

Como no existe ninguna regla permisiva de escritura, ningún usuario puede crear ni actualizar reportes: la escritura queda bloqueada aunque la empresa sea la correcta. Antes no se notaba porque el guardado lo hacía el proceso automático nocturno, que salta las reglas; al pasar el cálculo a la sesión del propio usuario quedó al descubierto.

Además, la clave única de la tabla incluye la sucursal y hoy hay 16 registros con sucursal vacía, lo que puede generar reportes duplicados del mismo período.

## Qué voy a hacer

1. Agregar la regla de escritura que falta en la tabla de reportes guardados: el administrador y el administrador operativo podrán crear y actualizar los reportes **de su propia empresa** (la regla de aislamiento por empresa se mantiene intacta).
2. Limpiar los reportes duplicados del mismo período y dejar la clave única sin ambigüedad, para que "guardar" siempre actualice el registro existente en lugar de fallar.
3. Volver a entrar al sistema como administrador y comprobar que Mix de Ventas, Pérdidas y Ganancias, Reportes de Inventario y el Panel general cargan sin errores, y que cada empresa sigue viendo solo sus datos.

No se toca ningún otro módulo (ventas, caja, inventario, facturación).

## Detalle técnico

- Migración sobre `public.report_snapshots`:
  - `CREATE POLICY ... FOR INSERT / FOR UPDATE TO authenticated` con
    `private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'admin_operativo') OR is_system_owner(auth.uid())`;
    la política restrictiva `muro_empresa_report_snapshots` sigue exigiendo `company_id = current_company_id()`.
  - Confirmar `GRANT SELECT, INSERT, UPDATE ON public.report_snapshots TO authenticated` y `GRANT ALL ... TO service_role`.
  - Normalizar `branch_id` (por ejemplo `DEFAULT`/backfill a un valor no nulo o índice único sobre `coalesce(branch_id, '00000000-...')`) para que el `onConflict` de `reportes-cache.server.ts` funcione siempre; borrar duplicados previos conservando el `computed_at` más reciente.
- Revisión posterior sin cambios funcionales: `src/lib/reportes-cache.ts` (`leerSnapshot`) filtra solo por `kind`/`period_*`; con el aislamiento por empresa activo la RLS ya limita las filas, pero se dejará el filtro explícito por empresa si aparece más de una fila.
- Verificación: repetir la prueba autenticada en `/admin/mix-ventas`, `/admin/perdidas-ganancias`, `/admin/reportes-inventario` y `/admin/dashboard`, revisar que no queden errores en consola, y ejecutar el linter de seguridad tras la migración.
