async page=>{
 const checks=[],errors=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);},button=name=>page.getByRole('button',{name,exact:true});
 const onError=e=>errors.push(e.message),onDialog=dialog=>dialog.accept();page.on('pageerror',onError);page.on('dialog',onDialog);
 await page.evaluate(()=>{
  if(window.__overlapDelay)return;
  const NativeWorker=window.Worker,onmessage=Object.getOwnPropertyDescriptor(NativeWorker.prototype,'onmessage');
  window.__overlapDelay={sent:0,delivered:0};
  window.Worker=class extends NativeWorker{
   constructor(url,options){super(url,options);if(!String(url).includes('modelOverlap.worker'))return;
    Object.defineProperty(this,'onmessage',{get:()=>this._receiver,set:receiver=>{this._receiver=receiver;onmessage.set.call(this,event=>{window.__overlapDelay.sent++;setTimeout(()=>{window.__overlapDelay.delivered++;receiver?.call(this,event);},150);});}});
   }
  };
  const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob.type.includes('image/svg'))blob.text().then(text=>window.__exportedModelSVG=text);return create(blob);};
 });
 try{
  await page.setViewportSize({width:1540,height:1000});
  for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
  await button('镶嵌设计').click();await button('01 单元扭转').click();await page.getByLabel('边数',{exact:true}).fill('10');await page.getByLabel('内接半径比',{exact:true}).fill('.7');
  await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('采用折痕副本 →').click();await button('计算平折').click();await button('实体').click();
  const ready=()=>page.waitForFunction(()=>document.querySelector('.flat-workspace svg[data-model-render-mode]')?.getAttribute('data-model-render-mode')==='regions');
  await ready();check(true,'十边扭转 0.7 在编辑器完成局部实体遮挡');
  const main=page.getByLabel('实际平折面几何，点击面查看原始位置',{exact:true}),camera=await main.getAttribute('viewBox');
  await page.evaluate(()=>{
   const report=window.__editorSurfaceFrames={stop:false,wire:0,regions:0,badFill:0,missingSurface:0,frames:0};
   function frame(){if(report.stop)return;document.querySelectorAll('.flat-workspace svg[data-model-render-mode]').forEach(svg=>{
    report.frames++;const mode=svg.getAttribute('data-model-render-mode');if(mode==='wire')report.wire++;if(mode==='regions')report.regions++;
    if(mode==='wire'||mode==='regions')svg.querySelectorAll('polygon[data-face-id]').forEach(p=>{if(!['none','transparent'].includes(p.getAttribute('fill')))report.badFill++;});
    if(mode==='regions'&&(!svg.querySelector('[data-region-fill]')||!svg.querySelector('[data-region-boundary]')))report.missingSurface++;
   });requestAnimationFrame(frame);}requestAnimationFrame(frame);
  });
  const lines=async locator=>locator.locator('[data-region-boundary]').evaluateAll(edges=>edges.map(e=>['x1','y1','x2','y2'].map(k=>Number(e.getAttribute(k)).toFixed(7)).join(',')).sort());
  const signatures={};
  for(const side of ['背面','正面','背面','正面']){
   await button(side).click();await ready();const current=await lines(main);check(current.length>0,`${side}保留可见结构边线`);
   if(signatures[side])check(JSON.stringify(current)===JSON.stringify(signatures[side]),`${side}重复切换后结构一致`);else signatures[side]=current;
  }
  check(await main.getAttribute('viewBox')===camera,'正背面切换保留相机位置');
  await button('更多').click();await page.getByLabel('模型组合显示',{exact:true}).selectOption('both');
  await page.waitForFunction(()=>document.querySelectorAll('[data-model-pane] svg[data-model-render-mode="regions"]').length===2);
  const panes={front:page.locator('[data-model-pane="front-solid"] svg[data-model-render-mode]'),back:page.locator('[data-model-pane="back-solid"] svg[data-model-render-mode]')};
  for(const [side,locator]of Object.entries(panes))check(JSON.stringify(await lines(locator))===JSON.stringify(signatures[side==='front'?'正面':'背面']),`${side}双视图与单视图结构一致`);
  await page.getByLabel('模型导出范围',{exact:true}).selectOption('combined');await page.getByLabel('模型图像格式',{exact:true}).selectOption('svg');
  const downloadPromise=page.waitForEvent('download');await button('导出组合 SVG').click();const download=await downloadPromise;await download.saveAs('output/playwright/editor-back-surface.svg');
  await page.waitForFunction(()=>window.__exportedModelSVG?.includes('data-pane='));
  const exported=await page.evaluate(()=>{
   const xml=new DOMParser().parseFromString(window.__exportedModelSVG,'image/svg+xml'),out={};
   for(const image of xml.querySelectorAll('image[data-pane]')){
    const svg=new DOMParser().parseFromString(decodeURIComponent(image.getAttribute('href').split(',').slice(1).join(',')),'image/svg+xml');
    out[image.getAttribute('data-pane')]={lines:Array.from(svg.querySelectorAll('[data-region-boundary]')).map(e=>['x1','y1','x2','y2'].map(k=>Number(e.getAttribute(k)).toFixed(7)).join(',')).sort(),underpainting:svg.querySelectorAll('polygon[data-face-id]').length,paths:svg.querySelectorAll('[data-region-fill]').length};
   }return out;
  });
  for(const side of ['front','back']){const data=exported[`${side}-solid`];check(data?.paths>0&&data.underpainting===0&&JSON.stringify(data.lines)===JSON.stringify(signatures[side==='front'?'正面':'背面']),`${side}实际 SVG 下载完整保留屏幕结构且没有编号底图`);}
  const metrics=await page.evaluate(()=>{window.__editorSurfaceFrames.stop=true;return {...window.__editorSurfaceFrames,worker:window.__overlapDelay};});
  check(metrics.worker.delivered>=6&&metrics.wire>0,'延迟局部 Worker 150ms 实际覆盖等待帧');
  check(metrics.badFill===0&&metrics.missingSurface===0,'等待期间仅线框，完成帧同时具备色面和结构线');check(errors.length===0,'浏览器无运行错误');
  await page.screenshot({path:'output/playwright/editor-back-surface.png'});
  const result={passed:checks.length,checks,metrics,errors};await page.evaluate(result=>window.__editorBackSurfaceResult=result,result);return result;
 }finally{page.off('pageerror',onError);page.off('dialog',onDialog);}
}
