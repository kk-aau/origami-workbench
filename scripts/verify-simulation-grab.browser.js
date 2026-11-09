async page=>{
 const checks=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const iframe=()=>page.locator('iframe[title="三维折叠模拟画布"]');
 const canvas=()=>page.frameLocator('iframe[title="三维折叠模拟画布"]').locator('#simulation');
 const state=()=>canvas().evaluate(element=>({backend:element.dataset.backend,status:element.dataset.status,steps:Number(element.dataset.steps),grabbed:element.dataset.grabbed}));
 const ready=backend=>page.waitForFunction(expected=>{
  const element=document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation');
  return element?.dataset.backend===expected&&['loaded','running','paused'].includes(element.dataset.status);
 },backend,{timeout:30000});
 const capture=async()=>canvas().evaluate(()=>{
  window.__simGrabDownload={original:URL.createObjectURL,items:[]};
  URL.createObjectURL=function(blob){window.__simGrabDownload.items.push(blob.text());return window.__simGrabDownload.original.call(this,blob);};
 });
 const exported=async path=>{
  await page.getByRole('tab',{name:'导出',exact:true}).click();
  const waiting=page.waitForEvent('download');
  await button('导出三维 FOLD').click();
  const file=await waiting;await file.saveAs(path);
  check((await file.failure())===null,`${path} 下载成功`);
  return JSON.parse(await canvas().evaluate(async()=>await window.__simGrabDownload.items.at(-1)));
 };
 const releaseExport=async path=>{
  const waiting=page.waitForEvent('download');
  await iframe().evaluate(element=>element.contentWindow.postMessage({type:'zhezhi-sim-export-fold'},location.origin));
  const file=await waiting;await file.saveAs(path);
  check((await file.failure())===null,`${path} 拖动中下载成功`);
  return JSON.parse(await canvas().evaluate(async()=>await window.__simGrabDownload.items.at(-1)));
 };
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 const pickPoints=async fold=>{
  const element=await canvas().evaluate(node=>({width:node.width,height:node.height}));
  const box=await canvas().boundingBox();
  const points=fold.vertices_coords.map(([x,y,z])=>[x,z,-y]);
  const center=[0,1,2].map(axis=>points.reduce((sum,point)=>sum+point[axis],0)/points.length);
  const radius=Math.max(.001,...points.map(point=>Math.hypot(...point.map((value,axis)=>value-center[axis]))));
  const scale=Math.max(1,Math.min(element.width,element.height)*.84)/(2*radius)*.88;
  const camDist=radius*3.2;
  return points.map(([x,y,z],index)=>{
   const depth=y-center[1],perspective=camDist/Math.max(camDist-depth,.001);
   const sx=element.width/2+(x-center[0])*perspective*scale;
   const sy=element.height/2-(z-center[2])*perspective*scale;
   return {index,x:box.x+sx*box.width/element.width,y:box.y+sy*box.height/element.height};
  }).filter(point=>point.x>box.x+6&&point.x<box.x+box.width-6&&point.y>box.y+6&&point.y<box.y+box.height-6)
    .sort((a,b)=>Math.abs(fold.vertices_coords[a.index][0]-100)-Math.abs(fold.vertices_coords[b.index][0]-100));
 };
 const exercise=async backend=>{
  await ready(backend);
  check((await state()).backend===backend,`${backend} 后端载入成功`);
  await capture();
  if(!(await page.locator('.sim-advanced').evaluate(element=>element.open)))await page.locator('.sim-advanced > summary').click();
  await button('展开复位').click();
  await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.status==='paused');
  await button('正面视角').click();
  await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.view==='front');
  const before=await exported(`output/playwright/simulation-grab-${backend}-before.fold`);
  check(before.vertices_coords.length>=6&&before.vertices_coords.every(point=>point.length===3),`${backend} 折前导出含三维顶点`);
  const orbitPoint=(await pickPoints(before))[0],orbitSteps=(await state()).steps;
  await page.mouse.move(orbitPoint.x,orbitPoint.y);await page.mouse.down();
  check((await state()).grabbed===undefined,`${backend} 默认从顶点拖动也只旋转视角`);
  await page.mouse.move(orbitPoint.x+16,orbitPoint.y-10,{steps:8});await page.mouse.up();
  check(await canvas().evaluate(element=>Math.abs(Number(element.dataset.yaw)-16*.007)<1e-6&&Math.abs(Number(element.dataset.pitch)+10*.007)<1e-6),`${backend} 旋转角度只取鼠标位移，不受画布偏移或像素比例影响`);
  await page.waitForTimeout(250);
  const orbited=await exported(`output/playwright/simulation-orbit-${backend}.fold`);
  check(JSON.stringify(orbited.vertices_coords)===JSON.stringify(before.vertices_coords),`${backend} 旋转前后三维顶点完全一致`);
  check((await state()).steps===orbitSteps&&(await state()).status==='paused',`${backend} 旋转不启动求解或推进模拟`);
  await button('正面视角').click();
  await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.view==='front');
  let grabbed=null;
  await page.keyboard.down('Shift');
  for(const point of await pickPoints(before)){
   await page.mouse.move(point.x,point.y);await page.mouse.down();
   await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.grabbed!==undefined,null,{timeout:500}).catch(()=>{});
   const current=(await state()).grabbed;
   if(current!==undefined){grabbed=Number(current);break;}
   await page.mouse.up();
  }
  check(Number.isInteger(grabbed)&&grabbed>=0&&grabbed<before.vertices_coords.length,`${backend} 画布命中并抓取真实顶点`);
  // Playwright does not expose pointer coordinates; use the selected vertex's exact projection again.
  const picked=(await pickPoints(before)).find(point=>point.index===grabbed);
  check(!!picked,`${backend} 被抓顶点有可见投影`);
  await page.mouse.move(picked.x+16,picked.y-10,{steps:8});
  await page.waitForTimeout(1000);
  check((await state()).grabbed===String(grabbed),`${backend} 拖动时约束保持在同一顶点`);
  const during=await releaseExport(`output/playwright/simulation-grab-${backend}-during.fold`);
  const changed=distance(before.vertices_coords[grabbed],during.vertices_coords[grabbed]);
  check(changed>.03,`${backend} 拖动中的三维 FOLD 顶点确实移动（${changed.toFixed(3)}）`);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.grabbed===undefined);
  check((await state()).grabbed===undefined,`${backend} 松开后抓取约束标识清除`);
  const releasedSteps=(await state()).steps;
  await page.waitForTimeout(550);
  const after=await exported(`output/playwright/simulation-grab-${backend}-after.fold`);
  check(after.vertices_coords[grabbed].every(Number.isFinite)&&(await state()).steps===releasedSteps&&(await state()).status==='paused'&&distance(after.vertices_coords[grabbed],during.vertices_coords[grabbed])<2e-6,`${backend} 释放约束后暂停保留塑形顶点、不重新居中`);
  const foldingStart=(await state()).steps;
  await iframe().evaluate(element=>element.contentWindow.postMessage({type:'zhezhi-sim-progress',value:.6},location.origin));
  await page.waitForFunction(minimum=>Number(document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.steps)>minimum,foldingStart+3000,{timeout:30000});
  await iframe().evaluate(element=>element.contentWindow.postMessage({type:'zhezhi-sim-pause'},location.origin));
  await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.status==='paused');
  const folded=await exported(`output/playwright/simulation-orbit-${backend}-folded-before.fold`),foldedSteps=(await state()).steps;
  check(folded.vertices_coords.some(point=>Math.abs(point[2])>.001),`${backend} 旋转回归覆盖实际折叠后的三维纸面`);
  await button('立体视角').click();
  const box=await canvas().boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2-15,{steps:5});await page.mouse.up();
  const foldedOrbit=await exported(`output/playwright/simulation-orbit-${backend}-folded-after.fold`);
  check(JSON.stringify(foldedOrbit.vertices_coords)===JSON.stringify(folded.vertices_coords)&&(await state()).steps===foldedSteps,`${backend} 折叠后旋转也不改变坐标或求解步数`);
  return {picked:grabbed,changed};
 };
 await page.evaluate(()=>{window.__simGrabOriginalConfirm=window.confirm;window.confirm=()=>true;});
 try{
  await page.setViewportSize({width:1200,height:800});
  for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
  const segment=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
  const input={format:'zhezhi-workbench',version:2,schemaVersion:2,name:'三维抓点回归-'+Date.now(),paper:{width:200,height:100},segments:[
   segment('top',[0,0],[200,0]),segment('right',[200,0],[200,100]),segment('bottom',[200,100],[0,100]),segment('left',[0,100],[0,0]),
   segment('crease',[100,0],[100,100],'M',-90),
  ]};
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((element,text)=>{
   const transfer=new DataTransfer();transfer.items.add(new File([text],'sim-grab.zhezhi.json',{type:'application/json'}));
   element.files=transfer.files;element.dispatchEvent(new Event('change',{bubbles:true}));
  },JSON.stringify(input));
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,input.name);
  await button('三维模拟').click();
  await page.locator('.sim-advanced > summary').click();
  const gpu=await exercise('webgl2');
  await iframe().evaluate(element=>{element.src='/simulator/index.html?backend=cpu';});
  await page.waitForFunction(()=>{
   const frame=document.querySelector('iframe[title="三维折叠模拟画布"]');
   return frame?.contentWindow?.location.search.includes('backend=cpu')&&frame.contentDocument?.querySelector('#simulation')?.dataset.status==='ready';
  },null,{timeout:30000});
  await button('载入当前折痕').click();
  const cpu=await exercise('cpu');
  await page.screenshot({path:'output/playwright/simulation-grab-complete.png'});
  return {passed:checks.length,checks,gpu,cpu};
 }finally{
  await page.keyboard.up('Shift').catch(()=>{});
  await page.mouse.up().catch(()=>{});
  await canvas().evaluate(()=>{
   if(window.__simGrabDownload){URL.createObjectURL=window.__simGrabDownload.original;delete window.__simGrabDownload;}
  }).catch(()=>{});
  await page.evaluate(()=>{if(window.__simGrabOriginalConfirm){window.confirm=window.__simGrabOriginalConfirm;delete window.__simGrabOriginalConfirm;}}).catch(()=>{});
 }
}
