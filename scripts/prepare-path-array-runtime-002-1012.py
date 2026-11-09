from pathlib import Path
import re,json
root=Path.cwd().resolve();folder=root/'output/playwright/path-array-main-1012';downloads=folder/'downloads-002';assert not downloads.exists();downloads.mkdir()
bundle=re.search(r'src="([^"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8'))[1]
(downloads/'verify-main.browser.js').write_text((root/'scripts/path-array-main-1012.browser.js').read_text(encoding='utf8').replace('__OUTPUT__',downloads.as_posix()).replace('__BUNDLE__',bundle),encoding='utf8')
config=json.loads((folder/'cli-config.json').read_text(encoding='utf8'));config['outputDir']=str(folder/'cli-002');(folder/'cli-config-002.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
ps=(root/'scripts/start-path-array-main-1012.ps1').read_text(encoding='utf-8-sig').replace('path-array-main-server-1012','path-array-main-server-002-1012').replace('start-path-array-main-1012.mjs','start-path-array-main-002-1012.mjs')
(root/'scripts/start-path-array-main-002-1012.ps1').write_text(ps,encoding='utf-8-sig')
print(bundle,downloads)
