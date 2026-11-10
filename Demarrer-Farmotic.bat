@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js est introuvable sur ce PC.
  echo   Installez Node.js 18 ou plus recent : https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo   Installation des dependances...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   L'installation a echoue. Verifiez votre connexion Internet.
    pause
    exit /b 1
  )
)

if not exist "build\farmotic.cjs" goto :compiler
if not exist "build\public\index.html" goto :compiler
goto :lancer

:compiler
echo   Compilation de Farmotic...
call npm run build
if errorlevel 1 (
  echo.
  echo   La compilation a echoue.
  pause
  exit /b 1
)

:lancer
node build\farmotic.cjs %*
if errorlevel 1 pause
endlocal
