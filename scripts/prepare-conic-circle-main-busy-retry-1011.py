from pathlib import Path
import hashlib,json
root=Path.cwd().resolve()
file=root/'output/playwright/original-conic-circle-main-1011/downloads-002/verify-main.browser.js'
before=file.read_text(encoding='utf8')
old='r=>sourceMatch(r,predicate),{timeout:90000}'
assert before.count(old)==1
after=before.replace(old,'r=>r.status()!==429&&sourceMatch(r,predicate),{timeout:90000}')
file.write_text(after,encoding='utf8')
record=root/'output/original-conic-circle-main-busy-retry-1011.json'
assert not record.exists()
record.write_text(json.dumps(dict(script=file.relative_to(root).as_posix(),beforeSHA256=hashlib.sha256(before.encode()).hexdigest(),afterSHA256=hashlib.sha256(after.encode()).hexdigest(),reason='Initial background tessellation owns the single native worker. Existing production retries 429 and returned 200; browser assertion must wait for the non-busy result, retaining other HTTP failures.',productionChanged=False,failedRun='output/playwright/original-conic-circle-main-1011/downloads-001'),ensure_ascii=False,indent=2),encoding='utf8')
