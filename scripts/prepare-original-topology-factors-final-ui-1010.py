from pathlib import Path
import hashlib
import json
import subprocess

root=Path.cwd().resolve()
out=root/'output/playwright/original-topology-factors-final-1010'
out.mkdir(parents=True,exist_ok=False)
records=[]
def prepare(source,target,replacements):
    text=source.read_text(encoding='utf8')
    for old,new in replacements:
        assert old in text,(source,old)
        text=text.replace(old,new)
    dest=root/'scripts'/target
    with dest.open('x',encoding='utf8') as stream:stream.write(text)
    records.append({'source':source.relative_to(root).as_posix(),
                    'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                    'prepared':dest.relative_to(root).as_posix()})

folder=out/'flasher';folder.mkdir();prefix=folder.relative_to(root).as_posix()
for source,target in [
    ('verify-original-flasher-factors-1010.browser.js','verify-final-original-flasher-factors-1010.browser.js'),
    ('verify-original-flasher-factors-download-1010.ts','verify-final-original-flasher-factors-download-1010.ts')]:
    prepare(root/'scripts'/source,target,[('output/playwright/flasher-factors-1010',prefix)])

folder=out/'dual';folder.mkdir();prefix=folder.relative_to(root).as_posix()
base=root/'output/parallel/original-dual-faces-1010'
prepare(base/'verify.browser.js','verify-final-original-dual-faces-1010.browser.js',[
    ('output/playwright/',prefix+'/'),('evidence/',prefix+'/'),
    ('DualFaces1010-','DualFacesFinal1010-'),
    ('await page.setViewportSize({width:1360,height:900});',
     "await page.setViewportSize({width:1360,height:900});await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();"),
    ('const report={verified:true,passed:checks.length,checks,errors};',
     'const report={verified:true,passed:checks.length,checks,errors,bundle:await page.locator(\'script[type="module"]\').getAttribute(\'src\')};')])
prepare(base/'verify-reopen.browser.js','verify-final-original-dual-faces-reopen-1010.browser.js',[
    ('evidence/',prefix+'/'),('DualFaces1010-','DualFacesFinal1010-')])
prepare(base/'verify-downloads.ts','verify-final-original-dual-faces-download-1010.ts',[
    ("'./src/","'../src/"),('evidence/',prefix+'/'),
    ('data/projects/','output/original-topology-factors-server-1010/projects/')])

graph=root/'output/parallel/courteous-graph-root-review-1010/root-final-8862'
subprocess.run([str(root/'.venv/Scripts/python.exe'),'-B',
    'output/parallel/courteous-graph-root-review-1010/scripts/prepare-acceptance.py',
    '--base-url','http://127.0.0.1:8862','--run-dir',str(graph)],check=True)
for file in (graph/'code').iterdir():
    text=file.read_text(encoding='utf8')
    old="if(new URL(page.url()).origin!==new URL(BASE_URL).origin)"
    text=text.replace(old,"if(!(await page.evaluate(base=>location.origin===new URL(base).origin,BASE_URL)))")
    text=text.replace(' await page.goto(BASE_URL);'," await page.on('dialog',dialog=>dialog.accept());await page.goto(BASE_URL);")
    file.write_text(text,encoding='utf8')
with (out/'prepared-scripts.json').open('x',encoding='utf8') as stream:
    json.dump({'noProducerResultsCopied':True,'records':records,'graphRun':str(graph),
               'graphRuntimeFixes':['URL only evaluated in browser context','beforeunload accepted in owned session']},stream,indent=2)
print('Prepared new final-bundle UI audits; all earlier attempts retained.')
