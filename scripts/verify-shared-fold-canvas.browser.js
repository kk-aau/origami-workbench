async page=>{
 const checks=[],errors=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const error=e=>errors.push(e.message);page.on('pageerror',error);
 const button=name=>page.getByRole('button',{name,exact:true});
 const crease=()=>page.locator('svg.crease-canvas');
 const rect=()=>crease().boundingBox();
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const flatReady=()=>page.waitForFunction(()=>document.querySelector('.tess-flat-pane')?.getAttribute('data-current')==='true'&&document.querySelectorAll('[data-tess-flat-face]').length>0);
 const palette=async selector=>{
  await page.getByLabel('平折正面颜色',{exact:true}).fill('#ffcc00');
  await page.getByLabel('平折背面颜色',{exact:true}).fill('#3366ff');
  await page.getByLabel('平折边线颜色',{exact:true}).fill('#151515');
  check(await page.locator(selector).evaluateAll(ps=>ps.every(p=>p.getAttribute('fill')===(p.getAttribute('data-material')==='front'?'#ffcc00':'#3366ff')&&p.getAttribute('stroke')==='#151515')),'正面、背面、边线配色即时更新 '+selector);
 };
 const hit=async selector=>page.locator(selector).evaluateAll((ps,selector)=>{
  for(const p of [...ps].reverse()){
   const points=Array.from(p.points),x=points.reduce((s,p)=>s+p.x,0)/points.length,y=points.reduce((s,p)=>s+p.y,0)/points.length;
   const q=new DOMPoint(x,y).matrixTransform(p.getScreenCTM()),hit=document.elementFromPoint(q.x,q.y);
   if(hit?.closest(selector))return {x:q.x,y:q.y};
  }throw Error('没有可操作的折后面');
 },selector);
 try{
  for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
  await page.setViewportSize({width:1000,height:720});
  let before=await rect();await button('计算平折').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-face-id]').length>0);
  check(JSON.stringify(await rect())===JSON.stringify(before),'折痕编辑打开平折不挤压原画布');
  check(await page.locator('.inline-fold-result,[aria-label="平折结果区宽度"]').count()===0,'不再创建独立平折结果区或分隔条');
  check(await page.locator('.canvas-wrap > .canvas-fold-overlay').count()===1,'折后模型位于折痕的同一画布容器');
  check(await page.locator('[data-face-id]').evaluateAll(ps=>ps.every(p=>p.getAttribute('fill-opacity')==='1')),'默认实体模式不透明');
  await button('透视').click();check(await page.locator('[data-face-id]').evaluateAll(ps=>ps.every(p=>p.getAttribute('fill-opacity')==='0.25')),'透视按钮显示半透明内部纸面');
  await button('实体').click();await palette('[data-face-id]');
  await button('背面').click();check(await page.locator('.flat-workspace').getAttribute('data-model-camera').then(v=>v.startsWith('back-solid')),'背面使用实体显示');
  await palette('[data-face-id]');await button('正面').click();
  let cpView=await crease().getAttribute('viewBox');let model=page.getByLabel('实际平折面几何，点击面查看原始位置',{exact:true});let view=await model.getAttribute('viewBox');
  let point=await hit('[data-face-id]');await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x-70,point.y+20,{steps:10});await page.mouse.up();
  check(await model.getAttribute('viewBox')!==view&&await crease().getAttribute('viewBox')===cpView,'左键拖动模型不移动或修改折痕图');
  point=await hit('[data-face-id]');view=await model.getAttribute('viewBox');await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-200);await page.waitForTimeout(100);
  check(await model.getAttribute('viewBox')!==view&&await crease().getAttribute('viewBox')===cpView,'模型滚轮缩放与折痕相机独立');
  await page.getByLabel('复位平折图像位置',{exact:true}).click();
  check(await page.locator('.fold-display-bar').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'编辑平折工具条无需滚动');
  await page.screenshot({path:'output/playwright/shared-fold-editor.png'});
  await button('收起平折').click();check(JSON.stringify(await rect())===JSON.stringify(before),'收起平折不改变折痕画布尺寸');
  await button('显示平折').click();check(await page.getByLabel('平折正面颜色',{exact:true}).inputValue()==='#ffcc00','重新显示编辑模型保留配色');
  const count=await page.locator('[data-segment]').count();await button('线段').click();const canvas=await rect();
  await page.mouse.click(canvas.x+35,canvas.y+canvas.height*.68);await page.mouse.click(canvas.x+95,canvas.y+canvas.height*.75);
  check(await page.locator('[data-segment]').count()>count,'平折图层显示时仍能在空白处编辑折痕');
  await button('镶嵌设计').click();await ready();await button('02 周期拼接').click();await ready();before=await rect();
  await button('计算平折').click();await flatReady();
  check(JSON.stringify(await rect())===JSON.stringify(before),'镶嵌打开平折不挤压原画布');
  check(await page.locator('.canvas-wrap > .tess-flat-pane.canvas-fold-overlay').count()===1,'镶嵌折后图也位于原画布图层');
  check(await page.locator('[data-tess-flat-face]').evaluateAll(ps=>ps.every(p=>p.getAttribute('fill-opacity')==='1')),'镶嵌默认实体纸面');
  await button('透视').click();check(await page.locator('[data-tess-flat-face]').evaluateAll(ps=>ps.every(p=>p.getAttribute('fill-opacity')==='0.25')),'镶嵌可切换透视模式');
  await button('实体').click();await palette('[data-tess-flat-face]');
  await button('背面').click();await palette('[data-tess-flat-face]');await button('正面').click();
  cpView=await crease().getAttribute('viewBox');model=page.getByLabel('镶嵌实时平折画面',{exact:true});view=await model.getAttribute('viewBox');
  point=await hit('[data-tess-flat-face]');await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x-80,point.y+15,{steps:10});await page.mouse.up();
  check(await model.getAttribute('viewBox')!==view&&await crease().getAttribute('viewBox')===cpView,'镶嵌模型可以在同画布独立拖动');
  const shape=()=>page.locator('[data-tess-flat-face]').evaluateAll(ps=>ps.map(p=>p.getAttribute('points')).join('|'));
  let previous=await shape();view=await model.getAttribute('viewBox');await page.getByLabel('旋转角度',{exact:true}).fill('45');await ready();await flatReady();
  check(await shape()!==previous&&await model.getAttribute('viewBox')===view,'调参更新折后形状并保留模型位置');
  check(await page.getByLabel('平折正面颜色',{exact:true}).inputValue()==='#ffcc00','调参保留模型配色');
  previous=await shape();await page.getByLabel('平折顺时针旋转45度',{exact:true}).click();check(await shape()!==previous,'工具条旋转只调整模型显示方向');
  check(await page.locator('.fold-display-bar').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'镶嵌平折工具条无需滚动');
  await page.screenshot({path:'output/playwright/shared-fold-tess.png'});
  await button('收起平折').click();check(JSON.stringify(await rect())===JSON.stringify(before),'镶嵌收起平折不改变画布尺寸');
  await button('计算平折').click();await flatReady();check(await page.getByLabel('平折正面颜色',{exact:true}).inputValue()==='#ffcc00','镶嵌收起重开保留配色');
  check(errors.length===0,'无浏览器运行错误');return {passed:checks.length,checks};
 }catch(e){throw Error(e.message+'；已通过：'+checks.join('、'));}finally{page.off('pageerror',error);}
}
