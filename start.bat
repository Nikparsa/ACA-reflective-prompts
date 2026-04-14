@echo off
echo ========================================
echo    ACA - Automated Code Assessment
echo ========================================
echo.

echo Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)
echo Node.js found.

echo.
echo Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python not found. Please install Python first.
    pause
    exit /b 1
)
echo Python found.

echo.
echo Installing dependencies...
echo Installing backend dependencies...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install backend dependencies
    pause
    exit /b 1
)

echo Installing frontend dependencies...
cd ../frontend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install frontend dependencies
    pause
    exit /b 1
)

echo Building frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Failed to build frontend
    pause
    exit /b 1
)

echo Setting up Python virtual environment for runner...
cd ../runner
if not exist .venv (
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
)

echo Installing Python dependencies inside virtual environment...
call .venv\Scripts\python.exe -m pip install --upgrade pip >nul
call .venv\Scripts\python.exe -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo    All dependencies installed!
echo ========================================
echo.
echo Starting services...
echo.

start "ACA Backend" cmd /k "cd backend && node src/index.js"
timeout /t 3 /nobreak >nul

start "ACA Runner" cmd /k "cd runner && call .venv\Scripts\activate && python runner.py"
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo    Services Started!
echo ========================================
echo.
echo Frontend: http://localhost:3000
echo Backend API: http://localhost:3000/api
echo Runner API: http://localhost:5001/health
echo.
echo Press any key to exit...
pause >nul
