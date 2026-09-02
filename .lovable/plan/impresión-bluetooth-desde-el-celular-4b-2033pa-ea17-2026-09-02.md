# Impresión Bluetooth desde el celular (4B-2033PA-EA17)

## Lo importante primero

La impresora está bien. El problema es que **un navegador no puede usar impresoras Bluetooth clásicas (SPP) emparejadas en Android**: el sistema operativo no le deja "ver" la lista de dispositivos emparejados ni pedir el PIN 0000. Por eso las apps instaladas sí imprimen y la página web no. No es un error del código: es un límite del navegador.

Entonces el sistema no va a poder "buscar dispositivos emparejados". Lo que sí se puede hacer, y es exactamente lo que usan los POS web que funcionan en Ecuador, es lo siguiente.

## Qué se va a construir

Una sección **Impresión en celular** dentro de Configuración, con tres caminos, en este orden:

1. **Enviar a la app de impresión que ya funciona (recomendado y el que va a resolverlo hoy)**
   El ticket se convierte a texto ESC/POS y se entrega al celular como orden de impresión para RawBT (o la app compatible que el usuario ya tenga). El usuario toca "Imprimir" y sale el papel por la 4B-2033PA-EA17, sin volver a configurar nada. Se guarda como método preferido para que las siguientes impresiones sean directas.

2. **Conexión directa por Bluetooth (solo si la impresora expone BLE)**
   Botón **Buscar impresora Bluetooth**: abre el selector del propio navegador, donde aparece la impresora si trabaja en modo BLE. Al elegirla se guarda su nombre y se imprime directo con ESC/POS, sin apps. Incluye botón **Probar impresión**. Si el modelo solo trabaja en Bluetooth clásico, el sistema lo dice con claridad y ofrece el camino 1, en vez de fallar en silencio.

3. **Compartir el ticket**
   Botón **Compartir / Abrir con…**: entrega el ticket al menú de compartir del celular, para elegir cualquier app de impresión instalada. Sirve como salida de emergencia.

Además:
- Campo para **escribir el nombre exacto** de la impresora (`4B-2033PA-EA17`) y guardarlo como preferida.
- Mensajes en español claros: qué pasó, qué hacer, sin tecnicismos.
- En computadora todo sigue igual (agente local / diálogo de impresión); esto es solo para celular.

## Sobre el PIN 0000

El PIN se pide una sola vez cuando el celular empareja la impresora, en los ajustes del teléfono. Ninguna app web puede enviarlo. El sistema mostrará una guía corta de emparejamiento (Ajustes → Bluetooth → 4B-2033PA-EA17 → PIN 0000) para quien no la haya vinculado todavía.

## Detalle técnico

- Nuevo `src/lib/bluetooth-print.ts`:
  - `ticketEscPos(data)` — convierte el ticket a bytes ESC/POS de 42 columnas (48 con fuente condensada), reutilizando los datos que hoy arma `receiptHtml` en `src/lib/receipt.ts`.
  - `imprimirRawBT(texto)` — envía por esquema `rawbt:` / `intent:` con el payload ESC/POS.
  - `imprimirBLE()` — `navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [...] })`, busca característica de escritura y envía en bloques de 180 bytes; guarda el `deviceId` para reconexión.
  - `compartirTicket()` — `navigator.share` con archivo de texto; respaldo a descarga.
  - Preferencia guardada en `localStorage` (`costea.impresion-movil`): `rawbt | ble | compartir`.
- `src/lib/receipt.ts`: `printReceipt` detecta celular y método preferido; si no hay ninguno, sigue con el flujo actual (`silentPrint`).
- `src/routes/configuracion.tsx`: nueva tarjeta "Impresión en celular" con los tres botones, el campo de nombre, "Probar impresión" y la guía de emparejamiento.
- Sin cambios en base de datos, facturación, SRI ni en la impresión de escritorio.
