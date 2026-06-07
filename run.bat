@echo off
REM ============================================================
REM  AI News Digest - runner
REM  Dipakai oleh Windows Task Scheduler, atau klik 2x manual.
REM  Output program ditulis ke output\daily.md
REM  Log tiap run ditambahkan ke output\run.log
REM ============================================================

cd /d "C:\Users\zerotuone\Documents\scrap\ai-news-digest"

echo. >> "output\run.log"
echo ===== Run: %DATE% %TIME% ===== >> "output\run.log"

"C:\Program Files\nodejs\node.exe" src\main.js >> "output\run.log" 2>&1

echo Selesai. Lihat output\daily.md
