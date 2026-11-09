async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 await page.evaluate(()=>{window.confirm=()=>true;});await page.setViewportSize({width:1440,height:1000});
 const button=name=>['撤销','重做'].includes(name)?page.getByRole('complementary',{name:'绘图工具',exact:true}).getByRole('button',{name,exact:true}):page.getByRole('button',{name,exact:true});
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const xy=p=>page.locator('svg.crease-canvas').evaluate((el,p)=>{const q=new DOMPoint(...p).matrixTransform(el.getScreenCTM());return[q.x,q.y];},p);
 const click=async p=>{await page.mouse.click(...await xy(p));await settle();};
 const tool=async id=>{await page.locator('button[data-tool='+id+']').click();await settle();};
 const closeProps=async()=>{if(await button('关闭工具设置').count())await button('关闭工具设置').click();};
 const load=async()=>{await page.keyboard.press('Escape');await closeProps();await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles('output/playwright/material-tools-source-1008.zhezhi.json');await page.waitForFunction(()=>document.querySelector('[aria-label="工程名称"]')?.value==='材料构造工具验收');await button('绘图工具').click();await page.getByRole('checkbox',{name:/保护边界/}).check();await page.getByRole('button',{name:/^(纸张属性|选区 \(\d+\))$/}).click();const props=page.locator('dialog.tool-settings-dialog');await props.getByLabel('选择材料部件',{exact:true}).selectOption('all');await closeProps();await page.getByRole('checkbox',{name:/保护边界/}).check();await page.getByRole('checkbox',{name:'操作后保持选择',exact:true}).check();await button('适合画布').click();await settle();};
 const solved=async()=>{await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.flat-result-label')?.textContent?.includes('已找到层序解'));};
 const download=async(name,format='json')=>{await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.getByRole('combobox').first().selectOption(format);const saving=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();await(await saving).saveAs(`output/playwright/material-tools-${name}-1008.${format==='json'?'zhezhi.json':format}`);await button('关闭窗口').click();};
 for(const id of ['copyselection','copyfour','mirrorselection','inplace']){
  await load();await solved();await button('收起平折').click();await tool(id==='inplace'?'copyselection':id);
  const points=id==='copyfour'?[[0,0],[200,0],[600,0],[600,200]]:id==='mirrorselection'?[[600,0],[600,200]]:id==='inplace'?[[0,0],[0,0]]:[[0,0],[600,0]];
  for(const p of points.slice(0,-1))await click(p);await page.mouse.move(...await xy(points.at(-1)));await settle();
  check(await page.locator(id==='mirrorselection'?'[data-mirror-preview=hover]':'[data-transform-preview]').count()===16,id+'完整材料16边可预览');
  await download(id+'-preview');await click(points.at(-1));
  if(id==='mirrorselection'){check(await page.locator('[data-mirror-preview=ready]').count()===16,'镜像二点确认后保完整16边');check(await button('确认镜像').count()===1,'镜像需显式确认');await download('mirror-ready');await button('确认镜像').click();}
  await button('显示平折').click();check(true,id+'提交后打开旧模型');
  check((await page.locator('.flat-result-label').innerText()).includes('结果已过期'),id+'旧层序失效');
  await download(id+'-applied');await button('撤销').click();await download(id+'-undo');await button('重做').click();await download(id+'-redo');check(true,id+'一次撤销重做');
  await solved();check(true,id+'重新计算层序已解');
  for(const side of ['背面','正面']){await button(side).click();check(await button(side).getAttribute('aria-pressed')==='true',id+side+'可显示');}
  await download(id+'-final');await download(id+'-final','fold');await download(id+'-final','dxf');
  await page.screenshot({path:`output/playwright/material-tools-${id}-1008.png`});
  for(const ext of ['zhezhi.json','fold']){await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-tools-${id}-final-1008.${ext}`);await solved();check(true,id+'实际'+ext+'重开可解');}
 }
 await load();await tool('copyselection');await click([0,0]);await page.keyboard.press('Escape');check(await page.locator('[data-transform-preview]').count()===0,'Esc取消构造预览');await download('cancel');
 check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors};
}
