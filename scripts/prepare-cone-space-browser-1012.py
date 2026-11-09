from pathlib import Path
import json, sys

root = Path.cwd().resolve()
version = sys.argv[1]
assert version in ('003', '004')
folder = root / 'output/playwright/cone-space-main-1012'
freeze = json.loads((root / f'output/parallel/cone-space-main-root-{version}-1012/ROOT-SOURCE-FROZEN.json').read_text(encoding='utf8'))
candidate = (root / 'output/parallel/cone-space-actual-reader-1012/browser-candidate/cone-space-main.browser.js').read_text(encoding='utf8')
candidate = candidate.replace('__OUTPUT__', (folder / f'downloads-{version}').as_posix()).replace('__BUNDLE__', freeze['bundle']).replace('__ORIGIN__', 'http://127.0.0.1:8887')
needle = 'footerBottom:footer.bottom,plots};'
assert candidate.count(needle) == 1
candidate = candidate.replace(needle, "footerTop:footer.top,footerBottom:footer.bottom,hintBottom:e.querySelector('aside .sgm-hint')?.getBoundingClientRect().bottom??0,asideBottom:e.querySelector('aside')?.getBoundingClientRect().bottom??0,plots};")
needle = "check(r.scrollHeight<=r.clientHeight+2,name+'主窗口无滚动');"
assert candidate.count(needle) == 1
candidate = candidate.replace(needle, needle + "check(!r.hintBottom||(r.hintBottom<=r.asideBottom+.5&&r.hintBottom<=r.footerTop),name+'侧栏提示不覆盖采用栏',r);")
(folder / f'cone-space-main-{version}.browser.js').write_text(candidate, encoding='utf8')
