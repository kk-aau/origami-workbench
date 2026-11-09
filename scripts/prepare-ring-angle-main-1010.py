from pathlib import Path
import json

root=Path.cwd()
base=root/'output/parallel/original-ring-angular-if-1010'
out=root/'output/original-ring-angle-browser-1010'
out.mkdir(exist_ok=True)
fixture=json.loads((root/'tests/fixtures/ring-angular-if-20261010.json').read_text(encoding='utf8'))
cases=[{'name':c['name']+'-if','params':c['params']} for c in fixture['cases']]
cases += [{'name':c['name']+'-piecewise','params':c['piecewiseParameters']} for c in fixture['cases']]
text=(base/'verify_ring_angular.browser.template.js').read_text(encoding='utf8')
assert text.count('__CASES__')==1
text=text.replace('await rejected;await ready();check(', 'await rejected;await page.waitForFunction(()=>document.querySelector(\'.tess-preview-status\')?.textContent===\'参数需调整\');check(')
(root/'scripts/verify-original-ring-angle-1010.browser.js').write_text(text.replace('__CASES__',json.dumps(cases,ensure_ascii=False)),encoding='utf8')
text=(base/'verify_ring_angular_downloads.ts').read_text(encoding='utf8')
text=text.replace("'./src/", "'../src/")
text=text.replace("const here=path.dirname(fileURLToPath(import.meta.url))", "const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')")
(root/'scripts/verify-original-ring-angle-download-1010.ts').write_text(text,encoding='utf8')
print('Prepared actual main UI test and download readback; no producer output copied.')
