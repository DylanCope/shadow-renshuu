@echo off
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set PATH=C:\Users\dylan\miniconda3\Library\bin;C:\Users\dylan\miniconda3\Scripts;C:\Users\dylan\miniconda3;%PATH%
cd /d "%~dp0"

:: Kill any process already on port 8000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 2^>nul') do (
    echo Killing existing process on port 8000 ^(PID %%a^)...
    taskkill /PID %%a /F >nul 2>&1
)

C:\Users\dylan\miniconda3\python.exe -m uvicorn main:app --reload --reload-dir . --port 8000
