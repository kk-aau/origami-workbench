from pathlib import Path
import hashlib,json,shutil
root=Path.cwd();out=root/'output/playwright/original-constructible-final-1010/discrete'
original=root/'scripts/verify-discrete-main-final-v2-1011.browser.js'
target=root/'scripts/verify-discrete-main-final-v3-1011.browser.js'
assert not target.exists()
source=original.read_text(encoding='utf8')
old="await button('工程库').click();await page.locator('.project-list button').filter({hasText:name}).first().click();await savedName(name);"
new="await button('工程库').click();const opening=page.waitForResponse(r=>r.url().endsWith('/api/projects/'+receipt.id)&&r.request().method()==='GET');await page.locator('.project-list button').filter({hasText:name}).first().click();const reopened=await opening;if(!reopened.ok())throw Error(kind+'实际保存UUID重开失败');await savedName(name);await page.locator('.save-dot.saved').waitFor();"
assert source.count(old)==1
target.write_text(source.replace(old,new),encoding='utf8')
failed=out/'failure-library-wait-1011';assert not failed.exists();failed.mkdir()
runtime=[p for p in out.iterdir() if p.is_file() and (p.name in ['browser-checks.json','failure.png'] or p.name.startswith(('invalid-','preset-sentinel-','reset-','base-','edited-','ordinary-')))]
for p in runtime:
    assert p.resolve().is_relative_to(root.resolve())
    shutil.move(str(p),str(failed/p.name))
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record=dict(verified=True,original=original.relative_to(root).as_posix(),originalSha256=digest(original),retry=target.relative_to(root).as_posix(),retrySha256=digest(target),
 reason='The imported file already had the saved project name. Name-only waiting resolved before asynchronous library GET completed. Await the exact saved UUID response and saved indicator; preserve actual library reopening assertion.',
 failedFilesPreserved=len(runtime),productionChanged=False)
(root/'output/original-constructible-discrete-library-wait-audit-1011.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,failedFilesPreserved=len(runtime))))
