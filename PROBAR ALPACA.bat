@echo off
rem Prueba que la clave de Alpaca de .env.local funcione, sin levantar la app.
rem No imprime la clave ni el secreto: solo el veredicto.
cd /d "%~dp0"
if not exist ".env.local" (
  echo.
  echo  No existe .env.local en esta carpeta.
  echo  Copia .env.example como .env.local y carga tus dos claves.
  echo.
  pause
  exit /b 1
)
echo.
node --env-file=.env.local scripts\probar-alpaca.mjs
echo.
pause
