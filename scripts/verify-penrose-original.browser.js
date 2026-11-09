async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const response=()=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.kind==='penrose');
 const level=async n=>{const wait=response();await page.getByLabel('原版层级 n',{exact:true}).fill(String(n));await page.getByLabel('原版层级 n',{exact:true}).press('Enter');const r=await(await wait).json();await ready();return r;};
 await page.setViewportSize({width:1000,height:720});await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('05 非周期').click();await ready();
 let wait=response();await page.getByLabel('母结构类型',{exact:true}).selectOption({value:'penrose'});let r=await(await wait).json();await ready();check(r.stats.parameters.penroseVersion==='origamica'&&r.stats.tiles===10,'新选择 Penrose 默认原版 n=1 Sun');
 r=await level(0);check(r.stats.tiles===5&&r.mother.faces_vertices.every(f=>f.length===4),'n=0 Star 为五个厚菱形');
 r=await level(2);check(r.stats.tiles===20&&r.mother.faces_vertices.filter(f=>f.length===3).length===10,'偶数层包含原版边界半菱形');
 wait=response();await page.getByLabel('保留边界半菱形',{exact:true}).uncheck();r=await(await wait).json();await ready();check(r.stats.tiles===10&&r.mother.faces_vertices.every(f=>f.length===4),'关闭半菱形只保留完整菱形');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'Penrose 层级和边界选项无滚动');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();wait=response();await button('读取工程参数').click();r=await(await wait).json();await ready();check(r.stats.parameters.depth===2&&r.stats.parameters.borderTriangles===false&&r.stats.parameters.penroseVersion==='origamica','原版层级与边界选择随工程恢复');
 wait=response();await page.getByLabel('Penrose 层级规则').selectOption({value:'legacy'});r=await(await wait).json();await ready();check(r.stats.parameters.penroseVersion==='legacy'&&await page.getByLabel('细分层数',{exact:true}).count()===1,'仍可明确选择兼容旧层级');
 await page.getByLabel('母结构类型',{exact:true}).selectOption({value:'voronoi'});await ready();check(await page.getByRole('button',{name:'采用折痕副本 →',exact:true}).isEnabled(),'切换其他母结构清除专用 Penrose 参数');
 await page.getByLabel('母结构类型',{exact:true}).selectOption({value:'penrose'});await ready();await level(4);await page.screenshot({path:'output/playwright/penrose-original.png'});return {passed:checks.length,checks};
}
