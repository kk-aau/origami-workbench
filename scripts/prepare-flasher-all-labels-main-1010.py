from pathlib import Path
import shutil
root=Path.cwd()
base=root/'output/parallel/original-source-helper-1010'
out=root/'output/original-flasher-all-labels-browser-1010'
out.mkdir(exist_ok=True)
text=(base/'verify.browser.js').read_text(encoding='utf8').replace('output/parallel/original-source-helper-1010','output/original-flasher-all-labels-browser-1010')
(root/'scripts/verify-original-flasher-all-labels-1010.browser.js').write_text(text,encoding='utf8')
text=(base/'audit_downloads.ts').read_text(encoding='utf8').replace("'./work/src/","'../src/")
text=text.replace('output/parallel/original-source-helper-1010','output/original-flasher-all-labels-browser-1010').replace('browser-tests-caption.log','browser-tests.log').replace('download-audit-caption.json','download-audit.json')
text=text.replace('`${out}/work/tests/fixtures/flasher-all-vertices-labels-20261010.json`',"'tests/fixtures/flasher-all-vertices-labels-20261010.json'")
(root/'scripts/verify-original-flasher-all-labels-download-1010.ts').write_text(text,encoding='utf8')
for name in ['custom-3d-parameters.json','invalid-parameters.json']:shutil.copy2(base/name,out/name)
print('Prepared actual main UI and independent download checks; only two authored input files copied, no producer results.')
