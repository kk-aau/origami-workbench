async page=>{
  const checks=[],errors=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const button=name=>page.getByRole('button',{name,exact:true});
  await page.getByLabel('工程名称',{exact:true}).waitFor();
  for(const name of ['设置并开始使用','关闭窗口','保留当前工程'])if(await button(name).isVisible().catch(()=>false))await button(name).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{
    window.__clipboardConfirm=window.confirm;window.confirm=()=>true;window.__clipboardDownloads=[];
    window.__clipboardCreateURL=URL.createObjectURL;window.__clipboardAnchorClick=HTMLAnchorElement.prototype.click;
    URL.createObjectURL=function(blob){window.__clipboardDownloads.push(blob.text());return window.__clipboardCreateURL.call(this,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download)return window.__clipboardAnchorClick.call(this);};
  });
  const source=await page.evaluate(async()=>{
    const {blankDoc}=await import('/src/app/state.ts');const doc=blankDoc('混合剪贴板验收',200,200);
    doc.segments.push({id:'mountain',a:[40,40],b:[100,40],assignment:'M',angle:-45,displayColor:'#aa5522'},{id:'guide',a:[40,65],b:[100,65],assignment:'A',angle:0});
    doc.objects=[{id:'circle',kind:'circle',center:[140,130],radius:20,color:'#225588'},{id:'note',kind:'text',position:[20,150],text:'应保留注释',fontSize:5,color:'#112233'}];return doc;
  });
  const close=async()=>{if(await button('关闭工具设置').isVisible().catch(()=>false))await button('关闭工具设置').click();};
  const canvas=()=>page.locator('svg.crease-canvas:visible').first();
  const press=async key=>{await canvas().focus();await page.keyboard.press(key);};
  const upload=async doc=>{
    await close();await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,doc)=>{const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify({...doc,format:'zhezhi-workbench',version:2})],'clipboard.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},doc);
    await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,doc.name);
    if(!await page.locator('button[data-tool=select]').isVisible())await button('绘图工具').click();
    await page.locator('button[data-tool=select]').click();await button('适合画布').click();
  };
  const readDoc=async()=>{
    const count=await page.evaluate(()=>window.__clipboardDownloads.length);await button('保存完整作品').click();
    await page.waitForFunction(count=>window.__clipboardDownloads.length>count,count);
    return page.evaluate(async count=>JSON.parse(await window.__clipboardDownloads[count]).editor,count);
  };
  const click=async point=>{const p=await canvas().evaluate((svg,point)=>{const p=svg.createSVGPoint();p.x=point[0];p.y=point[1];const at=p.matrixTransform(svg.getScreenCTM());return{x:at.x,y:at.y};},point);await page.mouse.click(p.x,p.y);};
  const selectedCircle=()=>canvas().locator('[data-selected-circle]').count();
  const clipboardPanel=()=>page.getByRole('dialog',{name:'选区剪贴板',exact:true});
  try{
    await upload(source);await page.getByRole('checkbox',{name:'保护边界',exact:true}).check();
    const before=await readDoc();await click([160,130]);check(await selectedCircle()===1,'真实折痕编辑可选辅助圆');
    await button('剪贴板').click();check(await clipboardPanel().getByRole('button',{name:'复制选中',exact:true}).isEnabled(),'只选圆时复制和剪切面板可用');await close();
    await press('Control+c');await press('Control+v');const circles=await readDoc();
    check(circles.objects.filter(o=>o.kind==='circle').length===2&&circles.segments.length===before.segments.length,'圆单选 Ctrl+C/V 只追加辅助圆');
    check(circles.objects.at(-1).id!=='circle'&&same(circles.objects.at(-1).center,[140,130])&&circles.objects.at(-1).radius===20&&circles.objects.at(-1).color==='#225588','圆副本坐标、半径和颜色保留，身份独立');
    await press('Control+z');check(same(await readDoc(),before),'圆粘贴一次撤销');await press('Control+Shift+z');check(same(await readDoc(),circles),'圆粘贴一次重做');await press('Control+z');

    await click([160,130]);await page.keyboard.down('Shift');await click([70,40]);await page.keyboard.up('Shift');await press('Control+c');
    await button('剪贴板').click();check((await clipboardPanel().getByRole('status').innerText()).includes('1 条线段、1 个辅助圆'),'混合选区剪贴板准确显示两种对象');
    await clipboardPanel().getByRole('button',{name:'偏移粘贴',exact:true}).click();await close();const mixed=await readDoc();
    check(mixed.segments.length===before.segments.length+1&&mixed.objects.length===before.objects.length+1,'混合偏移粘贴同时追加线和圆');
    check(same(mixed.segments.at(-1).a,[50,50])&&mixed.segments.at(-1).angle===-45&&same(mixed.objects.at(-1).center,[150,140]),'相同毫米偏移同时应用到线和圆，折角保留');
    check(new Set([...mixed.segments,...mixed.objects].map(o=>o.id)).size===mixed.segments.length+mixed.objects.length,'混合粘贴全局 ID 无重复');
    await press('Control+z');check(same(await readDoc(),before),'混合粘贴一次撤销同时恢复线和圆');await press('Control+Shift+z');check(same(await readDoc(),mixed),'混合粘贴一次重做同时恢复两种副本');await press('Control+z');

    await click([160,130]);await page.keyboard.down('Shift');await click([70,40]);await page.keyboard.up('Shift');await press('Control+x');const cut=await readDoc();
    check(!cut.objects.some(o=>o.kind==='circle')&&!cut.segments.some(s=>s.id==='mountain')&&cut.objects.some(o=>o.id==='note'),'混合 Ctrl+X 删除选中线和圆，保留注释');
    await press('Control+z');check(same(await readDoc(),before),'混合剪切一次撤销');await press('Control+Shift+z');check(same(await readDoc(),cut),'混合剪切一次重做');
    await press('Control+v');const restored=await readDoc();
    check(restored.segments.length===before.segments.length&&restored.objects.length===before.objects.length,'混合剪切后 Ctrl+V 恢复两种几何');
    await press('Control+z');check(same(await readDoc(),cut),'剪切后的粘贴独立一次撤销');await press('Control+z');check(same(await readDoc(),before),'再撤销剪切恢复原始对象身份');

    await click([160,130]);await press('Control+x');const circleCut=await readDoc();check(circleCut.segments.length===before.segments.length&&!circleCut.objects.some(o=>o.kind==='circle'),'圆单选 Ctrl+X 保留所有线');await press('Control+z');
    await press('Control+a');const layers=page.getByRole('group',{name:'对象显示',exact:true});await layers.getByText('图层',{exact:true}).click();await layers.getByRole('checkbox',{name:'辅助线',exact:true}).uncheck();
    await press('Control+c');await press('Control+x');const hiddenCut=await readDoc();check(hiddenCut.objects.some(o=>o.id==='circle')&&hiddenCut.segments.some(s=>s.id==='guide'),'隐藏辅助层不会被剪切');
    await press('Control+v');const hiddenPaste=await readDoc();check(hiddenPaste.objects.filter(o=>o.kind==='circle').length===1&&hiddenPaste.segments.filter(s=>s.assignment==='B').length===4,'隐藏圆和受保护边界不会偷偷进入剪切剪贴板');
    await press('Control+z');await press('Control+z');await layers.getByRole('checkbox',{name:'辅助线',exact:true}).check();await layers.getByText('图层',{exact:true}).click();check(same(await readDoc(),before),'隐藏图层剪切与粘贴可完整撤销');

    // A previous circle clipboard must survive rejection of a topology/circle mix.
    await press('Escape');await click([160,130]);await press('Control+c');
    const material=await page.evaluate(async()=>{
      const {blankDoc}=await import('/src/app/state.ts'),{buildFold}=await import('/src/core/geometry.ts'),{createMaterialTopology}=await import('/src/core/materialTopology.ts');
      const doc=blankDoc('材料混选剪贴板验收',200,200),built=buildFold(doc),ids=built.edgeSourceIds.map(row=>row[0]);
      doc.metadata={materialTopology:createMaterialTopology(doc,built.graph,ids,{foldedVertices:built.graph.vertices_coords,startingFace:0})};doc.objects=[{id:'material-circle',kind:'circle',center:[140,130],radius:20,color:'#225588'}];return doc;
    });
    await upload(material);await page.getByRole('checkbox',{name:'保护边界',exact:true}).uncheck();await press('Control+a');const materialBefore=await readDoc();await press('Control+c');
    check((await page.locator('.toast').innerText()).includes('完整材料部件与辅助圆不能混合'),'材料与圆混选有明确说明，不静默漏圆');
    check(same(await readDoc(),materialBefore),'被拒绝的材料混合复制不修改工程');await press('Control+x');check(same(await readDoc(),materialBefore),'被拒绝的材料混合剪切不删除部分对象');
    await press('Control+v');const materialPasted=await readDoc();check(materialPasted.objects.length===2&&same(materialPasted.metadata.materialTopology,materialBefore.metadata.materialTopology),'拒绝后保留旧圆剪贴板，粘贴不损坏材料拓扑');
    await press('Control+z');await press('Control+a');await page.keyboard.down('Shift');await click([160,130]);await page.keyboard.up('Shift');await press('Control+c');
    await button('剪贴板').click();check((await clipboardPanel().getByRole('status').innerText()).includes('完整材料边'),'纯材料部件仍进入原完整材料剪贴板');await close();
    check(errors.length===0,'剪贴板真实工作区流程无运行时异常');await page.screenshot({path:'output/playwright/mixed-clipboard.png'});
    return {passed:checks.length,checks,errors};
  }catch(error){throw Error(`${error.message}; 已通过${checks.length}项：${checks.join('；')}`);}
  finally{page.off('pageerror',onError);await page.evaluate(()=>{window.confirm=window.__clipboardConfirm;URL.createObjectURL=window.__clipboardCreateURL;HTMLAnchorElement.prototype.click=window.__clipboardAnchorClick;}).catch(()=>{});}
}
