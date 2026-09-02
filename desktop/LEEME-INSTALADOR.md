# Costea POS Caja — cómo generar el instalador de Windows (.exe)

El programa de caja vive en la carpeta `desktop/`. Se empaqueta con Electron Builder
y produce un instalador de doble clic que crea el acceso directo en el escritorio y
la carpeta de datos local de la caja.

## 1. Requisitos (una sola vez)

- Una computadora con **Windows 10/11** (el instalador NSIS debe generarse en Windows).
- **Node.js 20 o superior**: https://nodejs.org

## 2. Generar el instalador

Copie la carpeta `desktop` a la computadora Windows y ejecute:

```bat
cd desktop
npm install
npm run dist
```

Al terminar, el instalador queda en:

```
desktop\dist\CosteaPOS-Caja-1.0.0-setup.exe
```

También existe `npm run dist:portable`, que genera un único `.exe` que se ejecuta
sin instalar (útil para pruebas en una caja prestada).

Atajo: haga doble clic en `construir-instalador.bat` para ejecutar los dos pasos.

## 3. Instalar en la computadora de caja

1. Copie `CosteaPOS-Caja-1.0.0-setup.exe` a la computadora de caja.
2. Doble clic → elija la carpeta de instalación → Instalar.
3. Se crea el acceso directo **Costea POS Caja** en el escritorio.
4. Al abrirlo por primera vez aparece la **Configuración de la caja**: RUC, razón social,
   establecimiento y punto de emisión, ambiente, archivo de firma `.p12` con su clave,
   siguiente número de factura, dirección del servidor central, código de caja y clave
   de sincronización.
5. Presione **Activar caja**. Desde ese momento la caja factura sola: firma en esta
   computadora, envía al SRI si hay internet y guarda con su propio número si no lo hay.

La carpeta de datos local se crea automáticamente en
`C:\Users\<usuario>\AppData\Roaming\Costea POS Caja\datos-caja`
(config, secuencia, comprobantes y XML firmados). Se abre desde el menú
**Caja → Carpeta de datos**.

## 4. Panel de facturas pendientes

Menú **Caja → Facturas pendientes**: lista con ✅ Autorizada, ⏳ Pendiente y ❌ Rechazada,
botón **Enviar todo pendiente** y **Subir al servidor central**. Además la caja reintenta
sola cada minuto en cuanto vuelve el internet.

## 5. Conexión con el servidor central

En el servidor (este proyecto) debe existir la caja registrada con su código y su clave
de sincronización. La caja usa:

- `GET  /api/public/caja/catalogo` — descarga productos, precios y datos del local.
- `POST /api/public/caja/sincronizar` — sube facturas, órdenes y totales del día.

El servidor solo recibe y consolida: **la numeración siempre es de la caja**.
