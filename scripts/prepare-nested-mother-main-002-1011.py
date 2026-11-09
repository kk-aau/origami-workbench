from pathlib import Path
import json,hashlib
root=Path.cwd().resolve();base=root/'output/playwright/nested-mother-main-1011';out=base/'downloads-002'
assert not out.exists();out.mkdir()
text=(base/'verify-main.browser.js').read_text(encoding='utf8')
text=text.replace("out='D:/codex/折纸工具/workbench/output/playwright/nested-mother-main-1011'","out='D:/codex/折纸工具/workbench/output/playwright/nested-mother-main-1011/downloads-002'")
assert ".selectOption('none')" in text;text=text.replace(".selectOption('none')",".selectOption('legacy')")
(out/'verify-main.browser.js').write_text(text,encoding='utf8')
config=json.loads((base/'config.json').read_text(encoding='utf8'));config['outputDir']=(base/'cli-002').as_posix()
(out/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
(out/'before.json').write_text(json.dumps({'verified':True,'changedOnly':'test selector: paper option legacy, not nonexistent none','firstFailure':'../browser-checks.json','sourceUnchanged':True,'bundle':'/assets/main-BDbQ7c0F.js','scriptSHA256':hashlib.sha256((out/'verify-main.browser.js').read_bytes()).hexdigest()},ensure_ascii=False,indent=2),encoding='utf8')
print('Fresh actual-button run prepared; failed first script/report/downloads retained.')
