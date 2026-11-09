async page=>{
 const out='D:/codex/折纸工具/workbench/output/playwright/original-constructible-final-1010/discrete';
 const checks=[],errors=[],downloads=[],apiCaptures=[],metadataCaptures=[],receipts=[],expectedRejections=[];
 const button=name=>page.getByRole('button',{name,exact:true});
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 const pageError=e=>errors.push(e.message);page.on('pageerror',pageError);
 const bundle=await page.locator('script[type="module"]').first().getAttribute('src');
 const capture=async(value,name)=>{
  const pending=page.waitForEvent('download');
  await page.evaluate(({value,name})=>{const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},{value,name});
  await(await pending).saveAs(`${out}/${name}`);metadataCaptures.push({path:`${out}/${name}`,userExport:false});
 };
 const userExport=async(kind,suffix,format)=>{
  await button('导出作品').click();const dialog=page.getByRole('dialog',{name:'导出作品',exact:true});
  await dialog.getByRole('combobox',{name:'输出格式',exact:true}).selectOption(format);
  const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出文件',exact:true}).click();
  const d=await pending,path=`${out}/${kind}-${suffix}.${format}`;await d.saveAs(path);
  downloads.push({kind,suffix,format,path,suggested:d.suggestedFilename(),actualUserExport:true});
  await button('关闭窗口').click();return path;
 };
 const queryMatches=(r,predicate)=>{
  try{return r.url().endsWith('/api/tessellate')&&r.request().method()==='POST'&&predicate(r.request().postDataJSON());}catch{return false;}
 };
 const candidate=async(name,predicate,action,success=true)=>{
  const pending=page.waitForResponse(r=>queryMatches(r,predicate),{timeout:70000});await action();const r=await pending;
  const value={name,url:r.url(),status:r.status(),query:r.request().postDataJSON(),response:await r.json(),userExport:false};
  check(r.ok()===success,name+(success?'真实 API 成功':'真实 API 拒绝'));
  const path=`${name}-api-capture.json`;await capture(value,path);apiCaptures.push({name,path:`${out}/${path}`,status:r.status(),userExport:false});
  if(!success)expectedRejections.push({name,status:r.status(),response:value.response});
  return value;
 };
 const cpReady=async()=>await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='仅采用 CP →'&&!b.disabled),{},{timeout:70000});
 const typed=(label,value)=>page.getByRole('spinbutton',{name:label,exact:true}).fill(String(value));
 const preset=async()=>{
  await button('三点有限手算示例').click();
  await candidate('preset-sentinel-'+String(apiCaptures.length),q=>q.family==='discrete-curve-cp'&&q.leftWidth===.411,()=>typed('左原母线系数',.411));
  await candidate('reset-'+String(apiCaptures.length),q=>q.family==='discrete-curve-cp'&&q.leftWidth===.4&&q.rightWidth===.4&&q.assignments?.join(',')==='U,U,U,U',()=>button('三点有限手算示例').click());
  await cpReady();
 };
 const assigned=async(name,assignments)=>{
  const action=async()=>{await button('原三点／母线／山谷').click();
   for(const [i,label]of ['折痕首段','折痕末段','左侧母线','右侧母线'].entries())await page.getByRole('combobox',{name:`离散纸带${label}赋型`,exact:true}).selectOption(assignments[i]);
   await button('完成').click();};
  const value=await candidate(name,q=>q.family==='discrete-curve-cp'&&q.assignments?.join(',')===assignments.join(','),action);
  await cpReady();return value;
 };
 const enter=async()=>{
  await button('镶嵌设计').click();await page.getByRole('button',{name:/^\d+ 空间构造$/}).click();
  await page.getByRole('combobox',{name:'空间构造类型',exact:true}).selectOption('discrete-curve-cp');
 };
 const savedName=async name=>await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]')?.value===name,name);
 const layerReady=async()=>{
  if(await button('计算平折').count())await button('计算平折').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='采用折痕副本 →'&&!b.disabled),{},{timeout:70000});
 };
 try{
  check(await page.evaluate(()=>location.origin)==='http://127.0.0.1:8864','使用 root 已打开的最终 8864 页面');
  check(typeof bundle==='string'&&bundle.startsWith('/assets/main-'),'记录真实主页面 bundle');
  await page.evaluate(()=>window.confirm=()=>true);await page.setViewportSize({width:1380,height:920});
  if(await button('保留当前工程').count())await button('保留当前工程').click();
  if(await button('关闭窗口').count())await button('关闭窗口').click();
  await enter();
  // Force an actual preset request even if the prior UI already had this family.
  await preset();
  check((await page.getByText('9 顶点 · 12 条边',{exact:true}).innerText()).includes('9'),'真实默认 9 顶点 / 12 边');
  check(await button('仅采用 CP →').isEnabled(),'默认 U 可显式仅采用 CP');
  check(await button('采用折痕副本 →').isDisabled(),'默认 U 拒绝普通采用');
  await button('核对原倍率').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='构造三点纸带 CP'&&!b.disabled));
  check(await button('构造三点纸带 CP').isEnabled(),'原倍率真实回读后桥接入口可用');
  await button('构造三点纸带 CP').click();await cpReady();
  const lff=await assigned('invalid-lff',['M','M','M','V']);
  check(lff.response.stats.checks.local.status==='passed'&&lff.response.stats.checks.lff.status==='failed','真实局部通过但 LFF 失败');
  check(await button('采用折痕副本 →').isDisabled(),'LFF 失败拒绝普通采用');
  await page.screenshot({path:`${out}/invalid-lff.png`,fullPage:true});
  await preset();
  const bad=await candidate('invalid-geometry',q=>q.family==='discrete-curve-cp'&&q.source?.leftRulings?.[0]?.[0]===0&&q.source?.leftRulings?.[0]?.[1]===-1,async()=>{
   await button('原三点／母线／山谷').click();await page.getByRole('combobox',{name:'离散纸带原顶点',exact:true}).selectOption('0');
   await typed('左原向量 x',0);await typed('左原向量 y',-1);await button('完成').click();
  },false);
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='仅采用 CP →'&&b.disabled));
  check(await button('仅采用 CP →').isDisabled()&&await button('采用折痕副本 →').isDisabled(),'真实翻转/退化几何拒绝两种采用');
  check(JSON.stringify(bad.response).includes('纸带面退化')||JSON.stringify(bad.response).includes('几何'),'几何拒绝有明确原始原因');
  await page.screenshot({path:`${out}/invalid-geometry.png`,fullPage:true});await preset();
  for(const kind of ['base','edited','ordinary']){
   if(kind==='edited'){
    await candidate('edited-widths',q=>q.family==='discrete-curve-cp'&&q.leftWidth===.32&&q.rightWidth===.28,async()=>{await typed('左原母线系数',.32);await typed('右原母线系数',.28);});await cpReady();
    check(await page.getByRole('spinbutton',{name:'左原母线系数',exact:true}).inputValue()==='0.32','持续修改宽度进入实际 API 参数');
   }
   if(kind==='ordinary'){
    await preset();const valid=await assigned('ordinary-valid',['M','M','V','M']);
    check(valid.response.stats.checks.local.status==='passed'&&valid.response.stats.checks.lff.status==='passed','显式 M/M/V/M 局部及 LFF 通过');
    await layerReady();
    check((await page.locator('body').innerText()).includes('层序已解'),'真实整片层序已求解后普通采用可用');
    await page.screenshot({path:`${out}/ordinary-whole-sheet-solved.png`,fullPage:true});await button('采用折痕副本 →').click();
   }else await button('仅采用 CP →').click();
   await page.waitForFunction(()=>document.querySelector('nav[aria-label="工作区"] button[aria-pressed="true"]')?.textContent?.replace(/^\d+/,'')==='折痕编辑');
   check(await button('折痕编辑').getAttribute('aria-pressed')==='true',kind+'真实采用进入既有绘图工作区');
   const name='离散CP最终1010-'+kind;await page.getByRole('textbox',{name:'工程名称',exact:true}).fill(name);
   const savePending=page.waitForResponse(r=>r.url().endsWith('/api/projects')&&r.request().method()==='POST');
   await button('保存工程').click();const saved=await savePending,receipt=await saved.json();
   check(saved.ok()&&/^[a-f0-9-]{36}$/.test(receipt.id),kind+'真实工程库保存取得 UUID');
   await page.locator('.save-dot.saved').waitFor();receipts.push({kind,name,id:receipt.id,path:`${out}/${kind}-saved-receipt.json`,userExport:false});await capture({kind,name,...receipt},`${kind}-saved-receipt.json`);
   for(const format of ['json','fold','dxf'])await userExport(kind,'original',format);
   for(const format of ['json','fold']){
    await page.getByRole('textbox',{name:'工程名称',exact:true}).fill('确认实际重开-'+kind+'-'+format);
    await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`${out}/${kind}-original.${format}`);await savedName(name);
    check(await button('折痕编辑').getAttribute('aria-pressed')==='true',kind+'/'+format+'真实文件重开');
    await userExport(kind,format+'-reopen','json');
   }
   await button('工程库').click();const opening=page.waitForResponse(r=>r.url().endsWith('/api/projects/'+receipt.id)&&r.request().method()==='GET');await page.locator('.project-list button').filter({hasText:name}).first().click();const reopened=await opening;if(!reopened.ok())throw Error(kind+'实际保存UUID重开失败');await savedName(name);await page.locator('.save-dot.saved').waitFor();
   check(await page.locator('.save-dot.saved').isVisible(),kind+'工程库 UUID 工程重开');await userExport(kind,'library-reopen','json');
   await enter();await candidate(kind+'-temporary-width',q=>q.family==='discrete-curve-cp'&&q.leftWidth===.81,()=>typed('左原母线系数',.81));await cpReady();
   const expected=kind==='edited'?{left:.32,right:.28,assign:'U,U,U,U'}:{left:.4,right:.4,assign:kind==='ordinary'?'M,M,V,M':'U,U,U,U'};
   const restored=await candidate(kind+'-saved-parameters-reconstructed',q=>q.family==='discrete-curve-cp'&&q.leftWidth===expected.left&&q.rightWidth===expected.right&&q.assignments?.join(',')===expected.assign,()=>button('读取工程参数').click());await cpReady();
   check(restored.response.stats.vertices===9&&restored.response.stats.edges===12&&restored.response.stats.faces===4,kind+'读取已保存参数发起真实 API 重构');
   check(await page.getByRole('spinbutton',{name:'左原母线系数',exact:true}).inputValue()===String(expected.left),kind+'源宽度读回');
   if(kind==='ordinary'){
    await layerReady();
    check((await page.locator('body').innerText()).includes('层序已解'),'普通参数重构重新验证真实全局层序');await button('采用折痕副本 →').click();
   }else{check(await button('采用折痕副本 →').isDisabled(),kind+'恢复 U 参数仍拒普通采用');await button('仅采用 CP →').click();}
   await page.waitForFunction(()=>document.querySelector('nav[aria-label="工作区"] button[aria-pressed="true"]')?.textContent?.replace(/^\d+/,'')==='折痕编辑');
   await page.getByRole('textbox',{name:'工程名称',exact:true}).fill(name);await userExport(kind,'regenerated','json');
   await page.screenshot({path:`${out}/${kind}-final-workspace.png`,fullPage:true});
   if(kind!=='ordinary'){await enter();if(kind==='edited')await preset();}
  }
  check(downloads.length===21,'21 份真实用户下载：3 参数/采用情形×7 文件；API captures 排除');
  check(new Set(receipts.map(r=>r.id)).size===3,'三份采用工程各有真实保存 UUID');
  check(errors.length===0,'页面无未处理运行时异常');
  const result={verified:true,passed:checks.length,checks,errors,downloads,bundle,receipts,apiCaptures,metadataCaptures,expectedRejections,apiCapturesExcludedFromDownloads:true,adoptionCases:{base:'explicit-cp-only',edited:'explicit-cp-only',ordinary:'actual-whole-sheet-layer-solved'},noInitialGoto:true};
  await capture(result,'browser-checks.json');return result;
 }catch(e){
  errors.push(e instanceof Error?e.message:String(e));await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});
  await capture({verified:false,passed:checks.length,checks,errors,downloads,bundle,receipts,apiCaptures,metadataCaptures,expectedRejections,apiCapturesExcludedFromDownloads:true,noInitialGoto:true},'browser-checks.json');throw e;
 }finally{page.off('pageerror',pageError);}
}
