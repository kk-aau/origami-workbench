async page=>{
  const checks=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
  page.on('dialog',dialog=>dialog.accept());
  const svg=page.locator('svg.crease-canvas').first();
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const click=async point=>{const p=await svg.evaluate((element,point)=>{const q=new DOMPoint(...point).matrixTransform(element.getScreenCTM());return[q.x,q.y];},point);await page.mouse.click(...p);await settle();};
  const s=(id,a,b,assignment='B')=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});
  const boundary=[s('top',[0,0],[200,0]),s('right',[200,0],[200,200]),s('bottom',[200,200],[0,200]),s('left',[0,200],[0,0])];
  const fixture=async(extra,name)=>{
    await page.keyboard.press('Escape');
    await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,doc)=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(doc)],doc.name+'.json',{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));},{format:'zhezhi-workbench',version:2,schemaVersion:2,name,paper:{width:200,height:200},segments:[...boundary,...extra]});
    await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]').value===name,name);
    await page.getByRole('button',{name:'适合画布',exact:true}).click();await settle();
    await page.locator('.dock-line-presets').getByRole('button',{name:'山折',exact:true}).click();
  };
  const lines=()=>svg.locator('[data-segment] line').evaluateAll(lines=>lines.map(line=>({a:[Number(line.getAttribute('x1')),Number(line.getAttribute('y1'))],b:[Number(line.getAttribute('x2')),Number(line.getAttribute('y2'))],color:line.getAttribute('stroke')})));
  const horizontal=(all,y)=>all.filter(line=>Math.abs(line.a[1]-y)<1e-6&&Math.abs(line.b[1]-y)<1e-6);
  const length=(all,color)=>all.filter(line=>line.color===color).reduce((sum,line)=>sum+Math.abs(line.b[0]-line.a[0]),0);
  await fixture([s('guide',[0,125],[150,125],'A'),s('start-anchor',[25,125],[25,140],'A'),s('end-anchor',[125,125],[125,140],'A')],'角度覆盖验收');
  await page.locator('button[data-tool="angledrag"]').click();
  await click([25,125]);await click([125,125]);
  const angle=horizontal(await lines(),125);
  check(Math.abs(length(angle,'#b23d42')-100)<1e-6,'角度拖画可直接在辅助线上生成100mm山折');
  check(Math.abs(angle.filter(line=>line.color!=='#b23d42').reduce((sum,line)=>sum+Math.abs(line.b[0]-line.a[0]),0)-50)<1e-6,'辅助线左右未覆盖部分保留');
  await page.getByRole('button',{name:'撤销',exact:true}).click();await settle();
  const angleUndone=horizontal(await lines(),125);
  check(angleUndone.length===3&&!angleUndone.some(line=>line.color==='#b23d42'),'角度覆盖一次撤销还原整条辅助线');

  await fixture([s('guide',[0,100],[200,100],'A'),s('start-anchor',[25,100],[25,115],'A'),s('mirror1',[75,0],[75,200],'M'),s('mirror2',[125,0],[125,200],'V')],'连续反射覆盖验收');
  await page.locator('button[data-tool="continuous"]').click();
  await click([25,100]);await click([75,100]);
  check(await page.getByRole('button',{name:'确认连续反射',exact:true}).isEnabled(),'辅助线重合时仍可预览和确认连续反射');
  await page.getByRole('button',{name:'确认连续反射',exact:true}).click();await settle();
  const reflected=horizontal(await lines(),100);
  check(Math.abs(length(reflected,'#b23d42')-125)<1e-6&&Math.abs(length(reflected,'#315ebe')-50)<1e-6,'连续反射覆盖辅助线并按125mm山折和50mm谷折交替提交');
  check(Math.abs(reflected.filter(line=>!['#b23d42','#315ebe'].includes(line.color)).reduce((sum,line)=>sum+Math.abs(line.b[0]-line.a[0]),0)-25)<1e-6,'连续反射保留起点之前25mm辅助线');
  await page.screenshot({path:'output/playwright/construction-overwrite.png'});
  await page.getByRole('button',{name:'撤销',exact:true}).click();await settle();
  const undone=horizontal(await lines(),100);
  check(undone.length===4&&!undone.some(line=>['#b23d42','#315ebe'].includes(line.color)),'连续反射整组一次撤销还原原有辅助线');
  return{passed:checks.length,checks};
}
