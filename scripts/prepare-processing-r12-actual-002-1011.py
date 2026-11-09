from pathlib import Path
import json,re,shutil
root=Path.cwd().resolve();folder=root/'output/playwright/processing-r12-main-1011/downloads-002';folder.mkdir(parents=True,exist_ok=False)
shutil.copy2(root/'output/playwright/processing-hover-main-1011/downloads-001/input-fixture.json',folder/'input-fixture.json')
bundle=re.search(r'src="([^"]+\.js)"',(root/'dist/index.html').read_text(encoding='utf8')).group(1)
template=root/'scripts/processing-r12-actual-1011.browser.js'
text=template.read_text(encoding='utf8').replace('__OUTPUT__',folder.as_posix()).replace('__BUNDLE__',bundle)
(folder/'verify-main.browser.js').write_text(text,encoding='utf8')
(folder/'config.json').write_text(json.dumps({'origin':'http://127.0.0.1:8885','bundle':bundle,'controlledInput':'input-fixture.json','actualUserExport':False},indent=2),encoding='utf8')
print(folder)
