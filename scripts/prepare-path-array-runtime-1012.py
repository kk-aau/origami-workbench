from pathlib import Path
import json,re
root=Path.cwd().resolve();folder=root/'output/playwright/path-array-main-1012';assert not folder.exists();folder.mkdir(parents=True)
downloads=folder/'downloads-001';downloads.mkdir()
bundle=re.search(r'src="([^"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8'))[1]
text=(root/'scripts/path-array-main-1012.browser.js').read_text(encoding='utf8').replace('__OUTPUT__',downloads.as_posix()).replace('__BUNDLE__',bundle)
(downloads/'verify-main.browser.js').write_text(text,encoding='utf8')
(folder/'cli-config.json').write_text(json.dumps(dict(allowUnrestrictedFileAccess=True,browser=dict(browserName='chromium',launchOptions=dict(channel='chrome',args=['--disable-gpu'])),outputDir=str(folder/'cli')),ensure_ascii=False,indent=2),encoding='utf8')
ps='''$ErrorActionPreference = 'Stop'
$env:ZHEZHI_PORT = '8886'
$env:ZHEZHI_DATA_DIR = 'D:/codex/折纸工具/workbench/output/path-array-main-server-1012'
$pathArrayServer = Start-Process -FilePath 'D:/Program Files/nodejs/node.exe' -ArgumentList @('scripts/start-path-array-main-1012.mjs') -WorkingDirectory 'D:/codex/折纸工具/workbench' -WindowStyle Hidden -RedirectStandardOutput 'D:/codex/折纸工具/workbench/output/path-array-main-server-1012.log' -RedirectStandardError 'D:/codex/折纸工具/workbench/output/path-array-main-server-1012.err.log' -PassThru
$pathArrayServer.Id
'''
(root/'scripts/start-path-array-main-1012.ps1').write_text(ps,encoding='utf-8-sig')
print(downloads)
