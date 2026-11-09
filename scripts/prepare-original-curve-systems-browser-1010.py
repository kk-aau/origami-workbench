from pathlib import Path
import shutil
root=Path.cwd();base=root/'output/parallel/original-curve-systems-1010'
out=root/'output/original-function-browser-1010/curve-systems';out.mkdir(exist_ok=True)
for name in ['uncached-input.json','forged-system-file.json','pole-system-file.json']:
 shutil.copy2(base/'evidence'/name,out/name)
script=(base/'verify.browser.js').read_text(encoding='utf8').replace('evidence/','output/original-function-browser-1010/curve-systems/')
entry="""await page.evaluate(()=>window.confirm=()=>true);
const close=page.getByRole('button',{name:'关闭镶嵌窗口',exact:true});if(await close.count())await close.last().click();
await page.setViewportSize({width:1280,height:800});await page.getByRole('button',{name:/^\\d+ 空间构造$/}).click();
if(await page.locator('.tess-source-tools').getAttribute('open')===null)await page.locator('.tess-source-tools>summary').click();
await page.getByLabel('原式工具与参考示例',{exact:true}).selectOption('curved-linked-first-band');
await page.getByLabel('关联同心圆构造范围',{exact:true}).selectOption('common-parameter');
await page.getByLabel('关联同心圆构造范围',{exact:true}).selectOption('generic-common-parameter');
"""
script=script.replace('async page=>{','async page=>{\n'+entry,1)
(root/'scripts/verify-original-curve-systems-1010.browser.js').write_text(script,encoding='utf8')
audit=(base/'verify-downloads.ts').read_text(encoding='utf8')
audit=audit.replace("'./src/app/","'../src/app/").replace('evidence/','output/original-function-browser-1010/curve-systems/')
(root/'scripts/verify-original-curve-systems-download-1010.ts').write_text(audit,encoding='utf8')
print('Prepared root main-App external systems checks, preserving isolated source evidence.')
