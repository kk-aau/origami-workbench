async page=>{
 const bundle=await page.evaluate(()=>Array.from(document.scripts).map(s=>s.getAttribute("src")).find(s=>s?.startsWith("/assets/main-")));const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 const dialog=()=>page.getByRole('dialog',{name:'原对称剖面 · PotCrossSectionGraphics',exact:true}),ready=()=>page.waitForFunction(()=>{
  const d=document.querySelector('.pot-cross-section-dialog[open]');return d?.querySelector('.pot-cross-section-status')?.textContent?.includes('2条原Line')&&d.querySelector('.pot-cross-section-plot')?.getAttribute('aria-busy')==='false';
 });
 const responseFor=predicate=>page.waitForResponse(r=>r.url().endsWith('/api/tessellation/pot-cross-section-graphics')&&predicate(r.request().postDataJSON()));
 const capture=async(name,value)=>{const pending=page.waitForEvent('download');await page.evaluate(({name,value})=>{const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);},{name,value});await(await pending).saveAs('output/original-helpers-browser-final-1010/pot-section/'+name);};
 const save=async(name,button,ext)=>{const pending=page.waitForEvent('download');await dialog().getByRole('button',{name:button,exact:true}).click();await(await pending).saveAs(`output/original-helpers-browser-final-1010/pot-section/${name}.${ext}`);};
 const input=()=>dialog().getByLabel('载入原对称剖面参数文件',{exact:true});
 const toggleAdvanced=async open=>{const details=dialog().locator('.pot-cross-section-input');if((await details.getAttribute('open')!==null)!==open)await details.locator('summary').click();};
 await ready();
 const initial=await dialog().locator('polyline[data-original-head="Line"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('points')));
 check(initial.length===2&&initial[0].startsWith('0,0 0.7,1')&&initial[1].startsWith('0,0 -0.7,1'),'original first-point shift and ordered reflection from raw radius .3');
 await page.screenshot({path:'output/original-helpers-browser-final-1010/pot-section/initial-desktop.png'});
 await toggleAdvanced(true);
 const cases=['standard','translated-nonmonotone','singleton','duplicate-negative','all-seven','automatic-ratio','tiny-unordered','boundary-512'];
 for(const name of cases){
  const pending=responseFor(()=>true);await input().setInputFiles(`output/original-helpers-browser-final-1010/pot-section/inputs/${name}-source.json`);
  const response=await(await pending).json();await ready();
  check(response.data.primitives.length===2,'exactly two original Lines '+name);
  check(response.data.primitives.every(p=>p.points.length===response.query.points.length),'all point repetitions retained '+name);
  check(response.source.fullOptionsGraphicsReproduced===false&&response.source.mathematicaDefaultRenderingReproduced===false&&!response.source.wolframExecuted,'finite/default scope flags '+name);
  check(await dialog().getByRole('button',{name:'导出完整原图形JSON',exact:true}).isEnabled(),'actual complete-data export '+name);
  const projected=await dialog().locator('polyline[data-original-head="Line"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('points')));
  check(JSON.stringify(projected)===JSON.stringify(response.data.primitives.map(p=>p.points.map(x=>x.join(',')).join(' '))),'live SVG full coordinates '+name);
  await capture(name+'-response.json',response);
  await save(name+'-source','导出源JSON','json');await save(name+'-data','导出完整原图形JSON','json');await save(name,'导出参考SVG','svg');
  if(name==='all-seven'){
   const measured=await dialog().locator('.pot-cross-section-plot').evaluate(el=>{
    const outer=el.querySelector(':scope>div>svg'),inner=outer.querySelector('svg'),a=outer.getBoundingClientRect(),b=outer.querySelector('[data-graphics-option="Frame"]').getBoundingClientRect();
    return {outerWidth:outer.getAttribute('width'),outerHeight:outer.getAttribute('height'),outerRatio:a.height/a.width,innerRatio:b.height/b.width,viewBox:inner.getAttribute('viewBox'),background:getComputedStyle(outer).backgroundColor,frame:outer.querySelectorAll('[data-graphics-option="Frame"]').length,axes:[...outer.querySelectorAll('[data-graphics-option^="Axes-"]')].map(n=>n.getAttribute('data-graphics-option')),lines:[...outer.querySelectorAll('polyline[data-original-head="Line"]')].map(n=>n.getAttribute('points'))};
   });
   check(measured.outerWidth==='320pt'&&measured.outerHeight==='160pt'&&Math.abs(measured.outerRatio-.5)<.01,'ImageSize explicit region actually applied');
   check(Math.abs(measured.innerRatio-1)<.01,'AspectRatio and pair-size letterbox actually applied');
   check(measured.viewBox==='-0.5 -1.5 1 1'&&measured.lines[0].includes('1.7,4'),'PlotRange only clips viewport, never original coordinates');
   check(measured.background==='rgb(51, 128, 179)'&&measured.frame===1&&JSON.stringify(measured.axes)==='["Axes-y"]','RGB background Frame and per-axis options actually applied');
   check(await dialog().getByLabel('对称剖面轴交点X',{exact:true}).inputValue()==='0.1'&&await dialog().getByLabel('对称剖面轴交点Y',{exact:true}).inputValue()==='1','AxesOrigin restored to public controls');
   await capture('all-seven-live-view.json',measured);await toggleAdvanced(false);
   await page.setViewportSize({width:1280,height:720});await page.screenshot({path:'output/original-helpers-browser-final-1010/pot-section/options-desktop.png'});
   await page.setViewportSize({width:390,height:844});
   const layout=await dialog().evaluate(d=>{const r=d.getBoundingClientRect(),controls=[...d.querySelectorAll('.pot-cross-section-options>label')].map(e=>e.getBoundingClientRect());return {dialogInside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,controlsOverlap:controls.some((a,i)=>controls.some((b,j)=>j>i&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1))};});
   check(layout.dialogInside&&!layout.controlsOverlap,'390px helper dialog and controls fit');
   await page.screenshot({path:'output/original-helpers-browser-final-1010/pot-section/options-narrow.png'});await page.setViewportSize({width:1380,height:900});await toggleAdvanced(true);
  }
 }
 for(const name of ['illegal-options','empty-source','oversized-source']){
  await input().setInputFiles(`output/original-helpers-browser-final-1010/pot-section/inputs/${name}.json`);await dialog().getByRole('alert').waitFor();
  check(await dialog().getByRole('button',{name:'导出完整原图形JSON',exact:true}).isDisabled(),'invalid parameter file has no stale data/export '+name);
  const pending=responseFor(q=>q.points.length===5);await input().setInputFiles('output/original-helpers-browser-final-1010/pot-section/standard-source.json');
  const response=await(await pending).json();await ready();check(response.data.primitives.length===2,'actual exported source file reload after rejection '+name);
 }
 await dialog().getByRole('button',{name:'关闭镶嵌窗口',exact:true}).click();
 const parent=page.getByRole('dialog',{name:'编辑矩形壶体剖面',exact:true});
 check(await parent.getByLabel('半径 r',{exact:true}).inputValue()==='0.3','all help edits leave original parent radius untouched');
 await parent.getByRole('button',{name:'取消',exact:true}).click();
 const ctor=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.family==='rectangular-pot');
 await page.getByRole('button',{name:'重新计算',exact:true}).click();const after=await(await ctor).json();
 check(after.stats.parameters.crossSection[0][0]===.3&&after.stats.parameters.panels===1,'original constructor raw parameters retained');
 await capture('constructor-after.json',after);
 for(const family of ['radial-pot','twisted-pot']){
  await page.getByLabel('空间构造类型',{exact:true}).selectOption(family);
  await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
  await page.getByRole('button',{name:'编辑剖面',exact:true}).click();const pending=responseFor(()=>true);
  await page.getByRole('button',{name:'原对称剖面',exact:true}).click();const r=await(await pending).json();await ready();
  check(r.data.primitives.length===2,'original help accessible from '+family+' editor');
  await dialog().getByRole('button',{name:'关闭镶嵌窗口',exact:true}).click();
  await page.getByRole('button',{name:'取消',exact:true}).click();
 }
 check(errors.length===0,'no page error');
 const evidence={passed:checks.length,checks,errors,actualHelperDownloadFiles:32,bundle};await capture('browser-evidence.json',evidence);return evidence;
}
