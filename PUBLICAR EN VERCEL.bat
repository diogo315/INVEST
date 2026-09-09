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

for /f %%i in ('git rev-list --count origin/main..HEAD 2^>nul') do set PEND=%%i
if "%PEND%"=="" set PEND=0

if "%PEND%"=="0" (
  echo.
  echo No hay commits pendientes. Vercel ya tiene la ultima version.
  echo   https://invest-topaz-one.vercel.app
  echo.
  git status --porcelain >nul 2>&1
  echo Si hiciste cambios y no los ves aca, es que faltan commitear.
  echo.
  pause
  exit /b 0
)

echo.
echo Commits pendientes de publicar: %PEND%
echo --------------------------------------------
git log --oneline origin/main..HEAD
echo --------------------------------------------
echo.

git push origin main
if errorlevel 1 (
  echo.
  echo EL PUSH FALLO. Revisa el error de arriba.
  echo Si pide usuario y clave, abri GitHub Desktop una vez para
  echo guardar las credenciales, o corre:
  echo   git config --global credential.helper manager
  echo.
  pause
  exit /b 1
)

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
