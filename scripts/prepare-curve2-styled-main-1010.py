from pathlib import Path
import json

root = Path.cwd()
base = root / 'output/parallel/curve2-styled-ledger-1010'
out = root / 'output/original-curve2-styled-browser-1010'
out.mkdir(exist_ok=True)
old = 'D:/codex/折纸工具/workbench/output/parallel/curve2-styled-ledger-1010'
new = str(out.resolve()).replace('\\', '/')
for source, target in [('verify-curve2-styled.browser.js','verify-original-curve2-styled-1010.browser.js'), ('verify-forged.browser.js','verify-original-curve2-styled-forged-1010.browser.js')]:
    script = (base / source).read_text(encoding='utf8').replace(old, new)
    (root / 'scripts' / target).write_text(script, encoding='utf8')
audit = (base / 'audit_downloads.ts').read_text(encoding='utf8')
audit = audit.replace("'./work/src/app/curve2StyledGraphics'", "'../src/app/curve2StyledGraphics'")
audit = audit.replace("const root=new URL('.',import.meta.url)", "const root=new URL('../output/original-curve2-styled-browser-1010/',import.meta.url)")
(root / 'scripts/verify-original-curve2-styled-download-1010.ts').write_text(audit, encoding='utf8')
print(json.dumps({'prepared': 3, 'actualDownloadsCopied': False, 'output': str(out)}))
