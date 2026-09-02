# Por qué aún no ves el RUC 1716626484001 y www.costeapro.com

El cambio sí está en el código del proyecto (verificado):

- XML web: `src/lib/sri/factura-xml.server.ts` (campos "Proveedor RUC" y "Proveedor Web")
- XML caja de escritorio: `desktop/lib/factura-xml.cjs`
- RIDE A4: `src/lib/ride.server.ts` (dos líneas al pie)

Lo que falta para que lo veas depende de dónde estás mirando:

1. **Sitio publicado**: los cambios viven en la vista previa hasta que publiques. Si abriste la factura desde el sitio publicado (costea-pos-master.lovable.app), todavía muestra la versión anterior.
2. **Facturas ya emitidas**: el XML se guarda firmado en el momento de la emisión, así que los comprobantes anteriores conservan su XML original. Solo las facturas nuevas llevarán los dos campos. El RIDE, en cambio, se genera al abrirlo, así que sí debería mostrar las dos líneas incluso en facturas viejas (en la vista previa).
3. **Ticket térmico 80 mm**: hoy no incluye esas líneas; el pie termina en "Costea POS | Sistema de Gestión de Restaurantes". Se agregarán.
4. **Caja descargable (Electron)**: el archivo ya está actualizado, pero el instalador entregado hay que reconstruirlo para que la caja instalada emita con los nuevos campos.

## Qué propongo hacer

1. Publicar el proyecto para que el sitio en producción ya emita con los datos del proveedor.
2. Agregar al final del pie del ticket térmico de 80 mm, en todas sus variantes (factura SRI, nota de venta y copia de control interno), únicamente:

```text
RUC: 1716626484001
www.costeapro.com
```

Centrado, con la misma tipografía pequeña del pie. Nada más.
3. Si usas la caja descargable, reconstruir el instalador con los cambios.

## Detalle técnico

- No se modificará ningún cálculo, etiqueta, secuencial, clave de acceso ni firma.
- Ticket: único archivo tocado `src/lib/receipt.ts`, dos líneas de texto al final del pie. Sin cambios de ancho ni de corte de papel.
- Reconstrucción de la caja: `scripts/build-desktop.mjs` (solo si la usas).
