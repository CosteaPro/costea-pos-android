# Ajustes de la caja descargable (v1.8.8)

## 1. Tipo de local: solo en la caja, se borra del sistema central

Hoy el modo de local se puede cambiar en dos sitios: el selector de la pantalla de
Configuración de la app web y el campo "Tipo de local" del panel de Configuración de la Caja.

- Se **elimina por completo** el selector de tipo de local de la Configuración de la app web
  y del asistente de configuración inicial (no se oculta: se borra).
- Queda como única fuente la Configuración de la Caja con las tres opciones (sin mesas /
  con salón y mesas / patio de comidas). Al guardar, la interfaz aplica el modo de inmediato
  y muestra u oculta la pestaña Mapa de Mesas y el campo de etiqueta del pedido sin reiniciar.
- Cada caja reporta su tipo de local al servidor al autorizarse y al sincronizar; el servidor
  lo guarda solo para reportes y consulta (se muestra como dato de solo lectura en la lista de
  cajas), sin posibilidad de editarlo desde el sistema central.
- Al aplicar el cambio, el valor que tenga la caja pasa a ser el válido y sobrescribe cualquier
  tipo de local que estuviera guardado antes en el sistema central.

## 2. Punto de Venta: colores y tipografía

- Pie de tarjeta: bloque del nombre en **negro sólido** con letra blanca.
- Bloque del precio: el mismo **naranja medio rojizo** de las pestañas de categorías.
- Tipografía moderna y limpia en todo el panel: nombres de producto en seminegrita, precios
  en negrita, categorías y encabezados con peso más grueso. Tamaños y disposición actuales
  se mantienen.

## 3. Anulación de órdenes (solo órdenes, nunca facturas)

- Botón "Anular orden" en la pantalla de Órdenes de la caja, disponible solo para órdenes de
  venta.
- Pide clave de Administrador o Superadministrador y luego el motivo de la anulación.
- La orden queda marcada como ANULADA en la caja (no se borra) y se envía la anulación al
  sistema central en la siguiente sincronización o de inmediato si hay conexión.
- Se imprime automáticamente un comprobante térmico con "ORDEN ANULADA" en grande, número de
  orden, fecha, hora, usuario que anuló y motivo.
- En ambas listas (caja y central) la orden se ve tachada/etiquetada como ANULADA y deja de
  sumar en los totales del cuadre.

## 4. Pantalla de cobro más limpia

- Las opciones de tipo de comprobante pierden el fondo negro: fondo blanco con borde gris
  suave y texto negro; la opción seleccionada en naranja medio rojizo con texto blanco.
- El recuadro de totales (Subtotal sin IVA, IVA 15%, Total) pasa a fondo blanco/gris muy
  claro con borde sutil; etiquetas y montos en negro, y la fila del Total en negrita y en el
  naranja medio rojizo.

## 5. Impresión térmica de 80 mm

- Se reduce el tamaño de letra general de tickets de orden, factura, cierre y cuadre y se
  centra el contenido con márgenes laterales pequeños e iguales, de modo que nada se corte.
- Todos los montos con 2 decimales.
- Cuadre de caja: número al lado de cada etiqueta (Órdenes del día, Facturas emitidas,
  Facturas anuladas), fila FALTANTE en negrita, líneas punteadas alineadas entre etiqueta y
  monto, y formas de pago sin movimiento en blanco en lugar de $0.

## 6. Cierre de caja: uno solo y con el diseño de la versión web

- Se elimina "Cierre de caja" de la lista desplegable del menú superior de la caja descargable.
- Queda únicamente el cierre al que se entra desde la pantalla principal / Punto de Venta.
- Esa pantalla se rehace para verse exactamente igual que el cierre de caja de la versión web:
  mismos campos (apertura, ventas del turno, formas de pago, subtotal, IVA, anuladas, total,
  efectivo esperado, efectivo contado, diferencia, observaciones), mismo orden, misma
  disposición y mismo estilo; solo cambian los datos, que salen de las ventas guardadas en
  esta computadora.

## Detalle técnico

- `src/routes/configuracion.tsx` y `src/components/SetupWizard.tsx`: eliminar el bloque y el
  paso de `operation_mode` (constante `MODOS`, estado y guardado). `company_settings.operation_mode`
  se conserva en la base pero deja de escribirse desde la app web.
- `src/lib/caja-local.ts` sigue mapeando `tipoLocal` → `operation_mode` en memoria, y se emite un
  evento al guardar en `desktop/config.html` para que la interfaz recargue la config sin reinicio.
- Migración: nueva columna `tipo_local` en `cajas`; `src/routes/api/public/caja/autorizar.ts` y
  `sincronizar.ts` la reciben desde la caja y la guardan; `src/routes/admin.cajas.tsx` la muestra
  como texto de solo lectura.
- `src/styles.css`: `--product-bar` a negro sólido, `--product-price` al naranja de categorías
  (mismo token del acento), y familia tipográfica del POS (títulos/precios) con pesos 600/700.
- `src/routes/index.tsx` y `src/components/CheckoutDialog.tsx`: aplicar los nuevos tokens; en el
  cobro, reemplazar fondos oscuros por `bg-white`/`border` y estado activo naranja.
- Anulación: `desktop/lib/almacen.cjs` añade `anularOrden(id, motivo, usuario)` marcando
  `estado: "anulada"` con motivo/usuario/fecha; `desktop/main.cjs` expone el IPC (valida clave
  vía `/api/public/caja/clave-admin` con respaldo local) e imprime el nuevo `ordenAnuladaHtml`
  de `desktop/lib/ticket.cjs`; `desktop/lib/sincronizacion.cjs` envía la anulación y
  `src/routes/api/public/caja/sincronizar.ts` la aplica al pedido del central.
- `desktop/lib/ticket.cjs`: hoja térmica común con `font-size` base menor (10px), ancho útil
  72 mm centrado; `cierreHtml` con líneas punteadas por fila, FALTANTE en negrita y omisión de
  formas de pago en cero.
- `src/components/AppShell.tsx`: quitar el botón "Cierre de caja" del menú de la caja local y
  dejar el acceso al cierre desde la pantalla de Punto de Venta.
- `desktop/cierre.html`: replicar la maqueta de `src/routes/caja.tsx` (tarjetas, secciones,
  tipografía, colores y orden de campos) alimentada por `resumenCierre()` del almacén local.
- Subir a la versión 1.8.8 (`desktop/package.json`, `desktop/acerca.html`), reconstruir la
  interfaz integrada y generar el instalador de Windows.
