async page=>{
 const checks=[],metrics=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.context-toolbar .outline')?.textContent==='重新计算'&&document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
 await page.setViewportSize({width:1280,height:800});
 await button('镶嵌设计').click();await ready();await button('01 单元扭转').click();await ready();
 const record=async(label,field,start,end)=>{
  await page.evaluate(()=>{
   const data=window.__tessPerf={frames:[],changes:[],last:'',stop:false,start:performance.now()};
   function sample(now){
    if(data.stop)return;
    const signature=Array.from(document.querySelectorAll('[data-segment]')).map(g=>{
     const l=g.querySelector('line');return l?['x1','y1','x2','y2'].map(k=>l.getAttribute(k)).join(','):'';
    }).join(';');
    data.frames.push(now);if(signature!==data.last){data.changes.push(now);data.last=signature;}
    requestAnimationFrame(sample);
   }requestAnimationFrame(sample);
  });
  const slider=page.getByLabel(field+'滑条',{exact:true}),box=await slider.boundingBox();
  const min=Number(await slider.getAttribute('min')),max=Number(await slider.getAttribute('max'));
  const x=value=>box.x+7+(box.width-14)*(value-min)/(max-min),y=box.y+box.height/2;
  await page.mouse.move(x(start),y);await page.mouse.down();
  for(let i=1;i<=48;i++){await page.mouse.move(x(start+(end-start)*i/48),y);await page.waitForTimeout(16);}
  const held=await page.evaluate(()=>window.__tessPerf.changes.length);
  await page.mouse.up();await ready();
  const data=await page.evaluate(()=>{const d=window.__tessPerf;d.stop=true;const gaps=d.frames.slice(1).map((x,i)=>x-d.frames[i]).sort((a,b)=>a-b);return {frames:d.frames.length,changedFrames:d.changes.length,durationMs:d.frames.at(-1)-d.frames[0],frameP95Ms:gaps[Math.floor(gaps.length*.95)],longFrames:gaps.filter(x=>x>50).length};});
  check(held>=20,label+' 在鼠标松开前持续更新至少 20 帧');
  metrics.push({label,heldUpdates:held,...data});await page.evaluate(m=>window.__tessMetrics=m,metrics);
 };
 await record('单元扭转','旋转角度',32,70);
 await button('02 周期拼接').click();await ready();
 await page.getByLabel('行数',{exact:true}).fill('6');await page.getByLabel('列数',{exact:true}).fill('6');await ready();
 await record('6×6 周期拼接','旋转角度',30,70);
 await record('6×6 周期缩放','缩放比例',.25,.75);
 // Hold the full calculation back: geometry must follow the input independently.
 let release;const gate=new Promise(resolve=>release=resolve);
 const hold=async route=>{await gate;await route.continue();};await page.route('**/api/tessellate',hold);
 try{
  const before=await page.locator('[data-segment]').first().innerHTML();
  await page.getByLabel('旋转角度',{exact:true}).fill('45');await page.waitForTimeout(60);
  const first=await page.locator('[data-segment]').first().innerHTML();
  await page.getByLabel('旋转角度',{exact:true}).fill('55');await page.waitForTimeout(60);
  const second=await page.locator('[data-segment]').first().innerHTML();
  check(before!==first&&first!==second,'后台未返回时，前端仍显示当前角度的几何');
  check(await button('采用折痕副本 →').isDisabled(),'实时预览未经当前参数检查时不可采用');
 }finally{release();await ready();await page.unroute('**/api/tessellate',hold);}
 await ready();
 for(const [name,field,start,end] of [['04 混合平铺','旋转角度',35,65],['08 铺石镶嵌','褶宽比',.15,.42],['09 盒褶编织','条带宽比',.15,.42]]){
  await button(name).click();await ready();await record(name,field,start,end);
  check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),name+' 无需面板滚动');
 }
 await page.screenshot({path:'output/playwright/tessellation-smooth.png'});
 return {passed:checks.length,checks,metrics};
}
