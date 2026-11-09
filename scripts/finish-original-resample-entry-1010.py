from pathlib import Path
p=Path('scripts/verify-original-resample-1010.browser.js');s=p.read_text(encoding='utf8')
old="await page.getByLabel('空间构造类型',{exact:true}).selectOption('curved-generic-cone-flatten');\nawait page.getByRole('button',{name:'一般原式',exact:true}).click();"
assert s.count(old)==1
new="await page.locator('.tess-source-tools > summary').click();\nawait page.getByLabel('原式工具与参考示例',{exact:true}).selectOption('curved-generic-cone-flatten');\nawait page.getByLabel('通用Darboux构造范围',{exact:true}).selectOption('general');"
p.write_text(s.replace(old,new),encoding='utf8')
