from pathlib import Path
import shutil
root=Path.cwd();higher=root/'output/parallel/original-resample-higher-1010';out=root/'output/original-higher-browser-1010';out.mkdir(exist_ok=True)
for name in ['degree-2','degree-3','degree-4','original-cone-degree-4']:
 shutil.copy2(higher/'evidence'/(name+'-input.json'),out/(name+'-input.json'))
script=(higher/'verify.browser.js').read_text(encoding='utf8').replace('evidence/','output/original-higher-browser-1010/')
entry="""await page.evaluate(()=>window.confirm=()=>true);await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
await page.getByRole('button',{name:/^\\d+ 空间构造$/}).click();if(await page.locator('.tess-source-tools').getAttribute('open')===null)await page.locator('.tess-source-tools>summary').click();
await page.getByLabel('原式工具与参考示例',{exact:true}).selectOption('curved-generic-cone-flatten');
if(await page.getByLabel('通用Darboux构造范围',{exact:true}).inputValue()==='saved')await page.getByLabel('通用Darboux构造范围',{exact:true}).selectOption('general');
"""
script=script.replace('async page=>{','async page=>{\n'+entry,1)
(root/'scripts/verify-original-higher-1010.browser.js').write_text(script,encoding='utf8')
audit=(higher/'verify-downloads.ts').read_text(encoding='utf8').replace("'./src/app/","'../src/app/").replace('evidence/','output/original-higher-browser-1010/')
(root/'scripts/verify-original-higher-download-1010.ts').write_text(audit,encoding='utf8')
frames=root/'output/parallel/frame-plots-ledger-1010';frame_out=root/'output/original-graphics-browser-1010';frame_out.mkdir(exist_ok=True)
script=(frames/'verify-graphics.browser.js').read_text(encoding='utf8').replace('D:/codex/折纸工具/workbench/output/parallel/frame-plots-ledger-1010','D:/codex/折纸工具/workbench/output/original-graphics-browser-1010')
script=script.replace('async page=>{',"async page=>{\nconst closing=page.getByRole('button',{name:'关闭镶嵌窗口',exact:true});if(await closing.count())await closing.last().click();",1)
(root/'scripts/verify-original-graphics-1010.browser.js').write_text(script,encoding='utf8')
audit=(frames/'audit_downloads.ts').read_text(encoding='utf8').replace("'./work/src/app/","'../src/app/")
audit=audit.replace("new URL('./',import.meta.url)","new URL('../output/original-graphics-browser-1010/',import.meta.url)")
(root/'scripts/verify-original-graphics-download-1010.ts').write_text(audit,encoding='utf8')
print('Prepared main-App higher interpolation and original graphics interaction/download replay scripts.')
