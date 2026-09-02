# Usuarios separados por empresa (cada cliente su propio espacio)

## Qué pasa hoy (verificado)

- El nombre de usuario es único en TODO el sistema: la tabla de perfiles tiene un índice único sobre `username` (sin considerar la empresa).
- El correo interno de acceso se arma como `usuario@costeapos.local`, igual para todas las empresas, así que dos clientes no pueden tener "administrador".
- Ya existen 2 empresas con su identificador propio: `chusin-chuzon` (Chuzin Chuzon) y `ceviexpres` (CeviExpres). Los perfiles ya tienen columna de empresa.

Resultado: al crear el segundo cliente, "administrador" o "Gabriel" da error "ya existe".

## Qué se va a hacer

### 1. El usuario es único DENTRO de su empresa

- El correo interno de acceso pasa a incluir la empresa: `administrador@chusin-chuzon.costeapos.local`, `administrador@ceviexpres.costeapos.local`. Así cada cliente puede repetir los mismos nombres sin chocar.
- La validación de "ya existe" pasa a revisar solo los usuarios de esa empresa.
- El índice único de perfiles pasa a ser por empresa + usuario.

### 2. Enlace propio por empresa (opción elegida)

- Cada cliente entra por su enlace: `/acceso/chusin-chuzon`, `/acceso/ceviexpres`. Ahí ve el nombre del negocio y solo escribe usuario y contraseña.
- El panel de SúperAdmin muestra y permite copiar el enlace de acceso de cada empresa.

### 3. Los usuarios actuales no cambian nada

- Chuzin Chuzón sigue entrando por la pantalla de acceso de siempre, con `administrador` / `cajero1` / `mesero1`, sin escribir código de empresa ni cambiar su contraseña.
- Se logra manteniendo el correo interno actual para los usuarios ya creados (empresa #1 conserva su formato) y aplicando el nuevo formato con empresa solo a los usuarios nuevos.
- La pantalla de acceso general sigue funcionando: si el usuario escrito existe en una sola empresa, entra directo; si existe en varias, pide elegir el negocio de una lista.

### 4. Alta de clientes nuevos

- Al crear una empresa desde el panel de SúperAdmin, el propietario ya no choca con usuarios de otros clientes; puede llamarse "administrador", "Gabriel", "Maria", lo que sea.
- Al terminar el alta se muestra el enlace de acceso listo para enviarle al cliente.

## Detalles técnicos

- `src/lib/usernames.ts`: `loginEmailFor(username, companySlug?)` → `usuario@<slug>.costeapos.local`; se conserva `loginEmailFor(username)` (dominio raíz) como formato heredado para los usuarios ya existentes.
- Migración: reemplazar `profiles_username_unique` por índice único `(company_id, lower(username))`; añadir columna `login_email` en `profiles` (correo interno real usado para autenticar) y rellenarla con el correo actual de `auth.users` para todos los perfiles existentes — así el inicio de sesión no depende de reconstruir el correo por convención y los usuarios actuales quedan intactos.
- `src/lib/staff.functions.ts` y `src/lib/plataforma.functions.ts`: la comprobación de duplicado pasa de `ilike username` global a filtrar por `company_id`; la creación en Auth usa el correo con slug y guarda `login_email` en el perfil.
- Nueva ruta pública `src/routes/acceso.$slug.tsx`: resuelve la empresa por slug (función de servidor pública que devuelve solo nombre comercial y slug), muestra la marca del negocio y autentica resolviendo `login_email` del perfil de ese usuario en esa empresa.
- `src/routes/auth.tsx`: mantiene el acceso actual; resuelve el usuario buscando perfiles por `username` — un resultado entra directo, varios muestran un selector de empresa. Nada de exponer la lista completa de usuarios: la resolución se hace en una función de servidor que solo devuelve nombres de empresas coincidentes.
- `src/routes/admin.plataforma.index.tsx` y `admin.plataforma.$empresaId.tsx`: mostrar y copiar el enlace `/acceso/<slug>`.
- Sin cambios en RLS ni en la app de escritorio (la caja usa PIN de caja, no usuario).

## Verificación antes de cerrar

1. Crear en CeviExpres un usuario llamado `administrador` y confirmar que se crea sin error.
2. Iniciar sesión como `administrador` de Chuzin Chuzón exactamente como hoy (sin slug) y confirmar que llega a su pantalla asignada.
3. Iniciar sesión por `/acceso/ceviexpres` con el nuevo `administrador` y confirmar que solo ve datos de CeviExpres.
