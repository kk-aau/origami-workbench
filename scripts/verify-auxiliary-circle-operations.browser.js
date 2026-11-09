async page=>{
 const checks=[],errors=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const canvas=page.locator('#workspace .crease-canvas'),command=page.getByLabel('工具命令',{exact:true});
 const button=name=>page.getByRole('button',{name,exact:true});
 const object=id=>canvas.locator(`[data-drawing-object="${id}"]`);
 const circles=()=>canvas.locator('[data-drawing-object][data-object-kind="circle"]').count();
 const selectedCircles=()=>canvas.locator('[data-selected-circle]').count();
 const selectedLines=()=>canvas.locator('[data-segment] > circle').count();
 const count=assignment=>canvas.locator(`[data-assignment="${assignment}"]`).count();
 const point=coordinate=>canvas.evaluate((element,p)=>{const b=element.getBoundingClientRect(),v=element.viewBox.baseVal;return{x:b.left+(p[0]-v.x)/v.width*b.width,y:b.top+(p[1]-v.y)/v.height*b.height};},coordinate);
 const rim=id=>object(id).locator('circle').evaluate(element=>{const b=element.getBoundingClientRect();return{x:b.right,y:b.top+b.height/2};});
 const geometry=()=>object('operations-circle-1').locator('circle').evaluate(element=>['cx','cy','r'].map(name=>Number(element.getAttribute(name))));
 const waitGeometry=expected=>page.waitForFunction(expected=>{
  const circle=document.querySelector('#workspace [data-drawing-object="operations-circle-1"] > circle');
  return !!circle&&['cx','cy','r'].every((name,i)=>Math.abs(Number(circle.getAttribute(name))-expected[i])<.2);
 },expected);
 const waitCircles=n=>page.waitForFunction(n=>document.querySelector('#workspace .crease-canvas')?.querySelectorAll('[data-drawing-object][data-object-kind="circle"]').length===n,n);
 const execute=async(text,tool)=>{await command.fill('');await command.focus();await page.keyboard.type(text);await command.press('Enter');await page.waitForFunction(tool=>document.querySelector('#workspace .crease-canvas')?.classList.contains(`tool-${tool}`),tool);};
 const right=async p=>{await page.mouse.move(p.x,p.y);await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});};
 const undo=async n=>{await canvas.focus();await page.keyboard.press('Control+z');await waitCircles(n);};
 const segment=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
 const source={format:'zhezhi-workbench',version:2,schemaVersion:2,name:`辅助圆操作回归-${Date.now()}`,paper:{width:200,height:200},segments:[
  segment('operations-top',[0,0],[200,0]),segment('operations-right',[200,0],[200,200]),segment('operations-bottom',[200,200],[0,200]),segment('operations-left',[0,200],[0,0]),
  segment('operations-mountain',[20,150],[180,150],'M',-180),segment('operations-guide',[20,130],[180,130],'A')],objects:[
   {id:'operations-circle-1',kind:'circle',center:[40,60],radius:20,color:'#367d86'},
   {id:'operations-circle-2',kind:'circle',center:[120,60],radius:15,color:'#367d86'},
   {id:'operations-mark',kind:'mark',a:[130,180],b:[170,180],color:'#8052ad'},
   {id:'operations-text',kind:'text',position:[130,190],text:'保留注释',fontSize:5,color:'#263b31'}]};
 const pageError=error=>errors.push(error.message);page.on('pageerror',pageError);
 await page.evaluate(()=>{window.__circleOperationsOriginalConfirm=window.confirm;window.confirm=()=>true;});
 try{
  // The caller supplies an isolated page; this script never navigates or saves.
  await page.getByLabel('工程名称',{exact:true}).waitFor();await page.waitForTimeout(150);
  for(const name of ['设置并开始使用','关闭窗口','保留当前工程']){const b=button(name);if(await b.count()&&await b.isVisible())await b.click();}
  if(await button('收起平折').count())await button('收起平折').click();
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,text)=>{const d=new DataTransfer();d.items.add(new File([text],'auxiliary-circle-operations.zhezhi.json',{type:'application/json'}));input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));},JSON.stringify(source));
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,source.name);
  const layers=page.locator('#workspace details.canvas-layers');if(!(await layers.evaluate(element=>element.open)))await layers.locator('summary').click();
  await layers.getByRole('checkbox',{name:'主折痕',exact:true}).check();await layers.getByRole('checkbox',{name:'辅助线',exact:true}).check();await layers.locator('summary').click();
  const snap=page.getByLabel('吸附',{exact:true});if(await snap.isChecked())await snap.uncheck();
  const protect=page.getByLabel('保护边界',{exact:true});if(!(await protect.isChecked()))await protect.check();
  await execute('v','select');let start=await point([60,60]),end=await point([70,65]);
  await page.mouse.click(start.x,start.y);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();await waitGeometry([50,65,20]);
  check((await geometry()).every((n,i)=>Math.abs(n-[50,65,20][i])<.2),'V 圆周选中后真实拖动偏移 [10,5]，圆心变化且半径保持 20');
  await canvas.focus();await page.keyboard.press('Control+z');await waitGeometry([40,60,20]);check((await geometry())[0]<40.2,'Ctrl+Z 撤销圆拖动恢复原圆心与半径');
  await page.keyboard.press('Control+Shift+z');await waitGeometry([50,65,20]);check((await geometry())[1]>64.8,'重做恢复真实辅助圆拖动位置');
  start=await rim('operations-circle-1');await page.mouse.click(start.x,start.y);
  await button('圆属性 (1)').click();await page.waitForFunction(()=>document.querySelector('[aria-label="选择辅助圆"]')?.value==='operations-circle-1');
  const values=await Promise.all(['圆心 X','圆心 Y','圆半径'].map(async name=>Number(await page.getByLabel(name,{exact:true}).inputValue())));
  check(values.every((n,i)=>Math.abs(n-[50,65,20][i])<.2),'右侧圆属性 (1) 承接选圆，circleedit 圆心与半径反馈对应移动后几何');
  await execute('v','select');await canvas.focus();await page.keyboard.press('Control+a');
  check(await selectedCircles()===2&&await selectedLines()===4&&await canvas.locator('[data-assignment="B"] > circle').count()===0,'Ctrl+A 选择全部辅助圆与非边界线，保留边界保护');
  await page.keyboard.press('Control+Shift+a');check(await selectedCircles()===0&&await selectedLines()===0,'Ctrl+Shift+A 清空圆与线段选区');
  await page.keyboard.press('Control+a');await page.keyboard.press('Escape');check(await selectedCircles()===0&&await selectedLines()===0,'空闲 Esc 清空圆与线段选区');
  await execute('c','circle');start=await point([170,40]);await page.mouse.click(start.x,start.y);
  await right(await rim('operations-circle-1'));check(await circles()===2,'未完成圆构造的首次右键只取消构造，不删除已有辅助圆');
  await right(await rim('operations-circle-1'));await waitCircles(1);check(await object('operations-circle-1').count()===0,'构造取消后的第二次右键恢复圆周删除');await undo(2);
  await execute('e','erase');start=await rim('operations-circle-1');await page.mouse.click(start.x,start.y);await waitCircles(1);
  check(await count('M')===1&&await object('operations-circle-1').count()===0,'擦除线段 E 工具支持左键圆周删除辅助圆');await undo(2);
  await execute('eraseaux','eraseaux');start=await rim('operations-circle-1');await page.mouse.click(start.x,start.y);await waitCircles(1);
  check(await count('M')===1&&await object('operations-circle-1').count()===0,'仅擦除辅助线 eraseaux 支持左键圆周删除辅助圆');await undo(2);
  start=await point([100,150]);await page.mouse.click(start.x,start.y);
  check(await count('M')===1&&await circles()===2,'eraseaux 左键点击山折不删除主折痕或其他辅助圆');
  check(await count('B')===4&&await object('operations-mark').count()===1&&await object('operations-text').count()===1,'扩展圆操作不误删纸边、独立标记或文字');
  await page.screenshot({path:'output/playwright/auxiliary-circle-operations.png'});
  check(errors.length===0,`辅助圆扩展操作没有页面异常 (${errors.join('; ')})`);
  return{passed:checks.length,checks,values,errors};
 }catch(error){const latest=await canvas.evaluate(element=>({tool:element.className.baseVal,circles:element.querySelectorAll('[data-object-kind="circle"]').length,selected:element.querySelectorAll('[data-selected-circle]').length})).catch(()=>null);throw Error(`${error.message}; 已通过 ${checks.length} 项; 状态=${JSON.stringify(latest)}`);}
 finally{page.off('pageerror',pageError);await page.evaluate(()=>{if(window.__circleOperationsOriginalConfirm){window.confirm=window.__circleOperationsOriginalConfirm;delete window.__circleOperationsOriginalConfirm;}}).catch(()=>{});}
}
