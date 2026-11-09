from pathlib import Path
import json,hashlib
root=Path.cwd();base=root/'output/playwright/original-constructible-final-1010'
assert not base.exists()
base.mkdir()
for name in ['min-total','flasher','gore']:(base/name).mkdir()
records=[]
for original,target in [
 ('scripts/verify-min-total-pleat-main-1010.browser.js','scripts/verify-final-min-total-pleat-1010.browser.js'),
 ('scripts/verify-original-flasher-rotation-main-1010.browser.js','scripts/verify-final-flasher-rotation-1010.browser.js'),
 ('scripts/verify-original-flasher-rotation-download-1010.ts','scripts/verify-final-flasher-rotation-download-1010.ts'),
]:
 source=root/original;destination=root/target;assert not destination.exists()
 text=source.read_text(encoding='utf8').replace('original-min-budget-final-1010','original-constructible-final-1010')
 destination.write_text(text,encoding='utf8',newline='\n')
 records.append(dict(original=original,target=target,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),afterSha256=hashlib.sha256(destination.read_bytes()).hexdigest()))
 (base/'preparation.json').write_text(json.dumps(dict(verified=True,records=records),ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(prepared=len(records),out=str(base))))
