async page=>{
 const checks=[],errors=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const canvas=page.locator('#workspace .crease-canvas'),command=page.getByLabel('工具命令',{exact:true});
 const button=name=>page.getByRole('button',{name,exact:true});
 const circleCount=()=>canvas.locator('[data-drawing-object][data-object-kind="circle"]').count();
 const selectedCircles=()=>canvas.locator('[data-selected-circle]').count();
 const count=assignment=>canvas.locator(`[data-assignment="${assignment}"]`).count();
 const selectedLines=()=>canvas.locator('[data-segment] > circle').count();
 const object=id=>canvas.locator(`[data-drawing-object="${id}"]`);
 const point=coordinate=>canvas.evaluate((element,p)=>{const b=element.getBoundingClientRect(),v=element.viewBox.baseVal;return{x:b.left+(p[0]-v.x)/v.width*b.width,y:b.top+(p[1]-v.y)/v.height*b.height};},coordinate);
 const rim=(id,angle=0)=>object(id).locator('circle').evaluate((element,angle)=>{
  const b=element.getBoundingClientRect();return{x:b.left+b.width/2+Math.cos(angle)*b.width/2,y:b.top+b.height/2+Math.sin(angle)*b.height/2};
 },angle);
 const click=async(coordinate,which='left')=>{const p=await point(coordinate);await page.mouse.click(p.x,p.y,{button:which});};
 const rightPoint=async p=>{await page.mouse.move(p.x,p.y);await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});};
 const drag=async(a,b,which='left',shift=false)=>{
  const start=await point(a),end=await point(b);if(shift)await page.keyboard.down('Shift');
  try{await page.mouse.move(start.x,start.y);await page.mouse.down({button:which});await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up({button:which});}
  finally{if(shift)await page.keyboard.up('Shift');}
 };
 const waitCircles=n=>page.waitForFunction(n=>document.querySelector('#workspace .crease-canvas')?.querySelectorAll('[data-drawing-object][data-object-kind="circle"]').length===n,n);
 const waitSelected=n=>page.waitForFunction(n=>document.querySelector('#workspace .crease-canvas')?.querySelectorAll('[data-selected-circle]').length===n,n);
 const waitLines=(assignment,n)=>page.waitForFunction(({assignment,n})=>document.querySelector('#workspace .crease-canvas')?.querySelectorAll(`[data-assignment="${assignment}"]`).length===n,{assignment,n});
 const execute=async(text,tool)=>{await command.fill('');await command.focus();await page.keyboard.type(text);await command.press('Enter');await page.waitForFunction(tool=>document.querySelector('#workspace .crease-canvas')?.classList.contains(`tool-${tool}`),tool);};
 const clear=async()=>{await execute('v','select');await click([185,20]);await waitSelected(0);};
 const undo=async n=>{await canvas.focus();await page.keyboard.press('Control+z');await waitCircles(n);};
 const redo=async n=>{await canvas.focus();await page.keyboard.press('Control+Shift+z');await waitCircles(n);};
 const layers=async(main,auxiliary)=>{
  const d=page.locator('#workspace details.canvas-layers');if(!(await d.evaluate(element=>element.open)))await d.locator('summary').click();
  const m=d.getByRole('checkbox',{name:'主折痕',exact:true}),a=d.getByRole('checkbox',{name:'辅助线',exact:true});
  if(await m.isChecked()!==main)await m.setChecked(main);if(await a.isChecked()!==auxiliary)await a.setChecked(auxiliary);
  await d.locator('summary').click();
 };
 const segment=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
 const circle=(id,center,radius)=>({id,kind:'circle',center,radius,color:'#367d86'});
 const annotations=()=>[{id:'circle-keep-mark',kind:'mark',a:[130,180],b:[170,180],color:'#8052ad'},
  {id:'circle-keep-text',kind:'text',position:[130,190],text:'保留注释',fontSize:5,color:'#263b31'}];
 const source=(suffix,circles=[],near=false)=>({format:'zhezhi-workbench',version:2,schemaVersion:2,name:`辅助圆回归-${suffix}-${Date.now()}`,
  paper:{width:200,height:200},segments:[segment('circle-top',[0,0],[200,0]),segment('circle-right',[200,0],[200,200]),segment('circle-bottom',[200,200],[0,200]),segment('circle-left',[0,200],[0,0]),
   near?segment('circle-mountain',[60.5,25],[60.5,95],'M',-180):segment('circle-mountain',[20,160],[180,160],'M',-180),segment('circle-guide',[20,120],[180,120],'A')],objects:[...annotations(),...circles]});
 const upload=async document=>{
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,text)=>{const d=new DataTransfer();d.items.add(new File([text],'auxiliary-circle.zhezhi.json',{type:'application/json'}));input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));},JSON.stringify(document));
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,document.name);
 };
 const intact=async label=>check(await count('B')===4&&await object('circle-keep-mark').count()===1&&await object('circle-keep-text').count()===1,label);
 const pageError=error=>errors.push(error.message);page.on('pageerror',pageError);
 // Caller supplies an isolated test page. Do not navigate or save a project.
 await page.evaluate(()=>{window.__auxiliaryCircleOriginalConfirm=window.confirm;window.confirm=()=>true;});
 try{
  await page.getByLabel('工程名称',{exact:true}).waitFor();await page.waitForTimeout(250);
  for(const name of ['设置并开始使用','关闭窗口','保留当前工程']){const b=button(name);if(await b.count()&&await b.isVisible())await b.click();}
  await canvas.waitFor();await command.waitFor();if(await button('收起平折').count())await button('收起平折').click();
  await page.locator('.header-actions').getByText('设置',{exact:true}).click();await page.getByRole('tab',{name:'命令编辑',exact:true}).click();
  const commandSettings=page.locator('[data-storage-settings] .tool-command-settings');await commandSettings.getByRole('checkbox',{name:'画布直接键入命令',exact:true}).check();await commandSettings.getByRole('button',{name:'保存并应用',exact:true}).click();
  const snap=page.getByLabel('吸附',{exact:true});if(await snap.isChecked())await snap.uncheck();
  const protection=page.getByLabel('保护边界',{exact:true});if(!(await protection.isChecked()))await protection.check();
  await upload(source('实际绘圆'));await layers(true,true);await execute('c','circle');
  await click([40,60]);await click([60,60]);await waitCircles(1);
  const firstId=await canvas.locator('[data-drawing-object][data-object-kind="circle"]').getAttribute('data-drawing-object');
  const geometry=await object(firstId).locator('circle').evaluate(element=>['cx','cy','r'].map(name=>Number(element.getAttribute(name))));
  check(geometry.every((value,index)=>Math.abs(value-[40,60,20][index])<.2),'C Enter 与真实两点点击绘出圆心 [40,60]、半径 20 的辅助圆');
  await click([120,60]);await click([135,60]);await waitCircles(2);
  const secondId=await canvas.locator('[data-drawing-object][data-object-kind="circle"]').evaluateAll(elements=>elements.map(element=>element.dataset.drawingObject),null).then(ids=>ids.find(id=>id!==firstId));
  await execute('v','select');let p=await rim(firstId);await page.mouse.click(p.x,p.y);await waitSelected(1);
  check(await canvas.locator(`[data-selected-circle="${firstId}"]`).count()===1,'V Enter 后真实点击圆周选择辅助圆并显示高亮');
  await page.keyboard.down('Shift');try{p=await rim(secondId);await page.mouse.click(p.x,p.y);}finally{await page.keyboard.up('Shift');}await waitSelected(2);
  check(await selectedCircles()===2,'Shift 圆周点击多选两个辅助圆');
  await clear();await drag([15,35],[65,85]);await waitSelected(1);check(await selectedCircles()===1,'普通空白拖框选中完整辅助圆');
  await drag([100,40],[140,80],'left',true);await waitSelected(2);check(await selectedCircles()===2,'Shift 空白框选追加第二个辅助圆');
  await clear();await click([100,120]);
  await page.keyboard.down('Shift');try{for(const id of [firstId,secondId]){p=await rim(id);await page.mouse.click(p.x,p.y);}}finally{await page.keyboard.up('Shift');}
  await waitSelected(2);check(await selectedLines()===2,'Shift 支持线段与两个辅助圆混合选区');
  await canvas.focus();await page.keyboard.press('Delete');await waitCircles(0);await waitLines('A',0);
  check(await count('M')===1,'Delete 删除混选圆和辅助线，保留未选山折');await intact('Delete 混选不删除纸边、独立标记或文字');
  await undo(2);await waitLines('A',1);check(await circleCount()===2,'Ctrl+Z 撤销混合圆与辅助线删除');
  await redo(0);await waitLines('A',0);check(await circleCount()===0,'Ctrl+Shift+Z 重做混合删除');await undo(2);await waitLines('A',1);
  await clear();p=await rim(firstId);await page.mouse.click(p.x,p.y);await waitSelected(1);
  await page.locator('.tool-rail').getByRole('button',{name:'删除所选',exact:true}).click();await waitCircles(1);
  check(await object(secondId).count()===1,'工具栏删除所选支持单个辅助圆，保留另一圆');await undo(2);
  await clear();await rightPoint(await point([40,60]));
  check(await circleCount()===2,'右键点击圆心不会将圆当作命中圆周删除');
  await rightPoint(await rim(firstId));await waitCircles(1);check(await circleCount()===1,'真实右键 down/up 在圆周点删辅助圆');await undo(2);await redo(1);await undo(2);
  await drag([45,65],[35,55],'right');check(await circleCount()===2,'向左框位于圆内部且不触及圆周时不删除圆');
  await drag([16,56],[24,64],'right');check(await circleCount()===2,'向右框仅接触圆周、未完整包含圆时不删除');
  await drag([15,35],[65,85],'right');await waitCircles(1);check(await circleCount()===1,'右拖向右完整包含圆时删除圆');await undo(2);
  await drag([24,64],[16,56],'right');await waitCircles(1);check(await circleCount()===1,'右拖向左的小框接触圆周时删除整圆');await undo(2);await redo(1);await undo(2);
  await rightPoint(await point([150,180]));await rightPoint(await point([140,190]));await intact('选择工具下右击独立标记与文字不误删这些对象');
  await page.screenshot({path:'output/playwright/auxiliary-circle-ordinary.png'});

  await upload(source('纸外圆与近邻',[circle('inside-circle',[40,60],20),circle('second-circle',[120,60],15),circle('outside-circle',[-35,60],20)],true));
  await layers(true,true);await execute('v','select');await waitCircles(3);
  p=await rim('inside-circle');await page.mouse.click(p.x,p.y);await waitSelected(1);
  check(await selectedLines()===0,'圆周与山折距离仅 0.5mm，V 选择仍优先真实最近圆周');
  await rightPoint(p);await waitCircles(2);check(await count('M')===1,'圆周右删优先最近圆，保留近邻山折');await undo(3);
  await rightPoint(await point([60.5,60]));await waitLines('M',0);check(await circleCount()===3,'在线段上右删优先最近线段，保留近邻圆');
  await canvas.focus();await page.keyboard.press('Control+z');await waitLines('M',1);
  await layers(true,false);await waitCircles(0);await execute('v','select');await click([60,60]);
  check(await selectedCircles()===0&&await selectedLines()===2,'辅助图层隐藏后不选隐藏圆，改选可见近邻山折');
  await rightPoint(await point([60,60]));await waitLines('M',0);await layers(true,true);
  check(await circleCount()===3,'辅助图层隐藏后点删不删隐藏圆');await canvas.focus();await page.keyboard.press('Control+z');await waitLines('M',1);
  await layers(true,false);await drag([24,64],[16,56],'right');await layers(true,true);
  check(await circleCount()===3&&await count('M')===1,'辅助图层隐藏后右框触及隐藏圆周也不删除圆');
  await layers(false,true);await execute('v','select');await click([60.5,60]);await waitSelected(1);
  check(await selectedLines()===0,'主图层隐藏后不选隐藏主线，只选可见近邻圆');
  await rightPoint(await point([60.5,60]));await waitCircles(2);await layers(true,true);
  check(await count('M')===1,'主图层隐藏后右删圆不会删除隐藏主线');await undo(3);
  await clear();p=await rim('outside-circle');const box=await canvas.boundingBox(),outsideBox=await object('outside-circle').locator('circle').boundingBox();
  check(outsideBox.x>=box.x&&outsideBox.y>=box.y&&outsideBox.x+outsideBox.width<=box.x+box.width&&outsideBox.y+outsideBox.height<=box.y+box.height,
   '纸外圆 [-35,60] 的整个圆周完整适配到可操作画布');
  await page.mouse.click(p.x,p.y);await waitSelected(1);
  check(await canvas.locator('[data-selected-circle="outside-circle"]').count()===1,'截图同类纸张外辅助圆仍可用 V 在圆周选择');
  await rightPoint(p);await waitCircles(2);check(await object('outside-circle').count()===0,'纸张外辅助圆仍可真实右键圆周删除');await undo(3);
  await intact('纸内外圆点删与框删始终保留原始纸边、标记和文字');
  await page.screenshot({path:'output/playwright/auxiliary-circle-outside-paper.png'});

  await execute('circleedit','circleedit');p=await rim('inside-circle');await page.mouse.click(p.x,p.y);
  await page.waitForFunction(()=>document.querySelector('[aria-label="选择辅助圆"]')?.value==='inside-circle');
  check(await page.getByLabel('圆半径',{exact:true}).inputValue()==='20','旧圆编辑工具保留圆周点选和真实半径参数');
  await page.getByLabel('选择辅助圆',{exact:true}).selectOption('outside-circle');
  check(await canvas.locator('[data-selected-circle="outside-circle"]').count()===1,'圆编辑参数选择纸外圆与共享圆选区同步高亮');
  await button('删除此圆').click();await waitCircles(2);check(await object('outside-circle').count()===0,'旧圆编辑参数删除此圆保持可用');await undo(3);
  await intact('圆编辑参数删除不影响原材料边界与注释对象');
  await page.screenshot({path:'output/playwright/auxiliary-circle-circleedit.png'});
  check(errors.length===0,`辅助圆编辑全过程无页面异常 (${errors.join('; ')})`);
  return{passed:checks.length,checks,errors};
 }catch(error){
  const latest=await canvas.evaluate(element=>({tool:element.className.baseVal,circles:element.querySelectorAll('[data-object-kind="circle"]').length,
   selected:[...element.querySelectorAll('[data-selected-circle]')].map(circle=>circle.getAttribute('data-selected-circle')),view:element.getAttribute('viewBox')})).catch(()=>null);
  throw Error(`${error.message}; 已通过 ${checks.length} 项; 状态=${JSON.stringify(latest)}`);
 }finally{page.off('pageerror',pageError);await page.evaluate(()=>{if(window.__auxiliaryCircleOriginalConfirm){window.confirm=window.__auxiliaryCircleOriginalConfirm;delete window.__auxiliaryCircleOriginalConfirm;}}).catch(()=>{});}
}
