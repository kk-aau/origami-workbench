from pathlib import Path
import hashlib,json
root=Path.cwd().resolve();base=root/'output/original-arrays-main-1011'
out=root/'output/playwright/original-arrays-main-1011/downloads-002';assert not out.exists();out.mkdir(parents=True)
bundle=json.loads((root/'output/original-arrays-bundle-1011.json').read_text(encoding='utf-8'))
text=(base/'verify-main.template-002.js').read_text(encoding='utf-8')
for key,value in {'__BUNDLE__':bundle['bundle'],'__OUTPUT__':out.as_posix(),'__RUN_ID__':'originalarrays1011r2'}.items():text=text.replace(key,json.dumps(value,ensure_ascii=False))
script=out/'verify-main.browser.js';script.write_text(text,encoding='utf-8')
config={'allowUnrestrictedFileAccess':True,'browser':{'browserName':'chromium','launchOptions':{'channel':'chrome','args':['--disable-gpu']}},'outputDir':(out.parent/'cli-output-002').as_posix()}
with (base/'playwright-config-002.json').open('x',encoding='utf-8') as f:json.dump(config,f,ensure_ascii=False,indent=2)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record={'verified':True,'bundle':bundle['bundle'],'dataDirectory':(root/'output/original-arrays-main-server-1011').as_posix(),
        'scriptSHA256':sha(script),'templateSHA256':sha(base/'verify-main.template-002.js'),'productionWritten':False,
        'integration':json.loads((root/'output/parallel/original-arrays-root-delivery-integrated-1010.json').read_text(encoding='utf-8'))}
with (out/'before-guard.json').open('x',encoding='utf-8') as f:json.dump(record,f,ensure_ascii=False,indent=2)
print(json.dumps({'prepared':True,'bundle':bundle['bundle'],'output':out.as_posix()}))
