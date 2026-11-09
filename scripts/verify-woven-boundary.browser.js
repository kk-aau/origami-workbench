async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('12 线组编织').click();await ready();
 await page.getByLabel('线组方式',{exact:true}).selectOption('chord');await ready();await button('褶宽约束／周期／固定面').click();await page.getByText('边界点坐标',{exact:true}).click();await button('正多边形边界').click();
 const wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.boundary?.length===1);await button('保存编织约束').click();const response=await wait;check(response.ok(),'单点旋转凸包生成七边形编织边界');await ready();
 await button('编辑边界').click();await page.getByLabel('点 X',{exact:true}).fill('1.03');await page.getByLabel('点 X',{exact:true}).press('Enter');await button('保存几何修改').click();await ready();
 await button('褶宽约束／周期／固定面').click();await page.getByText('边界点坐标',{exact:true}).click();check(JSON.parse(await page.getByLabel('边界坐标',{exact:true}).inputValue())[0][0]===1.03,'单点边界可交互编辑与保存');
 await page.getByLabel('边界坐标',{exact:true}).fill('{bad');await button('保存编织约束').click();check((await page.getByRole('alert').textContent()).includes('JSON'),'损坏边界不替换当前参数');await button('关闭镶嵌窗口').click();
 await button('恢复圆弦边界').click();await ready();check(await button('采用折痕副本 →').isEnabled(),'恢复自动圆弦边界');
 await page.getByLabel('线组方式',{exact:true}).selectOption('lines');await ready();await button('褶宽约束／周期／固定面').click();await page.getByText('边界点坐标',{exact:true}).click();
 await page.getByLabel('边界坐标',{exact:true}).fill('[[-1,-1],[1,-1],[1.2,0],[1,1],[-1,1]]');await button('保存编织约束').click();await ready();await button('编辑边界').click();check(await page.locator('.tess-mesh-editor circle').count()===5,'任意凸边界点数进入可视编辑器');await button('保存几何修改').click();await ready();
 return {passed:checks.length,checks};
}
