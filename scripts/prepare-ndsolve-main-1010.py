from pathlib import Path
import shutil

root = Path.cwd()
base = root / 'output/parallel/original-ndsolve-options-1010'
out = root / 'output/original-ndsolve-browser-1010'
out.mkdir(exist_ok=True)
prefix = str(out.resolve()).replace('\\','/') + '/'
for source, target in [('open.browser.js','open-original-ndsolve-1010.browser.js'), ('verify.browser.js','verify-original-ndsolve-1010.browser.js')]:
    text = (base / source).read_text(encoding='utf8').replace('evidence/', prefix)
    (root / 'scripts' / target).write_text(text, encoding='utf8')
for source in (base / 'evidence').glob('*-input.json'):
    shutil.copy2(source, out / source.name)
text = (base / 'verify-downloads.ts').read_text(encoding='utf8')
text = text.replace("'./src/app/curvedNativeGenericDarboux'", "'../src/app/curvedNativeGenericDarboux'").replace('evidence/', 'output/original-ndsolve-browser-1010/')
(root / 'scripts/verify-original-ndsolve-download-1010.ts').write_text(text, encoding='utf8')
print('Prepared three scripts and literal inputs; no producer results copied.')
