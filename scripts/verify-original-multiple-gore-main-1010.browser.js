async page=>{
 const out='output/playwright/original-constructible-final-1010/gore',checks=[],errors=[],downloads=[],responses=[];
 const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByRole('spinbutton',{name,exact:true}),check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 page.on('pageerror',e=>errors.push(e.message));await page.evaluate(()=>window.confirm=()=>true);await page.setViewportSize({width:1380,height:920});
 const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用展开图副本 →'&&!b.disabled));
 const wait=q=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.ok()&&Object.entries(q).every(([k,v])=>r.request().postDataJSON()?.[k]===v));
 const change=async(label,value,q)=>{const pending=wait(q);await field(label).fill(String(value));const r=await(await pending).json();await ready();return r;};
 const capture=async(value,name)=>{const pending=page.waitForEvent('download');await page.evaluate(({value,name})=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)]));a.download=name;a.click();},{value,name});await(await pending).saveAs(`${out}/${name}`);};
 const exported=async(name,format)=>{await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.getByRole('combobox').first().selectOption(format);const pending=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();const file=await pending;await file.saveAs(`${out}/${name}`);downloads.push({name,format,suggested:file.suggestedFilename()});await button('关闭窗口').click();};
 await button('镶嵌设计').click();await page.getByRole('button',{name:/^\d+ 空间构造$/}).click();let pending=wait({family:'gore-paper'});
 await page.getByLabel('空间构造类型',{exact:true}).selectOption('gore-paper');await pending;await ready();
 check(await page.getByLabel('Gore材料方式',{exact:true}).inputValue()==='single','原单瓣默认及入口保持');
 pending=wait({family:'gore-paper',petals:'multiple'});await page.getByLabel('Gore材料方式',{exact:true}).selectOption('multiple');await pending;await ready();
 await change('球面分段 n',8,{family:'gore-paper',petals:'multiple',divisions:8});let actual=await change('瓣数 m',8,{family:'gore-paper',petals:'multiple',sectors:8,divisions:8});
 for(const profile of ['sphere','points']){
  if(profile==='points'){pending=wait({family:'gore-paper',petals:'multiple',profile:'points'});await page.getByLabel('Gore剖面方式',{exact:true}).selectOption('points');actual=await(await pending).json();await ready();}
  const name=profile+'-eight',project='Gore1010-'+name;responses.push({name,response:actual});
  check(actual.stats.faces===64&&actual.stats.materials===8&&actual.source.independentMaterials.length===8,name+'真实构造8部件64面');
  check(actual.stats.checks.geometry.status==='passed'&&actual.source.staticGlobalIsometryChecked===true,name+'实际静态几何等距通过');
  check(!actual.source.gluingApplied&&!actual.source.coordinateWeldingApplied&&!actual.source.selfCollisionChecked&&!actual.source.continuousRigidPathChecked&&actual.stats.checks.layerOrder.status==='not_checked',name+'独立材料及未认证范围保持');
  check(await page.locator('.tess-rigid-pane').getAttribute('data-rigid-current')==='true',name+'主画布显示真实静态三维');
  await button('四个原Gore函数 · 完整图形数据').click();let d=page.getByRole('dialog',{name:'四个原Gore函数 · 完整数据',exact:true});
  check(await d.getByLabel('Gore原函数',{exact:true}).inputValue()===(profile==='sphere'?'SphereMultipleGoreData':'MultipleGoreData'),name+'实际帮助函数与当前多瓣来源一致');
  await d.getByRole('button',{name:'关闭镶嵌窗口',exact:true}).click();await ready();await page.screenshot({path:`${out}/${name}-preview.png`,fullPage:true});
  await button('采用展开图副本 →').click();check(await button('折痕编辑').getAttribute('aria-pressed')==='true',name+'真实采用进入材料编辑');await page.getByLabel('工程名称',{exact:true}).fill(project);
  for(const format of ['json','fold','dxf'])await exported(`${name}.${format==='json'?'zhezhi.json':format}`,format);
  for(const format of ['json','fold']){
   await page.getByLabel('工程名称',{exact:true}).fill('待验证-'+format);await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`${out}/${name}.${format==='json'?'zhezhi.json':format}`);
   await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]')?.value===name,project);await exported(`${name}-${format}-reopen.zhezhi.json`,'json');check(true,name+'/'+format+'实际重开并下载');
  }
  const saving=page.waitForResponse(r=>r.url().includes('/api/projects')&&r.request().method()==='POST');await button('保存工程').click();const saved=await saving;check(saved.ok(),name+'真实工程库保存');await capture(await saved.json(),name+'-saved.json');await page.locator('.save-dot.saved').waitFor();
  await page.reload();await page.evaluate(()=>window.confirm=()=>true);if(await button('保留当前工程').count())await button('保留当前工程').click();await button('工程库').click();await page.locator('.project-list button').filter({hasText:project}).first().click();
  await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]')?.value===name,project);await exported(name+'-library-reopen.zhezhi.json','json');check(true,name+'从工程库真实重开导出');
  if(profile==='points'){
   await button('纸张属性').click();const settings=page.locator('.tool-settings-dialog');check(await settings.getByLabel('选择材料部件',{exact:true}).locator('option').count()===10,'重开后的8个独立材料可分别选中');
   await settings.getByLabel('选择材料部件',{exact:true}).selectOption('2');await settings.getByRole('button',{name:'材料参数变换',exact:true}).click();d=page.getByRole('dialog',{name:'材料参数变换',exact:true});
   check(await d.getByLabel('变换部件 3',{exact:true}).isChecked(),'独立选择第三瓣');await d.getByRole('spinbutton',{name:'变换偏移 X',exact:true}).fill('13');await d.getByRole('spinbutton',{name:'变换偏移 Y',exact:true}).fill('-7');
   await d.getByRole('button',{name:'预览材料变换',exact:true}).click();await d.getByRole('status').waitFor();check((await d.getByRole('status').innerText()).includes('1个部件'),'预览只改变一个原瓣');check(await d.getByRole('button',{name:'FF预览',exact:true}).isDisabled(),'不伪造二维平折证明');
   await d.getByRole('button',{name:'应用材料变换',exact:true}).click();await settings.getByRole('button',{name:'关闭工具设置',exact:true}).click();await exported('points-eight-moved.zhezhi.json','json');await page.screenshot({path:`${out}/points-eight-moved.png`,fullPage:true});
  }
  await button('镶嵌设计').click();pending=wait({family:'gore-paper',petals:'multiple',profile});await button('读取工程参数').click();const regenerated=await(await pending).json();await ready();
  check(JSON.stringify(regenerated.source)===JSON.stringify(actual.source)&&JSON.stringify(regenerated.fold)===JSON.stringify(actual.fold),name+'实际工程库配方重新构造同一原多瓣源及CP');await capture(regenerated,name+'-regenerated-response.json');actual=regenerated;
 }
 const refused=await page.evaluate(async()=>{const h=await(await fetch('/api/health')).json(),rows=[];for(const q of [{family:'gore-paper',profile:'sphere',sectors:24,divisions:26,petals:'multiple'},{family:'gore-paper',profile:'points',sectors:6,crossSection:[[0,0],[0,1]],petals:'multiple'},{family:'gore-paper',profile:'sphere',sectors:6,divisions:8,petals:'multiple',glue:true}]){const r=await fetch('/api/tessellate',{method:'POST',headers:{'Content-Type':'application/json','X-Zhezhi-Token':h.token},body:JSON.stringify(q)});rows.push({query:q,status:r.status,body:await r.json()});}return rows;});
 check(refused.every(r=>r.status===422&&typeof r.body.error==='string'&&!r.body.fold),'真实API拒绝超预算、退化及虚构粘合');
 check(errors.length===0,'多瓣真实构造采用编辑保存重开无页面异常');await capture({responses,refused},'public-responses.json');const record={verified:true,checks,passed:checks.length,downloads,errors,bundle:await page.locator('script[type="module"]').getAttribute('src')};await capture(record,'browser-checks.json');return record;
}
