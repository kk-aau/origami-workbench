async page=>{
 const checks=[],check=(value,text)=>{if(!value)throw Error(text);checks.push(text);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const flatReady=()=>page.waitForFunction(()=>document.querySelector('.tess-flat-pane')?.getAttribute('data-current')==='true'&&document.querySelectorAll('[data-tess-flat-face]').length>0);
 const shape=()=>page.locator('[data-tess-flat-face]').evaluateAll(ps=>ps.map(p=>p.getAttribute('points')).join('|'));
 for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
 await page.setViewportSize({width:1000,height:720});
 await button('折痕编辑').click();
 const editor=await page.locator('[data-segment]').evaluateAll(ps=>ps.map(p=>({id:p.getAttribute('data-segment'),assignment:p.getAttribute('data-assignment'),coordinates:['x1','y1','x2','y2'].map(k=>p.querySelector('line').getAttribute(k))})));
 await button('镶嵌设计').click();await ready();await button('02 周期拼接').click();await ready();
 if(!await page.locator('.tess-flat-pane').count())await button('计算平折').click();await flatReady();
 check(await button('镶嵌设计').getAttribute('aria-pressed')==='true','计算平折始终留在镶嵌工作区');
 check(await page.locator('[data-tess-flat-face]').count()>0,'生成实际平折面');
 await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');
 check(true,'独立层序计算成功，且与几何预览分开');
 await page.getByLabel('行数',{exact:true}).fill('6');await page.getByLabel('列数',{exact:true}).fill('6');await ready();await flatReady();
 await page.evaluate(()=>{
  const d=window.__tessFlatPerf={rects:[],times:[],shapes:[],stop:false};let previous='';
  function sample(now){if(d.stop)return;
   const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
   d.rects.push([...rect('.tess-cp-pane .crease-canvas'),...rect('.tess-flat-drawing'),...rect('.tess-cancel')]);d.times.push(now);
   const shape=Array.from(document.querySelectorAll('[data-tess-flat-face]')).map(p=>p.getAttribute('points')).join('|');
   if(shape!==previous){d.shapes.push(now);previous=shape;}requestAnimationFrame(sample);
  }requestAnimationFrame(sample);
 });
 const range=page.getByLabel('旋转角度滑条',{exact:true}),box=await range.boundingBox(),y=box.y+box.height/2;
 const x=a=>box.x+7+(box.width-14)*(a+80)/160;
 await page.mouse.move(x(30),y);await page.mouse.down();await page.mouse.move(x(65),y,{steps:60});
 const held=await page.evaluate(()=>window.__tessFlatPerf.shapes.length);await page.mouse.up();await ready();await flatReady();
 const metrics=await page.evaluate(()=>{const d=window.__tessFlatPerf;d.stop=true;const gaps=d.times.slice(1).map((t,i)=>t-d.times[i]).sort((a,b)=>a-b);return {frames:d.times.length,foldedUpdates:d.shapes.length,maxLayoutShift:Math.max(...d.rects.flatMap(r=>r.map((v,i)=>Math.abs(v-d.rects[0][i])))),frameP95Ms:gaps[Math.floor(gaps.length*.95)]};});
 check(held>=12,'快速拖动未松开时，平折画面持续更新');check(metrics.maxLayoutShift<.1,'提示、画布与取消按钮位置尺寸全程不跳动');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'1000×720 参数面板无需滚动');
 // Pause network responses while exact shrink/rotate geometry remains available.
 let release;const gate=new Promise(resolve=>release=resolve),hold=async route=>{await gate;await route.continue();};
 await page.route('**/api/tessellate',hold);
 try{
  const before=await shape();await page.getByLabel('旋转角度',{exact:true}).fill('42');await flatReady();const first=await shape();
  await page.getByLabel('旋转角度',{exact:true}).fill('54');await flatReady();const second=await shape();
  check(before!==first&&first!==second,'后台构造未返回时，平折几何也按当前参数更新');
  check(await button('采用折痕副本 →').isDisabled(),'实时平折不会绕过候选检查');
  check(!(await page.locator('.tess-flat-pane header span').innerText()).includes('层序已解'),'参数变化立即撤销旧层序的有效状态');
 }finally{release();await ready();await page.unroute('**/api/tessellate',hold);}
 await flatReady();
 const svg=page.getByLabel('镶嵌实时平折画面',{exact:true}),bounds=await svg.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.wheel(0,-220);await page.waitForTimeout(50);
 const camera=await svg.getAttribute('viewBox');await page.getByLabel('旋转角度',{exact:true}).fill('58');await ready();await flatReady();
 check(await svg.getAttribute('viewBox')===camera,'调整参数保留平折缩放与位置');
 await page.locator('.fold-dock .fold-display-bar summary').click();await button('暂停').click();await page.waitForTimeout(60);const frozen=await shape();await page.getByLabel('旋转角度',{exact:true}).fill('62');await ready();await page.waitForTimeout(100);
 check(await shape()===frozen,'暂停只冻结平折预览，不影响镶嵌调参');await button('继续').click();await flatReady();check(await shape()!==frozen,'继续后收敛到最新参数');await page.locator('.fold-dock .fold-display-bar summary').click();
 const stableBounds=await page.locator('.tess-cp-pane').boundingBox();await page.getByLabel('旋转角度',{exact:true}).fill('0');
 await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.textContent==='参数需调整');
 check(JSON.stringify(await page.locator('.tess-cp-pane').boundingBox())===JSON.stringify(stableBounds),'无效参数的提示同样不会挤动画布');
 check(await button('采用折痕副本 →').isDisabled(),'错误参数不能借用上一帧平折结果采用');
 await page.getByLabel('旋转角度',{exact:true}).fill('62');await ready();await flatReady();
 await button('背面').click();check(await button('背面').getAttribute('aria-pressed')==='true','支持查看背面');
 await button('透视').click();check(await button('透视').getAttribute('aria-pressed')==='true','支持 X 光显示');
 await button('收起平折').click();check(await page.locator('.tess-flat-pane').count()===0,'收起释放平折区');await button('计算平折').click();await flatReady();check(true,'重新打开自动计算当前镶嵌');
 await page.screenshot({path:'output/playwright/tessellation-flat.png'});
 await button('折痕编辑').click();check(JSON.stringify(await page.locator('[data-segment]').evaluateAll(ps=>ps.map(p=>({id:p.getAttribute('data-segment'),assignment:p.getAttribute('data-assignment'),coordinates:['x1','y1','x2','y2'].map(k=>p.querySelector('line').getAttribute(k))}))))===JSON.stringify(editor),'镶嵌平折及调参不修改原折痕工程');
 return {passed:checks.length,checks,metrics};
}
