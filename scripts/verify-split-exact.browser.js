async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 await page.setViewportSize({width:1000,height:720});const keep=button('保留当前工程');if(await keep.count())await keep.click();
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('11 分裂扭转').click();
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 for(const variant of ['general','centered','centered-angle','offset']){
  await page.getByLabel('分裂方式',{exact:true}).selectOption(variant);await ready();
  check(await button('采用折痕副本 →').isEnabled(),variant+' 默认折痕可采用');
  if(!await page.locator('.tess-flat-pane').count())await button('计算平折').click();
  await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');
  check(true,variant+' 同画布平折层序求解成功');
  check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),variant+' 一屏无滚动');
 }
 await page.getByLabel('分裂方式',{exact:true}).selectOption('general');await ready();await button('编辑外四边形').click();
 await page.getByLabel('点 X',{exact:true}).fill('-.01');await page.getByLabel('点 X',{exact:true}).press('Enter');await button('保存几何修改').click();
 await page.getByLabel('精确褶角',{exact:true}).fill('72');await ready();
 const wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.tilt===72);await button('重新计算').click();const r=await(await wait).json();await ready();
 check(r.stats.parameters.polygon[0][0]===-.01&&r.stats.parameters.tilt===72,'编辑轮廓后调褶角保留形状');
 check(Math.abs(r.source.pleatAngle-72)<1e-9,'输入褶角作为精确边缘方向进入构造');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();await button('读取工程参数').click();
 check(await page.getByLabel('分裂方式',{exact:true}).inputValue()==='general'&&Number(await page.getByLabel('精确褶角',{exact:true}).inputValue())===72,'工程恢复精确分裂方式和参数');
 await page.screenshot({path:'output/playwright/split-exact-goal.png'});return {passed:checks.length,checks};
}
