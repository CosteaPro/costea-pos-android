# Endurecimiento de Configuración de Empresa + estándares de seguridad

## 1. Validación previa (antes de tocar la base)

Un único validador compartido `src/lib/company-settings.schema.ts` (Zod) para los datos de empresa:

- RUC: 13 dígitos, termina en 001, dígito verificador válido.
- Establecimiento y punto de emisión: exactamente 3 dígitos.
- Secuencial: entero 1..999999999.
- Correo con formato válido; teléfono solo dígitos/espacios/+.
- IVA y servicio: 0..100. Copias de impresión: 1..5. Límites de preparación: 0..240 minutos.
- Ambiente ("pruebas"/"producción") y tipo de emisión dentro de valores permitidos.
- Razón social, nombre comercial y dirección: obligatorios, longitud máxima.

En `configuracion.tsx` el guardado valida primero y muestra el error debajo del campo correspondiente (nada se envía si hay errores). El mismo esquema se reutiliza en el servidor (punto 2), cumpliendo "validación en dos extremos".

## 2. Auditoría de cambios

Nueva tabla `public.company_settings_audit`: quién (user_id, email, rol), cuándo, qué cambió (JSON con campos previos y nuevos, solo los modificados), y desde dónde (IP y navegador). Solo administradores pueden leerla; nadie puede editarla ni borrarla.

El guardado pasa a una server function `updateCompanySettings` protegida con sesión:
1. revalida con el esquema Zod,
2. verifica rol administrador,
3. actualiza la fila,
4. registra el diff en la bitácora con IP y user-agent de la petición.

Nueva pestaña "Bitácora" en Configuración con el historial (fecha, usuario, campos modificados, valor anterior → nuevo), paginada.

## 3. Prueba de RLS

Suite automatizada `tests/rls-company-settings.test.ts` que se ejecuta con las pruebas del proyecto y verifica contra la base real:

- usuario sin sesión: no lee ni escribe,
- cajero/mesero: lee, no escribe,
- administrador: lee y escribe,
- nadie puede crear una segunda fila de empresa ni borrar la existente,
- la bitácora no acepta UPDATE ni DELETE de ningún rol.

Cualquier fallo bloquea la entrega.

## 4. Token de autenticación fuera de Local Storage — punto a decidir

Estado verificado: `src/integrations/supabase/client.ts` (archivo autogenerado por la plataforma, no editable) configura la sesión con `storage: localStorage` y `persistSession: true`. La caja offline y el tiempo real dependen de ese cliente en el navegador.

Cookies `HttpOnly` no pueden ser escritas ni leídas por JavaScript, por lo que el cliente de autenticación del navegador no puede usarlas: migrar a cookies exige que todas las lecturas/escrituras pasen por el servidor, lo que rompe el modo offline de la caja descargable. Por eso propongo, salvo que indiques lo contrario:

- Endurecimiento inmediato (sin romper nada): expiración de sesión por inactividad (24 h máximo, cierre automático), limpieza total de la sesión y caché al cerrar sesión, y auditoría de inicios/cierres de sesión.
- Limpieza de `localStorage`: allí quedan solo identificador de dispositivo, empresa, último usuario, roles y preferencias de interfaz (hoy ya es así; se documenta y se agrega una revisión automática que falle si aparece cualquier clave sensible).
- Migración completa a cookies `HttpOnly` como proyecto aparte, porque implica rehacer autenticación y el modo offline.

Ya se cumple hoy: contraseñas gestionadas con hash por el servicio de autenticación, certificado .p12 y claves solo en servidor, roles en tabla aparte con verificación en base de datos.

## Detalles técnicos

- Migración: `company_settings_audit` con GRANT explícitos, RLS activa, política de lectura solo administradores, sin políticas de UPDATE/DELETE; escritura desde el servidor.
- Server function en `src/lib/company-settings.functions.ts` con `requireSupabaseAuth`; el cliente deja de llamar `update` directo a la tabla.
- Esquema Zod compartido cliente/servidor.
- Pruebas con vitest usando sesiones reales de cada rol.
