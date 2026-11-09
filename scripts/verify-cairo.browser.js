async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const response=()=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.family==='archimedean');
 const number=async(label,value)=>{const wait=response();await page.getByLabel(label,{exact:true}).fill(String(value));await page.getByLabel(label,{exact:true}).press('Enter');const r=await(await wait).json();await ready();return r;};
 await page.setViewportSize({width:1000,height:720});await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('04 混合平铺').click();await ready();
 let wait=response();await page.getByLabel('顶点构型',{exact:true}).selectOption({value:'cairo'});let r=await(await wait).json();await ready();check(r.stats.tiles===16&&r.source.output==='tiling'&&await button('计算平折').isDisabled(),'Cairo 默认完整母结构，明确不作为平折折痕');
 const vectors=JSON.stringify(r.source.periodicCell.lattice);r=await number('底角 δ',105);check(r.stats.tiles===16&&JSON.stringify(r.source.periodicCell.lattice)!==vectors&&r.stats.checks.geometry.status==='passed','底角改变五边形和真实周期向量');
 r=await number('横向周期',3);check(r.stats.tiles===24,'周期数量生成实际重复单元');
 wait=response();await page.getByLabel('输出',{exact:true}).selectOption({value:'twist'});r=await(await wait).json();await ready();check(r.stats.checks.local.status==='passed'&&await button('采用折痕副本 →').isEnabled(),'Cairo 支持通过检查的统一扭转');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'扭转模式全部控件与检查结果无滚动');
 wait=response();await page.getByLabel('顶点构型',{exact:true}).selectOption({value:'double-cairo'});r=await(await wait).json();await ready();check(r.stats.tiles===32&&r.source.periodicCell.tiles.length===8,'Double Cairo 使用八块单元而非改名重复');
 r=await number('底角 δ',105);check(r.stats.checks.geometry.status==='passed'&&r.fold.edges_assignment.every(a=>a==='F'||a==='B'),'非对称 Double Cairo 完整生成辅助母结构');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'母结构模式无滚动');
 await button('采用母结构副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();wait=response();await button('读取工程参数').click();r=await(await wait).json();await ready();check(r.stats.parameters.tiling==='double-cairo'&&r.stats.parameters.cairoAngle===105&&r.stats.parameters.cairoOutput==='tiling','母结构底角、周期类型与输出方式随工程恢复');
 await page.screenshot({path:'output/playwright/double-cairo-original.png'});
 wait=response();await page.getByLabel('输出',{exact:true}).selectOption({value:'twist'});const rejected=await wait;check(rejected.status()===422,'不支持的统一扭转显式拒绝');await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.textContent==='参数需调整');check(await button('采用折痕副本 →').isDisabled(),'失败结果无法当作成功折痕采用');
 wait=response();await page.getByLabel('输出',{exact:true}).selectOption({value:'tiling'});await wait;await ready();check(await button('采用母结构副本 →').isEnabled(),'返回母结构后仍可继续设计');
 wait=response();await page.getByLabel('顶点构型',{exact:true}).selectOption({value:'3.6.3.6'});r=await(await wait).json();await ready();check(r.stats.parameters.cairoAngle===undefined&&await button('采用折痕副本 →').isEnabled(),'切换旧构造清除 Cairo 专用参数');
 return {passed:checks.length,checks};
}
