@echo off
REM Genera el instalador de Windows de Costea POS Caja.
REM Requiere Node.js 20+ instalado en esta computadora Windows.
cd /d "%~dp0"
echo Instalando dependencias...
call npm install || goto :error
echo Integrando la interfaz completa de la caja web...
cd /d "%~dp0.."
call npm install || goto :error
call npm run build:desktop || goto :error
cd /d "%~dp0"
echo Generando el instalador...
call npx electron-builder --win nsis --x64 || goto :error
echo.
echo Listo. El instalador esta en: %~dp0dist\
pause
exit /b 0

:error
echo.
echo Ocurrio un error. Revise el mensaje anterior.
pause
exit /b 1
