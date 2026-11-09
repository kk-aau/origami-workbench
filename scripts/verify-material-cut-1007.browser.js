async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const button=name=>page.getByRole('button',{name,exact:true});
 await page.evaluate(()=>{window.confirm=()=>true;}); // Isolated web test; not a desktop native confirmation test.
 await page.setViewportSize({width:1280,height:720});
 await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles('output/playwright/material-cut-source-1007.zhezhi.json');
 await page.waitForFunction(()=>document.querySelector('input[aria-label="工程名称"]')?.value==='材料切口验收');
 const solved=async()=>{await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.flat-result-label')?.textContent?.includes('已找到层序解'));};
 const props=async()=>{await button('绘图工具').click();await page.getByRole('button',{name:/^(纸张属性|选区 \(\d+\))$/}).click();return page.locator('dialog.tool-settings-dialog');};
 const closeProps=async()=>{if(await button('关闭工具设置').count())await button('关闭工具设置').click();};
 const download=async(name,format='json')=>{
  await closeProps();await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});
  await d.getByRole('combobox').selectOption(format);const saved=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();
  await(await saved).saveAs(`output/playwright/material-cut-${name}-1007.${format==='fold'?'fold':'zhezhi.json'}`);await button('关闭窗口').click();
 };
 await solved();check(true,'原材料三部件基线平折层序已解');
 let d=await props();check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('3 个部件'),'原材料三部件身份可见');
 await d.getByRole('button',{name:'切开材料折痕',exact:true}).click();
 let c=page.getByRole('dialog',{name:'切开材料折痕',exact:true});
 check(await c.getByRole('button',{name:'应用材料切口',exact:true}).isDisabled(),'未选边和未预览不可应用');
 check(await c.locator('svg[aria-label="材料切口预览，坐标单位毫米"] text').count()>5,'选边预览有实际毫米坐标刻度');
 await c.getByRole('checkbox').first().check();await c.getByRole('button',{name:'预览切口',exact:true}).click();
 check((await c.getByRole('status').innerText()).includes('3 → 4'),'预览显示切开一条内边后四部件');
 for(const width of [1000,800]){await page.setViewportSize({width,height:720});check(await c.evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.getBoundingClientRect().bottom<=window.innerHeight),`${width}×720 切口窗口完整显示，无窗口滚动`);}
 await page.setViewportSize({width:1280,height:720});
 await page.screenshot({path:'output/playwright/material-cut-preview-1007.png'});
 await c.getByRole('button',{name:'取消',exact:true}).click();
 check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('3 个部件'),'取消预览保留三部件');
 await download('cancel');
 d=await props();await d.getByRole('button',{name:'切开材料折痕',exact:true}).click();c=page.getByRole('dialog',{name:'切开材料折痕',exact:true});
 await c.getByRole('checkbox').first().check();await c.getByRole('button',{name:'预览切口',exact:true}).click();
 await c.getByRole('button',{name:'应用材料切口',exact:true}).click();
 check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('4 个部件'),'应用切口实际拆成四部件');
 await closeProps();
 check((await page.locator('.flat-result-label').innerText()).includes('结果已过期'),'旧平折结果已过期，未沿用旧层序');
 await download('applied');
 await button('撤销').click();await download('undo');
 d=await props();check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('3 个部件'),'撤销恢复原三部件');await closeProps();
 await button('重做').click();await download('redo');
 d=await props();check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('4 个部件'),'重做恢复四部件');await closeProps();
 await solved();check(true,'切口后重新平折层序已解');
 for(const side of ['背面','正面']){await button(side).click();check(await button(side).getAttribute('aria-pressed')==='true',`切口后${side}显示`);}
 await page.screenshot({path:'output/playwright/material-cut-fold-1007.png'});
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();check(true,'切口工程实际保存');
 await download('final');await download('final','fold');check(true,'实际浏览器下载JSON和CP/FF材料FOLD');
 for(const ext of ['zhezhi.json','fold']){
  await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-cut-final-1007.${ext}`);await solved();
  d=await props();check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('4 个部件'),`${ext}实际重开后保留四部件并重新平折`);await closeProps();
 }
 check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors};
}
