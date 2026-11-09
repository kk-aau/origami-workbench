async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};await page.evaluate(()=>{window.confirm=()=>true;});await page.setViewportSize({width:1440,height:1000});
 const button=name=>page.getByRole('button',{name,exact:true}),settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const xy=p=>page.locator('svg.crease-canvas').evaluate((el,p)=>{const q=new DOMPoint(...p).matrixTransform(el.getScreenCTM());return[q.x,q.y];},p),click=async p=>{await page.mouse.click(...await xy(p));await settle();};
 const tool=async id=>{await page.locator('button[data-tool='+id+']').click();await settle();};
 const download=async(name)=>{await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.getByRole('combobox').first().selectOption('json');const saved=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();await(await saved).saveAs(`output/playwright/material-tools-partial-${name}-1008.zhezhi.json`);await button('关闭窗口').click();};
 if(await button('收起平折').count())await button('收起平折').click();
 for(const id of ['copyselection','copyfour','mirrorselection']){
  await page.keyboard.press('Escape');await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles('output/playwright/material-copy-square-source-1008.zhezhi.json');await page.waitForFunction(()=>document.querySelector('[aria-label="工程名称"]')?.value==='原位材料复制验收');await page.getByRole('checkbox',{name:/保护边界/}).uncheck();await button('适合画布').click();await tool('select');if(await button('全部撤选').isEnabled())await button('全部撤选').click();await click([50,0]);await tool(id);check((await page.locator('.canvas-pane').innerText()).includes('选区 1 段'),id+'仅选一条材料边');await download(id+'-before');
  const points=id==='copyfour'?[[0,0],[100,0],[0,100],[100,100]]:[[0,0],[100,100]];for(const p of points)await click(p);
  check(/完整材料部件|完整部件/.test(await page.locator('.canvas-pane').innerText()),id+'部分材料明确拒绝');
  check(await page.locator('[data-transform-preview],[data-mirror-preview=ready]').count()===0,id+'没有可提交半成品');await download(id+'-after');await page.keyboard.press('Escape');
 }
 check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors};
}
