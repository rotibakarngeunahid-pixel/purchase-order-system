@echo off
echo Menutup proses lama...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Menjalankan Server dan Client...
start "Server - Roti Bakar Ngeunah" cmd /k "cd /d "%~dp0server" && npm start"
timeout /t 3 /nobreak >nul
start "Client - Roti Bakar Ngeunah" cmd /k "cd /d "%~dp0client" && npm run dev"

echo Selesai! Buka browser ke: http://localhost:5173
