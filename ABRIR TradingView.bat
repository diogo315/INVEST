@echo off
setlocal enabledelayedexpansion
title TradingView Gratis
cd /d "%~dp0"

REM ---- Aviso de cambios sin publicar -------------------------------
REM Evita el caso "en mi PC lo veo pero en Vercel no": si hay commits
REM que no estan en GitHub, la web sigue mostrando la version vieja.

git rev-parse --git-dir >nul 2>&1
if not errorlevel 1 (
  git fetch origin >nul 2>&1
  for /f %%i in ('git rev-list --count origin/master..HEAD 2^>nul') do set PEND=%%i
  if "!PEND!"=="" set PEND=0
  if not "!PEND!"=="0" (
    echo ============================================
    echo   Hay !PEND! commit^(s^) sin publicar.
    echo   invest-topaz-one.vercel.app sigue mostrando
    echo   la version anterior hasta que los subas.
    echo ============================================
    git log --oneline origin/master..HEAD
    echo.
    set /p PUB="Publicarlos ahora en Vercel? (S/N): "
    if /i "!PUB!"=="S" (
      git push origin main
      git push origin HEAD:master
      if errorlevel 1 (
        echo.
        echo El push fallo. Segui igual con la app local.
      ) else (
        echo.
        echo Publicado. Vercel redespliega en ~1 minuto.
      )
      echo.
    )
  )
)

REM ---- Arranque rapido ---------------------------------------------
REM next dev compila bajo demanda (20-40s la primera pantalla);
REM next start sirve el build ya compilado en ~1s.
REM Si el codigo cambio desde el ultimo build, recompila solo.

set NEEDBUILD=0
if not exist ".next\BUILD_ID" set NEEDBUILD=1

if "%NEEDBUILD%"=="0" (
  powershell -NoProfile -Command "$b=(Get-Item '.next\BUILD_ID' -ErrorAction SilentlyContinue).LastWriteTime; $s=(Get-ChildItem -Path 'src','package.json','next.config.ts' -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime; if($null -eq $b -or ($null -ne $s -and $s -gt $b)){exit 1}; exit 0"
  if errorlevel 1 set NEEDBUILD=1
)

if "%NEEDBUILD%"=="1" (
  echo El codigo cambio desde el ultimo build. Recompilando...
  echo Esto tarda ~30-60s. Solo pasa cuando hay cambios.
  echo.
  call npm run build
  if errorlevel 1 (
    echo.
    echo EL BUILD FALLO. Revisa el error de arriba.
    pause
    exit /b 1
  )
  echo.
  echo Build listo.
)

echo Levantando servidor en http://localhost:3000 ...
start "TradingView Gratis - servidor" /min cmd /c "npm run start"

powershell -NoProfile -Command "for($i=0;$i -lt 80;$i++){try{$r=Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 1; exit 0}catch{Start-Sleep -Milliseconds 250}}; exit 1"

set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
  start "" "%CHROME%" --app=http://localhost:3000
) else (
  start "" http://localhost:3000
)

exit /b 0
