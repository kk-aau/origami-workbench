from pathlib import Path
import shutil
root=Path.cwd();frame=root/'output/parallel/frenet-plot-ledger-1010';out=root/'output/original-frenet-browser-1010';out.mkdir(exist_ok=True)
for source,target in [('verify-frenet.browser.js','verify-original-frenet-1010.browser.js'),('verify-forged.browser.js','verify-original-frenet-forged-1010.browser.js')]:
 t=(frame/source).read_text(encoding='utf8').replace('D:/codex/折纸工具/workbench/output/parallel/frenet-plot-ledger-1010','D:/codex/折纸工具/workbench/output/original-frenet-browser-1010')
 (root/'scripts'/target).write_text(t,encoding='utf8')
t=(frame/'audit_downloads.ts').read_text(encoding='utf8').replace("'./work/src/app/","'../src/app/").replace("new URL('.',import.meta.url)","new URL('../output/original-frenet-browser-1010/',import.meta.url)")
(root/'scripts/verify-original-frenet-download-1010.ts').write_text(t,encoding='utf8')
base=root/'output/parallel/original-independent-systems-1010';out=root/'output/original-independent-browser-1010';out.mkdir(exist_ok=True)
for source in (base/'evidence').glob('*input.json'):shutil.copy2(source,out/source.name)
for name in ['forged-system-file.json','pole-system-file.json']:
 if (base/'evidence'/name).exists():shutil.copy2(base/'evidence'/name,out/name)
t=(base/'verify.browser.js').read_text(encoding='utf8').replace('evidence/','output/original-independent-browser-1010/')
entry="""await page.evaluate(()=>window.confirm=()=>true);await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
await page.getByRole('button',{name:/^\\d+ 空间构造$/}).click();if(await page.locator('.tess-source-tools').getAttribute('open')===null)await page.locator('.tess-source-tools>summary').click();
await page.getByLabel('原式工具与参考示例',{exact:true}).selectOption('curved-linked-first-band');
await page.getByLabel('关联同心圆构造范围',{exact:true}).selectOption('common-parameter');await page.getByLabel('关联同心圆构造范围',{exact:true}).selectOption('generic-common-parameter');
"""
t=t.replace('async page=>{','async page=>{\n'+entry,1)
(root/'scripts/verify-original-independent-1010.browser.js').write_text(t,encoding='utf8')
t=(base/'verify-downloads.ts').read_text(encoding='utf8').replace("'./src/app/","'../src/app/").replace('evidence/','output/original-independent-browser-1010/')
(root/'scripts/verify-original-independent-download-1010.ts').write_text(t,encoding='utf8')
print('Prepared root main-App Plot3D and independent-rule checks and real-download replay.')
