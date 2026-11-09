async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const result=()=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.radii);
 await page.setViewportSize({width:1000,height:720});await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('07 环状镶嵌').click();await ready();
 let wait=result();await page.getByLabel('环形构造',{exact:true}).selectOption({value:'trapezoid'});await wait;await ready();await button('编辑半径列表 · 3 层').click();await page.getByLabel('半径列表',{exact:true}).fill('.4, 1.3, 2.2');wait=result();await button('采用半径').click();let r=await (await wait).json();await ready();check(r.stats.tiles===17&&JSON.stringify(r.stats.parameters.radii)==='[0.4,1.3,2.2]','显式非等比半径生成旋转梯形');
 wait=result();await page.getByLabel('包含中心点',{exact:true}).check();r=await (await wait).json();await ready();check(r.stats.tiles===24&&r.mother.faces_vertices.filter(f=>f.length===3).length===8&&r.stats.checks.local.status==='passed','加入中心点生成三角扇并通过局部检查');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'旋转梯形参数面板无滚动');
 await button('编辑半径列表 · 3 层').click();await page.getByLabel('半径列表',{exact:true}).fill('1, 1, 2');await button('采用半径').click();check((await page.getByRole('alert').last().textContent()).includes('递增'),'拒绝重复半径');await button('关闭镶嵌窗口').click();
 wait=result();await page.getByLabel('旋转角度',{exact:true}).fill('40');await page.getByLabel('旋转角度',{exact:true}).press('Enter');r=await (await wait).json();await ready();check(r.stats.parameters.includeCenter&&r.stats.parameters.radii[0]===.4,'调参保留半径和中心选择');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();wait=result();await button('读取工程参数').click();r=await (await wait).json();await ready();check(r.stats.tiles===24&&r.stats.parameters.includeCenter,'保存恢复保留旋转梯形构造');
 await page.screenshot({path:'output/playwright/trapezoid.png'});return {passed:checks.length,checks};
}
