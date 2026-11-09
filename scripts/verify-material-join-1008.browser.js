async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const button=name=>page.getByRole('button',{name,exact:true});
 await page.evaluate(()=>{window.confirm=()=>true;}); // Isolated web acceptance only.
 await page.setViewportSize({width:1280,height:720});
 await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles('output/playwright/material-join-source-1008.zhezhi.json');
 await page.waitForFunction(()=>document.querySelector('input[aria-label="工程名称"]')?.value==='材料粘合验收');
 const solved=async()=>{await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.flat-result-label')?.textContent?.includes('已找到层序解'));};
 const props=async()=>{await button('绘图工具').click();await page.getByRole('button',{name:/^(纸张属性|选区 \(\d+\))$/}).click();return page.locator('dialog.tool-settings-dialog');};
 const closeProps=async()=>{if(await button('关闭工具设置').count())await button('关闭工具设置').click();};
 const download=async(name,format='json')=>{
  await closeProps();await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.getByRole('combobox').selectOption(format);
  const saved=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();await(await saved).saveAs(`output/playwright/material-join-${name}-1008.${format==='fold'?'fold':'zhezhi.json'}`);await button('关闭窗口').click();
 };
 const fillPair=async(c,kind='V')=>{await c.getByLabel('粘合 1 第一侧',{exact:true}).selectOption('material-11');await c.getByLabel('粘合 1 第二侧',{exact:true}).selectOption('material-11::cut-bank-1');await c.getByLabel('粘合 1 连接线型',{exact:true}).selectOption(kind);};
 await solved();check(true,'四部件切口工程基线已解');
 let d=await props();await d.getByRole('button',{name:'粘合材料边界',exact:true}).click();let c=page.getByRole('dialog',{name:'粘合材料边界',exact:true});
 check(await c.getByRole('button',{name:'应用材料粘合',exact:true}).isDisabled(),'未配对和未预览不能应用');
 await fillPair(c);await c.getByRole('button',{name:'预览粘合',exact:true}).click();
 check((await c.getByRole('status').innerText()).includes('4 → 3'),'V粘合预览显示四部件恢复为三部件');
 check((await c.getByRole('status').innerText()).includes('折后位置保留'),'兼容线型保留原FF位置');
 await c.getByRole('button',{name:'增加粘合对',exact:true}).click();
 await c.getByLabel('粘合 2 第一侧',{exact:true}).selectOption('material-11');await c.getByLabel('粘合 2 第二侧',{exact:true}).selectOption('material-11::cut-bank-1');
 await c.getByRole('button',{name:'预览粘合',exact:true}).click();
 check((await c.getByRole('alert').innerText()).includes('重复参加'),'重复使用边界的配对明确拒绝');
 check(await c.getByRole('button',{name:'应用材料粘合',exact:true}).isDisabled(),'失败预览不能应用');
 await c.getByRole('button',{name:'删除粘合 2',exact:true}).click();await c.getByRole('button',{name:'预览粘合',exact:true}).click();
 check(await c.locator('svg text').count()>5,'粘合预览有毫米坐标刻度');
 for(const width of [1000,800]){await page.setViewportSize({width,height:720});check(await c.evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.getBoundingClientRect().bottom<=window.innerHeight),`${width}×720 粘合窗口完整显示，无窗口滚动`);}
 await page.setViewportSize({width:1280,height:720});await page.screenshot({path:'output/playwright/material-join-preview-1008.png'});
 await c.getByRole('button',{name:'取消',exact:true}).click();check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('4 个部件'),'取消粘合保持原四部件');await download('cancel');
 d=await props();await d.getByRole('button',{name:'粘合材料边界',exact:true}).click();c=page.getByRole('dialog',{name:'粘合材料边界',exact:true});await fillPair(c);
 await c.getByRole('button',{name:'预览粘合',exact:true}).click();await c.getByLabel('粘合 1 连接线型',{exact:true}).selectOption('F');
 check(await c.getByRole('button',{name:'应用材料粘合',exact:true}).isDisabled(),'改线型使旧预览失效');
 await c.getByRole('button',{name:'预览粘合',exact:true}).click();check((await c.getByRole('status').innerText()).includes('折后位置已按固定面重算'),'F连接预览明确重算FF');await c.getByRole('button',{name:'取消',exact:true}).click();await download('flat-cancel');
 d=await props();await d.getByRole('button',{name:'粘合材料边界',exact:true}).click();c=page.getByRole('dialog',{name:'粘合材料边界',exact:true});await fillPair(c);await c.getByRole('button',{name:'预览粘合',exact:true}).click();await c.getByRole('button',{name:'应用材料粘合',exact:true}).click();
 check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('3 个部件'),'应用V粘合真实恢复三部件');await closeProps();check((await page.locator('.flat-result-label').innerText()).includes('结果已过期'),'旧层序明确过期');await download('applied');
 await button('撤销').click();await download('undo');d=await props();check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('4 个部件'),'撤销恢复切口四部件');await closeProps();
 await button('重做').click();await download('redo');d=await props();check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('3 个部件'),'重做恢复粘合三部件');await closeProps();
 await solved();check(true,'粘合后重新平折已解');for(const side of ['背面','正面']){await button(side).click();check(await button(side).getAttribute('aria-pressed')==='true',`粘合后${side}显示`);}
 await page.screenshot({path:'output/playwright/material-join-fold-1008.png'});await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();check(true,'粘合工程实际保存');await download('final');await download('final','fold');check(true,'实际浏览器下载JSON和材料CP/FF FOLD');
 for(const ext of ['zhezhi.json','fold']){await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-join-final-1008.${ext}`);await solved();d=await props();check((await d.getByLabel('选择材料部件',{exact:true}).innerText()).includes('3 个部件'),`${ext}重开保留三部件且再平折已解`);await closeProps();}
 await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles('output/playwright/material-join-source-1008.zhezhi.json');
 d=await props();await d.getByRole('button',{name:'粘合材料边界',exact:true}).click();c=page.getByRole('dialog',{name:'粘合材料边界',exact:true});await fillPair(c,'F');await c.getByRole('button',{name:'预览粘合',exact:true}).click();await c.getByRole('button',{name:'应用材料粘合',exact:true}).click();await closeProps();
 await solved();check(true,'F粘合实际应用后重算FF与层序通过');await download('flat-applied');await download('flat-applied','fold');
 await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles('output/playwright/material-join-flat-applied-1008.fold');await solved();check(true,'重算FF的F粘合材料FOLD实际重开可平折');
 check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors};
}
