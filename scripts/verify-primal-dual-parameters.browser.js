async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const response=()=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.family==='periodic');
 await page.goto('http://127.0.0.1:8799');await page.setViewportSize({width:1000,height:720});await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('02 周期拼接').click();await ready();
 await button('原始对偶参数设置').click();let wait=response();await page.getByLabel('原始对偶参数方式').selectOption({value:'gamma-alpha'});let r=await(await wait).json();await ready();check(Math.abs(r.stats.parameters.angle-36)<1e-9&&Math.abs(r.stats.parameters.scale-.3)<1e-9,'切换原版参数保持原折痕几何');
 wait=response();await page.getByLabel('图样定向').selectOption({value:'primal'});r=await(await wait).json();await ready();check(r.stats.parameters.postRotation==='primal','原始多边形定向可采用');await button('关闭镶嵌窗口').click();
 wait=response();await page.getByLabel('比例 γ',{exact:true}).fill('.6');await page.getByLabel('比例 γ',{exact:true}).press('Enter');r=await(await wait).json();await ready();check(r.stats.parameters.gamma===.6&&r.stats.checks.geometry.status==='passed','比例修改实时生成并检查');
 wait=response();await page.getByLabel('褶角 α',{exact:true}).fill('42');await page.getByLabel('褶角 α',{exact:true}).press('Enter');r=await(await wait).json();await ready();check(r.stats.parameters.pleatAngle===42&&r.stats.checks.local.status==='passed','褶角调整保留局部条件');
 wait=response();await button('反向扭转').click();r=await(await wait).json();await ready();check(r.stats.parameters.twistDirection==='cw'&&r.stats.parameters.angle<0,'反向扭转修改方向而非丢失原版参数');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'1000×720 参数设置不增加工具栏滚动');
 await button('原始对偶参数设置').click();wait=response();await page.getByLabel('图样定向').selectOption({value:'dual'});r=await(await wait).json();await ready();check(r.stats.parameters.postRotation==='dual','对偶定向生成成功');await button('关闭镶嵌窗口').click();
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();wait=response();await button('读取工程参数').click();r=await(await wait).json();await ready();check(r.stats.parameters.gamma===.6&&r.stats.parameters.pleatAngle===42&&r.stats.parameters.twistDirection==='cw'&&r.stats.parameters.postRotation==='dual','原版参数、方向和定向随工程恢复');
 await page.screenshot({path:'output/playwright/primal-dual-parameters.png'});
 await button('原始对偶参数设置').click();wait=response();await page.getByLabel('原始对偶参数方式').selectOption({value:'rho-beta'});r=await(await wait).json();await ready();check(r.stats.parameters.gamma===undefined&&r.stats.parameters.angle<0&&r.stats.parameters.postRotation==='dual','返回旧参数保留几何和定向');await button('关闭镶嵌窗口').click();
 return {passed:checks.length,checks};
}
