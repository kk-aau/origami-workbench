from pathlib import Path
p=Path('scripts/verify-mother-source-guard-1010.browser.js');s=p.read_text(encoding='utf8')
old="await button('编辑母图').click()";assert s.count(old)==1
p.write_text(s.replace(old,"await page.getByRole('button',{name:/^编辑母图 · \\d+ 点$/}).click()"),encoding='utf8')
