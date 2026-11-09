async page=>{
 const checks=[],errors=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},button=name=>page.getByRole('button',{name,exact:true});
 const onError=error=>errors.push(error.message);page.on('pageerror',onError);
 await page.setViewportSize({width:1540,height:1000});
 for(const name of ['设置并开始使用','知道了','关闭窗口','保留当前工程'])if(await button(name).isVisible().catch(()=>false))await button(name).click();
 await button('折痕编辑').click();
 await page.evaluate(()=>{
  window.__defaultRootConfirm=window.confirm;window.confirm=()=>true;
  window.__defaultRootDownloads=[];window.__defaultRootURL=URL.createObjectURL;
  URL.createObjectURL=function(blob){if(blob instanceof Blob)window.__defaultRootDownloads.push(blob.text());return window.__defaultRootURL.call(this,blob);};
 });
 const fixtures=await page.evaluate(async()=>{
  const [{blankDoc},{splitEditableSegments},{setStartingFace,resolveStartingFace},{buildFold},{exportDocument}]=await Promise.all([
   import('/src/app/state.ts'),import('/src/app/planarize.ts'),import('/src/app/flatFoldSettings.ts'),import('/src/core/geometry.ts'),import('/src/core/formats.ts')]);
  return [false,true].map(stale=>{
   const raw=blankDoc(`默认起始面回归-${stale?'失效旧设置':'有效旧设置'}`,100,100);
   raw.segments.push({id:'default-root-fold',a:[50,0],b:[50,100],assignment:'M',angle:-180});
   const doc=setStartingFace(splitEditableSegments(raw),1);
   if(stale)doc.flatFold.startingFace=doc.flatFold.startingFace.map(([x,y])=>[x+1,y]);
   return {name:doc.name,stale,settings:doc.flatFold,resolved:resolveStartingFace(doc,buildFold(doc).graph),text:exportDocument(doc,'json').text};
  });
 });
 const upload=async(label,text,name)=>{
  await page.getByLabel(label,{exact:true}).evaluate((input,{text,name})=>{
   const transfer=new DataTransfer();transfer.items.add(new File([text],name,{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  },{text,name});
  await page.waitForFunction(()=>!document.querySelector('[role="dialog"][aria-label="导入文件"]'));
 };
 const panel=async()=>{if(await button('显示平折').isVisible().catch(()=>false))await button('显示平折').click();if(await button('模型操作').getAttribute('aria-expanded')!=='true')await button('模型操作').click();};
 const current=()=>page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='重新分析当前模型'&&!b.disabled));
 const exported=async name=>{
  const count=await page.evaluate(()=>window.__defaultRootDownloads.length);
  const [download]=await Promise.all([page.waitForEvent('download'),button(name).click()]);
  check(await download.failure()===null,`${name}真实下载成功`);
  await page.waitForFunction(n=>window.__defaultRootDownloads.length>n,count);
  return page.evaluate(async n=>JSON.parse(await window.__defaultRootDownloads[n]),count);
 };
 const noPicker=async label=>{
  check(await button('起始面').count()===0&&await button('设置起始面').count()===0&&await page.getByRole('region',{name:'选择起始面',exact:true}).count()===0,`${label}无需起始面按钮或选择步骤`);
 };
 try{
  for(const fixture of fixtures){
   const label=fixture.stale?'失效旧手选面':'有效旧手选面';
   check(fixture.resolved.stale===fixture.stale&&(fixture.stale||fixture.resolved.face===1),`${label}测试源确实带有旧设置`);
   await upload('折痕工程文件',fixture.text,'default-root.zhezhi.json');
   await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,fixture.name);
   await noPicker(label);await button('计算平折').click();await panel();await current();
   await page.locator('.canvas-fold-overlay [data-face-id]').first().waitFor();
   const snapshot=await exported('导出模型快照');
   check(snapshot.model.startingFace===0,`${label}通过真实计算入口采用默认 F1`);
   check(JSON.stringify(snapshot.source.flatFold)===JSON.stringify(fixture.settings),`${label}默认计算不改写原折痕设置`);
   const artwork=await exported('保存完整作品');
   check(artwork.models.entries[0].snapshot.model.startingFace===0,`${label}默认结果包含在完整作品中`);
   await upload('折痕工程文件',JSON.stringify(artwork),'default-root.zhezhi-artwork.json');
   await page.waitForFunction(()=>document.body.textContent.includes('已恢复完整作品'));
   await panel();await current();
   check(await button('重新分析当前模型').isEnabled(),`${label}完整作品恢复后不会误标模型过期`);
   const restored=await exported('保存完整作品');
   check(JSON.stringify(restored.editor)===JSON.stringify(restored.models.entries[0].snapshot.source),`${label}完整作品恢复保留相同编辑器与模型来源`);
   check(restored.models.entries[0].snapshot.model.startingFace===0&&JSON.stringify(restored.models.entries[0].snapshot.model.vertices)===JSON.stringify(snapshot.model.vertices),`${label}完整作品恢复保留默认根和全部模型顶点`);
   await upload('模型快照文件',JSON.stringify(snapshot),'default-root.zhezhi-model.json');
   await page.waitForFunction(()=>document.body.textContent.includes('模型快照已载入'));
   await panel();await current();
   const repeated=await exported('导出模型快照');
   check(repeated.model.startingFace===0&&JSON.stringify(repeated.model.vertices)===JSON.stringify(snapshot.model.vertices),`${label}导出的模型重新导入后保持默认根和几何`);
   await noPicker(`${label}恢复后`);
  }
  check(errors.length===0,`默认起始面完整流程无页面异常：${errors.join('；')}`);
  return {passed:checks.length,checks,errors};
 }catch(error){throw Error(`${error.message}；已通过 ${checks.length} 项：${checks.join('；')}`);}
 finally{page.off('pageerror',onError);await page.evaluate(()=>{window.confirm=window.__defaultRootConfirm;URL.createObjectURL=window.__defaultRootURL;}).catch(()=>{});}
}
