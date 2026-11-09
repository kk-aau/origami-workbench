from pathlib import Path

source=Path('output/parallel/original-resample-1010/verify.browser.js').read_text(encoding='utf8')
head="""async page=>{
await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
await page.getByRole('button',{name:/^\\d+ 空间构造$/}).click();
await page.getByLabel('空间构造类型',{exact:true}).selectOption('curved-generic-cone-flatten');
await page.getByRole('button',{name:'一般原式',exact:true}).click();
"""
assert source.startswith('async page=>{\n')
source=head+source[len('async page=>{\n'):]
source=source.replace('`evidence/', '`output/parallel/original-resample-1010/evidence/',1)
source=source.replace('`evidence/browser-', '`output/playwright/original-resample-browser-')
source=source.replace("'evidence/browser-", "'output/playwright/original-resample-browser-")
Path('scripts/verify-original-resample-1010.browser.js').write_text(source,encoding='utf8')
print('Prepared root main App verification, keeping agent frozen inputs/evidence unmodified.')
