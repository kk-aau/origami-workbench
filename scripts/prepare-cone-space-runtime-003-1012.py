from pathlib import Path
import json

root = Path.cwd().resolve()
source = (root / 'scripts/prepare-cone-space-runtime-002-1012.py').read_text(encoding='utf8')
source = source.replace("check=root/'output/cone-space-checks-005-1012.json'", "check=root/'output/cone-space-checks-007-1012.json'")
source = source.replace('002-1012', '003-1012').replace('downloads-002', 'downloads-003').replace("folder/'cli-002'", "folder/'cli-003'").replace("folder/'cli-config-001.json'", "folder/'cli-config-003.json'")
# The previous tube-strip launcher is a captured template; its original exists.
source = source.replace("scripts/start-tube-strip-main-003-1012.ps1", "scripts/start-tube-strip-main-002-1012.ps1").replace(".replace('003-1012','003-1012')", ".replace('002-1012','003-1012')")
exec(compile(source, str(root / 'scripts/prepare-cone-space-runtime-003-1012.py'), 'exec'))

folder = root / 'output/playwright/cone-space-main-1012'
freeze = json.loads((root / 'output/parallel/cone-space-main-root-003-1012/ROOT-SOURCE-FROZEN.json').read_text(encoding='utf8'))
candidate = (root / 'output/parallel/cone-space-actual-reader-1012/browser-candidate/cone-space-main.browser.js').read_text(encoding='utf8')
candidate = candidate.replace('__OUTPUT__', (folder / 'downloads-003').as_posix()).replace('__BUNDLE__', freeze['bundle']).replace('__ORIGIN__', 'http://127.0.0.1:8887')
needle = "footerBottom:footer.bottom,plots};"
assert candidate.count(needle) == 1
candidate = candidate.replace(needle, "footerTop:footer.top,footerBottom:footer.bottom,hintBottom:e.querySelector('aside .sgm-hint')?.getBoundingClientRect().bottom??0,asideBottom:e.querySelector('aside')?.getBoundingClientRect().bottom??0,plots};")
needle = "check(r.scrollHeight<=r.clientHeight+2,name+'主窗口无滚动');"
assert candidate.count(needle) == 1
candidate = candidate.replace(needle, needle + "check(!r.hintBottom||(r.hintBottom<=r.asideBottom+.5&&r.hintBottom<=r.footerTop),name+'侧栏提示不覆盖采用栏',r);")
(folder / 'cone-space-main-003.browser.js').write_text(candidate, encoding='utf8')
