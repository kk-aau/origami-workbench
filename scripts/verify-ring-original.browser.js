async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const response=()=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.ringMode==='origamica');
 await page.setViewportSize({width:1000,height:720});
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 await button('镶嵌设计').click();await button('07 环状镶嵌').click();await ready();
 let wait=response();await page.getByLabel('环形构造',{exact:true}).selectOption('origamica');let r=await(await wait).json();await ready();
 check(r.source.curveFamily==='circles'&&r.stats.tiles===65&&r.stats.checks.geometry.status==='passed'&&r.stats.checks.local.status==='passed','原版圆形曲线逐环传播生成已检查的 CP');
 check(r.source.foldedForm.length===r.stats.vertices&&r.source.closureError<1e-10,'同一构造输出折后坐标并闭合边长');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'1000×720 下原版环参数无侧栏滚动');
 await button('编辑两组半径').click();await page.getByLabel('外环半径',{exact:true}).fill('1, 1.7, 2.5');await page.getByLabel('中间圆半径',{exact:true}).fill('1.3, 2.0');
 wait=response();await button('采用半径').click();r=await(await wait).json();await ready();
 check(JSON.stringify(r.stats.parameters.outerRadii)==='[1,1.7,2.5]'&&JSON.stringify(r.stats.parameters.creaseRadii)==='[1.3,2]'&&r.stats.checks.local.status==='passed','编辑两组半径重建原版传播');
 wait=response();await page.getByLabel('起始相位',{exact:true}).fill('12');await page.getByLabel('起始相位',{exact:true}).press('Enter');r=await(await wait).json();await ready();
 check(r.stats.parameters.offsetAngle===12&&r.stats.checks.geometry.status==='passed','初始相位改变真实几何');
 await button('编辑采样曲线').click();await button('填入双峰示例').click();wait=response();await button('采用曲线').click();r=await(await wait).json();await ready();
 check(r.source.curveFamily==='sampled-polar'&&r.stats.checks.geometry.status==='passed'&&r.stats.checks.local.status==='passed','采样极坐标曲线生成真实的非圆环状折痕');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'采样曲线模式 1000×720 无侧栏滚动');
 wait=response();await button('恢复圆形曲线').click();r=await(await wait).json();await ready();check(r.source.curveFamily==='circles','恢复圆形曲线不丢失环半径和相位');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();
 wait=response();await button('读取工程参数').click();r=await(await wait).json();await ready();
 check(r.stats.parameters.ringMode==='origamica'&&r.stats.parameters.offsetAngle===12,'工程恢复保留原版环模式和两组半径');
 return {passed:checks.length,checks};
}
