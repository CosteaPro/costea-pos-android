# Plan: Alertas operativas de Costea POS vía Telegram

## Resumen
Conectar un bot de Telegram gratuito para enviar alertas operativas clave desde Costea POS. No reemplaza la interfaz actual; la complementa con notificaciones push instantáneas en el celular del personal autorizado.

## Alcance

### 1. Alertas a implementar
- **Pedido listo en cocina**: cuando un ítem o toda la orden pase a estado "listo".
- **Cierre de caja**: resumen automático al hacer un cierre definitivo (total, efectivo, diferencia).
- **Stock bajo**: cuando un ingrediente/producto cruce el mínimo configurado.

### 2. Configuración en el panel central
- Nueva sección dentro de **Configuración > Notificaciones** (`/admin/ajustes` o `/configuracion`).
- Campos:
  - Token del bot de Telegram (se guarda como secreto de servidor).
  - Chat ID del grupo/usuario destino.
  - Activar/desactivar cada tipo de alerta.
- Botón "Probar conexión" que envía un mensaje de prueba.

### 3. Backend
- Función `sendTelegramAlert(message: string)` en un módulo server-only.
- Llamadas desde:
  - Cambio de estado de ítem/pedido a "listo".
  - Proceso de cierre definitivo de caja.
  - Trigger/función de inventario al detectar stock bajo.
- Manejo seguro: token como variable de entorno, nunca expuesto al cliente.

### 4. Conector a usar
- **Telegram** (`telegram`): se conecta como App connector estándar o se configura manualmente con el token del bot (BYOK gratuito).
- Alternativa si prefieren no usar connector: guardar `TELEGRAM_BOT_TOKEN` como secreto del proyecto.

## Cómo se conecta con Costea
- El mesero en el patio recibe el aviso en su celular sin tener que mirar la pantalla de cocina.
- El administrador recibe el resumen de cierre apenas el cajero cierra.
- El encargado de compras recibe alertas de stock bajo para reponer.

## No incluye
- Envío de notificaciones por WhatsApp (requiere proveedor pagado).
- Panel de historial de alertas (solo envío push).
- Suscripciones por usuario; inicia con un único chat destino.

## Entregable
Panel de configuración funcional + envío de alertas reales en los tres eventos definidos.
