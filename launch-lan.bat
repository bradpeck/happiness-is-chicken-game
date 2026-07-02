@echo off
rem Launch Happiness Is Chicken! on the local network (Windows).
rem Serves this folder on 0.0.0.0:8080 so any device on the same Wi-Fi can play.
setlocal
cd /d "%~dp0"
set PORT=8080

echo.
echo   Happiness Is Chicken! is starting on port %PORT%
echo.
echo   On this computer:   http://localhost:%PORT%/happiness-is-chicken.html
echo.
echo   On other devices use your PC's IPv4 address, shown below:
ipconfig | findstr /i "IPv4"
echo.
echo   Open:  http://YOUR-IPV4-ADDRESS:%PORT%/happiness-is-chicken.html
echo   Everyone must be on the same Wi-Fi / home network.
echo   Press Ctrl+C to stop the game server.
echo.

where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server %PORT% --bind 0.0.0.0
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT% --bind 0.0.0.0
  goto :eof
)
where npx >nul 2>nul
if %errorlevel%==0 (
  npx --yes http-server -a 0.0.0.0 -p %PORT% -c-1 .
  goto :eof
)

echo   Could not find Python 3 or Node.js.
echo   Install Python 3 from https://www.python.org (tick "Add to PATH"), then run this again.
pause
