@echo off
cd /d "%~dp0"
echo Running self test ^(uses a separate test DB: data\selftest.db^) ...
call npm run selftest
pause
