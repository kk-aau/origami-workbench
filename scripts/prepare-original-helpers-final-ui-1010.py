from pathlib import Path
import hashlib
import json
import shutil

root=Path.cwd().resolve()
out=root/'output/original-helpers-browser-final-1010'
assert not out.exists()
out.mkdir()
prepared=[]
def prepare(source,target,replacements):
    text=source.read_text(encoding='utf8')
    for old,new in replacements:text=text.replace(old,new)
    dest=root/'scripts'/target
    assert not dest.exists()
    dest.write_text(text,encoding='utf8')
    prepared.append({'source':source.relative_to(root).as_posix(),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'prepared':dest.relative_to(root).as_posix()})

flasher=out/'flasher';flasher.mkdir()
fp=flasher.relative_to(root).as_posix()
for kind,ext in [('','browser.js'),('-download','ts')]:
    source=root/'scripts'/f'verify-original-flasher-all-labels-final{kind}-1010.{ext}'
    prepare(source,f'verify-original-helpers-flasher{kind}-1010.{ext}',[('output/original-flasher-all-labels-browser-final-1010',fp)])
for name in ['custom-3d-parameters.json','invalid-parameters.json']:
    shutil.copy2(root/'output/original-flasher-all-labels-browser-final-1010'/name,flasher/name)

woven=out/'woven-old';woven.mkdir()
wp=woven.relative_to(root).as_posix()
for source,target in [
    ('verify-original-woven-old-1010.browser.js','verify-original-helpers-woven-old-1010.browser.js'),
    ('verify-original-woven-full-h-1010.browser.js','verify-original-helpers-woven-full-h-1010.browser.js'),
    ('verify-original-woven-old-download-1010.ts','verify-original-helpers-woven-old-download-1010.ts'),
]:prepare(root/'scripts'/source,target,[('output/original-woven-old-browser-1010',wp)])

pot=out/'pot-section';pot.mkdir()
pp=pot.relative_to(root).as_posix()
base=root/'output/parallel/original-pot-cross-section-1010'
inputs=pot/'inputs';inputs.mkdir()
for name in ['standard','translated-nonmonotone','singleton','duplicate-negative','all-seven','automatic-ratio','tiny-unordered','boundary-512']:
    shutil.copy2(base/'artifacts'/f'{name}-source.json',inputs/f'{name}-source.json')
for name in ['illegal-options','empty-source','oversized-source']:
    shutil.copy2(base/'artifacts'/f'{name}.json',inputs/f'{name}.json')
prepare(base/'open-pot-section.browser.js','open-original-helpers-pot-section-1010.browser.js',[('output/playwright/pot-cross-section',pp)])
prepare(base/'verify-pot-section.browser.js','verify-original-helpers-pot-section-1010.browser.js',[
    ('output/playwright/pot-cross-section',pp),('`artifacts/','`'+pp+'/inputs/'),
    ('const checks=[],errors=[];','const bundle=await page.evaluate(()=>Array.from(document.scripts).map(s=>s.getAttribute("src")).find(s=>s?.startsWith("/assets/main-")));const checks=[],errors=[];'),
    ('actualHelperDownloadFiles:32};','actualHelperDownloadFiles:32,bundle};'),
])
prepare(base/'verify-downloaded-graphics.py','verify-original-helpers-pot-section-download-1010.py',[
    ('HERE = Path(__file__).resolve().parent','HERE = Path(__file__).resolve().parent.parent'),
    ("DOWNLOADS = HERE / 'output/playwright/pot-cross-section'",'DOWNLOADS = HERE / '+repr(pp)),
    ("(HERE / 'pot-section-independent-download-evidence.json')", "(DOWNLOADS / 'download-audit.json')"),
])
(out/'prepared-scripts.json').write_text(json.dumps({'prepared':prepared,'noProducerResultCopied':True,'copiedOnlyAuthoredInputFiles':13},indent=2),encoding='utf8')
print('Prepared final-bundle main UI checks and independent actual file readback for three integrated features; no agent results copied.')
