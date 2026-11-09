from pathlib import Path
root=Path.cwd();out=root/'output/original-function-browser-1010';out.mkdir(exist_ok=True)
base=root/'output/parallel/planarize-ledger-1010'
browser=(base/'verify-planar.browser.js').read_text(encoding='utf8')
browser=browser.replace("D:/codex/折纸工具/workbench/output/parallel/planarize-ledger-1010","D:/codex/折纸工具/workbench/output/original-function-browser-1010")
(root/'scripts/verify-original-planar-1010.browser.js').write_text(browser,encoding='utf8')
audit=(base/'audit_downloads.ts').read_text(encoding='utf8')
audit=audit.replace("'./work/src/app/planarFunctions'","'../src/app/planarFunctions'")
audit=audit.replace("new URL('./',import.meta.url)","new URL('../output/original-function-browser-1010/',import.meta.url)")
audit=audit.replace("'browser-tests.log'","'original-planar-browser-1010.log'")
(root/'scripts/verify-original-planar-download-1010.ts').write_text(audit,encoding='utf8')
print('Prepared main-App Planarize interaction and independent real-file replay scripts.')
