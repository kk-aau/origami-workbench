async page=>{
 const out='output/playwright/flasher-factors-1010',checks=[],errors=[],downloads=[],responses=[];
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},button=name=>page.getByRole('button',{name,exact:true});
 page.on('pageerror',e=>errors.push(e.message));await page.evaluate(()=>window.confirm=()=>true);await page.setViewportSize({width:1360,height:900});
 const save=async(action,name)=>{const waiting=page.waitForEvent('download');await action();const d=await waiting;await d.saveAs(`${out}/${name}`);downloads.push({path:`${out}/${name}`,suggested:d.suggestedFilename()});};
 const capture=async(value,name)=>{const waiting=page.waitForEvent('download');await page.evaluate(({value,name})=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)]));a.download=name;a.click();},{value,name});await(await waiting).saveAs(`${out}/${name}`);};
 const exported=async(name,format)=>{await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.getByRole('combobox').first().selectOption(format);await save(()=>d.getByRole('button',{name:'导出文件',exact:true}).click(),name);await button('关闭窗口').click();};
 const ready=()=>button('采用展开图副本 →').waitFor({state:'visible'}).then(()=>page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用展开图副本 →'&&!b.disabled)));
 const field=(label)=>page.getByRole('spinbutton',{name:label,exact:true});
 const change=async(label,value,query)=>{const pending=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.ok()&&Object.entries(query).every(([key,v])=>r.request().postDataJSON()?.[key]===v));await field(label).fill(String(value));const r=await(await pending).json();await ready();return r;};
 await button('镶嵌设计').click();await page.getByRole('button',{name:/^\d+ 空间构造$/}).click();
 let pending=page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.ok()&&r.request().postDataJSON()?.family==='flasher');await page.getByLabel('空间构造类型',{exact:true}).selectOption('flasher');await pending;await ready();
 check(await field('环数 r').getAttribute('max')==='4'&&await field('高度阶 h').getAttribute('max')==='4'&&await field('旋转阶 m').getAttribute('max')==='16','默认动态控件上限与实际 face/rh 预算一致');
 const targets=[{name:'r1-h4-m4',r:1,h:4,m:4,counts:[40,104,65]},{name:'r5-h1-m4',r:5,h:1,m:4,counts:[144,384,241]},{name:'r1-h1-m9',r:1,h:1,m:9,counts:[36,72,37]}];
 for(const t of targets){
  if(t.name==='r1-h4-m4'){await change('环数 r',1,{family:'flasher',rings:1,heightOrder:2});pending=change('高度阶 h',4,{family:'flasher',rings:1,heightOrder:4,rotationalOrder:4});}
  else if(t.name==='r5-h1-m4'){await change('高度阶 h',1,{family:'flasher',rings:1,heightOrder:1});pending=change('环数 r',5,{family:'flasher',rings:5,heightOrder:1,rotationalOrder:4});}
  else {await change('环数 r',1,{family:'flasher',rings:1,heightOrder:1});pending=change('旋转阶 m',9,{family:'flasher',rings:1,heightOrder:1,rotationalOrder:9});}
  const response=await pending;responses.push({name:t.name,response});check(JSON.stringify([response.stats.vertices,response.stats.edges,response.stats.faces])===JSON.stringify(t.counts),`${t.name} 主界面实际生成原拓扑计数`);
  check(response.stats.checks.geometry.status==='passed'&&response.source.staticGlobalIsometryChecked,`${t.name} 几何及静态等距门禁通过`);
  check(response.stats.checks.layerOrder.status==='not_checked'&&!response.source.continuousRigidPathChecked&&!response.source.selfCollisionChecked,`${t.name} 保留未验证路径与层序状态`);
  await page.screenshot({path:`${out}/${t.name}-preview.png`,fullPage:true});await button('采用展开图副本 →').click();check(await button('折痕编辑').getAttribute('aria-pressed')==='true',`${t.name} 真实采用进入折痕编辑`);
  await page.getByRole('textbox',{name:'工程名称',exact:true}).fill(`Flasher ${t.name}`);
  for(const f of ['json','fold','dxf'])await exported(`${t.name}.${f==='json'?'zhezhi.json':f}`,f);
  for(const f of ['json','fold']){await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`${out}/${t.name}.${f==='json'?'zhezhi.json':f}`);await page.waitForTimeout(150);await exported(`${t.name}-${f}-reopen.zhezhi.json`,'json');check(true,`${t.name} ${f} 实际下载文件重开再导出`);}
  await button('优化加工导出').click();const optimization=page.getByRole('dialog',{name:'优化加工导出',exact:true});await optimization.getByRole('button',{name:'生成预览',exact:true}).click();await optimization.getByRole('button',{name:'导出加工文件',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='导出加工文件'&&!b.disabled));
  check((await optimization.innerText()).includes('文件几何回读通过'),`${t.name} 优化加工真实预览回读通过`);
  await save(()=>optimization.getByRole('button',{name:'导出加工文件',exact:true}).click(),`${t.name}-optimized.dxf`);await save(()=>optimization.getByRole('button',{name:'核验报告',exact:true}).click(),`${t.name}-optimized-report.json`);await optimization.getByRole('button',{name:'关闭优化加工导出',exact:true}).click();await exported(`${t.name}-after-optimization.zhezhi.json`,'json');
  await button('镶嵌设计').click();await ready();
 }
 // An out-of-domain draft is visibly rejected and never replaces the legal m9.
 await field('旋转阶 m').fill('17');await field('旋转阶 m').press('Enter');check(await field('旋转阶 m').getAttribute('aria-invalid')==='true','超有限域 m17 的编辑草稿显示无效');await field('旋转阶 m').press('Escape');check(await field('旋转阶 m').inputValue()==='9','无效参数不覆盖合法当前输入');
 const refused=await page.evaluate(async()=>{const health=await(await fetch('/api/health')).json(),results=[];for(const q of [{family:'flasher',rings:5,heightOrder:2},{family:'flasher',rings:9,heightOrder:1,rotationalOrder:4},{family:'flasher',rotationalOrder:17}]){const r=await fetch('/api/tessellate',{method:'POST',headers:{'Content-Type':'application/json','x-zhezhi-token':health.token},body:JSON.stringify(q)});results.push({query:q,status:r.status,body:await r.json()});}return results;});
 check(refused.every(r=>r.status===422&&typeof r.body.error==='string'), '公开 API 仍拒绝径向积、实际面数与m有限域超限');
 const layout=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));check(layout.scroll<=layout.client,'1360宽主界面无横向溢出');check(!errors.length,'三个新例真实构造采用导出与重开无页面异常');
 await capture({responses,refused},'browser-public-responses.json');const record={verified:true,passed:checks.length,checks,errors,downloads,layout,bundle:await page.locator('script[type="module"]').getAttribute('src')};await capture(record,'browser-checks.json');return record;
}
