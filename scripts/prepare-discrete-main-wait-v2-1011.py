from pathlib import Path
import hashlib,json
root=Path.cwd()
original=root/'output/playwright/original-constructible-final-1010/discrete/verify-main.browser.js'
target=root/'scripts/verify-discrete-main-final-v2-1011.browser.js'
assert not target.exists()
source=original.read_text(encoding='utf8')
old='document.querySelector(\'nav[aria-label="工作区"] button[aria-pressed="true"]\')?.textContent===\'折痕编辑\''
new='document.querySelector(\'nav[aria-label="工作区"] button[aria-pressed="true"]\')?.textContent?.replace(/^\\d+/,\'\')===\'折痕编辑\''
assert source.count(old)==2
target.write_text(source.replace(old,new),encoding='utf8')
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record=dict(verified=True,original=original.relative_to(root).as_posix(),originalSha256=digest(original),retry=target.relative_to(root).as_posix(),retrySha256=digest(target),
 changedWaitConditions=2,actualNavigationTag='NAV',actualActiveButtonText='01折痕编辑',
 reason='Actual adoption succeeded. Hidden workspace-no span contributes 01 to textContent. Strip only the numeric workspace prefix when waiting for the same active edit button.',
 supersedes='output/original-constructible-discrete-wait-audit-1011.json',
 earlyUnexecutedScript='scripts/verify-discrete-main-final-1011.browser.js',
 earlierAssumptionCorrected='Earlier DIV hypothesis was disproved by actual DOM; first generated retry contained doubled quotes and was never executed.',
 productionChanged=False)
(root/'output/original-constructible-discrete-wait-audit-correction-1011.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,changedWaitConditions=2,actualActiveButtonText='01折痕编辑'),ensure_ascii=False))
