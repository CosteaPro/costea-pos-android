# Regla de oro: el primer usuario de cada empresa nace SúperAdministrador Propietario

## Qué está pasando hoy (verificado en la base)

- La empresa nueva `admin` (empresa `b2818786…`) sí quedó marcada como propietaria de su empresa en el vínculo de usuarios, **pero no tiene ninguna fila de rol**. Sin rol, el sistema la trata como usuario sin permisos y la manda a la pantalla de ventas (parece "mesero").
- La condición de "Propietario" hoy es **única para todo el sistema**, no por empresa: la marca de propietario está tomada por el administrador de Chuzin Chuzón, y una regla de la base impide que exista un segundo propietario. Por eso ninguna empresa nueva puede tener su propio dueño.
- El registro público (crear cuenta desde la pantalla de acceso) crea el usuario y su ficha, pero **no crea empresa ni rol**: ese usuario queda sin permisos para siempre.
- La gestión de usuarios prohíbe explícitamente asignar el rol de Super Administrador, con el argumento de que "solo puede existir uno".

## Lo que se va a hacer

### 1. La propiedad pasa a ser por empresa
- Cada empresa puede tener su propio Propietario (SúperAdministrador). Se ajusta la regla de la base para que la unicidad sea "un propietario por empresa" en lugar de "uno en todo el sistema".
- Se conserva intacta la propiedad actual de Chuzin Chuzón.
- La transferencia de propiedad seguirá existiendo, pero dentro de la misma empresa.

### 2. Toda empresa nueva nace con su Propietario
- Al crear una empresa desde el panel de plataforma, el primer usuario se guarda siempre con:
  - rol **administrador** (SúperAdministrador),
  - marca de **propietario** de esa empresa,
  - pantalla de inicio: Panel General.
- Si por cualquier motivo falla el guardado del rol, la creación se revierte por completo: nunca queda una empresa con dueño sin permisos.

### 3. Reparación de lo ya creado
- Al usuario `admin` de la empresa nueva se le asigna su rol de SúperAdministrador Propietario.
- Se revisa que ningún usuario marcado como dueño de empresa quede sin rol.

### 4. Red de seguridad al iniciar sesión
- Si alguien entra y es el dueño registrado de su empresa pero no tiene rol, el sistema se lo asigna automáticamente en ese momento (hoy esa reparación solo funciona cuando la base está totalmente vacía).

### 5. Registro público de un cliente nuevo (autoservicio)
- Al crear cuenta desde la pantalla de acceso, se crea la empresa del cliente y su primer usuario queda como SúperAdministrador Propietario de esa empresa, con todos los módulos de su plan y su sucursal Matriz.
- Nunca se asigna Mesero, Cajero ni rol vacío.

### 6. Bienvenida y jerarquía
- En el primer ingreso del propietario se muestra: "👑 Bienvenido a Costea Pro. Eres el SúperAdministrador Propietario de tu empresa."
- Gestión de usuarios: el propietario de cada empresa puede crear usuarios y asignar Administrador, Cajero, Mesero o Cocina. El rol de Propietario solo cambia con "Nombrar Propietario" dentro de la misma empresa.

## Detalle técnico

- Migración: reemplazar el índice/validación global de `user_roles.is_owner` por unicidad parcial `(company_id) WHERE is_owner`; actualizar `protect_owner_role`, `is_system_owner`, `claim_system_ownership_for` y `transfer_system_ownership` para operar por `company_id`.
- Migración de datos: insertar la fila faltante en `user_roles` (rol `administrador`, `is_owner = true`, `company_id`) para cada `company_users.is_company_owner = true` sin rol.
- `src/lib/plataforma.functions.ts` → `crearEmpresa`: insertar el rol con `is_owner: true` y `company_id`, ordenando el vínculo `company_users` antes del rol.
- `src/lib/staff.functions.ts`: `assertSuperAdmin` y `transferOwnership` se limitan a la empresa del usuario; se permite nombrar propietario dentro de la empresa; se mantiene el bloqueo de asignar `administrador` a mano.
- `src/hooks/useRole.ts`: cuando no hay roles, llamar a una función de servidor que verifique `company_users.is_company_owner` y cree el rol faltante antes de rendirse.
- Nueva función de servidor de registro autoservicio (empresa + sucursal + módulos + propietario), reutilizando `create_platform_company` con un actor de servicio; `src/routes/auth.tsx` la usa en el modo "crear cuenta" y muestra la bienvenida.

## Fuera de alcance

No se tocan ventas, caja, inventario, compras, reportes ni facturación.
