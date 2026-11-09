async page=>{
 await page.evaluate(()=>window.confirm=()=>true);await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();await page.getByRole('button',{name:/^\d+ 线组编织$/}).click();const fresh=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.ok()&&r.request().postDataJSON()?.graph?.vertices?.length===33);await page.getByLabel('编织构造示例',{exact:true}).selectOption('scaled-even-32');await fresh;const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};await page.setViewportSize({width:1360,height:860});
 await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled));
 await page.getByRole('button',{name:'采用折痕副本 →',exact:true}).click();check(true,'32度实际层序已解后完成普通采用');
 const exportJSON=async file=>{await page.getByRole('button',{name:'导出作品',exact:true}).click();await page.getByRole('dialog').getByRole('combobox').selectOption('json');const pending=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'导出文件',exact:true}).click();await(await pending).saveAs(`D:/codex/折纸工具/workbench/output/original-woven-area-browser-1010/${file}`);await page.getByRole('dialog').getByRole('button',{name:'关闭窗口',exact:true}).click();};
 await exportJSON('browser-32-normal-adopt.json');
 for(const degree of [12,16,32]){
  await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`D:/codex/折纸工具/workbench/output/original-woven-area-browser-1010/browser-${degree}-cp.json`);
  await page.waitForFunction(()=>!document.querySelector('[role="alert"]'));await exportJSON(`browser-${degree}-reimport.json`);check(true,`${degree}度实际下载工程重新打开并再下载`);
 }
 const saving=page.waitForResponse(r=>r.url().includes('/api/projects')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存工程',exact:true}).click();const saved=await saving;check(saved.ok(),'32度CP完成本地隔离工程库真实保存');
 return {passed:checks.length,checks};
}
