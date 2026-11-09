async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 await page.setViewportSize({width:1000,height:720});
 const keep=button('保留当前工程');if(await keep.count())await keep.click();
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();
 await button('10 Brocard 扭转').click();
 const ready=()=>page.waitForFunction(()=>document.querySelector('.context-toolbar .outline')?.textContent==='重新计算'&&!Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='采用折痕副本 →')?.disabled);
 const generate=async()=>{const wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate'));await button('重新计算').click();const r=await wait;check(r.ok(),'Brocard 后端计算成功');await ready();return r.json();};
 for(const kind of ['triangle','trapezoid','parallelogram','angles','cyclic','cyclic-offset','triangle-vertices']){
  await page.getByLabel('Brocard 类型',{exact:true}).selectOption(kind);await generate();
  check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),kind+' 参数栏无滚动');
 }
 await button('编辑三个顶点').click();await page.getByLabel('点 X',{exact:true}).fill('-.2');await page.getByLabel('点 X',{exact:true}).press('Enter');await button('保存几何修改').click();
 await page.getByLabel('内接比例',{exact:true}).fill('.6');await page.getByLabel('Brocard 方向',{exact:true}).selectOption('cw');
 const edited=await generate();check(edited.stats.parameters.vertices[0][0]===-.2&&edited.stats.parameters.scale===.6&&edited.stats.parameters.clockwise,'编辑形状后继续调参保留三个顶点');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();await button('读取工程参数').click();
 check(await page.getByLabel('Brocard 类型',{exact:true}).inputValue()==='triangle-vertices','工程参数恢复 Brocard 类型');
 check(await page.getByLabel('内接比例',{exact:true}).inputValue()==='.6'||await page.getByLabel('内接比例',{exact:true}).inputValue()==='0.6','工程参数恢复比例');
 await generate();await page.screenshot({path:'output/playwright/brocard-goal.png'});
 return {passed:checks.length,checks};
}
