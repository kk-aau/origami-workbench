async page=>{
 const checks=[],errors=[],runs=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const iframe=()=>page.locator('iframe[title="三维折叠模拟画布"]');
 const canvas=()=>page.frameLocator('iframe[title="三维折叠模拟画布"]').locator('#simulation');
 const state=()=>canvas().evaluate(element=>({backend:element.dataset.backend,status:element.dataset.status,
  steps:Number(element.dataset.steps),creaseStyle:element.dataset.creaseStyle,view:element.dataset.view,
  target:Number(element.dataset.targetProgress),layers:Number(element.dataset.surfaceLayers)}));
 const waitDataset=async(key,value)=>page.waitForFunction(({key,value})=>
  document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset[key]===value,
  {key,value},{timeout:30000});
 const ready=backend=>page.waitForFunction(expected=>{
  const element=document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation');
  return element?.dataset.backend===expected&&['loaded','running','paused'].includes(element.dataset.status);
 },backend,{timeout:30000});
 const upload=async(label,document)=>page.getByLabel(label,{exact:true}).evaluate((element,text)=>{
  const transfer=new DataTransfer();transfer.items.add(new File([text],'simulation-100-style.zhezhi.json',{type:'application/json'}));
  element.files=transfer.files;element.dispatchEvent(new Event('change',{bubbles:true}));
 },JSON.stringify(document));
 const percent=async value=>{
  await page.getByRole('slider',{name:'目标折叠比例',exact:true}).evaluate((element,next)=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,String(next));
   element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
  await page.waitForFunction(next=>document.querySelector('[aria-label="目标折叠比例数字"]')?.value===String(next),value);
  await waitDataset('targetProgress',String(value/100));
 };
 const advanced=async open=>{
  const node=page.locator('.sim-advanced');
  if(await node.evaluate(element=>element.open)!==open)await node.locator('summary').click();
 };
 const capture=async()=>canvas().evaluate(()=>{
  window.__sim100StyleExports={original:URL.createObjectURL,items:[]};
  URL.createObjectURL=function(blob){window.__sim100StyleExports.items.push(blob);return window.__sim100StyleExports.original.call(this,blob);};
 });
 const releaseCapture=async()=>canvas().evaluate(()=>{
  if(window.__sim100StyleExports){URL.createObjectURL=window.__sim100StyleExports.original;delete window.__sim100StyleExports;}
 }).catch(()=>{});
 const exported=async(name,path)=>{
  await advanced(true);
  const count=await canvas().evaluate(()=>window.__sim100StyleExports.items.length);
  const waiting=page.waitForEvent('download');await button(name).click();const file=await waiting;
  await file.saveAs(path);if(await file.failure())throw Error(`${path} 下载失败`);
  let data;
  try{
   // Read the actual download; no fs/Buffer access or dependency on the page's JS realm.
   const stream=await file.createReadStream();if(!stream)throw Error('下载流为空');
   const parts=[];for await(const chunk of stream)parts.push(Array.from(chunk));
   data={parts,type:path.endsWith('.png')?'image/png':path.endsWith('.svg')?'image/svg+xml':'application/json'};
  }catch(streamError){
   data=await canvas().evaluate(async({count,name})=>{
    const deadline=performance.now()+3000;
    while((window.__sim100StyleExports?.items.length??0)<=count&&performance.now()<deadline)
     await new Promise(resolve=>setTimeout(resolve,25));
    const items=window.__sim100StyleExports?.items??[],blob=items[count];
    if(!blob)throw Error(`导出截获失败: kind=${name}, count=${count}, actualLength=${items.length}`);
    return {parts:[Array.from(new Uint8Array(await blob.arrayBuffer()))],type:blob.type};
   },{count,name}).catch(error=>{throw Error(`${error.message}; download stream: ${streamError.message}`);});
  }
  return page.evaluate(async({parts,type})=>{
   const blob=new Blob(parts.map(part=>new Uint8Array(part)),{type});
   if(blob.type!=='image/png')return {type:blob.type,text:await blob.text()};
   const bitmap=await createImageBitmap(blob),surface=document.createElement('canvas');
   surface.width=bitmap.width;surface.height=bitmap.height;
   const context=surface.getContext('2d');context.drawImage(bitmap,0,0);
   const pixels=context.getImageData(0,0,surface.width,surface.height).data;
   let red=0,blue=0,neutral=0;
   for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(r>100&&g<r*.55&&b<r*.65)red++;
    if(b>100&&r<b*.6&&g<b*.8)blue++;
    if(Math.max(r,g,b)<90&&Math.min(r,g,b)>20&&Math.max(r,g,b)-Math.min(r,g,b)<=16)neutral++;
   }
   bitmap.close();return {type:blob.type,size:blob.size,width:surface.width,height:surface.height,red,blue,neutral};
  },data);
 };
 const noScroll=async()=>page.locator('.sim-controls').evaluate(element=>{
  const box=element.getBoundingClientRect(),style=getComputedStyle(element);
  return element.scrollHeight<=element.clientHeight+1&&element.scrollWidth<=element.clientWidth+1&&
   style.overflowY==='visible'&&box.top>=0&&box.bottom<=innerHeight+1;
 });
 const rotate=async()=>{
  await advanced(false);const box=await canvas().boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.4);
  await page.mouse.down();await page.mouse.move(box.x+box.width*.5+28,box.y+box.height*.4-16,{steps:8});await page.mouse.up();
  await waitDataset('view','free');
 };
 const segment=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
 const paper=backend=>({format:'zhezhi-workbench',version:2,schemaVersion:2,name:`100%穿模与折痕样式-${backend}-${Date.now()}`,
  paper:{width:200,height:100},segments:[
   segment('top',[0,0],[200,0]),segment('right',[200,0],[200,100]),
   segment('bottom',[200,100],[0,100]),segment('left',[0,100],[0,0]),
   segment('crease',[100,0],[100,100],'M',-180),
  ]});
 const pageError=error=>errors.push(error.message);page.on('pageerror',pageError);
 await page.evaluate(()=>{window.__sim100StyleOriginalConfirm=window.confirm;window.confirm=()=>true;});
 try{
  for(const name of ['设置并开始使用','关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
  for(const backend of ['webgl2','cpu']){
   await page.setViewportSize({width:1200,height:800});
   const source=paper(backend);await upload('折痕工程文件',source);
   await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,source.name);
   await button('三维模拟').click();
   if(backend==='cpu'){
    await iframe().waitFor();await iframe().evaluate(element=>{element.src='/simulator/index.html?backend=cpu';});
    await page.waitForFunction(()=>{
     const frame=document.querySelector('iframe[title="三维折叠模拟画布"]');
     return frame?.contentWindow?.location.search==='?backend=cpu'&&
      ['ready','loaded','running','paused'].includes(frame.contentDocument?.querySelector('#simulation')?.dataset.status);
    },null,{timeout:30000});await button('载入当前折痕').click();
   }
   await ready(backend);await capture();await advanced(false);
   check((await state()).backend===backend,`${backend} 实际载入单条 -180° 山折`);
   check(await button('红蓝山谷样式').isVisible()&&await button('真实折痕样式').isVisible()&&
    !(await page.locator('.sim-advanced').evaluate(element=>element.open)),`${backend} 样式切换常驻工具条，不依赖高级菜单`);
   await button('纸面着色').click();await button('立体视角').click();await percent(100);
   await page.waitForFunction(()=>{
    const data=document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset;
    return Number(data?.steps)>=12000||Number(data?.surfaceLayers)>1;
   },null,{timeout:30000});
   if(await button('暂停').count())await button('暂停').click();await waitDataset('status','paused');
   const paused=await state();
   check(paused.target===1&&paused.steps>0,`${backend} 100% 目标实际推进并暂停`);
   check(Number.isInteger(paused.layers)&&paused.layers>=1,`${backend} 100% 显示层状态有效（${paused.layers} 层；不假定求解已收敛）`);
   await page.waitForTimeout(180);
   const settled=await state();
   check(settled.layers===paused.layers,`${backend} 暂停后显示层分离状态稳定`);
   check(await noScroll(),`${backend} 1200×800 工具条无内部滚动`);
   await page.screenshot({path:`output/playwright/simulation-100-style-${backend}-paper.png`});
   await page.setViewportSize({width:1000,height:720});
   check(await noScroll(),`${backend} 1000×720 工具条无内部滚动`);
   await page.screenshot({path:`output/playwright/simulation-100-style-${backend}-1000x720.png`});
   await page.setViewportSize({width:1200,height:800});
   const before=JSON.parse((await exported('导出三维 FOLD',`output/playwright/simulation-100-style-${backend}-before.fold`)).text);
   // The FOLD snapshot reads the solver's actual stepCount; earlier status samples can lag.
   // This is the baseline immediately before style/camera operations, not the early pause sample.
   const foldSteps=fold=>Number(fold.frame_title?.match(/·\s*(\d+)\s*步$/)?.[1]);
   const pausedSteps=foldSteps(before),baselineState=await state();
   if(!Number.isInteger(pausedSteps)||baselineState.status!=='paused')throw Error(
    `${backend} 样式阶段起点无效: before.frame_title=${before.frame_title}, baseline=${JSON.stringify(baselineState)}, settled=${JSON.stringify(settled)}`);
   check(before.vertices_coords.every(point=>point.length===3&&point.every(Number.isFinite))&&
    before.edges_foldAngle===undefined&&before.edges_assignment.includes('M'),`${backend} FOLD 保留真实三维位置与山折赋型`);
   await button('只看折线').click();await button('红蓝山谷样式').click();await waitDataset('creaseStyle','assignment');
   const assignedPng=await exported('导出当前 PNG',`output/playwright/simulation-100-style-${backend}-assignment.png`);
   check(assignedPng.type==='image/png'&&assignedPng.red>10,`${backend} 红蓝样式 PNG 具有实际红色山折像素`);
   const assignedSvg=(await exported('导出当前 SVG',`output/playwright/simulation-100-style-${backend}-assignment.svg`)).text;
   check(/stroke="#c2333b"/.test(assignedSvg)&&!assignedSvg.includes('#303b36'),`${backend} 红蓝样式 SVG 使用山折红色`);
   await button('真实折痕样式').click();await waitDataset('creaseStyle','crease');
   check(await button('真实折痕样式').getAttribute('aria-pressed')==='true'&&
    await button('红蓝山谷样式').getAttribute('aria-pressed')==='false',`${backend} 样式命令与按钮状态同步`);
   const creasedPng=await exported('导出当前 PNG',`output/playwright/simulation-100-style-${backend}-crease.png`);
   check(creasedPng.neutral>10&&creasedPng.red===0&&creasedPng.blue===0,`${backend} 折痕 PNG 使用中性深色，去除红蓝墨色`);
   const creasedSvg=(await exported('导出当前 SVG',`output/playwright/simulation-100-style-${backend}-crease.svg`)).text;
   const widths=svg=>Array.from(svg.matchAll(/<line\b[^>]*stroke-width="([\d.]+)"/g),match=>Number(match[1]));
   check(creasedSvg.includes('stroke="#303b36"')&&!creasedSvg.includes('stroke-dasharray')&&
    Math.max(...widths(creasedSvg))<Math.max(...widths(assignedSvg)),`${backend} 折痕 SVG 实线与更细线宽和屏幕样式一致`);
   await rotate();
   const after=JSON.parse((await exported('导出三维 FOLD',`output/playwright/simulation-100-style-${backend}-after.fold`)).text);
   check(JSON.stringify(after.vertices_coords)===JSON.stringify(before.vertices_coords)&&
    JSON.stringify(after.edges_assignment)===JSON.stringify(before.edges_assignment),`${backend} 切换样式与旋转不改变任何求解坐标或赋型`);
   const actual=await state(),afterSteps=foldSteps(after);
   check(actual.steps===pausedSteps&&afterSteps===pausedSteps&&actual.status==='paused',
    `${backend} 样式和视角操作不推进模拟（expected=${pausedSteps}, actual=${actual.steps}, status=${actual.status}, `+
    `earlyPause=${paused.steps}, settled=${settled.steps}, baselineDataset=${baselineState.steps}, `+
    `before.frame_title=${before.frame_title}, after.frame_title=${after.frame_title}）`);
   await button('纸面着色').click();await percent(99);
   await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.surfaceLayers==='1');
   check((await state()).target===.99&&(await state()).layers===1,`${backend} 99% 关闭平折表面层分离`);
   if(await button('暂停').count())await button('暂停').click();await waitDataset('status','paused');
   await advanced(false);
   const appended={format:'zhezhi-workbench',version:2,schemaVersion:2,name:'追加谷折',paper:source.paper,
    segments:[segment('new-valley',[50,0],[50,100],'V',180)]};
   await upload('追加导入折痕文件',appended);await page.locator('.sim-stale').waitFor();
   await button('载入当前折痕').click();await ready(backend);await waitDataset('creaseStyle','crease');
   check(await button('真实折痕样式').getAttribute('aria-pressed')==='true',`${backend} 新模型载入保留已选折痕样式`);
   await button('展开复位').click();await waitDataset('status','paused');await button('只看折线').click();await button('立体视角').click();
   const newCrease=(await exported('导出当前 SVG',`output/playwright/simulation-100-style-${backend}-new-crease.svg`)).text;
   check((newCrease.match(/stroke="#303b36"/g)||[]).length>=2&&!newCrease.includes('stroke-dasharray'),`${backend} 新模型山谷折痕全部使用中性实线`);
   await button('红蓝山谷样式').click();await waitDataset('creaseStyle','assignment');
   const newAssignment=(await exported('导出当前 SVG',`output/playwright/simulation-100-style-${backend}-new-assignment.svg`)).text;
   check(newAssignment.includes('stroke="#c2333b"')&&newAssignment.includes('stroke="#2e61b8"')&&
    /stroke-dasharray="5(?:\.00)? 3(?:\.00)?"/.test(newAssignment),`${backend} 切回红蓝恢复山谷颜色与谷折虚线`);
   runs.push({backend,steps:pausedSteps,earlyPauseSteps:paused.steps,settledSteps:settled.steps,baselineDatasetSteps:baselineState.steps,
    beforeFrameTitle:before.frame_title,afterFrameTitle:after.frame_title,surfaceLayers:paused.layers,assignedPng,creasedPng});
   await releaseCapture();
  }
  check(errors.length===0,'两个后端均没有页面运行异常');
  return {passed:checks.length,checks,runs,errors};
 }catch(error){
  const latest=await page.evaluate(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset).catch(()=>null);
  throw Error(`${error.message}; 已通过${checks.length}项，最后检查=${JSON.stringify(checks.slice(-3))}; 状态=${JSON.stringify(latest)}`);
 }finally{
  await releaseCapture();page.off('pageerror',pageError);
  await page.evaluate(()=>{if(window.__sim100StyleOriginalConfirm){window.confirm=window.__sim100StyleOriginalConfirm;delete window.__sim100StyleOriginalConfirm;}}).catch(()=>{});
 }
}
