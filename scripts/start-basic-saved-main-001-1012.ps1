$ErrorActionPreference = 'Stop'
$env:ZHEZHI_PORT = '8888'
$env:ZHEZHI_DATA_DIR = 'D:/codex/折纸工具/workbench/output/basic-saved-main-server-001-1012'
$pathArrayServer = Start-Process -FilePath 'D:/Program Files/nodejs/node.exe' -ArgumentList @('scripts/start-basic-saved-main-001-1012.mjs') -WorkingDirectory 'D:/codex/折纸工具/workbench' -WindowStyle Hidden -RedirectStandardOutput 'D:/codex/折纸工具/workbench/output/basic-saved-main-server-001-1012.log' -RedirectStandardError 'D:/codex/折纸工具/workbench/output/basic-saved-main-server-001-1012.err.log' -PassThru
$pathArrayServer.Id
