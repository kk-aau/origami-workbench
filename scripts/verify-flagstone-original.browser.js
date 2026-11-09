async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const response=()=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.family==='flagstone');
 await page.setViewportSize({width:1000,height:720});await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('08 铺石镶嵌').click();await ready();
 let wait=response();await page.getByLabel('铺石参数方式').selectOption({value:'rho'});let r=await(await wait).json();await ready();check(r.stats.parameters.shrinkage===.8,'褶宽转换为原版收缩率保持几何比例');
 wait=response();await page.getByLabel('收缩率 ρ',{exact:true}).fill('.7');await page.getByLabel('收缩率 ρ',{exact:true}).press('Enter');r=await(await wait).json();await ready();const vertices=r.fold.vertices_coords,types=r.fold.edges_assignment;check(r.stats.parameters.shrinkage===.7&&r.stats.checks.geometry.status==='passed','收缩率直接驱动铺石几何');
 wait=response();await page.getByLabel('铺石交汇赋型').selectOption({value:'original'});r=await(await wait).json();await ready();check(JSON.stringify(r.fold.vertices_coords)===JSON.stringify(vertices)&&JSON.stringify(r.fold.edges_assignment)!==JSON.stringify(types),'原版统一赋型改变山谷并保持几何');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'原版铺石参数与检查区完整可见无滚动');
 await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header')?.textContent?.includes('层序已解'));check(true,'原版方格赋型计算出真实平折层序');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();wait=response();await button('读取工程参数').click();r=await(await wait).json();await ready();check(r.stats.parameters.shrinkage===.7&&r.stats.parameters.junctionAssignment==='original','保存恢复原版收缩率与赋型选择');
 await page.screenshot({path:'output/playwright/flagstone-original.png'});
 wait=response();await page.getByLabel('收缩率 ρ',{exact:true}).fill('.05');await page.getByLabel('收缩率 ρ',{exact:true}).press('Enter');r=await(await wait).json();await ready();check(r.stats.checks.geometry.status==='failed'&&await button('采用折痕副本 →').isDisabled(),'过度收缩的交叉结果不会被误当成有效工程');
 wait=response();await page.getByLabel('铺石参数方式').selectOption({value:'width'});r=await(await wait).json();await ready();check(r.stats.parameters.shrinkage===undefined&&r.stats.checks.geometry.status==='passed','可切回兼容褶宽方式');return {passed:checks.length,checks};
}
