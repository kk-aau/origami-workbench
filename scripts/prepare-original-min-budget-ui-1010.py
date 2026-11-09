from pathlib import Path
import hashlib
import json

root=Path.cwd().resolve()
out=root/'output/playwright/original-min-budget-final-1010'
out.mkdir(parents=True,exist_ok=False)
for name in ('min-total','flasher'):(out/name).mkdir()
source=root/'scripts/verify-original-flasher-factors-1010.browser.js'
text=source.read_text(encoding='utf8')
old_targets="const targets=[{name:'r1-h4-m4',r:1,h:4,m:4,counts:[40,104,65]},{name:'r5-h1-m4',r:5,h:1,m:4,counts:[144,384,241]},{name:'r1-h1-m9',r:1,h:1,m:9,counts:[36,72,37]}];"
new_targets="const targets=[{name:'r1-h1-m17',r:1,h:1,m:17,counts:[68,136,69]},{name:'r1-h1-m149',r:1,h:1,m:149,counts:[596,1192,597]}];"
start=text.index("  if(t.name==='r1-h4-m4')")
end=text.index('  const response=await pending;',start)
text=text[:start]+"  if(t.m===17){await change('环数 r',1,{family:'flasher',rings:1,heightOrder:2});await change('高度阶 h',1,{family:'flasher',rings:1,heightOrder:1});}\n  pending=change('旋转阶 m',t.m,{family:'flasher',rings:1,heightOrder:1,rotationalOrder:t.m});\n"+text[end:]
replacements=[
    (old_targets,new_targets),('output/playwright/flasher-factors-1010',out.relative_to(root).as_posix()+'/flasher'),
    ("field('旋转阶 m').getAttribute('max')==='16'","field('旋转阶 m').getAttribute('max')==='24'"),
    ("field('旋转阶 m').fill('17')","field('旋转阶 m').fill('150')"),
    ("超有限域 m17","超有限域 m150"),("field('旋转阶 m').inputValue()==='9'","field('旋转阶 m').inputValue()==='149'"),
    ('rotationalOrder:17','rotationalOrder:150'),
]
for old,new in replacements:
    assert old in text,old
    text=text.replace(old,new)
target=root/'scripts/verify-original-flasher-rotation-main-1010.browser.js'
with target.open('x',encoding='utf8') as stream:stream.write(text)
audit_source=root/'scripts/verify-original-flasher-factors-download-1010.ts'
audit=audit_source.read_text(encoding='utf8').replace('output/playwright/flasher-factors-1010',out.relative_to(root).as_posix()+'/flasher')
assert 'ui.downloads.length,24' in audit
audit=audit.replace('ui.downloads.length,24','ui.downloads.length,16')
with (root/'scripts/verify-original-flasher-rotation-download-1010.ts').open('x',encoding='utf8') as stream:stream.write(audit)
with (out/'prepared-scripts.json').open('x',encoding='utf8') as stream:
    json.dump({'noProducerResultsCopied':True,'source':source.relative_to(root).as_posix(),
               'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
               'prepared':target.relative_to(root).as_posix(),'expectedOrdinaryAndOptimizedFiles':16},stream,indent=2)
print('Prepared fresh root high-rotation Flasher UI and file readback audits.')
