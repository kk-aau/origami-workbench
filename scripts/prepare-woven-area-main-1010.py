from pathlib import Path

root=Path.cwd()
base=root/'output/parallel/original-woven-near-round-1010'
out=root/'output/original-woven-area-browser-1010'
out.mkdir(exist_ok=True)
prefix=str(out.resolve()).replace('\\','/')+'/'
text=(base/'verify.browser.js').read_text(encoding='utf8').replace('evidence/',prefix)
text=text.replace('const checks=[],errors=[];', "await page.evaluate(()=>window.confirm=()=>true);await page.setViewportSize({width:1360,height:860});await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();await page.getByRole('button',{name:/^\\d+ 线组编织$/}).click();const checks=[],errors=[];")
(root/'scripts/verify-original-woven-area-1010.browser.js').write_text(text,encoding='utf8')
text=(base/'verify-import.browser.js').read_text(encoding='utf8').replace('evidence/',prefix)
text=text.replace("const checks=[],check=", "await page.evaluate(()=>window.confirm=()=>true);await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();await page.getByRole('button',{name:/^\\d+ 线组编织$/}).click();const fresh=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.ok()&&r.request().postDataJSON()?.graph?.vertices?.length===33);await page.getByLabel('编织构造示例',{exact:true}).selectOption('scaled-even-32');await fresh;const checks=[],check=")
old="const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'打开文件',exact:true}).click();await(await chooser).setFiles("
text=text.replace(old,"await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(")
(root/'scripts/verify-original-woven-area-import-1010.browser.js').write_text(text,encoding='utf8')
text=(base/'verify-downloads.ts').read_text(encoding='utf8').replace("'./src/","'../src/").replace('evidence/','output/original-woven-area-browser-1010/')
text=text.replace('data/projects','output/original-three-inputs-server-1010/projects')
(root/'scripts/verify-original-woven-area-download-1010.ts').write_text(text,encoding='utf8')
print('Prepared three actual main UI/download scripts; no producer outputs copied.')
