# Plan: El error 500 viene de la carpeta antigua, no de la caja 1.8.3

## Qué muestra el registro enviado

El archivo `costea-caja.log` que adjuntaste confirma, hasta el último intento de hoy a las 17:29 (Guayaquil), que la caja se está abriendo desde:

```text
C:\CajaPOS-9\win-unpacked\...\web-app\server\_ssr\server-DBjk2ckT.mjs
   → intenta cargar router-SA2Tfz8d.mjs  (ese archivo NO existe en esa carpeta)
```

Ese `router-SA2Tfz8d.mjs` pertenece al paquete anterior (1.8.2), el que tenía la construcción mezclada. El paquete 1.8.3 que te entregué usa `router-Cloy1oE-.mjs` y ese archivo sí está incluido y verificado dentro del ZIP y del instalador.

Conclusión: la computadora sigue ejecutando la carpeta vieja `C:\CajaPOS-9\win-unpacked`. La 1.8.3 todavía no se ha usado en esa máquina.

## Qué haremos

### Parte 1 — Dejar la máquina usando la versión correcta

1. Cerrar por completo Costea POS Caja (verificar en el Administrador de tareas que no quede `Costea POS Caja.exe`).
2. Respaldar `datos-caja` (configuración, secuencias, comprobantes, firma .p12):
   - Portable: la carpeta `datos-caja` junto al `.exe` dentro de `C:\CajaPOS-9\win-unpacked`.
   - Instalada: `%APPDATA%\Costea POS Caja\datos-caja`.
3. Borrar o renombrar `C:\CajaPOS-9` para que nadie vuelva a abrir el atajo viejo.
4. Instalar `CosteaPOS-Caja-1.8.3-setup.exe` (o descomprimir el ZIP 1.8.3 en una carpeta nueva).
5. Restaurar `datos-caja` y abrir la caja.

### Parte 2 — Evitar que vuelva a pasar (cambios en el código)

1. **Sellar la versión en el paquete**: al construir la caja se escribe la versión y la firma del paquete dentro de `web-app`, y `desktop/main.cjs` la registra en el log al arrancar. Así el registro dirá siempre qué versión se está ejecutando.
2. **Aviso claro de paquete incompleto**: cuando el servidor local falle por un módulo faltante (`ERR_MODULE_NOT_FOUND`), la pantalla de error mostrará en español "Esta carpeta de la caja está incompleta o es de una versión anterior. Instale la versión más reciente", junto con la ruta desde la que se abrió, en lugar de volcar el HTML técnico.
3. **Comprobación al arrancar**: antes de abrir la pantalla de venta, la caja verifica que el archivo de entrada del servidor y sus módulos principales existan; si no, muestra ese mismo aviso sin intentar cargar la página.

## Notas técnicas

- No hay defecto en la versión 1.8.3: el verificador de integridad ya recorre los módulos del servidor embebido y el ZIP entregado contiene `router-Cloy1oE-.mjs`.
- Los cambios de la Parte 2 son de diagnóstico y presentación en `desktop/main.cjs` y `scripts/build-desktop.mjs`; no tocan la lógica de venta, facturación ni cierre de caja.
- Tras aplicarlos se subirá la versión a 1.8.4 y se entregarán instalador y ZIP nuevos.
