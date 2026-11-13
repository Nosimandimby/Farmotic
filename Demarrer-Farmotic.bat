@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Python est introuvable sur ce PC.
  echo   Installez Python 3.10 ou plus recent : https://www.python.org/downloads/
  echo   ^(cochez "Add Python to PATH" pendant l'installation^)
  echo.
  pause
  exit /b 1
)

python "%~dp0lancer.py" %*
if errorlevel 1 pause
endlocal
