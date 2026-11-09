async page=>{
  const checks=[],errors=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
  const button=name=>page.getByRole('button',{name,exact:true});
  const pageError=error=>errors.push(error.message);page.on('pageerror',pageError);
  await page.getByLabel('工程名称',{exact:true}).waitFor();
  for(const name of ['设置并开始使用','关闭窗口','保留当前工程'])if(await button(name).isVisible().catch(()=>false))await button(name).click();
  await page.evaluate(()=>{
    window.__artworkConfirm=window.confirm;window.confirm=()=>true;
    window.__artworkDownloads=[];window.__artworkCreateURL=URL.createObjectURL;window.__artworkClick=HTMLAnchorElement.prototype.click;
    URL.createObjectURL=function(blob){if(blob instanceof Blob)window.__artworkDownloads.push(blob.text());return window.__artworkCreateURL.call(this,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download)return window.__artworkClick.call(this);};
  });
  const fixtures=await page.evaluate(async()=>{
    const [{blankDoc},{buildFold},{computeFlatFold},{prepareProjectImport},models,{tessPreset},diagram,{exportArtworkProject}]=await Promise.all([
      import('/src/app/state.ts'),import('/src/core/geometry.ts'),import('/src/core/flatFold.ts'),import('/src/app/prepareProjectImport.ts'),
      import('/src/app/foldedModelCollection.ts'),import('/src/app/tessellation.ts'),import('/src/app/diagramProject.ts'),import('/src/app/artworkProject.ts')]);
    const editor=blankDoc('完整作品浏览器 A',180,160);editor.metadata={source:'验收原参数',custom:{scale:17}};
    editor.objects=[{id:'artwork-circle',kind:'circle',center:[30,40],radius:12,color:'#367d86'}];
    const raw=blankDoc('独立模型来源',100,100);raw.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'M',angle:-180});
    const source=prepareProjectImport(raw),result=computeFlatFold(source);
    const collection=models.foldedModelCollectionReducer(models.emptyFoldedModelCollection(),{type:'add',id:'artwork-model',name:'作品模型',source:{doc:source,graph:buildFold(source).graph},result});
    let drawing=diagram.createDiagramProject(blankDoc('完整作品内独立折序',120,110));
    drawing=diagram.updateDiagramStep(drawing,drawing.activeStepId,{title:'原始标题',description:'图文说明保留'});
    drawing=diagram.updateDiagramAnnotations(drawing,drawing.activeStepId,[{id:'artwork-line',kind:'line',a:[10,10],b:[40,30],style:'valley',width:.7,color:'#112233'}]);
    const construction={tessellation:tessPreset('ring'),curve:null},a=exportArtworkProject({editor,models:collection,diagram:drawing,simulation:null,construction});
    const b=exportArtworkProject({editor:blankDoc('完整作品浏览器 B',130,140),models:models.emptyFoldedModelCollection(),diagram:null,simulation:null,construction:{tessellation:tessPreset('woven'),curve:null}});
    return {a,b};
  });
  const upload=async(text,name='browser.zhezhi-artwork.json')=>{
    await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,{text,name})=>{const transfer=new DataTransfer();transfer.items.add(new File([text],name,{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},{text,name});
    await page.waitForFunction(()=>!document.querySelector('[role="dialog"][aria-label="导入文件"]'));
  };
  const save=async()=>{
    const count=await page.evaluate(()=>window.__artworkDownloads.length);
    await button('保存完整作品').click();
    await page.waitForFunction(n=>window.__artworkDownloads.length>n,count);
    return page.evaluate(async n=>JSON.parse(await window.__artworkDownloads[n]),count);
  };
  const library=()=>page.evaluate(async()=>{const {createDiagramLibrary}=await import('/src/app/diagramLibrary.ts');const store=createDiagramLibrary();return store.read().documents.map(entry=>({id:entry.id,name:entry.name,project:store.load(entry.id)}));});
  try{
    await upload(fixtures.a);await page.waitForFunction(()=>document.querySelector('[aria-label="工程名称"]')?.value==='完整作品浏览器 A');
    const first=await save(),expected=JSON.parse(fixtures.a);
    check(first.editor.name===expected.editor.name&&first.editor.paper.width===180,'完整作品通过真实打开文件入口还原当前CP与纸张尺寸');
    check(JSON.stringify(first.editor.objects)===JSON.stringify(expected.editor.objects),'辅助圆几何与颜色往返保留');
    check(JSON.stringify(first.editor.metadata)===JSON.stringify(expected.editor.metadata),'源文档扩展元数据往返保留');
    check(first.models.entries[0].name==='作品模型'&&first.models.entries[0].snapshot.source.name==='独立模型来源','模型名称及独立源CP往返保留');
    check(JSON.stringify(first.construction)===JSON.stringify(expected.construction),'独立镶嵌构造参数还原并再次保存');
    check(first.diagram.steps[0].title==='原始标题'&&first.diagram.steps[0].annotations[0].id==='artwork-line','折序标题与绘图对象往返保留');
    const before=await library();check(before.length>=1&&before.some(entry=>entry.name==='完整作品内独立折序'),'完整作品折序作为新草稿加入独立文档库');
    await upload(fixtures.b);await page.waitForFunction(()=>document.querySelector('[aria-label="工程名称"]')?.value==='完整作品浏览器 B');
    const empty=await save(),after=await library();
    check(empty.diagram===null&&empty.models===null&&empty.simulation===null,'导入空模块作品后再次保存不会混入旧折序模型或三维');
    check(after.some(entry=>entry.id===before[0].id&&entry.project.steps[0].title==='原始标题'),'打开其他作品仍保留之前独立绘图的完整内容');
    await upload(fixtures.a);await page.waitForFunction(()=>document.querySelector('[aria-label="工程名称"]')?.value==='完整作品浏览器 A');
    const copies=await library();check(copies.length===after.length+1&&new Set(copies.map(entry=>entry.id)).size===copies.length,'再次打开相同作品导入新文档，不覆盖原独立绘图');
    const corrupt=JSON.parse(fixtures.b);corrupt.construction.tessellation={family:'invalid'};
    await upload(JSON.stringify(corrupt),'damaged.zhezhi-artwork.json');
    await page.waitForFunction(()=>document.body.textContent.includes('镶嵌构造参数无效'));
    check(await page.getByLabel('工程名称',{exact:true}).inputValue()==='完整作品浏览器 A','损坏的末尾构造参数不会部分替换有效CP');
    check((await library()).length===copies.length,'校验失败不会向独立绘图库写入部分作品');
    if(await button('知道了').isVisible().catch(()=>false))await button('知道了').click();
    await page.screenshot({path:'output/playwright/artwork-project-roundtrip.png'});
    check(errors.length===0,`完整作品往返没有运行时异常 (${errors.join('; ')})`);
    return {passed:checks.length,checks,libraryDocuments:copies.length,errors};
  }catch(error){throw Error(`${error.message}; 已通过 ${checks.length} 项：${checks.join('；')}`);}
  finally{page.off('pageerror',pageError);await page.evaluate(()=>{window.confirm=window.__artworkConfirm;URL.createObjectURL=window.__artworkCreateURL;HTMLAnchorElement.prototype.click=window.__artworkClick;}).catch(()=>{});}
}
