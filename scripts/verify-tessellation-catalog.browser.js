async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 await page.setViewportSize({width:1000,height:720});const keep=button('保留当前工程');if(await keep.count())await keep.click();
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('04 混合平铺').click();
 if(await button('收起平折').count()&&await button('收起平折').isEnabled())await button('收起平折').click();
 for(const tiling of [...Array.from({length:20},(_,i)=>`two-uniform-${i+1}`),...Array.from({length:5},(_,i)=>`resch-catalog-${i+1}`)]){
  const wait=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.tiling===tiling);
  await page.getByLabel('顶点构型',{exact:true}).selectOption(tiling);const r=await(await wait).json();
  await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
  check(r.stats?.checks.geometry.status==='passed'&&r.stats?.checks.local.status==='passed'&&await button('采用折痕副本 →').isEnabled(),tiling+' 几何与局部条件通过');
  check(r.source.periodicCell?.lattice?.length===2,tiling+' 返回精确周期向量');
  check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),tiling+' 一屏无滚动');
 }
 const changed=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.starAngle===35);
 await page.getByLabel('星尖角',{exact:true}).fill('35');const r=await(await changed).json();
 check(r.source.periodicCell.starTipAngle===35,'修改星尖角同步重建周期');
 await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('镶嵌设计').click();await button('01 单元扭转').click();await button('读取工程参数').click();
 await page.waitForFunction(()=>document.querySelector('select[aria-label="顶点构型"]')?.value==='resch-catalog-5');
 check(Number(await page.getByLabel('星尖角',{exact:true}).inputValue())===35,'工程恢复 Resch 目录和星尖角');
 await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 await page.screenshot({path:'output/playwright/tessellation-catalog-goal.png'});return {passed:checks.length,checks};
}
