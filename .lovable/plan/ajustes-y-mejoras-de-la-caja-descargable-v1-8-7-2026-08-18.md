# Ajustes y mejoras de la caja descargable (v1.8.7)

## 1. Impresión en papel térmico de 80 mm

La tirilla de facturas y órdenes de la caja ya está ajustada a 80 mm, pero los **reportes**
(cierre, cuadre y cualquier impresión que venga de la interfaz web) no lo están: el reporte web
sale en tamaño A4 y por eso se corta en la impresora térmica.

- Unificar una sola hoja de estilo térmica: hoja de 80 mm, margen de 3 mm a cada lado y
  contenido de 72 mm, sin tablas de ancho fijo ni columnas que se salgan.
- Aplicarla al reporte de cierre y cuadre de la caja y a las impresiones que la interfaz
  envía por el puente de impresión cuando corre dentro de la caja descargable.
- Números alineados a la derecha, texto largo que baja de línea en vez de cortarse.

## 2 y 3. Cierre de caja: quitar el del sistema web, dejar el propio

- Dentro de la caja descargable se oculta la pestaña "Caja" (cierre del sistema central).
- En su lugar aparece la pestaña **Cierre de caja** de la propia caja, con el mismo diseño y
  formato del cierre actual, pero alimentada con las ventas reales guardadas en esta
  computadora: período de apertura y cierre, ventas del turno, formas de pago, subtotal,
  IVA, anuladas, total, efectivo esperado y diferencia.

## 4. Mapa de mesas en la caja

- Nueva pestaña **Mapa de Mesas** junto a Punto de Venta.
- Las mesas y sus cuentas abiertas se leen del sistema central en tiempo real (no se
  configuran en la caja). Sin internet la pestaña avisa que requiere conexión.
- Al tocar una mesa se cargan las comandas que el mesero asignó a esa mesa y se pueden
  llevar al panel de cobro de la caja.

## 5. Tipo de local en la configuración de la caja

Nueva opción en la pantalla de configuración con tres alternativas:

1. Restaurante sin mesas — solo Punto de Venta, cobro inmediato.
2. Restaurante con salón y mesas — Punto de Venta + Mapa de Mesas, cuentas abiertas.
3. Patio de comidas — vista simplificada, sin mapa de mesas, con campo de etiqueta del pedido.

La selección se guarda en la configuración local y decide qué pestañas y funciones se ven.

## 6. Facturas y Órdenes en pantallas distintas

- "Facturas pendientes de envío al SRI" se mantiene tal cual, con todas las facturas de esta caja.
- Nueva pantalla **Órdenes** con todas las órdenes de venta emitidas por la caja
  (número, hora, etiqueta/mesa, forma de pago y total), con su propio total.
- El cuadre sigue sumando ambas listas sin duplicar la venta que ya tiene factura.

## 7. Pantalla inicial y acceso a configuración

- La caja abre siempre en **Punto de Venta**. Solo la primera vez, cuando aún no está
  activada, abre la configuración.
- Entrar a Configuración pide la clave de administrador o superadministrador (se valida
  contra el sistema central, con respaldo local cuando no hay internet).

## 8. Cierre definitivo y contadores

- El cierre definitivo envía todo al sistema central, deja el turno cerrado y pone los
  totales del turno en cero.
- Para volver a vender hay que abrir turno con clave de administrador o superadministrador.
- Facturas: la secuencia nunca se reinicia. Órdenes: vuelven al número 1 en cada turno/día.

## 9. Punto de venta — tarjetas como la foto modelo

La tarjeta queda igual a la imagen enviada: foto arriba ocupando toda la tarjeta y,
al pie, una barra dividida en dos bloques sin espacios ni bordes redondeados internos.

- Bloque izquierdo (ancho): fondo azul marino muy oscuro, nombre del producto en
  **blanco puro**, letra grande y en negrita, a la izquierda.
- Bloque derecho (angosto, se ajusta al texto): fondo **naranja**, precio en
  **blanco puro**, misma altura y tamaño de letra que el nombre, bien visible.
- Toda la tarjeta con esquinas redondeadas y la barra inferior a ras del borde.
- El precio siempre con 2 decimales ($0.80, $3.75, $6.00 — nunca $6).
- Pestañas de categorías más grandes y en blanco puro.
- Panel de cobro con letra negra más gruesa y definida, también con 2 decimales.

## Detalle técnico

- `desktop/lib/ticket.cjs`: extraer los estilos térmicos a una constante compartida y
  reescribir `cierreHtml` (cierre y cuadre) con márgenes de 3 mm y ancho útil 72 mm.
- `desktop/lib/almacen.cjs` + `config.html`: nuevo campo `tipoLocal`
  (`rapida` | `restaurante` | `patio`), expuesto en `configPublica()`.
- `src/lib/caja-local.ts`: mapear `tipoLocal` a `operation_mode` en `aplicarConfigLocal`
  y añadir al puente `ordenesLocales()`, `resumenCierre()`, `estadoTurno()`.
- `src/components/AppShell.tsx`: cuando `esCajaLocal()`, ocultar `/caja`, `/cocina`,
  `/reportes` y demás pantallas del central; mostrar Punto de Venta, Mapa de Mesas
  (solo modo restaurante), Órdenes, Facturas pendientes y Cierre de caja.
- Nuevas pantallas de la caja: `desktop/ordenes.html` (o pestaña en la interfaz) y
  reutilización de `cierre.html`/`cuadre.html` con el resumen local.
- `desktop/main.cjs`: arrancar siempre en `abrirPos()` salvo primera activación; exigir
  `admin:verificarClave` antes de `abrirConfiguracion()`; mantener
  `almacen.reiniciarOrdenes()` en el cierre definitivo sin tocar la secuencia de facturas.
- Mapa de mesas: la pantalla existente `/mesas` leyendo del servidor central, con aviso
  cuando la caja está sin conexión.
- Al final: subir a la versión 1.8.7 y generar el instalador de Windows.
