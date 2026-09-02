# Costea POS — Caja descargable v1.8.9 + agregadores e impuestos por producto

Ocho puntos, agrupados en tres bloques. Los bloques 1 y 2 tocan la caja instalada (nuevo instalador); el bloque 3 toca la app web central y la base de datos, y se refleja en la caja al sincronizar.

## Bloque A — Caja: órdenes, cierre y arranque

1. Órdenes sin dinero duplicado
   - La pantalla "Órdenes de venta de esta caja" sigue mostrando todos los registros con sus etiquetas "Orden", "Facturada" y "Anulada".
   - El total del pie pasa a sumar solo las órdenes con estado "Orden" (sin factura relacionada y sin anular). Se agrega una línea informativa "Ya facturado (se suma en Facturas)" para que el cajero vea el desglose sin confusión.

2. Cierre de caja con todos los medios de pago
   - Se quita "Cuadre de caja" (y cualquier entrada de cierre) del menú desplegable de la aplicación. El único acceso queda el botón del Punto de venta.
   - La pantalla de cierre de la caja adopta el mismo formato de la caja web: columna "Sistema" vs columna "Contado" para Efectivo, Tarjetas, Transferencias/pagos móviles, Vales, Recibos y Otros, con diferencia por línea y diferencia total (sobrante/faltante).
   - "Confirmar cierre definitivo" guarda el cierre con los seis medios de pago y sus diferencias, reinicia el número de orden a 1, deja el turno cerrado y bloquea la venta hasta abrir turno con clave de Administrador o Superadministrador. Se corrige el fallo actual del botón (validación y confirmación) y se imprime el ticket de cierre con el mismo detalle.

3. Arranque siempre en Punto de venta
   - La ventana principal abre siempre el Punto de venta, incluso si la configuración está incompleta (en ese caso muestra un aviso con botón "Ir a Configuración").
   - Configuración solo se entra desde el menú y siempre pide clave de Administrador/Superadministrador.

## Bloque B — Caja: catálogo local y avisos

4. Caché local del menú
   - Al primer arranque y al pulsar "Sincronizar", la caja descarga categorías, productos, precios, descripciones, agregadores e imágenes y las guarda en una carpeta local de datos.
   - En el uso diario el POS lee siempre del disco local (imágenes servidas desde la carpeta local), sin llamadas al servidor y funcionando sin internet.
   - La sincronización compara la marca de cambio de cada producto/imagen y descarga solo lo nuevo o modificado.

5. Aviso de actualizaciones pendientes
   - Al iniciar y cada cierto tiempo en segundo plano, la caja consulta si el catálogo del servidor cambió.
   - Si hay cambios, muestra un aviso discreto: "Hay actualizaciones pendientes del menú. ¿Desea sincronizar ahora?" con [Sincronizar] y [Más tarde]. Nunca actualiza sola.
   - "Más tarde" oculta el aviso hasta la siguiente consulta. Sin internet no se muestra nada.

## Bloque C — Producto: agregadores, impuestos y formatos de impresión

6. Agregadores (opciones por producto)
   - Nueva sección "Agregadores" en el menú administrativo: cada agregador tiene nombre, precio (puede ser $0.00), costo y receta/subreceta asociada, igual que un producto.
   - En cada producto se define qué grupos de agregadores aplican y si son obligatorios (elegir uno) u opcionales (varios o ninguno).
   - Al tocar en la caja un producto con agregadores se abre una ventana con la foto, las opciones y su precio, y un campo de observaciones libres. Los precios adicionales se suman al total.
   - El consumo de agregadores descuenta inventario y entra al costeo igual que cualquier receta.
   - Las opciones elegidas, sus precios y la observación se imprimen bajo el nombre del plato en el ticket de cocina y en la factura.

7. Impuesto por producto
   - En la ficha de producto se agrega un desplegable: IVA 15% (preseleccionado), IVA 0% o Exento.
   - El cálculo de la venta y el XML del SRI usan el impuesto de cada producto combinado con el porcentaje general del negocio; no se agrega ninguna opción global nueva.

8. Dos formatos de impresión
   - Factura del cliente: completa (establecimiento, RUC, dirección, teléfono, número, cliente, detalle, impuestos, total, clave de acceso y QR).
   - Copia de control interno: solo número de factura, fecha, hora, caja, detalle, totales y firma del cajero, sin repetir los datos del establecimiento. Ahorra papel sin perder control.

## Detalles técnicos

- Base de datos: nuevas tablas `product_modifier_groups`, `product_modifiers` y `product_modifier_links` (con GRANT y RLS por rol), columna `tax_treatment` en `products` (por defecto `iva`), y persistencia de las opciones elegidas en `order_items` (JSON con nombre, precio y observación).
- Caja (Electron): cambios en `desktop/main.cjs` (menú, ventana inicial), `desktop/ordenes.html` (total), `desktop/cierre.html` + `desktop/lib/cierre.cjs` (medios de pago, confirmación, bloqueo de turno), `desktop/lib/almacen.cjs` y `desktop/lib/sincronizacion.cjs` (caché de catálogo e imágenes, marca de cambios), `desktop/lib/ticket.cjs` (dos formatos y líneas de agregadores).
- Web: sección de agregadores en el panel administrativo, selector de agregadores en el POS y en la vista de mesero, campo de impuesto en la ficha de producto, y consumo de inventario extendido a agregadores.
- Se genera un nuevo instalador (v1.8.9) al terminar los bloques A y B.

## Orden de entrega sugerido

1. Bloque A (rápido, corrige lo que hoy falla).
2. Bloque B (caché y avisos).
3. Bloque C (agregadores, impuestos e impresión) — es el más extenso y cierra con nuevo instalador.
