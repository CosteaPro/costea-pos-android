# Arreglo definitivo de la pantalla de venta en la caja descargable

## Qué encontré en el registro que enviaste

El registro `costea-caja.log` de la caja muestra el error real, repetido cada vez que se abre la pantalla principal:

```text
Cannot find module ...\web-app\server\_ssr\router-SA2Tfz8d.mjs
imported from ...\web-app\server\_ssr\server-DBjk2ckT.mjs  (status 500)
```

No es un problema de sesión, de roles ni del puente local: el servidor interno de la caja responde error 500 al pedir la ruta principal porque **le falta un archivo de la interfaz compilada**.

Confirmado también en el proyecto: dentro de `desktop/web-app/server/_ssr` conviven dos compilaciones mezcladas. El archivo de arranque llama a una pieza antigua (`server-DBjk2ckT.mjs`) que a su vez busca `router-SA2Tfz8d.mjs`, y ese archivo ya no existe en la carpeta (el que sí está se llama `router-Cloy1oE-.mjs`).

Por eso todas las demás pantallas funcionan y solo la de venta cae en "This page didn't load": es la única que carga esa pieza rota.

## Qué se va a hacer

1. **Regenerar la interfaz integrada desde cero.** Borrar por completo `desktop/web-app` y volver a compilarla, para que todas las piezas pertenezcan a la misma compilación.
2. **Añadir una verificación automática de integridad.** Antes de empaquetar, un paso revisa que cada archivo del servidor interno tenga presentes todos los archivos que necesita. Si falta alguno, la compilación se detiene con un mensaje claro en lugar de entregar una caja rota.
3. **Evitar que la carpeta compilada se guarde a medias.** La interfaz integrada deja de tratarse como material editable del proyecto: se produce siempre en el momento de empaquetar.
4. **Mostrar el error en pantalla, no solo en el registro.** Si el servidor interno responde error, la caja mostrará el mensaje real (por ejemplo "falta un archivo de la interfaz") con botón de reintentar, en español.
5. **Publicar la versión 1.8.3** y entregar el ZIP portable ya verificado: se comprueba que la ruta principal responde correctamente antes de enviártelo.

## Detalles técnicos

- `scripts/build-desktop.mjs`: tras copiar `.output` a `desktop/web-app`, recorrer los `.mjs` de `server/_ssr` y `server/_chunks`, extraer las importaciones relativas y fallar si alguna no existe en disco.
- Añadir `desktop/web-app/` a `.gitignore` para impedir estados parciales versionados; el empaquetado lo genera siempre.
- `desktop/main.cjs`: al recibir un 5xx del servidor local, cargar `sin-conexion.html` con el detalle del error (texto en español) en lugar de dejar el error boundary genérico de la app.
- `desktop/package.json`: versión `1.8.3`.
- Verificación previa a la entrega: arrancar el servidor empaquetado y comprobar `HTTP 200` en `/`.

## Resultado esperado

La caja abre la pantalla de venta con la interfaz web íntegra, con o sin internet, y cualquier fallo futuro del servidor interno se ve explicado en pantalla en lugar de aparecer como una página en blanco.
