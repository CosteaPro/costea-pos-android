# Restaurar la opción "Menú" en el módulo de ventas

La página de Menú (`/menu`) sigue existiendo y completa: categorías, productos, fotos, áreas de impresión, precios por canal de venta, modificadores/agregadores y variantes de receta. Lo único que se perdió fue el enlace en la navegación, así que no hay que reconstruir nada de esa pantalla.

## Qué se hace

- Volver a mostrar el acceso "Menú y productos" dentro del grupo **Módulo de ventas y caja** del menú lateral del panel administrativo, junto a Punto de Venta, Mesas, Cocina y Cierres de caja.
- Restaurar también el acceso directo en la barra superior de la caja web, con el mismo permiso que tenía antes (usuarios que pueden configurar), para que se pueda entrar al Menú sin pasar por el panel administrativo.
- Ocultarlo en la caja descargable, igual que el resto de opciones que solo viven en el sistema web.

## Detalle técnico

- `src/components/AdminShell.tsx`: agregar `{ to: "/menu", label: "Menú y productos", icon: BookOpen }` al grupo `ventas`.
- `src/components/AppShell.tsx`: agregar la entrada `/menu` al arreglo `nav` con `permission: "configurar"` e incluir `/menu` en `ocultoEnCajaLocal`.
- Sin cambios en `src/routes/menu.tsx` ni en la base de datos.
