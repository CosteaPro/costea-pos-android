# Ajustes de interfaz de la caja web (según imagen de referencia)

## 1. Quitar el recuadro "Módulo administrativo"
Se elimina la tarjeta naranja con el enlace al panel administrativo que aparece encima del buscador en la pantalla de venta. El acceso queda solo en el enlace "Administración" de la barra superior.

## 2. Barra de navegación más corta
La barra superior queda con: Punto de venta, Mesas, Cocina, Caja, Administración, Configuración.

Se sacan de la barra: Reportes, Tiempos y demoras, Menú. Estos siguen existiendo como páginas y se acceden desde el panel administrativo:
- "Tiempos y demoras" ya está en el menú administrativo (sección de facturación).
- Se agregan al menú administrativo dos entradas nuevas: "Reportes de venta del día" (/reportes) y "Menú y platillos" (/menu).

"Clientes" también sale de la barra y pasa al panel administrativo, para que la barra quede exactamente como la imagen.

## 3. Limpieza del panel derecho de pedido
- Se elimina el campo "Notas del pedido (alergias, tiempos…)". La nota se sigue capturando por producto dentro de la ventana de personalización, que es donde corresponde.
- El aviso de cierre definitivo de caja se mantiene, pero solo se muestra cuando el día está bloqueado; con la caja abierta no ocupa espacio.
- Orden fijo del panel: tipo de consumo, mesa, N° de personas, canal, lista de productos agregados, subtotal sin IVA, IVA 15%, Total y botones de acción.

## 4. Tipografía
Se mantiene la identidad de Costea Pro pero con una tipografía más nítida:
- Títulos y encabezados: Archivo (se conserva).
- Texto general y números: IBM Plex Sans, que es más legible en pantalla táctil y en cifras.
Se ajustan los tokens de fuente en el sistema de diseño para que el cambio aplique en toda la interfaz de forma uniforme.

## 5. Guía visual
Se respeta la distribución de la imagen: buscador ancho arriba, pestañas de categorías en píldoras, cuadrícula de platillos con pie negro y precio naranja, y panel de pedido a la derecha con el total destacado.

## Detalles técnicos
- `src/components/AppShell.tsx`: recortar el arreglo `nav` a las seis entradas indicadas.
- `src/components/AdminShell.tsx`: añadir enlaces a `/reportes`, `/menu` y `/clientes` en las secciones correspondientes.
- `src/routes/index.tsx`: eliminar la tarjeta de acceso a `/admin`, quitar el `Textarea` de notas generales (y su estado asociado donde ya no se use), conservar el aviso `dayLocked` condicionado.
- `src/routes/__root.tsx` y `src/styles.css`: cargar IBM Plex Sans por `<link>` y actualizar `--font-sans`.
- No se toca lógica de cobro, impresión ni sincronización.
