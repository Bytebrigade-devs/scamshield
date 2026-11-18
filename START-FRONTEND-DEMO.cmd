@echo off
cd /d "%~dp0"
set "NEXT_PUBLIC_M2_MODE=demo"
echo ScamShield frontend demo: http://localhost:3000/pricing
echo Keep this window open during your presentation.
call npm run dev -- --hostname 127.0.0.1 --port 3000
pause
