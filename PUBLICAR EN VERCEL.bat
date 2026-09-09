@echo off
setlocal enabledelayedexpansion
title Publicar en Vercel
cd /d "%~dp0"

echo ============================================
echo   PUBLICAR EN VERCEL
echo ============================================
echo.

git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
  echo Esta carpeta no es un repo git. Nada que publicar.
  pause
  exit /b 1
)

echo Consultando GitHub...
git fetch origin >nul 2>&1

REM ---------------------------------------------------------------
REM OJO: la rama de produccion de este repo es MASTER, no main.
REM Vercel despliega la rama por defecto de GitHub, que es master.
REM Pushear solo a main NO actualiza la web. Por eso se empujan las
REM dos: main (donde se trabaja) y master (la que Vercel publica).
REM ---------------------------------------------------------------

for /f %%i in ('git rev-list --count origin/master..HEAD 2^>nul') do set PEND=%%i
if "%PEND%"=="" set PEND=0

if "%PEND%"=="0" (
  echo.
  echo No hay nada pendiente. Vercel ya tiene la ultima version.
  echo   https://invest-topaz-one.vercel.app
  echo.
  pause
  exit /b 0
)

echo.
echo Commits que le faltan a la web: %PEND%
echo --------------------------------------------
git log --oneline origin/master..HEAD
echo --------------------------------------------
echo.

echo Subiendo a main...
git push origin main
if errorlevel 1 goto FALLO

echo.
echo Subiendo a master (esta es la que despliega Vercel)...
git push origin HEAD:master
if errorlevel 1 goto FALLO

echo.
echo ============================================
echo   LISTO. Vercel redespliega solo (~1 min).
echo.
echo   https://invest-topaz-one.vercel.app
echo.
echo   Seguimiento del deploy:
echo   https://vercel.com/diogo3155-6639s-projects/invest
echo ============================================
echo.
pause
exit /b 0

:FALLO
echo.
echo EL PUSH FALLO. Revisa el error de arriba.
echo Si pide usuario y clave, abri GitHub Desktop una vez para
echo guardar las credenciales, o corre:
echo   git config --global credential.helper manager
echo.
pause
exit /b 1
