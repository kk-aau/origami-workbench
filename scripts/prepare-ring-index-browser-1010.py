from pathlib import Path
import json
root=Path.cwd();out=root/'output/original-ring-browser-1010';out.mkdir(exist_ok=True)
fixture=json.loads((root/'tests/fixtures/ring-index-conditions-20261010.json').read_text(encoding='utf8'))
script=(root/'scripts/verify-original-ring-index-1010.browser.template.js').read_text(encoding='utf8')
assert script.count('__CASES__')==1
script=script.replace('__CASES__',json.dumps([{'name':c['name'],'params':c['params']} for c in fixture['cases']],ensure_ascii=False))
(root/'scripts/verify-original-ring-index-1010.browser.js').write_text(script,encoding='utf8')
print('Prepared six real original ring inputs for main-App construction, source retention, adoption and export.')
