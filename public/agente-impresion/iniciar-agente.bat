@echo off
title Agente de impresion Costea POS
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js no esta instalado. Descarguelo en https://nodejs.org y vuelva a ejecutar este archivo.
  pause
  exit /b 1
)
node costea-print-agent.js
pause
