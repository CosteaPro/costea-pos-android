# Plan: Entregar el instalador y reemplazar la caja Costea POS

## Objetivo
Generar y entregar el instalador de Windows de Costea POS Caja 1.8.3 (`CosteaPOS-Caja-1.8.3-setup.exe`), y reemplazar la caja anterior conservando los datos locales.

## Parte 1 — Generar y entregar el instalador

1. **Reconstruir la interfaz integrada**
   - Ejecutar el script de construcción que compila el POS web y lo copia a `desktop/web-app`.
   - La verificación de integridad debe pasar (ningún módulo del servidor local con referencias rotas).

2. **Empaquetar la caja**
   - Empaquetar con Electron para Windows x64 e incrustar el ícono de Costea POS.
   - Producir el instalador `CosteaPOS-Caja-1.8.3-setup.exe` y, como respaldo, el ZIP portable.

3. **Verificar antes de entregar**
   - Confirmar que el servidor local embebido responde 200 en la pantalla de venta.
   - Confirmar tamaño y versión del archivo generado.

4. **Entregar los archivos** listos para descargar desde el chat.

## Parte 2 — Reemplazar la caja anterior en la computadora

1. **Respaldar los datos locales**
   - Copiar la carpeta `datos-caja` a un lugar seguro:
     - Instalada: `%APPDATA%\Costea POS Caja\datos-caja`
     - Portable: `datos-caja` junto al ejecutable

2. **Reemplazar**
   - Cerrar Costea POS Caja.
   - Instalador: desinstalar la versión anterior desde "Agregar o quitar programas" y ejecutar el nuevo `.exe`.
   - Portable: eliminar la carpeta anterior y colocar la nueva.

3. **Restaurar datos**
   - Volver a copiar `datos-caja` en la misma ruta original.

4. **Verificar**
   - Abrir la caja y comprobar que carga la pantalla de venta.
   - Revisar **Caja → Facturas pendientes** y la configuración (RUC, firma .p12, secuencias).

## Notas técnicas

- `datos-caja` guarda configuración, secuencias, comprobantes, XML firmados, clientes y cierres; por eso se respalda antes de reemplazar.
- El instalador NSIS se genera desde `desktop/` con Electron Builder; si el entorno no permite firmar/empaquetar NSIS, se entrega el ZIP portable equivalente.
- La 1.8.3 ya incluye la verificación de integridad del servidor embebido que corrigió la pantalla de venta en blanco.
