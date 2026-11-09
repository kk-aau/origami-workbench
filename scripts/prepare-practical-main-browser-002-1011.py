from pathlib import Path
import json,hashlib
root=Path.cwd().resolve();base=root/'output/playwright/practical-construction-main-1011';old=base/'downloads-001';out=base/'downloads-002';assert not out.exists();out.mkdir()
text=(old/'verify-main.browser.js').read_text(encoding='utf8').replace(old.as_posix(),out.as_posix())
a='const layout=async(k,name)=>{const row='
b="const layout=async(k,name)=>{await page.waitForFunction(id=>{const d=document.querySelector('[data-testid=\"'+id+'\"]')?.closest('dialog'),texts=[...(d?.querySelectorAll('svg text')??[])];return texts.length&&texts.every(t=>{const m=t.getScreenCTM();return m&&parseFloat(getComputedStyle(t).fontSize)*Math.hypot(m.a,m.b)>=12;});},ids[k]);const row="
assert text.count(a)==1;text=text.replace(a,b)
(out/'verify-main.browser.js').write_text(text,encoding='utf8',newline='\n')
config=json.loads((old/'config.json').read_text(encoding='utf8'));config['outputDir']=(base/'cli-002').as_posix();(out/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
(out/'before.json').write_text(json.dumps({'bundle':json.loads((root/'output/practical-construction-bundle-002-1011.json').read_text(encoding='utf8'))['bundle'],'previousFailure':'../downloads-001/browser-checks.json','reason':'First layout reader sampled initial font state immediately after remount, before ResizeObserver settled. Actual same DOM independently remeasured correct; wait for bounded settled measurement, no product/source change.','scriptSHA256':hashlib.sha256((out/'verify-main.browser.js').read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared second real-App run; preserved first timing observation, same product bundle.')
