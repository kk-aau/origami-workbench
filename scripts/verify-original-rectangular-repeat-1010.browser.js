async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 // All actions stay in the isolated test data root; confirm the authorized copies/exports.
 await page.evaluate(()=>{window.confirm=()=>true;});
 if(await page.getByRole('button',{name:'保留当前工程',exact:true}).count())await page.getByRole('button',{name:'保留当前工程',exact:true}).click();
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');
 const responseFor=(panels,sectors)=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.request().postDataJSON()?.family==='rectangular-pot'&&r.request().postDataJSON()?.panels===panels&&(sectors===undefined||r.request().postDataJSON()?.sectors===sectors));
 const capture=async(name,value)=>{
  const pending=page.waitForEvent('download');
  await page.evaluate(({name,value})=>{const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);},{name,value});
  await(await pending).saveAs('D:/codex/折纸工具/workbench/output/original-rectangular-repeat-browser-1010/'+name);
 };
 await page.setViewportSize({width:1280,height:720});await ready();
 if(await page.getByLabel('旋转扇区 m',{exact:true}).inputValue()!=='5'||await page.getByLabel('实际面板数',{exact:true}).inputValue()!=='5'){
  const initial=responseFor(5,5);await page.getByRole('button',{name:'恢复默认',exact:true}).click();await initial;await ready();
 }
 for(const [panels,button,counts] of [[6,'再绕一瓣',[125,244,120]],[10,'两圈面板',[205,404,200]]]){
  await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
  const pending=responseFor(panels);await page.getByRole('button',{name:button,exact:true}).click();
  const response=await(await pending).json();await ready();
  check(response.stats.parameters.panels===panels,'actual original panels '+panels);
  check(JSON.stringify([response.stats.vertices,response.stats.edges,response.stats.faces])===JSON.stringify(counts),'all CP counts '+panels);
  check(await page.locator('.rectangular-pot-repetition').isVisible(),'visible repetition note '+panels);
  check((await page.locator('.rectangular-pot-repetition').textContent()).includes('三维面片重合'),'literal spatial overlap described '+panels);
  check(await page.getByRole('button',{name:'采用展开图副本 →',exact:true}).isEnabled(),'adoption enabled '+panels);
  check(response.source.selfCollisionChecked===false&&response.source.continuousRigidPathChecked===false&&response.stats.checks.layerOrder.status==='not_checked','certificates not promoted '+panels);
  check(await page.getByRole('img',{name:'由真实三维顶点投影的镶嵌静态构形'}).count()===1,'true spatial view '+panels);
  const layout=await page.evaluate(()=>{const note=document.querySelector('.rectangular-pot-repetition'),r=note.getBoundingClientRect(),buttons=[...document.querySelectorAll('.tess-controls button')].filter(b=>['再绕一瓣','两圈面板'].includes(b.textContent.trim())).map(b=>b.getBoundingClientRect());return {noteVisible:r.width>0&&r.height>0,buttonsOverlap:buttons[0].right>buttons[1].left,documentOverflow:document.documentElement.scrollWidth>innerWidth};});
  check(layout.noteVisible&&!layout.buttonsOverlap&&!layout.documentOverflow,'desktop layout '+panels);
  await page.screenshot({path:`D:/codex/折纸工具/workbench/output/original-rectangular-repeat-browser-1010/panels-${panels}-desktop.png`});
  await page.setViewportSize({width:390,height:844});check(await page.locator('.rectangular-pot-repetition').isVisible(),'narrow note retained in sidebar '+panels);
  await page.screenshot({path:`D:/codex/折纸工具/workbench/output/original-rectangular-repeat-browser-1010/panels-${panels}-narrow.png`});
  await page.setViewportSize({width:1280,height:720});
  await capture(`panels-${panels}-response.json`,response);
  await page.getByRole('button',{name:'采用展开图副本 →',exact:true}).click();
  await page.getByLabel('工程名称',{exact:true}).fill('矩形重复-'+panels);
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/projects')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'保存工程',exact:true}).click();
  const savedResponse=await(await saved).json();check(typeof savedResponse.id==='string','actual project save '+panels);
  await page.getByRole('button',{name:'导出作品',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'导出作品',exact:true});
  for(const format of ['json','fold','dxf']){
   await dialog.getByRole('combobox',{name:'输出格式',exact:true}).selectOption(format);
   const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出文件',exact:true}).click();
   await(await download).saveAs(`D:/codex/折纸工具/workbench/output/original-rectangular-repeat-browser-1010/panels-${panels}.${format==='json'?'zhezhi.json':format}`);
   check(true,'actual '+format+' download '+panels);
  }
  await dialog.getByRole('button',{name:'关闭窗口',exact:true}).click();
  await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
  const reset=responseFor(5);await page.getByRole('button',{name:'恢复默认',exact:true}).click();await reset;await ready();
  check(await page.getByLabel('实际面板数',{exact:true}).inputValue()==='5','reset before saved read '+panels);
  await page.getByLabel('工程名称',{exact:true}).fill('待重开临时名称');
  await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`D:/codex/折纸工具/workbench/output/original-rectangular-repeat-browser-1010/panels-${panels}.zhezhi.json`);
  await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]')?.value===name,'矩形重复-'+panels);
  await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();
  const restored=responseFor(panels);await page.getByRole('button',{name:'读取工程参数',exact:true}).click();
  const replay=await(await restored).json();await ready();
  check(replay.stats.parameters.panels===panels&&replay.source.circumferentialRepetition.panels===panels,'actual project input read/regeneration '+panels);
  check(JSON.stringify(replay.fold)===JSON.stringify(response.fold),'reopened complete CP exact '+panels);
 }
 const invalid=page.getByLabel('实际面板数',{exact:true});await invalid.fill('31');await invalid.blur();
 check(await invalid.getAttribute('aria-invalid')==='true','over budget rejected by public input');
 await invalid.fill('6.5');await invalid.blur();check(await invalid.getAttribute('aria-invalid')==='true','fractional panel rejected by public input');
 await invalid.press('Escape');check(await invalid.inputValue()==='10','bad draft restored');
 const sector=page.getByLabel('旋转扇区 m',{exact:true}),keepRepeat=responseFor(10,4);
 await sector.fill('4');await sector.blur();const repeatUpdate=await(await keepRepeat).json();await ready();
 check(repeatUpdate.stats.parameters.panels===10&&await invalid.inputValue()==='10','explicit repeated panels survive sector change');
 const reset=responseFor(5,5);await page.getByRole('button',{name:'恢复默认',exact:true}).click();await reset;await ready();
 const keepFull=responseFor(6,6);await sector.fill('6');await sector.blur();const fullUpdate=await(await keepFull).json();await ready();
 check(fullUpdate.stats.parameters.panels===6&&await invalid.inputValue()==='6','old full pot panel count follows sectors');
 check(!Object.hasOwn(fullUpdate.source,'circumferentialRepetition'),'old nonrepeat source carries no repetition flag');
 check(errors.length===0,'no page error');
 const evidence={passed:checks.length,checks,errors,downloadedFiles:8};await capture('browser-evidence.json',evidence);return evidence;
}
