const fs = require('node:fs');
const path = require('node:path');
// First-run directory setup is a real UI action against the runner's isolated
// data directory. Confirm defaults before exercising any saved workspace data.
async function confirmInitialStorage({evaluate,wait,dataRoot}){
  const storage=require('./storageLocations.cjs').createStorageLocations({bootstrapRoot:dataRoot}),before=storage.status();
  if(!before.configured){
    await wait(`Array.from(document.querySelectorAll('[data-storage-settings] button')).some(button=>button.textContent==='设置并开始使用'&&!button.disabled)`);
    await evaluate(`Array.from(document.querySelectorAll('[data-storage-settings] button')).find(button=>button.textContent==='设置并开始使用').click()`);
  }
  await wait(`!document.querySelector('[data-storage-settings]')`);
  const after=storage.status();
  if(!after.configured||!fs.existsSync(path.join(dataRoot,'storage-locations.json')))throw Error('First-run storage configuration was not persisted');
  if(!before.configured){
    const canonical=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
    if(Object.keys(before.defaults).some(kind=>canonical(after.paths[kind])!==canonical(before.defaults[kind])))throw Error('First-run default storage locations were not retained');
  }
  return {configured:after.configured,confirmedFirstRun:!before.configured,defaultPathsConfirmed:!before.configured};
}
// Focused two-process regression; launcher must provide isolated desktop data.
exports.preferences=async({window,origin,dataRoot})=>{
  const evaluate=source=>window.webContents.executeJavaScript(source,true);
  const wait=async source=>{for(let n=0;n<100;n++){if(await evaluate(source))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Preferences smoke timed out: '+source);};
  await wait(`!!document.querySelector('.app-header') && window.desktop?.isDesktop`);
  const storageSetup=await confirmInitialStorage({evaluate,wait,dataRoot});
  if(process.env.ZHEZHI_DESKTOP_PREFERENCES_TEST==='write'){
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='显示设置').click()`);
    await wait(`!!document.querySelector('section[aria-label="主题设置"] input')`);
    await evaluate(`document.querySelector('section[aria-label="主题设置"] input').click()`);
    await wait(`document.documentElement.dataset.theme==='dark'`);
    await evaluate(`window.desktop.preferences.setItem('zhezhi.angle-settings.v1',JSON.stringify({version:1,settings:{active:2,dividers:[10,8],abc:[20,70,110],def:[30,50,100]}}))`);
  }
  const theme=await evaluate(`document.documentElement.dataset.theme`);
  const angle=await evaluate(`JSON.parse(window.desktop.preferences.getItem('zhezhi.angle-settings.v1'))`);
  if(theme!=='dark'||angle?.settings?.abc?.[0]!==20)throw Error('Desktop preferences did not survive process/origin change');
  const paths=require('./storageLocations.cjs').createStorageLocations({bootstrapRoot:dataRoot}).status().paths;
  const stored=JSON.parse(fs.readFileSync(path.join(paths.dataDir,'preferences.json'),'utf8'));
  if(JSON.parse(stored['zhezhi.theme.v1']).theme!=='dark')throw Error('Theme was not persisted to stable userData');
  if(!window.webContents.getLastWebPreferences().sandbox||!await evaluate(`typeof require==='undefined'`))throw Error('Renderer isolation changed');
  return {phase:process.env.ZHEZHI_DESKTOP_PREFERENCES_TEST,origin,theme,angle:angle.settings,isolated:true,storageSetup};
};
exports.storage=async({window,origin,dataRoot,service})=>{
  const evaluate=source=>window.webContents.executeJavaScript(source,true),wait=async source=>{for(let n=0;n<100;n++){if(await evaluate(source))return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Storage smoke timed out: '+source);};
  await wait(`!!document.querySelector('.app-header')&&window.desktop?.isDesktop`);const storageSetup=await confirmInitialStorage({evaluate,wait,dataRoot});
  const storageMigration=await require('./storageSmoke.cjs').run({window,origin,dataRoot,service,evaluate,wait});return {passed:storageMigration.checks.length+1,checks:['first-run storage setup persisted',...storageMigration.checks],origin,dataRoot,storageSetup,storageMigration,isolated:true};
};
exports.run=async({window,origin,dataRoot,backend,service,messages})=>{
  const checks=[];
  const assert=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
  const evaluate=async source=>{try{return await window.webContents.executeJavaScript(source,true);}catch(error){throw new Error(`Desktop smoke expression failed: ${source}`,{cause:error});}};
  const wait=async(source)=>{for(let n=0;n<100;n++){if(await evaluate(source))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+source);};
  await wait(`!!document.querySelector('.header-actions .primary') && !document.querySelector('.header-actions .primary').disabled`);
  const storageSetup=await confirmInitialStorage({evaluate,wait,dataRoot});
  assert(storageSetup.configured,'first-run default storage locations are confirmed and persisted before desktop tools start');
  assert(await evaluate(`window.desktop?.isDesktop === true && typeof require === 'undefined'`),'isolated desktop bridge without renderer Node access');
  assert(window.webContents.getLastWebPreferences().sandbox,'renderer sandbox enabled');
  assert(await evaluate(`!!document.querySelector('.fold-dock > .fold-display-bar') && !document.querySelector('[data-face-id]') && !document.querySelector('input[aria-label="平折正面颜色"]').disabled`),'basic folded display settings are available before calculation in the bottom dock');
  assert(window.webContents.getURL()===origin+'/','private local service loaded in native window');
  assert(await evaluate(`(()=>{
    const separators=Array.from(document.querySelectorAll('[role="separator"][aria-orientation="vertical"]'));
    const resizable=label=>separators.some(node=>node.getAttribute('aria-label')===label&&node.tabIndex===0&&+node.getAttribute('aria-valuemin')<=+node.getAttribute('aria-valuenow')&&+node.getAttribute('aria-valuenow')<=+node.getAttribute('aria-valuemax'));
    const compact=side=>{const grids=Array.from(document.querySelectorAll('[data-tool-layout-side="'+side+'"] .custom-tool-grid:not(.has-actions)'));return grids.length>0&&grids.every(grid=>getComputedStyle(grid).display==='grid'&&getComputedStyle(grid).gridTemplateColumns.split(/\\s+/).filter(Boolean).length>=4&&!!grid.querySelector('button[data-tool]'));};
    return separators.length===2&&['工具栏宽度','属性栏宽度'].every(resizable)&&['left','right'].every(compact);
  })()`),'desktop workbench has both accessible resizable panels and compact tool grids on each side');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='工具目录').click()`);
  await wait(`!!document.querySelector('dialog.tool-library[open]')`);
  assert(await evaluate(`document.querySelectorAll('.catalog-entry').length>=200`),'complete tool specifications catalog opens in packaged app');
  await evaluate(`document.querySelector('[aria-label="关闭工具目录"]').click()`);
  assert(await evaluate(`['extend','trim','divide','ratio','midperp'].every(id=>!!document.querySelector('button[data-tool='+id+']'))`),'all five segment expansion tools are present in packaged workbench');
  const health=await(await fetch(origin+'/api/health')).json();
  assert(health.tessAvailable&&fs.existsSync(backend),'bundled tessellation engine available');
  const processingSourceCount=await evaluate(`document.querySelectorAll('[data-segment]').length`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='优化加工导出').click()`);
  await wait(`!!document.querySelector('dialog.cp-processing-dialog[open]')`);
  assert(await evaluate(`!document.querySelector('select[aria-label="优化加工格式"]') && !document.querySelector('select[aria-label$="加工方式"]') && document.querySelector('select[aria-label="优化方案"]').value==='collinear'`),'packaged machining only offers crease and ordinary DXF LINE');
  await evaluate(`Array.from(document.querySelectorAll('dialog.cp-processing-dialog button')).find(b=>b.textContent==='生成预览').click()`);
  await wait(`!!document.querySelector('.cp-processing-ok')`);
  assert(await evaluate(`document.querySelectorAll('[data-processing-path]').length<${processingSourceCount}`),'packaged collinear merging reduces actual LINE entities');
  await evaluate(`(()=>{const input=document.querySelector('input[aria-label="最多合并原段数"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'1');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(`!document.querySelector('.cp-processing-ok')`);
  assert(await evaluate(`Array.from(document.querySelectorAll('dialog.cp-processing-dialog button')).find(b=>b.textContent==='导出加工文件').disabled`),'changing collinear limits invalidates previous output');
  await evaluate(`Array.from(document.querySelectorAll('dialog.cp-processing-dialog button')).find(b=>b.textContent==='生成预览').click()`);await wait(`!!document.querySelector('.cp-processing-ok')`);
  assert(await evaluate(`document.querySelectorAll('[data-processing-path]').length===${processingSourceCount}`),'packaged source-count limit 1 restores individual LINE entities');
  await evaluate(`(()=>{const select=document.querySelector('select[aria-label="优化方案"]');select.value='continuous';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`!!document.querySelector('input[aria-label="最多连续转弯次数"]')`);
  await evaluate(`Array.from(document.querySelectorAll('dialog.cp-processing-dialog button')).find(b=>b.textContent==='生成预览').click()`);await wait(`!!document.querySelector('.cp-processing-ok')`);
  assert(await evaluate(`document.querySelector('.cp-processing-status').textContent.includes('单组最多转弯 1 次')`),'packaged continuous planning respects the requested turn limit');
  await evaluate(`Array.from(document.querySelectorAll('dialog.cp-processing-dialog button')).find(b=>b.textContent==='取消').click()`);
  await wait(`!document.querySelector('dialog.cp-processing-dialog')`);
  assert(await evaluate(`document.querySelectorAll('[data-segment]').length===${processingSourceCount}`),'packaged processing export cancellation preserves original crease geometry');
  const initialSegments=await evaluate(`document.querySelectorAll('[data-segment]').length`);
  await evaluate(`Array.from(document.querySelectorAll('button[data-tool]')).find(b=>b.dataset.tool==='perpendicular').click()`);
  await wait(`!!document.querySelector('.tool-guide[data-tool="perpendicular"]')`);
  const clickCanvas=async(x,y)=>{
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    const point=await evaluate(`(()=>{const svg=document.querySelector('svg.crease-canvas'),p=new DOMPoint(${x},${y}).matrixTransform(svg.getScreenCTM());return{x:Math.round(p.x),y:Math.round(p.y)};})()`);
    window.webContents.sendInputEvent({type:'mouseMove',...point});window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
  };
  await clickCanvas(25,25);await wait(`document.querySelectorAll('[data-construction-point]').length===1`);
  assert(await evaluate(`document.querySelectorAll('[data-segment]').length===${initialSegments}`),'perpendicular first point works without preselection in packaged app');
  await clickCanvas(50,100);
  await wait(`document.querySelectorAll('[data-construction-point]').length===0`);
  assert(await evaluate(`Array.from(document.querySelectorAll('[data-segment]')).some(g=>{const l=g.querySelector('line:last-of-type');return ['x1','y1','x2','y2'].every((k,i)=>Math.abs(+l.getAttribute(k)-[25,25,50,25][i])<1e-5);})`),'packaged perpendicular ends at the foot, not both paper edges');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);
  await wait(`document.querySelectorAll('[data-segment]').length===${initialSegments}`);
  assert(true,'packaged perpendicular and reference split undo together');
  const chooseTool=async name=>{await evaluate(`Array.from(document.querySelectorAll('button[data-tool]')).find(b=>b.getAttribute('aria-label')===${JSON.stringify(name)}).click()`);};
  assert(await evaluate(`['添加顶点','合并顶点','正多边形'].every(name=>Array.from(document.querySelectorAll('button[data-tool]')).some(b=>b.getAttribute('aria-label')===name))`),'three vertex and polygon tools are available in packaged app');
  await chooseTool('添加顶点');await clickCanvas(50,50);await wait(`!!document.querySelector('[data-edit-source]')`);await clickCanvas(50,100);
  await wait(`document.querySelectorAll('[data-segment]').length===${initialSegments+1}`);assert(true,'packaged vertex tool splits one source into independent segments');
  await chooseTool('合并顶点');await clickCanvas(50,100);await wait(`!!document.querySelector('[data-merge-preview]')`);await clickCanvas(50,100);
  await wait(`document.querySelectorAll('[data-segment]').length===${initialSegments}`);assert(true,'packaged merge tool restores a single collinear segment');
  await chooseTool('正多边形');await clickCanvas(25,25);await wait(`document.querySelectorAll('[data-construction-point]').length===1`);await clickCanvas(50,25);
  await wait(`document.querySelectorAll('[data-segment]').length>${initialSegments}`);assert(true,'packaged polygon tool generates real crease geometry');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);await wait(`document.querySelectorAll('[data-segment]').length===${initialSegments}`);assert(true,'packaged polygon is a single undo step');
  assert(await evaluate(`['两点圆','定半径圆','三点圆','圆编辑'].every(name=>Array.from(document.querySelectorAll('button[data-tool]')).some(b=>b.getAttribute('aria-label')===name))`),'four circle tools are available in packaged app');
  await chooseTool('两点圆');await clickCanvas(25,25);await wait(`document.querySelectorAll('[data-construction-point]').length===1`);await clickCanvas(50,25);
  await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===1`);
  assert(await evaluate(`document.querySelectorAll('[data-segment]').length===${initialSegments}`),'packaged circle is independent from crease segments');
  await chooseTool('圆编辑');await clickCanvas(50,25);await wait(`!!document.querySelector('[data-selected-circle]')`);
  await wait(`Math.abs(+document.querySelector('input[aria-label="圆半径"]')?.value-25)<1e-4`);
  assert(true,'packaged circle can be selected and inspected');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='删除此圆').click()`);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===0`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===1`);assert(true,'packaged circle deletion undoes in one step');
  assert(await evaluate(`['分离半径圆','同心圆','等半径圆','双圆外切调整','点圆切线','两圆公切线'].every(name=>Array.from(document.querySelectorAll('button[data-tool]')).some(b=>b.getAttribute('aria-label')===name))`),'six advanced circle tools are available in packaged app');
  await chooseTool('点圆切线');await clickCanvas(100,25);await wait(`document.querySelectorAll('[data-construction-point]').length===1`);await clickCanvas(25,50);
  await wait(`document.querySelectorAll('[data-tangent-candidate]').length===2`);assert(true,'packaged point-circle tangent presents two candidates');
  await evaluate(`document.querySelector('[aria-label="切线候选"] button').click()`);await wait(`document.querySelectorAll('[data-segment]').length>${initialSegments}`);assert(true,'packaged tangent candidate commits real crease geometry');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);await wait(`document.querySelectorAll('[data-segment]').length===${initialSegments}`);assert(true,'packaged tangent and intersection splitting undo together');
  await chooseTool('分离半径圆');await clickCanvas(125,125);await wait(`document.querySelectorAll('[data-construction-point]').length===1`);await clickCanvas(100,100);await wait(`document.querySelectorAll('[data-construction-point]').length===2`);await clickCanvas(125,100);
  await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===2`);assert(true,'packaged separate-radius construction creates an independent circle');
  await chooseTool('双圆外切调整');await clickCanvas(25,25);await wait(`document.querySelectorAll('[data-circle-reference]').length===1`);await clickCanvas(125,125);await wait(`document.querySelectorAll('[data-advanced-circle-preview]').length===2`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='确认双圆').click()`);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===4`);assert(true,'packaged external tangency generates both circles atomically');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===2`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===1`);assert(true,'packaged pair and separate circle undo independently');
  assert(await evaluate(`['圆反演','直线反演','半径差同心圆'].every(name=>Array.from(document.querySelectorAll('button[data-tool]')).some(b=>b.getAttribute('aria-label')===name))`),'three inversion and radius-difference tools are available in packaged app');
  await chooseTool('直线反演');await clickCanvas(0,100);await wait(`!!document.querySelector('[data-inversion-source]')`);await clickCanvas(25,50);
  await wait(`!!document.querySelector('[data-inversion-circle-preview]')`);
  assert(await evaluate(`Math.abs(+document.querySelector('[data-inversion-circle-preview]').getAttribute('r')-12.5)<1e-6`),'packaged supporting-line inversion previews exact radius');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='确认反演圆').click()`);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===2`);
  assert(await evaluate(`document.querySelectorAll('[data-segment]').length===${initialSegments}`),'packaged line inversion preserves original segments');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===1`);
  await chooseTool('两点圆');await clickCanvas(50,25);await wait(`document.querySelectorAll('[data-construction-point]').length===1`);await clickCanvas(75,25);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===2`);
  await chooseTool('圆反演');await clickCanvas(75,25);await wait(`document.querySelectorAll('[data-circle-reference]').length===1`);await clickCanvas(0,25);await wait(`!!document.querySelector('[data-inversion-line-preview="guide"]')`);
  await clickCanvas(25,0);await wait(`document.querySelectorAll('[data-construction-point]').length===1`);await clickCanvas(25,200);await wait(`!document.querySelector('[data-inversion-line-preview]')`);
  assert(await evaluate(`Array.from(document.querySelectorAll('[data-segment]')).some(g=>{const l=g.querySelector('line:last-of-type');return ['x1','y1','x2','y2'].every((k,i)=>Math.abs(+l.getAttribute(k)-[37.5,0,37.5,200][i])<1e-5);})`),'packaged circle-to-line inversion obeys two explicit boundary cutoffs');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);await wait(`document.querySelectorAll('[data-segment]').length===${initialSegments}`);
  await chooseTool('半径差同心圆');await clickCanvas(25,50);await wait(`document.querySelectorAll('[data-circle-reference]').length===1`);await clickCanvas(25,50);await wait(`document.querySelectorAll('[data-circle-reference]').length===2`);
  await clickCanvas(75,25);await wait(`document.querySelector('.tool-guide-step').textContent.includes('后两圆半径相同')`);assert(true,'packaged radius difference rejects duplicate-radius result with an explanation');
  await chooseTool('两点圆');await clickCanvas(125,125);await wait(`document.querySelectorAll('[data-construction-point]').length===1`);await clickCanvas(175,125);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===3`);
  await chooseTool('半径差同心圆');await clickCanvas(25,50);await wait(`document.querySelectorAll('[data-circle-reference]').length===1`);await clickCanvas(25,50);await wait(`document.querySelectorAll('[data-circle-reference]').length===2`);await clickCanvas(125,125);await wait(`!!document.querySelector('[data-inversion-circle-preview]')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='确认半径差圆').click()`);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===4`);
  assert(await evaluate(`Array.from(document.querySelectorAll('[data-object-kind="circle"] circle')).some(c=>+c.getAttribute('cx')===25&&+c.getAttribute('cy')===25&&+c.getAttribute('r')===50)`),'packaged radius difference accepts repeated first reference and creates exact geometry');
  for(const count of [3,2,1]){await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);await wait(`document.querySelectorAll('[data-object-kind="circle"]').length===${count}`);}assert(true,'packaged inversion constructions undo back to original project');
  assert(await evaluate(`['镜像线段','镜像选区'].every(name=>Array.from(document.querySelectorAll('button[data-tool]')).some(b=>b.getAttribute('aria-label')===name))`),'two finite mirror tools are available in packaged app');
  await chooseTool('镜像线段');await clickCanvas(50,100);await wait(`document.querySelectorAll('[data-mirror-source]').length===1`);await clickCanvas(0,100);await wait(`!!document.querySelector('[data-mirror-preview="ready"]')`);
  assert(await evaluate(`document.querySelectorAll('[data-segment]').length===${initialSegments}`),'packaged mirror waits for explicit confirmation');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='确认镜像').click()`);await wait(`document.querySelectorAll('[data-segment]').length===${initialSegments+1}`);
  assert(await evaluate(`Array.from(document.querySelectorAll('[data-segment][data-assignment="M"]')).some(g=>{const l=g.querySelector('line:last-of-type');return +l.getAttribute('x1')===-50&&+l.getAttribute('x2')===-50;})`),'packaged mirror keeps mountain assignment and finite reflected position');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);await wait(`document.querySelectorAll('[data-segment]').length===${initialSegments}`);
  await chooseTool('镜像选区');await clickCanvas(50,100);await wait(`document.querySelectorAll('[data-segment] > circle').length===2`);assert(true,'packaged mirror selects a line directly without switching tools');
  await clickCanvas(50,100);await wait(`document.querySelectorAll('[data-segment] > circle').length===0`);assert(true,'packaged mirror repeats click to deselect without Shift');
  const dragPoints=await evaluate(`(()=>{const m=document.querySelector('svg.crease-canvas').getScreenCTM();return [[40,80],[160,120]].map(p=>{const q=new DOMPoint(...p).matrixTransform(m);return{x:Math.round(q.x),y:Math.round(q.y)};});})()`);
  window.webContents.sendInputEvent({type:'mouseMove',...dragPoints[0]});window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...dragPoints[0]});window.webContents.sendInputEvent({type:'mouseMove',button:'left',...dragPoints[1]});window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...dragPoints[1]});
  await wait(`document.querySelectorAll('[data-segment] > circle').length===6`);assert(true,'packaged mirror contact rectangle selects partial lines');
  await clickCanvas(0,25);await wait(`document.querySelectorAll('[data-construction-point]').length===1`);await clickCanvas(0,175);await wait(`document.querySelectorAll('[data-mirror-preview="ready"]').length===3`);
  assert(await evaluate(`!!document.querySelector('[data-mirror-region]')`),'packaged mirror renders an interior confirmation region');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='确认镜像').click()`);await wait(`document.querySelectorAll('[data-segment]').length===${initialSegments+3}`);assert(true,'packaged batch mirror creates three copies in one confirmation');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='撤销').click()`);await wait(`document.querySelectorAll('[data-segment]').length===${initialSegments}`);assert(true,'packaged batch mirror undoes as one operation');
  window.webContents.send('desktop:command','save');
  await wait(`!!document.querySelector('.save-dot.saved')`);
  const projects=await(await fetch(origin+'/api/projects')).json();
  assert(projects.projects.length===1,'native save command stores project in isolated desktop library');
  const saved=await(await fetch(origin+'/api/projects/'+projects.projects[0].id)).json();
  assert(saved.doc.schemaVersion===2&&saved.doc.segments.length>4,'desktop saved complete v2 geometry');
  assert(saved.doc.objects?.length===1&&saved.doc.objects[0].radius===25,'desktop saves auxiliary circle with its exact geometry');
  assert(fs.readdirSync(path.join(dataRoot,'projects')).some(f=>f.endsWith('.json')),'project written to desktop data directory');
  window.webContents.send('desktop:command','export');
  await wait(`!!document.querySelector('.modal')`);
  assert(await evaluate(`document.querySelector('.modal').textContent.includes('导出')`),'native export menu reaches existing export dialog');
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await wait(`!document.querySelector('.modal')`);
  const tess=await fetch(origin+'/api/tessellate',{method:'POST',headers:{'Content-Type':'application/json','X-Zhezhi-Token':health.token},body:JSON.stringify({tiling:'square',rings:1,angle:36,scale:.5})});
  const tessResult=await tess.json();
  assert(tess.ok&&tessResult.fold?.edges_vertices?.length>4,'packaged backend produces actual tessellation with no system Python command');
  for(const parameters of [{family:'twist',mode:'quad-split',sides:4},{family:'archimedean',tiling:'resch-3'},{family:'archimedean',tiling:'resch-4'},{family:'archimedean',tiling:'resch-6'},{family:'twist',sides:6},{family:'periodic',tiling:'triangle',rows:2,columns:3},{family:'archimedean',tiling:'equilateral-pentagon'},{family:'nonperiodic',kind:'voronoi'},{family:'nonperiodic',kind:'delaunay'},{family:'nonperiodic',kind:'penrose'},{family:'nonperiodic',kind:'goldberg',depth:2},{family:'custom',vertices:[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],faces:[[0,1,4,3],[1,2,5,4]]},{family:'ring'},{family:'flagstone',tiling:'triangle'},{family:'flagstone',tiling:'hexagon'},{family:'woven'}]){
    const response=await fetch(origin+'/api/tessellate',{method:'POST',headers:{'Content-Type':'application/json','X-Zhezhi-Token':health.token},body:JSON.stringify(parameters)});
    const generated=await response.json();
    assert(response.ok&&generated.stats?.checks?.geometry?.status==='passed'&&(generated.stats?.checks?.local?.status==='passed'||(generated.stats?.checks?.local?.status==='not_applicable'&&generated.stats?.checks?.local?.interiorVertices===0)),`standalone engine generates ${parameters.family} without Mathematica or system Python`);
  }
  const remainingCases=[
    ...Array.from({length:20},(_,i)=>({family:'archimedean',tiling:`two-uniform-${i+1}`})),
    ...Array.from({length:5},(_,i)=>({family:'archimedean',tiling:`resch-catalog-${i+1}`})),
    ...['angles','cyclic','triangle','trapezoid','parallelogram','triangle-vertices','cyclic-offset'].flatMap(mode=>[false,true].map(clockwise=>({family:'brocard',kind:mode,clockwise}))),
    ...['general','centered','centered-angle','offset'].map(variant=>({family:'split',variant})),
    ...['lines','chord','random'].flatMap(mode=>[1,-1].map(parity=>({family:'woven-lines',mode,parity}))),
  ];
  for(const parameters of remainingCases){
    const response=await fetch(origin+'/api/tessellate',{method:'POST',headers:{'Content-Type':'application/json','X-Zhezhi-Token':health.token},body:JSON.stringify(parameters)});
    const generated=await response.json();
    assert(response.ok&&generated.stats?.checks?.geometry?.status==='passed'&&generated.stats?.checks?.local?.status==='passed',`packaged remaining construction ${JSON.stringify(parameters)}: ${generated.error??'valid geometry and local fold conditions'}`);
  }
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('镶嵌设计')).click()`);
  await wait(`document.querySelector('.tess-preview-status')?.dataset.pending==='false'`);
  await evaluate(`Array.from(document.querySelectorAll('.tess-families button')).find(b=>b.textContent.includes('周期拼接')).click()`);
  await wait(`document.querySelector('.tess-preview-status')?.dataset.pending==='false'`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='计算平折').click()`);
  await wait(`document.querySelector('.tess-flat-pane')?.dataset.current==='true'&&document.querySelectorAll('[data-tess-flat-face]').length>0`);
  assert(await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('镶嵌设计')).getAttribute('aria-pressed')==='true'`),'packaged tessellation folds inside its own workspace');
  await wait(`document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解'`);
  assert(true,'tessellation layer solver operates independently under desktop CSP');
  assert(await evaluate(`!!document.querySelector('.canvas-wrap > .tess-flat-pane.canvas-fold-overlay') && !document.querySelector('.inline-fold-result')`),'packaged tessellation places folded model on the crease canvas');
  assert(await evaluate(`Array.from(document.querySelectorAll('[data-tess-flat-face]')).every(p=>p.getAttribute('fill-opacity')==='1')`),'packaged tessellation defaults to opaque paper');
  await evaluate(`Array.from(document.querySelectorAll('.fold-display-bar button')).find(b=>b.textContent==='透视').click()`);
  assert(await evaluate(`Array.from(document.querySelectorAll('[data-tess-flat-face]')).every(p=>p.getAttribute('fill-opacity')==='0.25')`),'packaged tessellation exposes transparent display explicitly');
  await evaluate(`Array.from(document.querySelectorAll('.fold-display-bar button')).find(b=>b.textContent==='实体').click()`);
  const tessFoldBefore=await evaluate(`Array.from(document.querySelectorAll('[data-tess-flat-face]')).map(p=>p.getAttribute('points')).join('|')`);
  await evaluate(`(()=>{const input=document.querySelector('input[aria-label="旋转角度"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'45');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(`document.querySelector('.tess-flat-pane')?.dataset.current==='true'&&JSON.parse(document.querySelector('.tess-flat-pane').dataset.tessFlatKey).angle===45`);
  assert(tessFoldBefore!==await evaluate(`Array.from(document.querySelectorAll('[data-tess-flat-face]')).map(p=>p.getAttribute('points')).join('|')`),'packaged flat geometry follows tessellation parameter changes');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('折痕编辑')).click()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='计算平折').click()`);
  await wait(`!!document.querySelector('.flat-view svg polygon') && document.body.textContent.includes('已找到符合引擎约束的平折层序解')`);
  assert(true,'flat-fold worker operates under desktop content security policy');
  assert(await evaluate(`!!document.querySelector('.canvas-wrap > .canvas-fold-overlay .flat-view') && !document.querySelector('[aria-label="平折结果区宽度"]')`),'packaged editor folds on the original canvas without a new pane');
  await evaluate(`(()=>{const input=document.querySelector('input[aria-label="平折正面颜色"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'#ffcc00');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert(await evaluate(`Array.from(document.querySelectorAll('[data-face-id][data-material="front"]')).every(p=>p.getAttribute('fill')==='#ffcc00') && document.querySelector('input[aria-label="平折正面颜色"]').value==='#ffcc00'`),'packaged editor applies front color immediately');
  assert(await evaluate(`document.querySelectorAll('.fold-display-bar input[type="color"]').length===3 && Array.from(document.querySelectorAll('[data-face-id]')).every(p=>p.getAttribute('fill-opacity')==='1')`),'packaged editor exposes front, back, line colors and opaque display');
  assert(await evaluate(`Array.from(document.querySelectorAll('.fold-dock button')).some(b=>b.textContent==='删除平折结果'&&!b.disabled) && !document.querySelector('.canvas-fold-overlay .fold-display-bar')`),'bottom dock exposes deletion and replaces the floating display toolbar');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('三维模拟')).click()`);
  await wait(`(()=>{const canvas=document.querySelector('iframe')?.contentDocument?.querySelector('#simulation');return canvas && ['webgl2','cpu'].includes(canvas.dataset.backend) && canvas.dataset.status !== 'error';})()`);
  assert(true,'embedded 3D simulator loads its local computing backend');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('折痕编辑')).click()`);
  await wait(`!!document.querySelector('svg.crease-canvas')`);
  await evaluate(`(()=>{const input=document.querySelector('input[aria-label="工程名称"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'桌面关闭保护验收');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(`!!document.querySelector('.save-dot:not(.saved)')`);
  const originalConfirm=messages.confirm;
  let prompted=false;
  messages.confirm=async()=>{prompted=true;return false;};
  try {window.close();await new Promise(r=>setTimeout(r,500));assert(prompted&&!window.isDestroyed(),'unsaved-close confirmation can return safely to editing');}
  finally {messages.confirm=originalConfirm;}
  window.webContents.send('desktop:command','save');await wait(`!!document.querySelector('.save-dot.saved')`);
  // Models deliberately keep beforeunload active even after saving the crease document.
  let reloadPrompted=false;messages.confirm=async()=>{reloadPrompted=true;return true;};
  try{
    window.webContents.reload();
    await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='恢复工作')`);
    assert(reloadPrompted,'saved crease document still protects unsaved models on reload');
  }finally{messages.confirm=originalConfirm;}
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='恢复工作').click()`);
  await wait(`document.querySelectorAll('[data-segment]').length === ${saved.doc.segments.length}`);
  assert(true,'desktop reload offers and restores local recovery');
  assert(await evaluate(`document.querySelectorAll('[data-object-kind="circle"]').length===1`),'desktop recovery preserves auxiliary circle');
  window.webContents.send('desktop:command','save');await wait(`!!document.querySelector('.save-dot.saved')`);
  const cpText=process.env.ZHEZHI_DESKTOP_CP_TEST_FILE?fs.readFileSync(process.env.ZHEZHI_DESKTOP_CP_TEST_FILE,'utf8'):'1 0 0 200 0\n1 200 0 200 200\n1 200 200 0 200\n1 0 200 0 0\n4 25 25 75 75\n';
  const expectedAux=cpText.split(/\r?\n/).filter(l=>/^[04]\s/.test(l.trim())).length;
  await evaluate(`(()=>{const input=document.querySelector('input[aria-label="折痕工程文件"]'),dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(cpText)}],'CP辅助兼容验收.cp',{type:'text/plain'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`document.querySelector('input[aria-label="工程名称"]').value==='CP辅助兼容验收'`);
  assert(await evaluate(`document.querySelectorAll('[data-segment][data-assignment="A"]').length>=${expectedAux} && document.querySelectorAll('[data-segment][data-assignment="F"]').length===0`),'packaged CP 4 imports as auxiliary rather than flat edge');
  window.webContents.send('desktop:command','save');await wait(`!!document.querySelector('.save-dot.saved')`);
  const cpProjects=await(await fetch(origin+'/api/projects')).json(),cpProject=cpProjects.projects.find(p=>p.name==='CP辅助兼容验收'),cpSaved=await(await fetch(origin+'/api/projects/'+cpProject.id)).json();
  assert(cpSaved.doc.segments.filter(s=>s.assignment==='A').length>=expectedAux&&cpSaved.doc.segments.filter(s=>s.assignment==='A').every(s=>s.angle===0),'packaged CP auxiliary persists as zero-angle non-folding geometry');
  await window.webContents.reload();await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='恢复工作')`);await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='恢复工作').click()`);await wait(`document.querySelectorAll('[data-segment]').length===${cpSaved.doc.segments.length}`);
  assert(await evaluate(`document.querySelectorAll('[data-segment][data-assignment="A"]').length===${cpSaved.doc.segments.filter(s=>s.assignment==='A').length}`),'packaged CP auxiliary survives recovery');

  // P77/P78 use the actual menu, dialogs, API, Worker and native CSP.
  // Only DOM input events prepare a document; no core factory or fake Scene enters this runner.
  const strainedCreation={};
  const strainedWait=async source=>{for(let n=0;n<450;n++){if(await evaluate(source))return;await new Promise(r=>setTimeout(r,100));}const state=await evaluate(`document.querySelector('.rpl-state,.tqd-state')?.textContent`);throw new Error('Strained creation timed out: '+source+'; '+state);};
  const setStrainedInput=async(selector,value)=>evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const setStrainedSelect=async(selector,value)=>evaluate(`(()=>{const select=document.querySelector(${JSON.stringify(selector)});if(!select||!Array.from(select.options).some(o=>o.value===${JSON.stringify(String(value))}))throw Error('Missing selectable option');select.value=${JSON.stringify(String(value))};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const clickStrainedButton=async(scope,label)=>evaluate(`(()=>{const button=Array.from(document.querySelectorAll(${JSON.stringify(scope+' button')})).find(b=>b.textContent===${JSON.stringify(label)});if(!button||button.disabled)throw Error('Missing usable button');button.click();})()`);
  const editorCreaseSignature=async()=>evaluate(`JSON.stringify(Array.from(document.querySelectorAll('svg.crease-canvas [data-segment]')).map(g=>[g.dataset.segment,g.dataset.assignment,Array.from(g.querySelectorAll('line')).map(l=>['x1','y1','x2','y2'].map(k=>l.getAttribute(k)))]))`);
  const returnStrainedEditor=async()=>{await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('折痕编辑')).click()`);await wait(`!!document.querySelector('svg.crease-canvas')`);};
  const openStrainedMenu=async value=>{
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('镶嵌设计')).click()`);
    await wait(`!!document.querySelector('.tess-families') || !!document.querySelector('select[aria-label="空间构造类型"]')`);
    if(!await evaluate(`!!document.querySelector('select[aria-label="空间构造类型"]')`)){
      await evaluate(`Array.from(document.querySelectorAll('.tess-families button')).find(b=>b.getAttribute('aria-label')?.endsWith(' 空间构造')).click()`);
      await wait(`!!document.querySelector('select[aria-label="空间构造类型"]')`);
    }
    await setStrainedSelect('select[aria-label="空间构造类型"]',value);
  };
  const waitStrainedCurrent=async(dialog,adopt)=>strainedWait(`document.querySelector(${JSON.stringify(dialog+' main')})?.dataset.previewCurrent==='true' && !!document.querySelector(${JSON.stringify(dialog+' main')})?.dataset.sourceKey && document.querySelector(${JSON.stringify(dialog+' button[aria-label="'+adopt+'"]')})?.disabled===false`);
  const saveStrainedProject=async name=>{
    await setStrainedInput('input[aria-label="工程名称"]',name);
    window.webContents.send('desktop:command','save');await wait(`!!document.querySelector('.save-dot.saved')`);
    const response=await fetch(origin+'/api/projects'),listing=await response.json();
    const project=listing.projects.find(p=>p.name===name);
    if(!response.ok||!project)throw new Error('Strained creation was not saved to the real project library');
    const savedResponse=await fetch(origin+'/api/projects/'+project.id),savedProject=await savedResponse.json();
    if(!savedResponse.ok||!savedProject.doc)throw new Error('Saved strained project cannot be read back');
    return savedProject;
  };
  const reopenStrainedProject=async name=>{
    await evaluate(`Array.from(document.querySelectorAll('.header-actions button')).find(b=>b.textContent.includes('工程库')).click()`);
    await wait(`Array.from(document.querySelectorAll('.project-list button strong')).some(s=>s.textContent===${JSON.stringify(name)})`);
    await evaluate(`Array.from(document.querySelectorAll('.project-list button')).find(b=>b.querySelector('strong')?.textContent===${JSON.stringify(name)}).click()`);
    await wait(`!document.querySelector('.modal') && document.querySelector('input[aria-label="工程名称"]')?.value===${JSON.stringify(name)}`);
    await returnStrainedEditor();
  };
  const cpOnlyStrainedDoc=doc=>doc.schemaVersion===2&&doc.segments.length>0&&doc.flatFold===undefined&&doc.background===undefined&&doc.metadata?.materialTopology?.foldedVertices===undefined&&doc.metadata?.materialTopology?.startingFace===undefined;
  if(require('electron').app.isPackaged)assert(path.resolve(backend)===path.resolve(process.resourcesPath,'tessellation','zhezhi-tess.exe'),'packaged strained creation uses this package native backend executable');

  // Recovery restores geometry but intentionally clears its manual-save marker.
  // Save that restored CP through the native command before adopting a new CP.
  window.webContents.send('desktop:command','save');await wait(`!!document.querySelector('.save-dot.saved')`);
  const beforeRotationalCreases=await editorCreaseSignature();
  await openStrainedMenu('rotational-pleats-cp');await wait(`!!document.querySelector('.rpl-dialog[open]')`);
  assert(await evaluate(`['rotational-pleats-cp','strain-tq-design-cp'].every(v=>Array.from(document.querySelector('select[aria-label="空间构造类型"]').options).some(o=>o.value===v))`),'packaged space menu exposes both original rotational pleats and TQ constraint CP routes');
  await setStrainedSelect('.rpl-dialog select[aria-label="旋转褶纸带构造"]','rectangle');
  await setStrainedInput('.rpl-dialog input[aria-label="空间弧角 Φ"]','45');
  await waitStrainedCurrent('.rpl-dialog','采用原旋转褶 CP');
  const rotationalKey45=await evaluate(`document.querySelector('.rpl-dialog main').dataset.sourceKey`);
  assert(JSON.parse(rotationalKey45).arcDeg===45&&JSON.parse(rotationalKey45).base.model==='flat-strip','packaged rotational pleats produces the current real rectangle engineering root at 45 degrees');
  await setStrainedInput('.rpl-dialog input[aria-label="空间弧角 Φ"]','46');
  await strainedWait(`document.querySelector('.rpl-dialog main')?.dataset.previewCurrent==='false' && document.querySelector('.rpl-dialog button[aria-label="采用原旋转褶 CP"]')?.disabled===true`);
  assert(true,'packaged rotational angle edit invalidates the old current root before adoption');
  await waitStrainedCurrent('.rpl-dialog','采用原旋转褶 CP');
  const rotationalKey46=await evaluate(`document.querySelector('.rpl-dialog main').dataset.sourceKey`);
  assert(rotationalKey46!==rotationalKey45&&JSON.parse(rotationalKey46).arcDeg===46,'packaged rotational source key changes only after the current 46-degree root passes');
  await clickStrainedButton('.rpl-dialog','取消');await wait(`!document.querySelector('.rpl-dialog')`);await returnStrainedEditor();
  assert(await editorCreaseSignature()===beforeRotationalCreases,'packaged rotational dialog cancellation preserves every editor crease');
  await openStrainedMenu('rotational-pleats-cp');await wait(`!!document.querySelector('.rpl-dialog[open]')`);
  await setStrainedSelect('.rpl-dialog select[aria-label="旋转褶纸带构造"]','rectangle');await setStrainedInput('.rpl-dialog input[aria-label="空间弧角 Φ"]','46');
  await waitStrainedCurrent('.rpl-dialog','采用原旋转褶 CP');
  await evaluate(`document.querySelector('.rpl-dialog button[aria-label="采用原旋转褶 CP"]').click()`);await wait(`!document.querySelector('.rpl-dialog')`);await returnStrainedEditor();
  await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='修改旋转褶构造参数')`);
  assert(await editorCreaseSignature()!==beforeRotationalCreases,'packaged rotational adoption replaces the editor with actual finite CP geometry');
  const rotationalSaved=await saveStrainedProject('P77 原旋转褶桌面验收'),rotationalSource=rotationalSaved.doc.metadata?.originalRotationalPleatsCP;
  assert(cpOnlyStrainedDoc(rotationalSaved.doc)&&JSON.stringify(rotationalSource?.recipe)===rotationalKey46&&rotationalSource?.rootResult?.query?.sourceKey===rotationalKey46&&rotationalSource?.rootResult?.sourceKey===rotationalKey46&&rotationalSource?.rootResultKey===JSON.stringify(rotationalSource?.rootResult),'packaged rotational save preserves the exact current recipe and native root source');
  assert(rotationalSource?.derived?.diagnostics?.spatialStateRole==='diagnostic reference only; not a certified Scene','packaged rotational spatial engineering shape remains diagnostic without an adopted Scene');
  await reopenStrainedProject('P77 原旋转褶桌面验收');await clickStrainedButton('body','修改旋转褶构造参数');await wait(`!!document.querySelector('.rpl-dialog[open]')`);await waitStrainedCurrent('.rpl-dialog','采用原旋转褶 CP');
  assert(await evaluate(`document.querySelector('.rpl-dialog select[aria-label="旋转褶纸带构造"]').value==='rectangle'&&document.querySelector('.rpl-dialog input[aria-label="空间弧角 Φ"]').value==='46'&&document.querySelector('.rpl-dialog main').dataset.sourceKey===${JSON.stringify(rotationalKey46)}`),'packaged saved rotational project reopens editable source parameters and the same verified key');
  const savedRotationalCreases=await editorCreaseSignature();
  await setStrainedInput('.rpl-dialog input[aria-label="空间弧角 Φ"]','45');await waitStrainedCurrent('.rpl-dialog','采用原旋转褶 CP');
  await clickStrainedButton('.rpl-dialog','取消');await wait(`!document.querySelector('.rpl-dialog')`);
  assert(await editorCreaseSignature()===savedRotationalCreases,'packaged rotational source-edit cancellation preserves the saved CP');
  await openStrainedMenu('rotational-pleats-cp');await wait(`!!document.querySelector('.rpl-dialog[open]')`);
  assert(await evaluate(`!!document.querySelector('select[aria-label="空间构造类型"] option[value="strain-tq-design-cp"]')`),'packaged return to tessellation keeps both CP routes selectable in the same dropdown');
  await clickStrainedButton('.rpl-dialog','取消');await wait(`!document.querySelector('.rpl-dialog')`);await returnStrainedEditor();
  strainedCreation.rotationalPleats={projectId:rotationalSaved.id,sourceKey:rotationalKey46,recipe:rotationalSource.recipe,segments:rotationalSaved.doc.segments.length,spatialState:'diagnostic'};

  const configureTQ=async()=>{
    await setStrainedSelect('.tqd-dialog select[aria-label="TQ 原约束模型"]','pleat-stiff');
    await setStrainedSelect('.tqd-dialog select[aria-label="TQ 点约束索引"]','2');
    await setStrainedInput('.tqd-dialog input[aria-label="TQ 点目标 Z / mm"]','90');
    await clickStrainedButton('.tqd-dialog','能量与分面');
    await setStrainedInput('.tqd-dialog input[aria-label="TQ 平折硬度"]','1.2');
    await evaluate(`(()=>{const input=document.querySelector('.tqd-dialog input[aria-label="TQ 按原峰谷约束方向"]');if(!input.checked)input.click();})()`);
  };
  const beforeTQCreases=await editorCreaseSignature();
  await openStrainedMenu('strain-tq-design-cp');await wait(`!!document.querySelector('.tqd-dialog[open]')`);
  await configureTQ();await waitStrainedCurrent('.tqd-dialog','采用原 TQ 约束 CP');
  const tqKey=await evaluate(`document.querySelector('.tqd-dialog main').dataset.sourceKey`),tqRecipe=JSON.parse(tqKey);
  assert(tqRecipe.model==='pleat-stiff'&&tqRecipe.pointConstraints[2].target[2]===.9&&tqRecipe.flatFoldStiffness===1.2&&tqRecipe.constrainFromAssignment===true,'packaged TQ Worker solves current pleat-stiff point Z 90 mm, stiffness 1.2 and original assignment constraints');
  assert(await evaluate(`document.querySelector('.tqd-reference')?.dataset.staticState==='diagnostic'&&document.querySelector('.tqd-state')?.dataset.state==='ready'`),'packaged TQ spatial display labels the native engineering minimum as diagnostic');
  await setStrainedInput('.tqd-dialog input[aria-label="TQ 平折硬度"]','1.3');
  await strainedWait(`document.querySelector('.tqd-dialog main')?.dataset.previewCurrent==='false'&&document.querySelector('.tqd-dialog button[aria-label="采用原 TQ 约束 CP"]')?.disabled===true`);
  assert(true,'packaged TQ energy edit invalidates the old Worker result before adoption');
  await waitStrainedCurrent('.tqd-dialog','采用原 TQ 约束 CP');
  const tqChangedKey=await evaluate(`document.querySelector('.tqd-dialog main').dataset.sourceKey`);
  assert(tqChangedKey!==tqKey&&JSON.parse(tqChangedKey).flatFoldStiffness===1.3,'packaged TQ publishes a different source key for the newly verified current constraints');
  await clickStrainedButton('.tqd-dialog','取消');await wait(`!document.querySelector('.tqd-dialog')`);await returnStrainedEditor();
  assert(await editorCreaseSignature()===beforeTQCreases,'packaged TQ cancellation preserves every prior editor crease');
  await openStrainedMenu('strain-tq-design-cp');await wait(`!!document.querySelector('.tqd-dialog[open]')`);await configureTQ();await waitStrainedCurrent('.tqd-dialog','采用原 TQ 约束 CP');
  await evaluate(`document.querySelector('.tqd-dialog button[aria-label="采用原 TQ 约束 CP"]').click()`);await wait(`!document.querySelector('.tqd-dialog')`);await returnStrainedEditor();
  await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='修改 TQ 约束设计参数')`);
  assert(await editorCreaseSignature()!==beforeTQCreases,'packaged TQ adoption writes the actual constrained finite CP into the editor');
  const tqSaved=await saveStrainedProject('P78 原 TQ 约束桌面验收'),tqSource=tqSaved.doc.metadata?.originalStrainTQDesign;
  assert(cpOnlyStrainedDoc(tqSaved.doc)&&JSON.stringify(tqSource?.recipe)===tqKey&&tqSource?.minimumResult?.query?.sourceKey===tqKey&&tqSource?.minimumResult?.sourceKey===tqKey&&tqSource?.minimumResultKey===JSON.stringify(tqSource?.minimumResult),'packaged TQ save preserves the complete exact recipe and native minimum source');
  assert(tqSource?.source?.staticSceneCertified===false&&tqSource?.source?.originalMinimumBranchCertified===false,'packaged TQ CP carries diagnostic engineering evidence without fake Scene or branch certification');
  await reopenStrainedProject('P78 原 TQ 约束桌面验收');await clickStrainedButton('body','修改 TQ 约束设计参数');await wait(`!!document.querySelector('.tqd-dialog[open]')`);await waitStrainedCurrent('.tqd-dialog','采用原 TQ 约束 CP');
  await setStrainedSelect('.tqd-dialog select[aria-label="TQ 点约束索引"]','2');
  assert(await evaluate(`document.querySelector('.tqd-dialog select[aria-label="TQ 原约束模型"]').value==='pleat-stiff'&&document.querySelector('.tqd-dialog input[aria-label="TQ 点目标 Z / mm"]').value==='90'&&document.querySelector('.tqd-dialog main').dataset.sourceKey===${JSON.stringify(tqKey)}`),'packaged saved TQ project reopens source model, selected point target and the same verified key');
  await clickStrainedButton('.tqd-dialog','能量与分面');
  assert(await evaluate(`document.querySelector('.tqd-dialog input[aria-label="TQ 平折硬度"]').value==='1.2'&&document.querySelector('.tqd-dialog input[aria-label="TQ 按原峰谷约束方向"]').checked`),'packaged TQ source reopening retains stiffness and the original mountain-valley constraint switch');
  const savedTQCreases=await editorCreaseSignature();await setStrainedInput('.tqd-dialog input[aria-label="TQ 平折硬度"]','1.3');await waitStrainedCurrent('.tqd-dialog','采用原 TQ 约束 CP');
  await clickStrainedButton('.tqd-dialog','取消');await wait(`!document.querySelector('.tqd-dialog')`);
  assert(await editorCreaseSignature()===savedTQCreases,'packaged TQ source-edit cancellation preserves the saved CP');
  await openStrainedMenu('strain-tq-design-cp');await wait(`!!document.querySelector('.tqd-dialog[open]')`);
  assert(await evaluate(`!!document.querySelector('select[aria-label="空间构造类型"] option[value="rotational-pleats-cp"]')`),'packaged saved TQ returns to the same tessellation dropdown with both original CP routes');
  await clickStrainedButton('.tqd-dialog','取消');await wait(`!document.querySelector('.tqd-dialog')`);await returnStrainedEditor();
  strainedCreation.strainTQ={projectId:tqSaved.id,sourceKey:tqKey,recipe:tqSource.recipe,segments:tqSaved.doc.segments.length,spatialState:'diagnostic'};
  const storageMigration=await require('./storageSmoke.cjs').run({window,origin,dataRoot,service,evaluate,wait});checks.push(...storageMigration.checks);
  return {passed:checks.length,checks,packaged:require('electron').app.isPackaged,origin,dataRoot,backend,storageSetup,storageMigration,nativeBackendPath:backend,nativeBackendSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(backend)).digest('hex'),strainedCreation,cpImport:{inputLines:cpText.trim().split(/\r?\n/).length,expectedAux,editableSegments:cpSaved.doc.segments.length,auxiliary:cpSaved.doc.segments.filter(s=>s.assignment==='A').length}};
};
