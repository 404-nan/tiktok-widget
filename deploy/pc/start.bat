@echo off
chcp 65001 >nul
rem 自分の PC で動かして、Cloudflare Tunnel で https の URL を付ける（Windows 用）。
rem このファイルをダブルクリックするだけ。
cd /d "%~dp0\..\.."

where node >nul 2>nul || (echo Node.js が入っていません。次を実行してから、もう一度このファイルを開いてください: & echo   winget install OpenJS.NodeJS.LTS & pause & exit /b 1)
where cloudflared >nul 2>nul || (echo cloudflared が入っていません。次を実行してから、もう一度このファイルを開いてください: & echo   winget install Cloudflare.cloudflared & pause & exit /b 1)

if not exist node_modules (
  echo 初回の準備をしています（数分かかります）...
  call npm ci --omit=dev || (pause & exit /b 1)
)

set TW_HOSTED=1
set HOST=127.0.0.1
set PORT=3939

rem 自分のドメインの Tunnel を使うなら、先に set TUNNEL_TOKEN=... してから開く
start "TikTok ウィジェット（サーバー）" cmd /k node server.js
timeout /t 3 >nul
if defined TUNNEL_TOKEN (
  start "Cloudflare Tunnel" cmd /k cloudflared tunnel run --token %TUNNEL_TOKEN%
) else (
  echo.
  echo ★ 下の枠に出る https://〇〇.trycloudflare.com が公開 URL です。管理画面は、その後ろに /admin/ を付けます。
  echo ★ 合言葉は data\admin-token.txt に入っています。
  echo.
  cloudflared tunnel --url http://127.0.0.1:3939
)
