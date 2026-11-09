async page=>{
 const checks=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const button=name=>page.getByRole('button',{name,exact:true}),bar=()=>page.getByRole('toolbar',{name:'平折图像显示'});
 const cp=()=>page.locator('[data-segment]').evaluateAll(ps=>ps.map(p=>p.outerHTML).join('|'));
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const flatReady=()=>page.waitForFunction(()=>document.querySelector('.tess-flat-pane')?.getAttribute('data-current')==='true'&&document.querySelectorAll('[data-tess-flat-face]').length>0);
 const hit=async selector=>page.locator(selector).evaluateAll((ps,selector)=>{
  for(const p of [...ps].reverse()){
   const points=Array.from(p.points),x=points.reduce((s,p)=>s+p.x,0)/points.length,y=points.reduce((s,p)=>s+p.y,0)/points.length;
   const q=new DOMPoint(x,y).matrixTransform(p.getScreenCTM());if(document.elementFromPoint(q.x,q.y)?.closest(selector))return {x:q.x,y:q.y};
  }throw Error('未找到可拖动的折后纸面');
 },selector);
 const drag=async selector=>{const p=await hit(selector);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x-45,p.y+15,{steps:8});await page.mouse.up();};
 const paint=async selector=>check(await page.locator(selector).evaluateAll(ps=>ps.every(p=>p.getAttribute('fill')===(p.getAttribute('data-material')==='front'?'#d47a24':'#256ec8'))),'预设配色正确应用到生成结果 '+selector);
 const preset=async()=>{await button('背面').click();await button('透视').click();await page.getByLabel('平折正面颜色',{exact:true}).fill('#d47a24');await page.getByLabel('平折背面颜色',{exact:true}).fill('#256ec8');};
 const position=async(svg,selector,label)=>{
  const initial=await svg.getAttribute('viewBox');await drag(selector);const dragged=await svg.getAttribute('viewBox');check(initial!==dragged,label+'可拖动');
  const point=await hit(selector);await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-120);await page.waitForFunction(({name,value})=>document.querySelector('svg[aria-label="'+name+'"]')?.getAttribute('viewBox')!==value,{name:await svg.getAttribute('aria-label'),value:dragged});const moved=await svg.getAttribute('viewBox');check(moved!==dragged,label+'缩放后继续验证显示切换');
  for(const name of ['正面','实体','背面','透视','实体','正面']){await button(name).click();check(await svg.getAttribute('viewBox')===moved,label+'切换'+name+'保留位置和缩放');}
  await drag(selector);const movedAgain=await svg.getAttribute('viewBox');await button('背面').click();check(movedAgain!==moved&&await svg.getAttribute('viewBox')===movedAgain,label+'再次移动后切面不会回到旧位置');
  await page.getByLabel('复位平折图像位置',{exact:true}).click();await page.waitForFunction(({name,value})=>document.querySelector('svg[aria-label="'+name+'"]')?.getAttribute('viewBox')!==value,{name:await svg.getAttribute('aria-label'),value:movedAgain});check(true,label+'只有复位按钮重新定位');
 };
 try{
  for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
  await page.setViewportSize({width:1000,height:720});
  check(await bar().isVisible()&&await page.locator('[data-face-id]').count()===0,'未计算平折时基本参数已显示');
  check(await bar().evaluate(e=>e.parentElement.matches('.fold-dock')),'工具条位于底部折叠控制栏');
  check(await button('删除平折结果').isDisabled(),'无结果时删除按钮禁用');
  await preset();await button('计算平折').click();await page.waitForFunction(()=>document.querySelectorAll('[data-face-id]').length>0);await paint('[data-face-id]');
  check(await page.locator('.flat-workspace').getAttribute('data-model-camera').then(k=>k.startsWith('back-transparent')),'计算前的面向与显示方式应用到新模型');
  check(await page.locator('.canvas-fold-overlay .fold-display-bar').count()===0,'画布内部不再出现重复工具框');
  await position(page.getByLabel('实际平折面几何，点击面查看原始位置',{exact:true}),'[data-face-id]','编辑模型');
  const before=await cp();page.once('dialog',dialog=>dialog.dismiss());await button('删除平折结果').click();check(await page.locator('[data-face-id]').count()>0,'取消删除保留结果');
  page.once('dialog',dialog=>dialog.accept());await button('删除平折结果').click();
  check(await page.locator('[data-face-id]').count()===0&&await button('删除平折结果').isDisabled(),'删除按钮移除模型而不是只隐藏');
  check(await cp()===before&&await bar().isVisible(),'删除模型保留原折痕和常驻参数');
  await button('计算平折').click();await page.waitForFunction(()=>document.querySelectorAll('[data-face-id]').length>0);await paint('[data-face-id]');
  check(await page.locator('.fold-dock').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'1000 像素宽度下底部控制栏无需滚动');
  await page.setViewportSize({width:1820,height:1020});await page.screenshot({path:'output/playwright/permanent-fold-editor.png'});
  await button('镶嵌设计').click();await ready();await button('02 周期拼接').click();await ready();
  check(await bar().isVisible()&&await page.locator('[data-tess-flat-face]').count()===0,'镶嵌未打开平折也可设置基本参数');
  await preset();await button('计算平折').click();await flatReady();await paint('[data-tess-flat-face]');
  check(await page.locator('[data-tess-flat-face]').evaluateAll(ps=>ps.every(p=>p.getAttribute('fill-opacity')==='0.25')),'镶嵌计算前设置的透视模式生效');
  await position(page.getByLabel('镶嵌实时平折画面',{exact:true}),'[data-tess-flat-face]','镶嵌模型');
  const tessBefore=await cp();await button('删除平折结果').click();check(await page.locator('[data-tess-flat-face]').count()===0&&await cp()===tessBefore,'删除镶嵌平折结果保留构造折痕');
  await page.getByLabel('旋转角度',{exact:true}).fill('45');await ready();check(await page.locator('.tess-flat-pane').count()===0,'删除后的结果不会被后续调参自动恢复');
  await button('计算平折').click();await flatReady();await paint('[data-tess-flat-face]');
  await page.screenshot({path:'output/playwright/permanent-fold-tess.png'});
  await page.setViewportSize({width:1000,height:720});check(await page.locator('.fold-dock').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'窄屏镶嵌底部控制栏无需滚动');
  const result={passed:checks.length,checks};await page.evaluate(result=>{window.__permanentFoldResult=result;},result);return result;
 }catch(e){await page.evaluate(result=>{window.__permanentFoldResult=result;},{error:e.message,checks});throw Error(e.message+'；已通过：'+checks.join('、'));}
}
