@echo off
setlocal
title Publicar en Vercel
cd /d "%~dp0"

echo Subiendo los cambios a GitHub (rama main).
echo Vercel detecta el push y redespliega solo.
echo.

git push origin main
if errorlevel 1 (
  echo.
  echo EL PUSH FALLO. Revisa el error de arriba.
  echo Si pide usuario/clave, abri GitHub Desktop una vez o corre:
  echo   git config --global credential.helper manager
) else (
  echo.
  echo Listo. En ~1 minuto la version nueva esta en:
  echo   https://invest-topaz-one.vercel.app
  echo.
  echo Podes seguir el deploy en:
  echo   https://vercel.com/diogo3155-6639s-projects/invest
)
echo.
pause
