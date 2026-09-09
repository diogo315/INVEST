@echo off
setlocal
title Recompilar TradingView Gratis
cd /d "%~dp0"
echo Recompilando el build de produccion...
echo (correlo cada vez que cambies el codigo)
echo.
call npm run build
echo.
if errorlevel 1 (echo BUILD FALLIDO) else (echo Listo. Ya podes usar "ABRIR TradingView.bat")
pause
