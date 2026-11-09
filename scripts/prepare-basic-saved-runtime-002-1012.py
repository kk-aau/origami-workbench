from pathlib import Path
import json, hashlib

root=Path.cwd().resolve()
folder=root/'output/playwright/basic-saved-main-1012'
downloads=folder/'downloads-002'
assert not downloads.exists()
downloads.mkdir()
original=folder/'basic-saved-main-001.browser.js'
text=original.read_text(encoding='utf8').replace('downloads-001','downloads-002')
needle="await open('basic');await slider('六角顶点仰角 θ / °滑条'"
assert text.count(needle)==1
text=text.replace(needle,"await open('basic');await selectModel('hexagon-vertex');await slider('六角顶点仰角 θ / °滑条'")
target=folder/'basic-saved-main-002.browser.js'
target.write_text(text,encoding='utf8')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(folder/'browser-adjustments-002.json').write_text(json.dumps(dict(original=str(original),originalSHA256=sha(original),adjusted=str(target),adjustedSHA256=sha(target),reason='The product intentionally starts with cube-box; explicitly select hexagon before the real theta slider cancellation test',productionChanged=False,oldCandidateFreezeChanged=False),ensure_ascii=False,indent=2),encoding='utf8')
config=json.loads((folder/'cli-config-001.json').read_text(encoding='utf8'))
config['outputDir']=str(folder/'cli-002')
(folder/'cli-config-002.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
js=(root/'scripts/start-basic-saved-main-001-1012.mjs').read_text(encoding='utf8').replace('basic-saved-main-server-001-1012','basic-saved-main-server-002-1012').replace('basic-saved-main-pid-001-1012','basic-saved-main-pid-002-1012')
(root/'scripts/start-basic-saved-main-002-1012.mjs').write_text(js,encoding='utf8')
ps=(root/'scripts/start-basic-saved-main-001-1012.ps1').read_text(encoding='utf-8-sig').replace('001-1012','002-1012')
(root/'scripts/start-basic-saved-main-002-1012.ps1').write_text(ps,encoding='utf-8-sig')
