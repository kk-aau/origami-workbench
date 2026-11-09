async page=>{
 const out='output/playwright/original-min-budget-final-1010/min-total',checks=[],errors=[],downloads=[];
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 const button=name=>page.getByRole('button',{name,exact:true});
 page.on('pageerror',e=>errors.push(e.message));await page.evaluate(()=>window.confirm=()=>true);
 await page.setViewportSize({width:1380,height:920});
 const wait=query=>page.waitForResponse(r=>r.url().endsWith('/api/tessellate')&&r.status()===200&&query(r.request().postDataJSON()));
 const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled));
 const capture=async(value,name)=>{
  const waiting=page.waitForEvent('download');await page.evaluate(({value,name})=>{
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)]));a.download=name;a.click();
  },{value,name});await(await waiting).saveAs(`${out}/${name}`);
 };
 const exported=async(name,format)=>{
  await button('导出作品').click();const dialog=page.getByRole('dialog',{name:'导出作品',exact:true});
  await dialog.getByRole('combobox').first().selectOption(format);
  const waiting=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出文件',exact:true}).click();
  const download=await waiting;await download.saveAs(`${out}/${name}`);downloads.push({path:`${out}/${name}`,suggested:download.suggestedFilename()});
  await button('关闭窗口').click();
 };
 await button('镶嵌设计').click();await page.getByRole('button',{name:/原始—对偶$/}).click();
 let pending=wait(p=>p.reciprocalMethod==='original-min-total-pleat');
 await button('原最小总褶宽 · 有限数值示例').click();const base=await(await pending).json();await ready();
 check(JSON.stringify([base.stats.vertices,base.stats.edges,base.stats.faces])==='[12,20,9]','真实四面例生成12点20边9面CP');
 check(base.source.reciprocalMinTotalPleat.totalNormalizedPleat===4&&base.source.reciprocalMinTotalPleat.fit.scale===1.5,'公开响应使用原最小总褶目标与公共拟合');
 check(base.stats.checks.geometry.status==='passed'&&base.stats.checks.local.status==='passed','实际四面CP通过几何与局部条件');
 await capture(base,'base-response.json');
 await page.getByLabel('原始对偶参数设置',{exact:true}).click();const settings=page.getByRole('dialog',{name:'原始—对偶参数与定向',exact:true});
 check(await page.getByLabel('对偶求解方法',{exact:true}).inputValue()==='original-min-total-pleat','当前界面显式显示原求解方法');
 pending=wait(p=>p.family==='primal-dual'&&p.reciprocalMethod===undefined&&p.dualTargets?.length===4);
 await page.getByLabel('对偶求解方法',{exact:true}).selectOption('compatible');const compatible=await(await pending).json();
 check(!compatible.source.reciprocalMinTotalPleat&&JSON.stringify(compatible.fold)!==JSON.stringify(base.fold),'切换旧垂直对偶确实使用不同构造且无旧证书');
 await capture(compatible,'compatible-response.json');pending=wait(p=>p.reciprocalMethod==='original-min-total-pleat');
 await page.getByLabel('对偶求解方法',{exact:true}).selectOption('original-min-total-pleat');await pending;
 await settings.getByRole('button',{name:'关闭镶嵌窗口',exact:true}).click();await ready();
 for(const kind of ['base','edited']){
  let actual=base;
  if(kind==='edited'){
   await button('镶嵌设计').click();await ready();await button('编辑对偶点').click();
   const x=Number(await page.getByLabel('点 X',{exact:true}).inputValue());
   pending=wait(p=>p.reciprocalMethod==='original-min-total-pleat'&&Math.abs(p.dualTargets?.[0]?.[0]-x-.03)<1e-9);
   await page.getByLabel('点 X',{exact:true}).fill(String(x+.03));await page.getByLabel('点 X',{exact:true}).press('Enter');
   actual=await(await pending).json();
   check(JSON.stringify(actual.fold.vertices_coords)!==JSON.stringify(base.fold.vertices_coords),'实际输入对偶点编辑重新求解并更新CP');
   check(actual.source.reciprocalMinTotalPleat.inputSigns.join(',')===base.source.reciprocalMinTotalPleat.inputSigns.join(','),'点编辑保持原输入符号而重新拟合');
   await capture(actual,'edited-response.json');await page.getByRole('dialog',{name:'编辑对偶目标点',exact:true}).getByRole('button',{name:'保存几何修改',exact:true}).click();await ready();
  }
  await page.screenshot({path:`${out}/${kind}-preview.png`,fullPage:true});
  check((await page.locator('body').innerText()).includes('层序已解'),'当前'+kind+'已实际解层序后才允许普通采用');
  await button('采用折痕副本 →').click();check(await button('折痕编辑').getAttribute('aria-pressed')==='true',kind+'真实普通采用进入折痕编辑');
  const name='MinTotal1010-'+kind;await page.getByLabel('工程名称',{exact:true}).fill(name);
  for(const format of ['json','fold','dxf'])await exported(`${kind}.${format}`,format);
  for(const format of ['json','fold']){
   const sentinel='待验证实际重开-'+format;await page.getByLabel('工程名称',{exact:true}).fill(sentinel);
   await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`${out}/${kind}.${format}`);
   await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]')?.value===name,name);
   await exported(`${kind}-${format}-reopen.json`,'json');check(true,kind+'/'+format+'实际重开替换工程且再导出');
  }
  const saving=page.waitForResponse(r=>r.url().includes('/api/projects')&&r.request().method()==='POST');await button('保存工程').click();const saved=await saving;
  check(saved.ok(),kind+'实际工程库保存');await capture(await saved.json(),kind+'-saved.json');await page.locator('.save-dot.saved').waitFor();
  await page.reload();await page.evaluate(()=>window.confirm=()=>true);if(await button('保留当前工程').count())await button('保留当前工程').click();
  await button('工程库').click();await page.locator('.project-list button').filter({hasText:name}).first().click();
  await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]')?.value===name,name);
  await exported(kind+'-library-reopen.json','json');check(true,kind+'工程库重开并实际导出');
  await button('镶嵌设计').click();pending=wait(p=>p.reciprocalMethod==='original-min-total-pleat'&&p.dualTargets?.length===4);
  await button('读取工程参数').click();const regenerated=await(await pending).json();await ready();
  check(JSON.stringify(regenerated.stats.parameters)===JSON.stringify(actual.stats.parameters),kind+'保存的原求解方法与输入对偶参数实际重构');
  await capture(regenerated,kind+'-regenerated-response.json');
 }
 await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles('output/parallel/original-min-total-pleat-1010/root-acceptance/three-face.zhezhi.json');
 await page.waitForFunction(()=>document.querySelector('input[aria-label="工程名称"]')?.value?.includes('three-face'));
 if(await button('镶嵌设计').getAttribute('aria-pressed')!=='true')await button('镶嵌设计').click();
 pending=wait(p=>p.reciprocalMethod==='original-min-total-pleat'&&p.dualTargets?.length===3);
 await button('读取工程参数').click();const three=await(await pending).json();
 check(three.stats.edges===15&&three.stats.checks.geometry.status==='passed','三面例真实生成CP而不伪造完整层序成功');
 await page.waitForFunction(()=>document.body.innerText.includes('层序无解'));
 check(await button('采用折痕副本 →').isDisabled(),'三面例整片层序实际无解时普通采用保持拒绝');
 await capture(three,'three-face-response.json');await page.screenshot({path:`${out}/three-face-refused.png`,fullPage:true});
 pending=wait(p=>p.reciprocalMethod==='original-min-total-pleat'&&p.dualTargets?.length===4);
 await button('原最小总褶宽 · 有限数值示例').click();await pending;await ready();
 check(true,'无解后恢复合法四面例并重新允许采用');
 check(errors.length===0,'完整构造编辑采用保存与重开无页面异常');
 const result={verified:true,passed:checks.length,checks,errors,downloads,bundle:await page.locator('script[type="module"]').getAttribute('src')};
 await capture(result,'browser-checks.json');return result;
}
