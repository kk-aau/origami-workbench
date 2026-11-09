$ErrorActionPreference = 'Stop'
$env:ZHEZHI_PORT = '8890'
$env:ZHEZHI_DATA_DIR = 'D:/codex/折纸工具/workbench/output/strain-tq-main-server-003-1012'
$ownServer = Start-Process -FilePath 'D:/Program Files/nodejs/node.exe' -ArgumentList @('scripts/start-strain-tq-main-003-1012.mjs') -WorkingDirectory 'D:/codex/折纸工具/workbench' -WindowStyle Hidden -RedirectStandardOutput 'D:/codex/折纸工具/workbench/output/strain-tq-main-server-003-1012.log' -RedirectStandardError 'D:/codex/折纸工具/workbench/output/strain-tq-main-server-003-1012.err.log' -PassThru
$ownServer.Id
