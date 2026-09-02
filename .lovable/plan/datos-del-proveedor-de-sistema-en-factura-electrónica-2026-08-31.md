# Datos del proveedor de sistema en factura electrónica

Agregar, de forma discreta, únicamente dos líneas de identificación del proveedor del sistema en la factura electrónica:

```text
RUC: 1716626484001
www.costeapro.com
```

Nada más: sin nombre comercial, sin correo, sin texto adicional.

## Dónde aparecerá

1. **RIDE (documento A4 que ve el cliente)**: dos líneas al final, en el mismo estilo pequeño y gris del pie actual, debajo de la leyenda de autorización del SRI.
2. **XML enviado al SRI**: dos campos adicionales dentro del bloque de información adicional que ya existe (el que hoy lleva el correo del comprador):
   - `Proveedor RUC` = 1716626484001
   - `Proveedor Web` = www.costeapro.com

## Qué NO se toca

- Ninguna otra etiqueta, orden, cálculo, validación, firma ni transmisión al SRI.
- Totales, impuestos, clave de acceso, secuenciales, formas de pago: sin cambios.
- El bloque de información adicional es opcional según la ficha técnica del SRI y admite hasta 15 campos; añadir dos no altera la validación del comprobante.

## Detalle técnico

- `src/lib/sri/factura-xml.server.ts`: en `buildFacturaXml`, añadir dos entradas `campoAdicional` al arreglo `infoAdicional` ya existente (después del email del comprador). Sin cambios en el resto de la función.
- `src/lib/ride.server.ts`: añadir un párrafo con clase `pie` con las dos líneas al final del documento.
- No se modifican notas de crédito/débito ni el ticket térmico salvo indicación posterior.
