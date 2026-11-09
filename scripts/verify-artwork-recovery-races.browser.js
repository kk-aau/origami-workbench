async page=>{
  // Run in a fresh browser context. This script only intercepts this page's
  // requests and never removes another window's recovery or library records.
  const checks=[],errors=[],writes=[],requestWrites=new Map(),stamp=Date.now();
  const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
  const button=name=>page.getByRole('button',{name,exact:true});
  const wait=async(predicate,label,timeout=16000)=>{
    const end=Date.now()+timeout;let result;
    while(Date.now()<end){result=await predicate();if(result)return result;await page.waitForTimeout(100);}
    throw Error('等待超时：'+label);
  };
  const list=()=>page.evaluate(async()=>{const {createArtworkRecoveryStore}=await import('/src/app/artworkRecovery.ts');return (await createArtworkRecoveryStore().list()).entries;});
  const load=id=>page.evaluate(async id=>{const {createArtworkRecoveryStore}=await import('/src/app/artworkRecovery.ts');return createArtworkRecoveryStore().load(id);},id);
  const focused=label=>page.getByLabel(label,{exact:true}).evaluate(el=>el===document.activeElement);
  const onRequest=request=>{
    if(request.method()!=='POST'||!request.url().endsWith('/api/artwork-recovery'))return;
    const body=request.postDataJSON(),entry={id:body.id,expectedRevision:body.expectedRevision,project:JSON.parse(body.text),started:Date.now(),finished:null,status:null};
    writes.push(entry);requestWrites.set(request,entry);
  };
  const onResponse=response=>{const entry=requestWrites.get(response.request());if(entry){entry.finished=Date.now();entry.status=response.status();}};
  page.on('request',onRequest);page.on('response',onResponse);page.on('pageerror',error=>errors.push(error.message));
  page.removeAllListeners('dialog');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByLabel('工程名称',{exact:true}).waitFor();
  for(const name of ['设置并开始使用','关闭窗口','保留当前工程','知道了'])if(await button(name).isVisible().catch(()=>false))await button(name).click();
  await page.evaluate(()=>window.confirm=()=>true);
  const before=await list(),known=new Set(before.map(entry=>entry.id));
  check(await page.getByLabel('工程名称',{exact:true}).evaluate(el=>el.readOnly),'新窗口没有打开折痕工程');
  check(await page.locator('[data-diagram-workspace]').count()===0,'新窗口没有进入或打开折序');

  await button('镶嵌设计').click();
  const sides=page.getByLabel('边数',{exact:true});
  await sides.waitFor();const oldSides=Number(await sides.inputValue()),newSides=oldSides===5?6:5;
  await sides.fill(String(newSides));
  const tessWrite=await wait(()=>writes.find(entry=>entry.project.construction?.tessellation?.sides===newSides&&entry.status===200),'首次镶嵌参数自动写盘');
  check(!known.has(tessWrite.id),'只进入镶嵌也建立本窗口的新恢复记录');
  const tessSaved=await load(tessWrite.id);
  check(tessSaved.project.construction.tessellation.family==='twist'&&tessSaved.project.construction.tessellation.sides===newSides,'没有点击保存或生成，磁盘完整作品包含新镶嵌参数');
  check(tessSaved.project.diagram===null&&tessSaved.project.simulation===null,'首次镶嵌恢复没有混入其他窗口的折序或三维');
  check(await focused('边数'),'镶嵌自动暂存不抢数字输入框焦点');

  // Open an independent small CP only after the fresh-tessellation check.
  const fixtureName='恢复竞态验收-'+stamp;
  const fixture=await page.evaluate(async name=>{const {blankDoc}=await import('/src/app/state.ts');return JSON.stringify(blankDoc(name,100,100));},fixtureName);
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,text)=>{const transfer=new DataTransfer();transfer.items.add(new File([text],'recovery-race.zhezhi.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},fixture);
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,fixtureName);
  await wait(()=>writes.find(entry=>entry.project.editor.name===fixtureName&&entry.status===200),'CP 初始快照');

  const oldName=fixtureName+'-先写',newName=fixtureName+'-延迟期间新名称';
  let delayed=null;
  const route=async route=>{
    if(route.request().method()==='POST'){
      const body=route.request().postDataJSON();
      if(!delayed&&JSON.parse(body.text).editor.name===oldName){
        delayed={id:body.id,started:Date.now(),released:null};
        await page.waitForTimeout(3000);delayed.released=Date.now();
      }
    }
    await route.continue();
  };
  await page.route('**/api/artwork-recovery',route);
  let finalEntry,oldWrite,newWrite;
  try{
    await page.getByLabel('工程名称',{exact:true}).fill(oldName);
    await wait(()=>delayed,'旧名称请求进入 3 秒延迟');
    await page.getByLabel('工程名称',{exact:true}).fill(newName);
    check(delayed.released===null,'新名称在旧写盘尚未完成时输入');
    finalEntry=await wait(async()=>{const entry=(await list()).find(item=>item.id===delayed.id&&item.name===newName);return entry;},'旧写盘结束后自动跟进新名称');
    oldWrite=writes.find(entry=>entry.project.editor.name===oldName);
    newWrite=writes.find(entry=>entry.project.editor.name===newName);
    check(delayed.released-delayed.started>=2900,'旧写盘请求确实延迟至少 2.9 秒');
    check(oldWrite.status===200&&newWrite.status===200,'旧快照和跟进快照均真实写盘成功');
    check(newWrite.started>=oldWrite.finished,'跟进写入在旧写入响应之后发出');
    check(newWrite.id===oldWrite.id&&typeof newWrite.expectedRevision==='string'&&newWrite.expectedRevision!==oldWrite.expectedRevision,'跟进写入沿用本窗口记录并携带刚完成的修订号');
    check((await load(finalEntry.id)).project.editor.name===newName,'磁盘最终名称是延迟期间输入的新名称');
    check(await focused('工程名称'),'跟进自动暂存保持名称输入框焦点');
  }finally{await page.unroute('**/api/artwork-recovery',route);}

  await button('折序绘图').click();
  await button('＋ 新建绘图').first().click();
  const title='未失焦标题-'+stamp;
  await page.getByLabel('步骤标题',{exact:true}).fill(title);
  const titleWrite=await wait(()=>writes.find(entry=>entry.project.editor.name===newName&&entry.project.diagram?.steps.some(step=>step.title===title)&&entry.status===200),'标题尚未失焦时自动暂存');
  check((await load(titleWrite.id)).project.diagram.steps.some(step=>step.title===title),'未失焦步骤标题进入磁盘完整恢复');
  check(await focused('步骤标题'),'标题自动暂存不触发失焦');
  if(await button('更多属性').getAttribute('aria-expanded')!=='true')await button('更多属性').click();
  await page.getByRole('navigation',{name:'折序属性'}).getByRole('button',{name:'工程',exact:true}).click();
  const diagramName='未失焦绘图名称-'+stamp;
  await page.getByLabel('折序工程名称',{exact:true}).fill(diagramName);
  const nameWrite=await wait(()=>writes.find(entry=>entry.project.editor.name===newName&&entry.project.diagram?.name===diagramName&&entry.status===200),'折序名称尚未失焦时自动暂存');
  const nameSaved=await load(nameWrite.id);
  check(nameSaved.project.diagram.name===diagramName&&nameSaved.project.diagram.steps.some(step=>step.title===title),'未失焦绘图名称和标题都进入完整恢复');
  check(await focused('折序工程名称'),'名称自动暂存不触发失焦');
  check(errors.length===0,'真实浏览器没有运行时异常');
  await page.screenshot({path:'output/playwright/artwork-recovery-races.png'});
  page.off('request',onRequest);page.off('response',onResponse);
  return {passed:checks.length,checks,tessellation:{before:oldSides,after:newSides,id:tessWrite.id},race:{delay:delayed.released-delayed.started,followupAfterResponse:newWrite.started-oldWrite.finished,id:finalEntry.id},errors};
}
