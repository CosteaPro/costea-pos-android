# Costea Pro SAAS — Etapa 1: Fundación multiempresa

## Qué resuelve esta etapa

Hoy el sistema está construido para **un solo negocio**: ninguna tabla tiene empresa ni sucursal, y quien inicia sesión ve todos los datos que existen. Esa es la razón por la que no se puede sumar un segundo cliente sin mezclar información.

Esta etapa convierte la base actual en una plataforma multiempresa **sin cambiar nada de la operación diaria de Chusin Chuzón**. Al terminar, Chusin Chuzón es el Cliente #1 y dar de alta al Cliente #2 es llenar un formulario, no reprogramar el sistema.

No se incluye todavía: P&G por sucursal, traslados entre locales, módulo contable, panel de SúperAdmin visual. Se construyen sobre esta base en etapas siguientes.

## Lo que se construye

### 1. Estructura de la plataforma

Tres tablas nuevas que sostienen todo lo demás:

- **Empresas** — nombre, RUC, región (Quito, Guayaquil, Cuenca, Quevedo…), plan contratado (Junior / Pro / Premium), estado (activa, suspendida, prueba), fecha de alta.
- **Sucursales** — pertenecen a una empresa; nombre, dirección, establecimiento y punto de emisión SRI propios, tipo (local o bodega).
- **Módulos por empresa** — qué módulos están encendidos para cada cliente, independientemente del plan, para poder activar o apagar uno puntual.

La **región** queda guardada en cada empresa desde el primer día. Todo funciona sobre una sola base; el día que convenga separar Quito de Guayaquil en bases distintas, los datos ya vienen etiquetados y se pueden partir sin rehacer nada.

### 2. Marca de propiedad en todos los datos

Cada tabla operativa del sistema (pedidos, productos, inventario, compras, recetas, cajas, gastos, clientes, proveedores, configuración, reportes…) recibe **empresa** y **sucursal**. Todos los registros históricos existentes se asignan a Chusin Chuzón / su local principal en la misma operación, de modo que nada queda huérfano y nada cambia de aspecto para el usuario.

### 3. Aislamiento real entre clientes

La separación no se hace en la pantalla, se hace en la base de datos: cada usuario queda vinculado a una empresa y las reglas de acceso solo devuelven filas de esa empresa. Aunque alguien intente consultar directamente, la base no le entrega datos de otro cliente. Los usuarios pueden además quedar limitados a sucursales específicas.

Esto se aplica también a las funciones internas de cálculo (inventario, costos, secuencias de facturación, folios de pedido), que hoy operan sobre todo el sistema y pasan a operar por empresa. Es la parte más delicada del trabajo y la que más pruebas requiere.

### 4. Roles de la plataforma

Se agregan dos niveles por encima de los actuales, sin tocar los roles que Chusin Chuzón ya usa:

- **SúperAdmin de plataforma** (nosotros): ve y gestiona todas las empresas; es el único que puede crear clientes, cambiar planes y suspender cuentas.
- **Propietario de empresa**: máxima autoridad dentro de su empresa; no ve nada fuera de ella.

Debajo continúan Administrador, Administrador operativo, Cajero, Mesero y Cocina, ahora siempre dentro de una empresa.

### 5. Auditoría global

Una bitácora única e inalterable: qué usuario, de qué empresa, qué hizo, sobre qué registro, cuándo y desde qué dirección. No se puede editar ni borrar, ni siquiera por un administrador. Se registran automáticamente los cambios sensibles: configuración, precios, anulaciones, inventario, usuarios, cierres de caja.

Además, todas las tablas pasan a **borrado lógico**: nada se elimina de verdad, se marca como eliminado con autor y fecha.

### 6. Control de módulos por plan

Un mecanismo central decide si una empresa puede usar un módulo. Si el plan no lo incluye, la opción no aparece en el menú **y** el servidor rechaza la operación aunque alguien intente forzarla. Los planes quedan configurados según el pedido (Junior, Pro, Premium) y se pueden ajustar por cliente.

### 7. Alta de clientes

Una función de creación de empresa que, en un solo paso, deja al nuevo cliente listo para operar: empresa, sucursal principal, propietario, plan, módulos, secuencias de facturación y catálogos básicos. Por ahora se ejecuta desde una pantalla mínima para SúperAdmin; el panel completo llega en la etapa siguiente.

## Cómo protegemos a Chusin Chuzón

- La migración es de estructura, no de datos: se agregan columnas y se rellenan con la empresa Chusin Chuzón. Ningún registro se mueve, se recalcula ni se borra.
- Sus pantallas, folios, secuencias SRI, inventario y reportes siguen exactamente igual. El sistema simplemente sabe ahora a quién pertenecen.
- La caja descargable y sus cajas autorizadas siguen sincronizando sin cambios de configuración en el local.
- Antes de cerrar la etapa se verifica con datos reales: ventas del día, cierre de caja, facturación SRI, inventario y reportes deben dar los mismos números que antes de la migración.

## Detalles técnicos

- **Base**: una sola base Supabase. Tablas nuevas `platform_companies`, `platform_branches`, `company_modules`, `company_users`, `audit_log`; columnas `company_id` / `branch_id` en todas las tablas de negocio, con índices compuestos (`company_id`, y `company_id + fecha` donde hay filtros por período).
- **Aislamiento**: RLS en cada tabla apoyado en funciones `security definer` (`current_company_id()`, `user_belongs_to_company()`, `has_platform_role()`) para evitar recursión y garantizar que el filtro no dependa del cliente. Los roles siguen en tabla aparte, nunca en el perfil.
- **Funciones a reescribir por empresa**: `next_order_folio`, `next_invoice_sequential`, `reserve_document_sequence_block`, `recalc_inventory_period`, `apply_sales_consumption`, `repropagate_item_cost`, `close_inventory_day`, `apply_physical_count_as_opening` y el resto de funciones de inventario y costos.
- **Auditoría**: triggers `AFTER INSERT/UPDATE/DELETE` sobre las tablas sensibles escribiendo en `audit_log`, sin permisos de UPDATE ni DELETE para ningún rol de aplicación.
- **Aplicación**: contexto de empresa resuelto en el servidor a partir de la sesión (nunca enviado por el navegador); guardas de módulo tanto en el menú como en cada server function.
- **Sesión y contraseñas**: se mantiene el esquema de autenticación gestionado actual (hash seguro y cookie HttpOnly ya implementada); se agrega bloqueo tras intentos fallidos y expiración corta del enlace de recuperación.
- **Orden de trabajo**: (1) tablas de plataforma y alta de Chusin Chuzón; (2) columnas y relleno histórico; (3) funciones por empresa; (4) RLS y roles; (5) auditoría y borrado lógico; (6) módulos y planes; (7) verificación con datos reales.

## Al terminar esta etapa

Chusin Chuzón opera igual que hoy, ya como Cliente #1 de la plataforma, y podemos crear el Cliente #2 con sus datos completamente aislados. La siguiente etapa sería el panel de SúperAdmin y el P&G por sucursal.
