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
git fetch origin --prune >nul 2>&1

REM ---------------------------------------------------------------
REM Vercel publica la rama POR DEFECTO del repo en GitHub. La leemos
REM en vivo en vez de asumirla, asi esto sigue funcionando si cambias
REM el default branch (por ejemplo de master a main).
REM ---------------------------------------------------------------
set "PROD="
for /f "tokens=2 delims=/" %%b in ('git symbolic-ref --short refs/remotes/origin/HEAD 2^>nul') do set "PROD=%%b"
if "%PROD%"=="" (
  git remote set-head origin --auto >nul 2>&1
  for /f "tokens=2 delims=/" %%b in ('git symbolic-ref --short refs/remotes/origin/HEAD 2^>nul') do set "PROD=%%b"
)
if "%PROD%"=="" set "PROD=main"

echo Rama de produccion (la que despliega Vercel): %PROD%
echo.

for /f %%i in ('git rev-list --count origin/%PROD%..HEAD 2^>nul') do set PEND=%%i
if "%PEND%"=="" set PEND=0

if "%PEND%"=="0" (
  echo No hay nada pendiente. Vercel ya tiene la ultima version.
  echo   https://invest-topaz-one.vercel.app
  echo.
  pause
  exit /b 0
)

echo Commits que le faltan a la web: %PEND%
echo --------------------------------------------
git log --oneline origin/%PROD%..HEAD
echo --------------------------------------------
echo.

for /f %%b in ('git branch --show-current') do set "ACTUAL=%%b"

echo Subiendo la rama actual (%ACTUAL%)...
git push origin %ACTUAL%
if errorlevel 1 goto FALLO

if /i not "%ACTUAL%"=="%PROD%" (
  echo.
  echo Subiendo a %PROD% ^(la que despliega Vercel^)...
  git push origin HEAD:%PROD%
  if errorlevel 1 goto FALLO
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
