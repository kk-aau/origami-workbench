async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 await page.setViewportSize({width:1000,height:720});const keep=button('保留当前工程');if(await keep.count())await keep.click();
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('12 线组编织').click();
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 await ready();await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');check(true,'默认任意方向三线同画布平折有层序解');
 await button('收起平折').click();
 for(const mode of ['lines','chord','random']){
  await page.getByLabel('线组方式',{exact:true}).selectOption(mode);await ready();
  check(await button('采用折痕副本 →').isEnabled(),mode+' 默认折痕可采用');
  check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),mode+' 一屏无滚动');
 }
 await page.getByLabel('线组方式',{exact:true}).selectOption('lines');await ready();await button('编辑线组 · 3').click();await page.getByLabel('线 3 角度',{exact:true}).fill('47');await page.getByLabel('线 2 宽度倍率',{exact:true}).fill('1.2');await button('保存线组').click();await ready();
 await button('编辑边界').click();await page.getByLabel('点 X',{exact:true}).fill('-.98');await page.getByLabel('点 X',{exact:true}).press('Enter');await button('保存几何修改').click();await ready();
 const changed=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.width===.07);
 await page.getByLabel('条带基准宽',{exact:true}).fill('.07');const a=await(await changed).json();await ready();
 check(a.stats.parameters.lines[2][0]===47&&a.stats.parameters.lines[1][2]===1.2&&a.stats.parameters.boundary[0][0]===-.98,'线组和边界编辑后调宽保持几何');
 check(Math.abs(a.source.lines[1][2]-.084)<1e-9,'每条共线组独立倍率控制真实宽度');
 await button('12 线组编织').click();await ready();await button('编辑线组 · 3').click();await button('增加线组').click();
 for(const [i,row] of [[0,-.4,1],[0,.4,1],[90,-.4,1],[90,.4,1]].entries())for(const [j,value] of row.entries())await page.getByLabel(`线 ${i+1} ${['角度','距离','宽度倍率'][j]}`,{exact:true}).fill(String(value));
 await button('保存线组').click();await ready();await button('褶宽约束／周期／固定面').click();await button('匹配矩形对边').click();
 check((await page.getByLabel('周期端点配对',{exact:true}).inputValue()).trim().split('\n').length===4,'母结构编号自动匹配四对周期端点');
 await page.getByLabel('固定面编号',{exact:true}).fill('2');await page.getByLabel('最小褶宽倍率',{exact:true}).fill('1.1');
 const wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.periodicity?.length===4);await button('保存编织约束').click();const b=await(await wait).json();await ready();
 check(b.source.periodVectors.length===2&&b.source.borderInset===0&&b.source.stationaryFace===1,'周期展开吻合、自动关闭边界内缩、固定面生效');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();await button('读取工程参数').click();await ready();
 await button('褶宽约束／周期／固定面').click();check(Number(await page.getByLabel('固定面编号',{exact:true}).inputValue())===2&&(await page.getByLabel('周期端点配对',{exact:true}).inputValue()).trim().split('\n').length===4,'工程恢复线组、周期与固定面');await button('保存编织约束').click();await ready();
 await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');check(true,'周期四线编织同画布平折有层序解');
 await page.screenshot({path:'output/playwright/woven-goal.png'});return {passed:checks.length,checks};
}
