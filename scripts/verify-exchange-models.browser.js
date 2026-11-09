async page=>{
 const results=[],check=(ok,msg)=>{if(!ok)throw Error(msg);results.push(msg);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const save=async()=>{await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();};
 const stored=async()=>{await save();return page.evaluate(async()=>{const name=document.querySelector('[aria-label="工程名称"]').value;const {projects}=await(await fetch('/api/projects')).json();return(await(await fetch('/api/projects/'+projects.find(p=>p.name===name).id)).json()).doc;});};
 const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 const eq=(a,b,msg)=>check(stable(a)===stable(b),msg);
 const keep=button('保留当前工程');if(await keep.count())await keep.click();
 await page.evaluate(()=>{window.__auditConfirm=window.confirm;window.__auditDialogs=[];window.confirm=message=>{window.__auditDialogs.push(message);return true;};});
 const upload=async(label,text)=>{await page.getByLabel(label,{exact:true}).evaluate((el,text)=>{const dt=new DataTransfer();dt.items.add(new File([text],'验收.json',{type:'application/json'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));},text);await settle();};
 const capture=async name=>{const waiting=page.waitForEvent('download');await button(name).click();return waiting;};
 try{
  await button('折痕编辑').click();
  await save();
  const s=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
  const doc={format:'zhezhi-workbench',version:2,schemaVersion:2,name:'交换与模型验收-'+Date.now(),paper:{width:200,height:200},segments:[s('t',[0,0],[200,0]),s('r',[200,0],[200,200]),s('b',[200,200],[0,200]),s('l',[0,200],[0,0]),s('m',[50,0],[50,200],'M',-72),s('v',[100,0],[100,200],'V',0),s('m2',[150,0],[150,200],'M',null)],objects:[{id:'circle',kind:'circle',center:[25,25],radius:10,color:'#8052ad'},{id:'text',kind:'text',position:[25,175],text:'中文交换 <>&',fontSize:5,color:'#224466'},{id:'mark',kind:'mark',a:[25,75],b:[40,85],color:'#337755'}]};
  await upload('折痕工程文件',JSON.stringify(doc));await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]').value===name,doc.name);const original=await stored();
  const geom=ss=>ss.map(s=>[s.assignment,[s.a,s.b].map(p=>p.map(n=>Math.round(n*1e5)/1e5).join(',')).sort().join(':')]).sort((a,b)=>stable(a).localeCompare(stable(b)));
  for(const format of ['json','fold','cp','opx','ori','orh','dxf','svg','png','jpg']){
   await upload('折痕工程文件',JSON.stringify({format:'zhezhi-workbench',version:2,...original}));await save();
   await button('导出作品').click();await page.getByRole('combobox',{name:'输出格式',exact:true}).selectOption(format);
   const file=await capture('导出文件'),path='output/playwright/exchange-audit.'+(format==='json'?'zhezhi.json':format);await file.saveAs(path);
   check((await file.failure())===null,format+'真实文件下载成功');
   if(await button('关闭窗口').count())await button('关闭窗口').click();
   if(['json','fold','cp','opx','ori','orh'].includes(format)){
    await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(path);await settle();const loaded=await stored();
    eq(geom(loaded.segments),geom(original.segments),format+'导出再打开保留折痕坐标及山谷');
    if(format==='json')eq(loaded,original,'完整工程逐字段无损');
    if(format==='fold')eq(loaded.segments.filter(s=>s.assignment!=='B').map(s=>s.angle).sort(),[-72,0,null].sort(),'FOLD 保留自定义、零和未知折角');
    if(['cp','opx','ori','orh'].includes(format))check(loaded.segments.filter(s=>s.assignment!=='B').every(s=>s.angle===(s.assignment==='M'?-180:180)),format+'明确按格式能力恢复默认折角');
    if(format==='ori')eq(loaded.objects.map(o=>o.kind).sort(),['circle','mark','text'],'ORI 保留圆、标记和文字');
    if(format==='orh')eq(loaded.objects.map(o=>o.kind).sort(),['circle','mark'],'ORH 保留圆与独立标记');
   }
  }
  check(await page.evaluate(()=>window.__auditDialogs.some(t=>t.includes('折角'))),'有损交换显示折角损失确认');
  // Real solver result, then real downloaded collection/snapshot imports.
  await upload('折痕工程文件',JSON.stringify({format:'zhezhi-workbench',version:2,...original}));await save();
  await button('计算平折').click();await page.locator('.flat-view svg polygon').first().waitFor({timeout:30000});
  await page.waitForFunction(()=>document.body.textContent.includes('已找到符合引擎约束的平折层序解'),null,{timeout:30000});check(true,'真实平折计算得到层序解');
  await button('平折参数').click();await button('复制结果副本').click();
  check(await page.getByRole('combobox',{name:'当前模型',exact:true}).locator('option:not([disabled])').count()===2,'创建独立模型副本');
  // Capture the actual download blob for a semantic before/after comparison, in addition to saving the file.
  await page.evaluate(()=>{window.__auditBlobs=[];const original=URL.createObjectURL;window.__auditCreateObjectURL=original;URL.createObjectURL=function(blob){window.__auditBlobs.push(blob.text());return original.call(this,blob);};});
  const collection=await capture('导出模型集合');await collection.saveAs('output/playwright/exchange-models.zhezhi-models.json');
  const exported=await page.evaluate(async()=>JSON.parse(await window.__auditBlobs.at(-1)));
  check(exported.models.length===2,'模型集合包含两个模型及当前工程');
  await page.getByLabel('模型集合文件',{exact:true}).setInputFiles('output/playwright/exchange-models.zhezhi-models.json');await settle();
  await button('平折参数').click();await capture('导出模型集合');const reopened=await page.evaluate(async()=>JSON.parse(await window.__auditBlobs.at(-1)));
  eq(reopened,exported,'模型集合实际下载再打开完整保留几何、活动项和视图');
  const beforeName=await page.getByLabel('工程名称',{exact:true}).inputValue();await upload('模型集合文件','{"format":"zhezhi-model-collection","version":99}');
  check(await page.getByLabel('工程名称',{exact:true}).inputValue()===beforeName,'损坏模型集合不覆盖当前工程');
  await capture('导出模型集合');eq(await page.evaluate(async()=>JSON.parse(await window.__auditBlobs.at(-1))),reopened,'损坏模型集合不损伤已有模型');
  const snapshotButton=page.getByRole('button',{name:/^导出.*快照$/}).first();const downloading=page.waitForEvent('download');await snapshotButton.click();const snapshot=await downloading;await snapshot.saveAs('output/playwright/exchange-model.zhezhi-model.json');
  const snapshotData=await page.evaluate(async()=>JSON.parse(await window.__auditBlobs.at(-1)));
  await page.getByLabel('模型快照文件',{exact:true}).setInputFiles('output/playwright/exchange-model.zhezhi-model.json');await settle();await button('平折参数').click();
  const repeat=page.waitForEvent('download');await page.getByRole('button',{name:/^导出.*快照$/}).first().click();await repeat;
  eq(await page.evaluate(async()=>JSON.parse(await window.__auditBlobs.at(-1))),snapshotData,'模型快照实际往返保留源折痕与结果');
  await page.evaluate(()=>{URL.createObjectURL=window.__auditCreateObjectURL;delete window.__auditCreateObjectURL;delete window.__auditBlobs;});
  await button('三维模拟').click();await page.waitForFunction(()=>document.body.textContent.includes('目标角未知'),null,{timeout:30000});check(true,'三维模拟拒绝未知目标角并说明原因');
  check((await page.locator('aside').innerText()).includes('不可用'),'三维载入失败不标为已载入');
  await button('折痕编辑').click();await save();
  const simulation={format:'zhezhi-workbench',version:2,...original,segments:original.segments.map(s=>({...s,angle:s.assignment==='M'?-180:s.assignment==='V'?180:0}))};
  await upload('折痕工程文件',JSON.stringify(simulation));await save();await button('三维模拟').click();
  await page.waitForFunction(()=>{const el=document.querySelector('iframe')?.contentDocument?.querySelector('#simulation');return el&&['webgl2','cpu'].includes(el.dataset.backend)&&el.dataset.status!=='error';},null,{timeout:30000});check(true,'修正目标角后三维模拟本地后端成功启动');
  await button('折痕编辑').click();await save();await page.screenshot({path:'output/playwright/exchange-models-complete.png'});return {passed:results.length,results};
 }finally{await page.evaluate(()=>{window.confirm=window.__auditConfirm;delete window.__auditConfirm;delete window.__auditDialogs;});}
}
