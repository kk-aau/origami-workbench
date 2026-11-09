async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const save=async()=>{await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();};
 await page.setViewportSize({width:1000,height:720});if(await button('保留当前工程').count())await button('保留当前工程').click();await save();await button('镶嵌设计').click();await button('05 非周期').click();await ready();
 const seeds=[[-1,-.5],[1,-.5],[.8,.9],[-.7,.8],[0,0]],boundary=[[-2,-1],[2,-1],[1.5,2],[-1.5,2]];
 await button('输入坐标').click();await page.getByLabel('种子坐标',{exact:true}).fill(JSON.stringify(seeds));await page.getByLabel('Voronoi 边界坐标',{exact:true}).fill(JSON.stringify(boundary));
 let wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.boundary?.[0]?.[0]===-2);await button('保存种子与边界').click();const result=await(await wait).json();await ready();check(result.stats?.checks.geometry.status==='passed','自定义凸边界生成可采用 Voronoi');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'Voronoi 完整控件无滚动');
 await button('编辑种子点').click();check(await page.getByLabel('点 X',{exact:true}).inputValue()==='-1','编辑器保留负坐标种子');await page.getByLabel('点 X',{exact:true}).fill('-1.02');await page.getByLabel('点 X',{exact:true}).press('Enter');await button('保存几何修改').click();await ready();
 wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.angle===42);await page.getByLabel('旋转角度',{exact:true}).fill('42');const edited=await(await wait).json();await ready();check(edited.stats.parameters.points[0][0]===-1.02&&edited.stats.parameters.boundary[0][0]===-2,'编辑后调参保留种子和边界');
 await button('采用折痕副本 →').click();await save();await button('镶嵌设计').click();await button('01 单元扭转').click();await button('读取工程参数').click();await ready();await button('输入坐标').click();check(JSON.parse(await page.getByLabel('Voronoi 边界坐标',{exact:true}).inputValue())[0][0]===-2,'工程恢复自定义 Voronoi 边界');
 await page.getByLabel('种子坐标',{exact:true}).fill('[[8,8],[0,0],[1,0]]');await button('保存种子与边界').click();check((await page.getByRole('alert').textContent()).includes('边界内'),'边界外种子在保存前被拒绝');await button('关闭镶嵌窗口').click();
 await page.getByLabel('母结构类型',{exact:true}).selectOption('delaunay');await ready();check(await page.getByLabel('Delaunay 边界规则',{exact:true}).inputValue()==='hull','新 Delaunay 默认使用种子凸包');
 await button('输入坐标').click();await page.getByLabel('种子坐标',{exact:true}).fill(JSON.stringify(seeds));wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.points?.[0]?.[0]===-1);await button('保存种子与边界').click();const hull=await(await wait).json();await ready();check(hull.mother.vertices_coords.length===seeds.length,'种子凸包模式没有偷偷补入四角');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'Delaunay 完整控件无滚动');
 await button('采用折痕副本 →').click();await save();await button('镶嵌设计').click();await button('01 单元扭转').click();await button('读取工程参数').click();await ready();check(await page.getByLabel('Delaunay 边界规则',{exact:true}).inputValue()==='hull','Delaunay 边界规则随工程恢复');
 wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.boundaryMode==='square');await page.getByLabel('Delaunay 边界规则',{exact:true}).selectOption('square');const legacy=await(await wait).json();await ready();check(legacy.mother.vertices_coords.length===new Set([...seeds,[0,0],[1,0],[1,1],[0,1]].map(p=>p.join(','))).size,'旧版正方形补角仍可明确选择');
 await page.screenshot({path:'output/playwright/site-boundaries.png'});return {passed:checks.length,checks};
}
