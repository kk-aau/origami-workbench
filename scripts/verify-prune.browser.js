async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const result=()=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.pruneBoundary);
 await page.setViewportSize({width:1000,height:720});await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('02 周期拼接').click();await ready();
 await button('修剪范围').click();await page.getByLabel('修剪轮廓坐标').fill('[[0.2,0.2],[1.8,0.2],[1.8,1.8],[0.2,1.8]]');let wait=result();await button('采用修剪范围').click();let r=await (await wait).json();await ready();
 check(r.stats.tiles===4&&r.mother.vertices_coords.some(p=>p[0]===2&&p[1]===2),'修剪只删整块，保留与范围相交的完整拼块');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'修剪入口未引入工具栏滚动');
 const old=r.mother;wait=result();await page.getByLabel('行数',{exact:true}).fill('4');await page.getByLabel('行数',{exact:true}).press('Enter');r=await (await wait).json();await ready();check(r.stats.tiles===4&&JSON.stringify(r.mother)===JSON.stringify(old),'母结构扩大后仍按修剪范围重新筛选');
 wait=result();await page.getByLabel('旋转角度',{exact:true}).fill('40');await page.getByLabel('旋转角度',{exact:true}).press('Enter');r=await (await wait).json();await ready();check(r.stats.parameters.angle===40&&r.stats.checks.local.status==='passed','修剪后调参重新生成有效折痕');
 await button('修剪范围 · 已启用').click();await button('拖动修剪轮廓').click();check(await page.getByRole('dialog',{name:'编辑修剪轮廓',exact:true}).count()===1,'可视轮廓编辑显示在母结构上');await page.getByRole('dialog',{name:'编辑修剪轮廓',exact:true}).getByRole('button',{name:'关闭镶嵌窗口'}).click();await page.getByLabel('修剪轮廓坐标').fill('[[0,0],[1,0],[0.2,0.2],[0,1]]');await button('采用修剪范围').click();check((await page.getByRole('alert').last().textContent()).includes('凸多边形'),'拒绝非凸修剪范围且保留当前结果');await button('关闭镶嵌窗口').click();
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();wait=result();await button('读取工程参数').click();r=await (await wait).json();await ready();check(r.stats.tiles===4&&r.stats.parameters.pruneBoundary.length===4&&r.stats.parameters.rows===4,'工程恢复保留修剪与原始生成参数');
 await button('修剪范围 · 已启用').click();wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&!r.request().postDataJSON()?.pruneBoundary);await button('清除修剪').click();r=await (await wait).json();await ready();check(r.stats.tiles===12,'清除修剪恢复完整母结构');
 await page.screenshot({path:'output/playwright/prune.png'});return {passed:checks.length,checks};
}
