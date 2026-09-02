# Ajuste del pie del ticket térmico

Cambio único: quitar la frase "Costea POS | Sistema de Gestión de Restaurantes" del pie del ticket de 80 mm y dejar solo el RUC y la web.

## Cómo queda el pie

```text
COPIA — CLIENTE
¡Gracias por su compra!
Verifica la validez y descarga tu comprobante en el portal oficial: www.sri.gob.ec
RUC: 1716626484001
www.costeapro.com
```

En la nota de venta / control interno se mantiene su bloque actual (CONSUMIDOR FINAL, 0999999999) y también termina con las dos líneas del RUC y la web.

## Detalle técnico

- `src/lib/receipt.ts`: eliminar las dos apariciones de la línea `Costea POS | Sistema de Gestión de Restaurantes` (variante factura SRI y variante nota de venta). Las líneas `RUC: 1716626484001` y `www.costeapro.com` ya existen debajo y se conservan.
- `desktop/lib/ticket.cjs`: eliminar la misma línea en el ticket de la caja de escritorio (las dos líneas nuevas ya están debajo).
- No se toca `src/lib/sri.ts` (leyenda del RIDE), ni el RIDE, ni el XML, ni encabezado, productos, totales, anchos o cortes de papel.
- Si usas la caja descargable, hay que reconstruir el instalador para que el cambio llegue a la caja instalada.
