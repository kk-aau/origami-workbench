from pathlib import Path
import shutil

root = Path.cwd()
base = root / 'output/parallel/original-linked-first3d-ndsolve-1010'
out = root / 'output/original-linked-first3d-browser-1010'
out.mkdir(exist_ok=True)
for source, target in [('open-linked-first3d.browser.js', 'open-original-linked-first3d-1010.browser.js'), ('verify-linked-first3d.browser.js', 'verify-original-linked-first3d-1010.browser.js')]:
    text = (base / source).read_text(encoding='utf8').replace('output/playwright/linked-first3d', str(out.resolve()).replace('\\', '/'))
    text = text.replace('artifacts/', str(out.resolve()).replace('\\', '/') + '/')
    (root / 'scripts' / target).write_text(text, encoding='utf8')
text = (base / 'verify-linked-downloads.ts').read_text(encoding='utf8').replace("'./src/", "'../src/")
text = text.replace('output/playwright/linked-first3d', 'output/original-linked-first3d-browser-1010')
(root / 'scripts/verify-original-linked-first3d-download-1010.ts').write_text(text, encoding='utf8')
shutil.copy2(base / 'artifacts/independent-raw-prefix-2-smallstep-source.json', out)
print('Prepared real main UI/readback scripts; only one authored source input copied, no producer results.')
