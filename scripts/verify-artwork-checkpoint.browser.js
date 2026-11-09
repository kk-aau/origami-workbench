async page=>{
  const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},button=name=>page.getByRole('button',{name,exact:true});
  for(const name of ['知道了','关闭窗口'])if(await button(name).isVisible().catch(()=>false))await button(name).click();
  if(!await page.getByLabel('步骤标题',{exact:true}).isVisible().catch(()=>false))await button('折序绘图').click();
  if(await button('继续当前绘图').isVisible().catch(()=>false))await button('继续当前绘图').click();
  await page.getByLabel('步骤标题',{exact:true}).waitFor();
  await page.evaluate(()=>{
    window.__checkpointDownloads=[];window.__checkpointURL=URL.createObjectURL;window.__checkpointClick=HTMLAnchorElement.prototype.click;window.__checkpointConfirm=window.confirm;
    window.confirm=()=>true;
    URL.createObjectURL=function(blob){if(blob instanceof Blob)window.__checkpointDownloads.push(blob.text());return window.__checkpointURL.call(this,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download)return window.__checkpointClick.call(this);};
  });
  try{
    await page.getByLabel('步骤标题',{exact:true}).fill('未失焦的作品标题');
    check(await page.getByLabel('步骤标题',{exact:true}).evaluate(el=>el===document.activeElement),'标题保持焦点，验收真正尚未失焦的输入');
    await button('保存完整作品').click();await page.waitForFunction(()=>window.__checkpointDownloads.length>0);
    const saved=await page.evaluate(async()=>JSON.parse(await window.__checkpointDownloads[0]));
    check(saved.diagram.steps[0].title==='未失焦的作品标题','完整保存同步提交折序当前标题字段');
    const existing=await page.evaluate(async()=>{const {createDiagramLibrary}=await import('/src/app/diagramLibrary.ts');const library=createDiagramLibrary();return library.read().documents.map(entry=>({id:entry.id,project:library.load(entry.id)}));});
    const replacement={...saved,editor:{...saved.editor,name:'存储失败不应打开'},diagram:null,models:null};
    await page.evaluate(async()=>{const {preferenceStorage}=await import('/src/app/preferenceStorage.ts');window.__checkpointCAS=preferenceStorage.compareAndSet;preferenceStorage.compareAndSet=(key,...args)=>{if(key==='zhezhi.diagram-library.v1')throw Error('验收注入：折序存储写入失败');return window.__checkpointCAS(key,...args);};});
    await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,text)=>{const transfer=new DataTransfer();transfer.items.add(new File([text],'checkpoint-failure.zhezhi-artwork.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},JSON.stringify(replacement));
    await page.waitForFunction(()=>document.body.textContent.includes('完整作品未打开'));
    check(await page.getByLabel('来源折痕工程名称',{exact:true}).inputValue()===saved.editor.name,'折序旧稿checkpoint失败时CP不被新作品部分替换');
    check(await page.getByLabel('步骤标题',{exact:true}).inputValue()==='未失焦的作品标题','折序旧稿checkpoint失败时当前绘图字段不变');
    const after=await page.evaluate(async()=>{const {createDiagramLibrary}=await import('/src/app/diagramLibrary.ts');const library=createDiagramLibrary();return library.read().documents.map(entry=>({id:entry.id,project:library.load(entry.id)}));});
    check(JSON.stringify(after)===JSON.stringify(existing),'失败写入未覆盖独立绘图的任何已存版本');
    return {passed:checks.length,checks};
  }finally{await page.evaluate(async()=>{const {preferenceStorage}=await import('/src/app/preferenceStorage.ts');if(window.__checkpointCAS)preferenceStorage.compareAndSet=window.__checkpointCAS;window.confirm=window.__checkpointConfirm;URL.createObjectURL=window.__checkpointURL;HTMLAnchorElement.prototype.click=window.__checkpointClick;});}
}
