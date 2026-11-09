async page=>{
 const checks=[],errors=[],hits=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const canvas=page.locator('#workspace .crease-canvas'),command=page.getByLabel('工具命令',{exact:true});
 const button=name=>page.getByRole('button',{name,exact:true});
 const segment=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
 const borders=()=>[segment('aux-top',[0,0],[200,0]),segment('aux-right',[200,0],[200,200]),segment('aux-bottom',[200,200],[0,200]),segment('aux-left',[0,200],[0,0])];
 const source=(name,segments)=>({format:'zhezhi-workbench',version:2,schemaVersion:2,name:`辅助线回归-${name}-${Date.now()}`,paper:{width:200,height:200},segments:[...borders(),...segments]});
 const count=assignment=>canvas.locator(`[data-assignment="${assignment}"]`).count();
 const selected=assignment=>canvas.locator(`${assignment?`[data-assignment="${assignment}"]`:'[data-segment]'} > circle`).count();
 const waitCount=(assignment,n)=>page.waitForFunction(({assignment,n})=>document.querySelector('#workspace .crease-canvas')?.querySelectorAll(`[data-assignment="${assignment}"]`).length===n,{assignment,n});
 const waitSelected=(assignment,n)=>page.waitForFunction(({assignment,n})=>document.querySelector('#workspace .crease-canvas')?.querySelectorAll(`${assignment?`[data-assignment="${assignment}"]`:'[data-segment]'} > circle`).length===n,{assignment,n});
 const point=coordinate=>canvas.evaluate((element,p)=>{
  const box=element.getBoundingClientRect(),view=element.viewBox.baseVal;
  return{x:box.left+(p[0]-view.x)/view.width*box.width,y:box.top+(p[1]-view.y)/view.height*box.height};
 },coordinate);
 const upload=async document=>{
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,text)=>{
   const transfer=new DataTransfer();transfer.items.add(new File([text],'auxiliary-edit.zhezhi.json',{type:'application/json'}));
   input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  },JSON.stringify(document));
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,document.name);
 };
 const execute=async(text,tool,fromCanvas=false)=>{
  if(fromCanvas)await canvas.focus();else{await command.fill('');await command.focus();}
  await page.keyboard.type(text);await command.press('Enter');
  await page.waitForFunction(tool=>document.querySelector('#workspace .crease-canvas')?.classList.contains(`tool-${tool}`),tool);
 };
 const clearSelection=async()=>{await canvas.focus();await page.keyboard.press('Control+Shift+a');await waitSelected(null,0);};
 const click=async(coordinate,options={})=>{const p=await point(coordinate);await page.mouse.click(p.x,p.y,options);};
 const dragScreen=async(a,b,which='left',shift=false)=>{
  if(shift)await page.keyboard.down('Shift');
  try{await page.mouse.move(a.x,a.y);await page.mouse.down({button:which});await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up({button:which});}
  finally{if(shift)await page.keyboard.up('Shift');}
 };
 const drag=async(a,b,which='left',shift=false)=>dragScreen(await point(a),await point(b),which,shift);
 const undo=async(assignment,n)=>{await canvas.focus();await page.keyboard.press('Control+z');await waitCount(assignment,n);};
 const redo=async(assignment,n)=>{await canvas.focus();await page.keyboard.press('Control+Shift+z');await waitCount(assignment,n);};
 const layers=async(main,auxiliary)=>{
  const details=page.locator('#workspace details.canvas-layers');
  if(!(await details.evaluate(element=>element.open)))await details.locator('summary').click();
  const mainBox=details.getByRole('checkbox',{name:'主折痕',exact:true}),auxBox=details.getByRole('checkbox',{name:'辅助线',exact:true});
  if(await mainBox.isChecked()!==main)await mainBox.setChecked(main);
  if(await auxBox.isChecked()!==auxiliary)await auxBox.setChecked(auxiliary);
  await details.locator('summary').click();
 };
 const drawing=async()=>{await button('绘图工具').click();await page.waitForFunction(()=>document.querySelector('.inspector-tabs button')?.getAttribute('aria-pressed')==='true');};
 const isDrawing=()=>button('绘图工具').getAttribute('aria-pressed').then(value=>value==='true');
 const presets=page.locator('.dock-line-presets .type-buttons');
 const modelSvg=()=>page.locator('.canvas-fold-overlay svg[aria-label="实际平折面几何，点击面查看原始位置"]');
 const overlapHit=()=>page.evaluate(()=>{
  const lines=[...document.querySelectorAll('#workspace .crease-canvas [data-assignment="A"] [data-crease-stroke]')],faces=[...document.querySelectorAll('.canvas-fold-overlay [data-face-id]')];
  const main=[...document.querySelectorAll('#workspace .crease-canvas [data-assignment="M"] [data-crease-stroke]')].map(line=>line.getBoundingClientRect());
  for(const line of lines){
   const a=line.getBoundingClientRect(),y=a.y+a.height/2;
   for(const face of faces){
    const b=face.getBoundingClientRect(),lo=Math.max(a.left,b.left)+5,hi=Math.min(a.right,b.right)-5;
    if(y<=b.top+4||y>=b.bottom-4||hi-lo<20)continue;
    for(const f of [.5,.25,.75]){
     const x=lo+(hi-lo)*f;if(main.some(m=>Math.abs(x-(m.left+m.right)/2)<18))continue;
     const target=document.elementFromPoint(x,y);
     if(!target?.closest('.canvas-fold-overlay')||!target.closest('[data-face-id],[data-region-top]'))continue;
     return{x,y,id:line.closest('[data-segment]').getAttribute('data-segment'),face:face.getAttribute('data-face-id'),target:target.tagName};
    }
   }
  }
  return null;
 });
 const pageError=error=>errors.push(error.message);page.on('pageerror',pageError);
 // Run on the caller's isolated test page. No navigation, project save or
 // server-side user data writes are performed by this regression script.
 await page.evaluate(()=>{window.__auxiliaryEditOriginalConfirm=window.confirm;window.confirm=()=>true;});
 try{
  await page.getByLabel('工程名称',{exact:true}).waitFor();await page.waitForTimeout(250);
  for(const name of ['设置并开始使用','关闭窗口','保留当前工程']){const b=button(name);if(await b.count()&&await b.isVisible())await b.click();}
  await canvas.waitFor();await command.waitFor();
  if(await button('收起平折').count())await button('收起平折').click();
  await page.locator('.header-actions').getByText('设置',{exact:true}).click();await page.getByRole('tab',{name:'命令编辑',exact:true}).click();
  const commandSettings=page.locator('[data-storage-settings] .tool-command-settings');await commandSettings.getByRole('checkbox',{name:'画布直接键入命令',exact:true}).check();await commandSettings.getByRole('button',{name:'保存并应用',exact:true}).click();
  const snap=page.getByLabel('吸附',{exact:true});if(await snap.isChecked())await snap.uncheck();
  const protection=page.getByLabel('保护边界',{exact:true});if(!(await protection.isChecked()))await protection.check();
  await upload(source('真实绘制',[]));await layers(true,true);await waitCount('B',4);
  await presets.getByRole('button',{name:'辅助',exact:true}).click();await execute('l','line',true);
  for(const [index,[a,b]] of [[[20,40],[80,40]],[[110,70],[170,70]],[[20,120],[170,120]]].entries()){
   await drag(a,b);await waitCount('A',index+1);
   check(await count('A')===index+1,`线段＋辅助真实拖放绘制第 ${index+1} 条 A 线`);
  }
  await presets.getByRole('button',{name:'山折',exact:true}).click();await drag([20,160],[170,160]);await waitCount('M',1);
  check(await count('M')===1&&await count('A')===3,'真实绘制保留辅助线与独立山折');
  await execute('v','select',true);await click([50,40]);await waitSelected('A',2);
  check(await selected('A')===2,'画布键入 V 后 Enter 单选实际辅助线');
  await page.keyboard.down('Shift');try{await click([140,70]);}finally{await page.keyboard.up('Shift');}
  await waitSelected('A',4);check(await selected('A')===4,'Shift 单击添加第二条辅助线选区');
  await clearSelection();await drag([10,30],[85,50]);await waitSelected('A',2);
  check(await selected('A')===2,'普通鼠标框选辅助线');
  await drag([105,60],[175,80],'left',true);await waitSelected('A',4);
  check(await selected('A')===4,'Shift 框选追加辅助线且保留原选区');
  await click([50,40],{button:'right'});await waitCount('A',2);
  check(await count('A')===2&&await count('M')===1,'右键单击删除辅助小段并保留主折痕');
  await undo('A',3);check(await count('A')===3,'Ctrl+Z 撤销右键点删辅助线');
  await redo('A',2);check(await count('A')===2,'Ctrl+Shift+Z 重做右键点删辅助线');await undo('A',3);
  await drag([40,35],[60,45],'right');
  check(await count('A')===3,'右拖向右的小框只接触辅助线时不删除未完整包含的线');
  await drag([15,35],[85,45],'right');await waitCount('A',2);
  check(await count('A')===2,'右拖向右完整包含框删除辅助线');await undo('A',3);
  await drag([60,125],[40,115],'right');await waitCount('A',2);
  check(await count('A')===2&&await count('M')===1,'右拖向左接触框删除穿过小框的长辅助线');
  await undo('A',3);await redo('A',2);check(await count('A')===2,'辅助线右拖框删可撤销与重做');await undo('A',3);
  await page.screenshot({path:'output/playwright/auxiliary-edit-ordinary.png'});

  // Separate parallel lines stay in the editor: coincident imports may be
  // merged by planarization and would not be a reliable hidden-layer fixture.
  await upload(source('图层拾取',[segment('near-guide',[20,80],[180,80],'A'),segment('near-mountain',[20,80.5],[180,80.5],'M',-180)]));
  await layers(true,true);await execute('v','select');await waitCount('A',1);await waitCount('M',1);
  const aPoint=await point([100,80]),mPoint=await point([100,80.5]);
  check(Math.hypot(aPoint.x-mPoint.x,aPoint.y-mPoint.y)<3,'主线与辅助线相距不足 3 像素，真实覆盖近邻拾取半径');
  await layers(false,true);await click([100,80.5]);await waitSelected('A',2);
  check(await selected('A')===2&&await selected('M')===0&&await canvas.locator('[data-assignment="M"]').getAttribute('visibility')==='hidden','隐藏主线后，靠近隐藏主线点击仅选中可见辅助线');
  await click([100,80.5],{button:'right'});await waitCount('A',0);
  await layers(true,true);check(await count('M')===1&&await count('A')===0,'隐藏主线后点删只删可见 A，重新显示验证 M 未被删除');
  await undo('A',1);await layers(false,true);
  await drag([110,84],[90,76],'right');await waitCount('A',0);
  await layers(true,true);check(await count('M')===1,'隐藏主线后右拖接触框不删除隐藏 M');await undo('A',1);
  await layers(true,false);await execute('v','select');await click([100,80]);await waitSelected('M',2);
  check(await selected('M')===2&&await selected('A')===0&&await canvas.locator('[data-assignment="A"]').getAttribute('visibility')==='hidden','隐藏辅助图层后，靠近隐藏 A 点击仅选中可见 M');
  await layers(true,true);check(await selected('A')===0,'重新显示辅助图层验证隐藏 A 未被选中');await layers(true,false);
  await click([100,80],{button:'right'});await waitCount('M',0);
  await layers(true,true);check(await count('A')===1&&await count('M')===0,'辅助图层隐藏时点删仅删除可见主线，A 仍保留');await undo('M',1);
  await layers(true,false);await drag([110,84],[90,76],'right');await waitCount('M',0);
  await layers(true,true);check(await count('A')===1,'辅助图层隐藏时右拖接触框仅删除可见主线');await undo('M',1);
  await page.screenshot({path:'output/playwright/auxiliary-edit-hidden-layers.png'});

  await upload(source('平折叠层',[segment('mountain',[100,0],[100,200],'M',-180),segment('guide',[10,100],[190,100],'A')]));
  await layers(true,true);await clearSelection();await waitCount('A',2);
  check(await count('A')===2,'导入交叉山折后辅助线真实分成两个小段');
  await button('计算平折').click();await page.locator('.canvas-fold-overlay [data-face-id]').first().waitFor({timeout:60000});
  await button('平折参数').click();let hit=await overlapHit();check(!!hit,'在实际平折模型面下找到辅助线的可视重叠点');hits.push({...hit,phase:'model'});
  await page.mouse.click(hit.x,hit.y);
  check(await button('平折参数').getAttribute('aria-pressed')==='true'&&await button('取消面选择').count()>0,'平折参数模式真实点击模型面仍可选择模型面');
  check(await selected('A')===0,'模型面点击不会误选后面的辅助线');
  // The original-face map intentionally appears over the model after a click.
  // Close it before testing a drag on the model itself.
  await button('取消面选择').click();hit=await overlapHit();check(!!hit,'关闭原始位置小图后重新命中模型面');
  const beforeView=await modelSvg().getAttribute('viewBox');
  await dragScreen(hit,{x:hit.x+24,y:hit.y+16});
  await page.waitForFunction(before=>document.querySelector('.canvas-fold-overlay svg[aria-label="实际平折面几何，点击面查看原始位置"]')?.getAttribute('viewBox')!==before,beforeView);
  check(await modelSvg().getAttribute('viewBox')!==beforeView&&await button('平折参数').getAttribute('aria-pressed')==='true','平折参数模式鼠标拖动真实模型视图仍可用');
  if(await button('取消面选择').count())await button('取消面选择').click();
  await page.locator('.tool-rail').getByRole('button',{name:'线段',exact:true}).click();
  check(await isDrawing(),'点击左侧线段工具自动返回绘图工具模式');
  await button('平折参数').click();await presets.getByRole('button',{name:'辅助',exact:true}).click();
  check(await isDrawing(),'点击新线类型辅助自动返回绘图工具模式');
  await button('平折参数').click();await execute('v','select');
  check(await isDrawing(),'实际键入 V 并 Enter 的 CAD 命令自动返回绘图工具模式');
  await button('平折参数').click();hit=await overlapHit();check(!!hit,'移动模型视图后仍找到真实辅助线与模型面重叠点');hits.push({...hit,phase:'drawing'});
  await drawing();await execute('v','select');
  const passedThrough=await page.evaluate(p=>!document.elementFromPoint(p.x,p.y)?.closest('.canvas-fold-overlay'),hit);
  check(passedThrough,'绘图工具模式模型叠层不截获真实鼠标命中');
  await page.mouse.click(hit.x,hit.y);await waitSelected('A',2);
  check(await selected('A')===2&&await isDrawing(),'绘图模式穿透模型叠层单选对应辅助小段');
  const mainBefore=await count('M');
  await dragScreen({x:hit.x+10,y:hit.y-10},{x:hit.x-10,y:hit.y+10},'right');await waitCount('A',1);
  check(await count('A')===1&&await count('M')===mainBefore,'绘图模式右拖穿透模型叠层，仅删除被接触的辅助小段');
  await undo('A',2);check(await count('A')===2,'模型叠层下辅助线框删仍支持工程 Ctrl+Z');
  await redo('A',1);check(await count('A')===1,'模型叠层下辅助线框删仍支持工程重做');await undo('A',2);
  await page.screenshot({path:'output/playwright/auxiliary-edit-fold-overlay.png'});
  check(errors.length===0,`辅助编辑全过程没有页面异常 (${errors.join('; ')})`);
  return{passed:checks.length,checks,hits,errors};
 }catch(error){
  const latest=await canvas.evaluate(element=>({view:element.getAttribute('viewBox'),tool:element.className.baseVal,
   selected:element.querySelectorAll('[data-segment] > circle').length,auxiliary:element.querySelectorAll('[data-assignment="A"]').length,
   main:element.querySelectorAll('[data-assignment="M"]').length})).catch(()=>null);
  throw Error(`${error.message}; 已通过 ${checks.length} 项; 最近检查=${JSON.stringify(checks.slice(-6))}; 状态=${JSON.stringify(latest)}; hit=${JSON.stringify(hits)}`);
 }finally{
  page.off('pageerror',pageError);await page.evaluate(()=>{if(window.__auxiliaryEditOriginalConfirm){window.confirm=window.__auxiliaryEditOriginalConfirm;delete window.__auxiliaryEditOriginalConfirm;}}).catch(()=>{});
 }
}
