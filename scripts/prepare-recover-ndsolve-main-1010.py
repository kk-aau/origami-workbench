from pathlib import Path
import shutil

root=Path.cwd()
base=root/'output/parallel/original-recover-ndsolve-options-1010'
out=root/'output/original-recover-ndsolve-browser-1010'
out.mkdir(exist_ok=True)
for source,target in [('open-recover-dialog.browser.js','open-original-recover-ndsolve-1010.browser.js'),('verify-recover-steps.browser.js','verify-original-recover-ndsolve-1010.browser.js')]:
    text=(base/source).read_text(encoding='utf8').replace('output/playwright/recover-steps',str(out.resolve()).replace('\\','/'))
    text=text.replace('artifacts/',str(out.resolve()).replace('\\','/')+'/')
    (root/'scripts'/target).write_text(text,encoding='utf8')
text=(base/'verify-recover-downloads.ts').read_text(encoding='utf8').replace("'./src/app/curvedNativeSystemHelpers'","'../src/app/curvedNativeSystemHelpers'")
text=text.replace('output/playwright/recover-steps','output/original-recover-ndsolve-browser-1010')
(root/'scripts/verify-original-recover-ndsolve-download-1010.ts').write_text(text,encoding='utf8')
for name in ['wrong-goal-source.json','recover2-raw-interior-source.json']:
    shutil.copy2(base/'artifacts'/name,out/name)
print('Prepared actual main UI and readback scripts; no producer downloads copied.')
