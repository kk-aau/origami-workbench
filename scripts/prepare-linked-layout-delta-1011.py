from pathlib import Path
import json,hashlib,shutil,difflib
root=Path.cwd().resolve();base=root/'output/parallel/linked-layout-delta-root-1011';assert not base.exists();base.mkdir()
name='src/components/LinkedBandsPlanarCP4086Dialog.css';source=root/name;before=source.read_text(encoding='utf8');text=before
for a,b in [
 ('padding:17px 20px 10px;background:#f4f7f5','padding:14px 20px 10px;background:#f4f7f5'),
 ('.linked4086-intro h3{font-size:22px;line-height:1.25;margin:12px 0 7px}', '.linked4086-intro h3{clear:both;font-size:20px;line-height:1.25;margin:8px 0 7px}'),
 ('margin:0 0 14px}', 'margin:0 0 10px}'),
 ('margin:10px 0 0}', 'margin:8px 0 0}')]:
 assert text.count(a)==1,(a,text.count(a));text=text.replace(a,b)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
saved=base/'before'/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,saved)
target=base/'files'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text,encoding='utf8',newline='\n')
p=base/'layout.patch';p.write_text(''.join(difflib.unified_diff(before.splitlines(keepends=True),text.splitlines(keepends=True),fromfile='a/'+name,tofile='b/'+name)),encoding='utf8',newline='\n')
(base/'manifest.json').write_text(json.dumps({'files':[{'target':name,'baselineSha256':sha(source),'sha256':sha(target),'source':str(target.resolve()),'kind':'modified'}],'patchSha256':sha(p),'reason':'Actual 1366x768 screenshot showed final scope note partially behind footer. Clear floated intro title and tighten spacing; preserve all source text, fields and logic.','observedScreenshot':'output/playwright/practical-construction-main-1011/downloads-002/linked-four.png'},ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared one CSS-only layout fix; actual prior screenshot preserved.')
