# Pantalla de inicio asignada por usuario

## Qué se hará

1. **Nueva columna "Pantalla de inicio"** en la tabla de usuarios (Roles y permisos), junto a "Rol", con lista desplegable:
   - Tablero de Mando (`/admin/dashboard`)
   - Módulo de Caja (`/caja`)
   - Mesas / Punto de venta (`/`)
   - Pantalla de Cocina (`/cocina`)

2. **Regla de funcionamiento**
   - Al crear o editar un usuario se elige su pantalla de inicio.
   - Al iniciar sesión (y al abrir la app en la raíz), el sistema abre exactamente esa pantalla: sin deducciones.
   - Si el usuario no tiene pantalla guardada, se usa la sugerencia actual según el rol.
   - Al elegir un rol en el formulario se propone la pantalla lógica (Cajero → Caja, Mesero → Mesas, Cocina → Cocina, Administradores → Tablero), pero se puede cambiar libremente.
   - Solo el Super Administrador puede modificar la pantalla de inicio de otros usuarios.

3. **Asignación inicial**
   - `administrador` → Tablero de Mando
   - `info` (info@costeapro.com) → Tablero de Mando
   - `cajero01` → Módulo de Caja
   - `mesero1` → Mesas

## Detalle técnico

- Migración: agregar `home_path text` a `public.profiles` (valores permitidos validados por disparador o CHECK simple con lista fija). Lectura propia y del Super Administrador según las políticas ya existentes de `profiles`; escritura de terceros vía función de servidor con clave de servicio.
- `src/lib/staff.functions.ts`: `StaffMember` incluye `homePath`; `listStaff` lo devuelve; `createStaffUser` y `updateStaffUser` aceptan y guardan `homePath` (solo Super Administrador).
- `src/hooks/useRole.ts`: leer `profiles.home_path` del usuario actual; si existe, `homePath` es ese valor; si no, se conserva el cálculo actual por rol.
- `src/routes/configuracion.tsx` (StaffPanel): nueva columna con `Select` de pantallas, y campo en el formulario de creación con sugerencia automática al cambiar de rol.
- `src/routes/index.tsx` y `src/routes/auth.tsx`: siguen usando `homePath`, sin cambios de lógica.
- Datos iniciales: actualizar `home_path` de los cuatro usuarios indicados.
