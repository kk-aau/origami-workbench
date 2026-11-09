async page=>{
 const checks=[],errors=[];
 const check=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const canvas=page.locator('#workspace .crease-canvas'),command=page.getByLabel('工具命令',{exact:true});
 const circles=()=>canvas.locator('[data-drawing-object][data-object-kind="circle"]');
 const selectedCircles=()=>canvas.locator('[data-selected-circle]');
 const selectedLines=()=>canvas.locator('[data-segment] > circle');
 const point=coordinate=>canvas.evaluate((element,p)=>{
  const box=element.getBoundingClientRect(),view=element.viewBox.baseVal;
  return{x:box.left+(p[0]-view.x)/view.width*box.width,y:box.top+(p[1]-view.y)/view.height*box.height};
 },coordinate);
 const click=async coordinate=>{const p=await point(coordinate);await page.mouse.click(p.x,p.y);};
 const execute=async(text,tool)=>{
  await command.fill(text);await command.press('Enter');
  await page.waitForFunction(tool=>document.querySelector('#workspace .crease-canvas')?.classList.contains(`tool-${tool}`),tool);
 };
 const waitCircles=n=>page.waitForFunction(n=>document.querySelector('#workspace .crease-canvas')?.querySelectorAll('[data-drawing-object][data-object-kind="circle"]').length===n,n);
 const waitSelection=(lines,circleCount)=>page.waitForFunction(({lines,circleCount})=>{
  const element=document.querySelector('#workspace .crease-canvas');
  return element?.querySelectorAll('[data-segment] > circle').length===lines&&element?.querySelectorAll('[data-selected-circle]').length===circleCount;
 },{lines,circleCount});
 const exportDoc=async()=>{
  await button('导出作品').click();const dialog=page.getByRole('dialog',{name:'导出作品',exact:true});
  await dialog.getByRole('combobox').first().selectOption('json');
  const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出文件',exact:true}).click();
  const download=await pending,bytes=[];for await(const chunk of await download.createReadStream())bytes.push(...chunk);
  const result=await page.evaluate(data=>JSON.parse(new TextDecoder().decode(new Uint8Array(data))),bytes);
  await button('关闭窗口').click();return result.doc??result;
 };
 const layers=async()=>{
  const details=page.locator('#workspace details.canvas-layers');if(!(await details.evaluate(element=>element.open)))await details.locator('summary').click();
  for(const name of ['主折痕','辅助线']){const checkbox=details.getByRole('checkbox',{name,exact:true});if(!(await checkbox.isChecked()))await checkbox.check();}
  await details.locator('summary').click();
 };
 const onError=error=>errors.push(error.message);page.on('pageerror',onError);
 // Caller supplies an isolated local page/data directory. The script does
 // not save projects, navigate or write directly to server/user data.
 await page.evaluate(()=>{window.__auxiliaryCircleMaterialConfirm=window.confirm;window.confirm=()=>true;});
 try{
  await page.setViewportSize({width:1200,height:800});
  for(const name of ['设置并开始使用','关闭窗口','保留当前工程']){const b=button(name);if(await b.count()&&await b.isVisible())await b.click();}
  const file=page.getByLabel('折痕工程文件',{exact:true});
  await file.setInputFiles('D:/codex/折纸工具/workbench/output/auxiliary-edit-fixtures/material-with-auxiliary.zhezhi.json');
  // The importer clears its file input once loaded. Read the actual loaded
  // baseline through the export UI instead of its already-cleared FileList.
  await page.waitForFunction(()=>document.querySelector('[aria-label="工程名称"]')?.value==='测试 · 材料辅助线编辑');
  await canvas.waitFor();await command.waitFor();
  if(await button('收起平折').count())await button('收起平折').click();
  await button('绘图工具').click();await layers();
  const protection=page.getByLabel('保护边界',{exact:true});if(!(await protection.isChecked()))await protection.check();
  const snap=page.getByLabel('吸附',{exact:true});if(await snap.isChecked())await snap.uncheck();
  const fixture=await exportDoc();
  const lineCount=fixture.segments.length,nonBoundary=fixture.segments.filter(segment=>segment.assignment!=='B').length;
  check(!!fixture.metadata?.materialTopology&&await canvas.locator('[data-segment]').count()===lineCount,
   '实际载入包含材料合同和guide辅助线的原生测试工程');

  await execute('C','circle');await click([100,130]);await click([110,130]);await waitCircles(1);
  const circleId=await circles().getAttribute('data-drawing-object');
  const geometry=await circles().locator('circle').evaluate(element=>['cx','cy','r'].map(name=>Number(element.getAttribute(name))));
  check(geometry.every((value,index)=>Math.abs(value-[100,130,10][index])<.2)&&await canvas.locator('[data-segment]').count()===lineCount,
   '真实C两点绘制圆心[100,130]半径10，材料线段数量不变');
  const before=await exportDoc();
  check(JSON.stringify(before.metadata)===JSON.stringify(fixture.metadata)&&JSON.stringify(before.segments)===JSON.stringify(fixture.segments),
   '实际下载流确认新增辅助圆不改材料合同、边身份或几何');

  await execute('V','select');await canvas.focus();await page.keyboard.press('Control+a');await waitSelection(nonBoundary*2,1);
  check(await selectedCircles().getAttribute('data-selected-circle')===circleId&&await selectedLines().count()===nonBoundary*2,
   'Ctrl+A混选非B材料谷边、guide及辅助圆，圆选区独立保存');
  await canvas.focus();await page.keyboard.press('Delete');
  await page.getByRole('alert').filter({hasText:'删除了材料边'}).waitFor();
  check(await circles().count()===1&&await canvas.locator('[data-segment]').count()===lineCount&&await selectedCircles().count()===1&&await selectedLines().count()===nonBoundary*2,
   '材料约束拒绝Delete，原线段、圆和两类选区全部保留');
  check(!((await page.locator('.toast').allTextContents()).join('').includes('已删除')),
   '原子提交被拒绝时没有成功删除提示');
  check(JSON.stringify(await exportDoc())===JSON.stringify(before),
   '拒绝后的实际导出工程与Delete前完全一致');

  await canvas.focus();await page.keyboard.press('Control+Shift+a');await waitSelection(0,0);
  await execute('V','select');await click([100,140]);await waitSelection(0,1);
  check(await selectedCircles().getAttribute('data-selected-circle')===circleId&&await selectedLines().count()===0,
   '清选后点击纯圆周[100,140]只选辅助圆，不选guide或材料边');
  await canvas.focus();await page.keyboard.press('Delete');await waitCircles(0);await waitSelection(0,0);
  check(await canvas.locator('[data-segment]').count()===lineCount,
   '单独Delete圆成功且原材料边与guide均保留');
  const deleted=await exportDoc();
  check(JSON.stringify(deleted.metadata)===JSON.stringify(before.metadata)&&JSON.stringify(deleted.segments)===JSON.stringify(before.segments)&&
   JSON.stringify(deleted.objects??[])===JSON.stringify((before.objects??[]).filter(object=>object.kind!=='circle'||object.id!==circleId)),
   '删除后的实际文件只移除所选圆，材料合同、线段和其他对象完整保留');
  await canvas.focus();await page.keyboard.press('Control+z');await waitCircles(1);
  check(JSON.stringify(await exportDoc())===JSON.stringify(before),'撤销恢复辅助圆及完整材料工程');
  await canvas.focus();await page.keyboard.press('Control+y');await waitCircles(0);
  check(JSON.stringify(await exportDoc())===JSON.stringify(deleted),'重做恢复仅删除辅助圆的结果');
  check(errors.length===0,'材料圆混选、拒绝、删除和文件导出全流程无页面异常');
  return{passed:checks.length,checks,errors,circleId,materialLineCount:lineCount,nonBoundarySelectionCount:nonBoundary};
 }catch(error){
  throw Error(`${error.message}; 已通过 ${checks.length} 项; 圆=${await circles().count()}; 选圆=${await selectedCircles().count()}; 选线端点=${await selectedLines().count()}`);
 }finally{
  page.off('pageerror',onError);
  await page.evaluate(()=>{if(window.__auxiliaryCircleMaterialConfirm){window.confirm=window.__auxiliaryCircleMaterialConfirm;delete window.__auxiliaryCircleMaterialConfirm;}}).catch(()=>{});
 }
}
