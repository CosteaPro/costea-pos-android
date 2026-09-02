# Corregir el error de guardado por período (ON CONFLICT)

## Qué está pasando realmente

La restricción única **sí existe**. Al convertir el sistema en multiempresa, las claves únicas dejaron de ser globales y ahora incluyen la empresa (y la sucursal cuando aplica). Ya verifiqué en la base de datos que están creadas, por ejemplo:

- Saldos de inventario: empresa + sucursal + fecha + ítem
- Conteo físico: empresa + sucursal + fecha + ítem
- Cierre de inventario del día: empresa + sucursal + fecha
- Reportes precalculados (Mix / P&G / Panel): empresa + sucursal + tipo + alcance + período
- Flujo de caja manual: empresa + sucursal + fecha
- Rubros manuales de P&G: empresa + sucursal + año + mes + rubro
- Totales y documentos por caja: empresa + caja + fecha / documento
- Clientes: empresa + cédula/RUC

El error aparece porque **la aplicación sigue pidiendo la clave antigua** (por ejemplo "fecha + ítem" o "tipo + período") que ya no existe con ese nombre. La base de datos responde que no encuentra esa combinación y el guardado falla. Los datos de Chusin Chuzón están intactos y sin duplicados (revisado: cero filas sin empresa o sucursal en todas las tablas afectadas).

## Qué voy a corregir

Actualizar cada punto de guardado para que use la clave nueva, que ya incluye empresa y sucursal:

| Pantalla / proceso | Clave que usará |
|---|---|
| Reportes precalculados (Mix, P&G, Panel) | empresa + sucursal + tipo + alcance + período |
| Conteo físico de inventario | empresa + sucursal + fecha + ítem |
| Flujo de caja manual | empresa + sucursal + fecha |
| Rubros manuales de P&G | empresa + sucursal + año + mes + rubro |
| Sincronización de totales por caja | empresa + caja + fecha |
| Ingesta de documentos por caja | empresa + caja + tipo + documento |
| Clientes (caja y sincronización) | empresa + cédula/RUC |

En cada caso, además de la clave, el guardado enviará explícitamente la empresa y la sucursal del usuario, para que la actualización caiga siempre sobre la fila correcta y nunca se dupliquen períodos.

## Dos huecos que también cierro en el mismo cambio

1. **Precios por canal de venta** aún tienen la clave antigua global (producto + canal). Como el producto ya pertenece a una empresa, la regla sigue siendo correcta; la dejo como está y solo lo confirmo.
2. **Código de receta** todavía es único a nivel de toda la plataforma. Eso haría que un segundo cliente no pueda usar "RC0001". Lo paso a único **por empresa**, igual que productos, ítems y proveedores.

## Detalle técnico

- Frontend/servidor: ajustar los `onConflict` en `src/lib/reportes-cache.server.ts`, `src/lib/inventory.movements.ts`, `src/lib/flujo-caja.ts`, `src/lib/caja-ingesta.server.ts`, `src/routes/api/public/caja/sincronizar.ts`, `src/routes/api/public/caja/clientes.ts`, `src/components/CheckoutDialog.tsx` y `src/routes/menu.tsx` (verificación), incluyendo `company_id`/`branch_id` en el payload del upsert.
- Los endpoints públicos de caja (`/api/public/caja/*`) resuelven la empresa desde la caja autorizada (`cajas.company_id`), no desde la sesión.
- Migración corta: reemplazar `recipes_code_key` por índice único `(company_id, code)`.
- Verificación: recalcular Mix/P&G de un rango y guardar un conteo físico dos veces seguidas para confirmar que actualiza en lugar de duplicar.
