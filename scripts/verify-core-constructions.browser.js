async (page) => {
 const results=[],check=(ok,message)=>{if(!ok)throw new Error(message);results.push(message);};
 await page.setViewportSize({width:1440,height:1000});
 const keep=page.getByRole('button',{name:'保留当前工程',exact:true});if(await keep.count())await keep.click();
 const svg=page.locator('svg.crease-canvas');
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const screen=p=>svg.evaluate((el,p)=>{const q=new DOMPoint(...p).matrixTransform(el.getScreenCTM());return[q.x,q.y];},p);
 const click=async(p,button='left')=>{await page.mouse.click(...await screen(p),{button});await settle();};
 const hover=async p=>{await page.mouse.move(...await screen(p));await settle();};
 const tool=async id=>{await page.locator('button[data-tool='+id+']').click();await settle();};
 const preset=async name=>{await page.locator('.dock-line-presets').getByRole('button',{name,exact:true}).click();await settle();};
 const segments=()=>page.locator('[data-segment]').evaluateAll(es=>es.map(e=>{const l=e.querySelector('[data-crease-stroke]');return{id:e.dataset.segment,assignment:e.dataset.assignment,a:[+l.getAttribute('x1'),+l.getAttribute('y1')],b:[+l.getAttribute('x2'),+l.getAttribute('y2')]};}));
 const preview=selector=>page.locator(selector).evaluateAll(es=>es.map(e=>({a:[+e.getAttribute('x1'),+e.getAttribute('y1')],b:[+e.getAttribute('x2'),+e.getAttribute('y2')]})));
 const geometry=ss=>JSON.stringify(ss.map(s=>[s.a,s.b].map(p=>p.map(n=>Math.round(n*1e6)/1e6).join(',')).sort().join(':')).sort());
 const s=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
 const boundary=[s('top',[0,0],[200,0]),s('right',[200,0],[200,200]),s('bottom',[200,200],[0,200]),s('left',[0,200],[0,0])];
 let serial=0,name='';
 async function save(){await page.getByRole('button',{name:'保存工程',exact:true}).click();await page.locator('.save-dot.saved').waitFor();}
 async function stored(){await save();return page.evaluate(async()=>{const response=await fetch('/api/recovery');return(await response.json()).doc;});}
 async function fixture(extra=[]){
  await page.keyboard.press('Escape');await save();name='构造审计-'+Date.now()+'-'+ ++serial;
  const doc={format:'zhezhi-workbench',version:2,schemaVersion:2,name,paper:{width:200,height:200},segments:[...boundary,...extra],objects:[]};
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,doc)=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(doc)],'audit.json',{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));},doc);
  await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]').value===name,name);
  await page.getByRole('button',{name:'适合画布',exact:true}).click();await preset('山折');await settle();
 }
 async function undoRedo(before,after,label){
  await page.getByRole('button',{name:'撤销',exact:true}).click();await settle();check(geometry(await segments())===geometry(before),label+'整组撤销');
  await page.getByRole('button',{name:'重做',exact:true}).click();await settle();check(geometry(await segments())===geometry(after),label+'整组重做');
 }
 const cases=[
  {id:'bisect',extra:[s('existing',[100,100],[200,200],'V',180)],points:[[150,100],[100,100],[100,150],[200,190]]},
  {id:'reflection',extra:[s('existing',[100,100],[150,100],'V',180)],points:[[50,100],[100,100],[100,150],[200,110]]},
  {id:'reflectionlines',extra:[s('source',[50,100],[100,100],'M',-180),s('axis',[100,50],[100,150],'M',-180),s('existing',[100,100],[150,100],'V',180)],points:[[75,100],[100,75],[200,110]]},
  {id:'midperp',extra:[s('existing',[100,100],[100,150],'V',180)],points:[[75,100],[125,100],[150,200]]},
  {id:'perpendicular',extra:[s('reference',[50,50],[150,50],'M',-180),s('existing',[100,50],[100,100],'V',180)],points:[[100,100],[125,50]]},
  {id:'parallel',extra:[s('reference',[50,50],[150,50],'M',-180),s('existing',[100,100],[150,100],'V',180)],points:[[100,100],[125,50],[200,110]]},
 ];
 for(const c of cases){
  await fixture(c.extra);await tool(c.id);const before=await segments();
  for(const p of c.points)await click(p);
  check(JSON.stringify(await segments())===JSON.stringify(before),c.id+'冲突不写入');
  check((await page.locator('.canvas-pane').innerText()).includes('线型或折角不同'),c.id+'提示重合冲突');
  if(c.id==='bisect')await page.screenshot({path:'output/playwright/construction-overlap-fixed.png'});
 }
 await fixture([s('existing',[100,100],[200,200],'M',-180)]);await tool('bisect');const duplicateBefore=await segments();
 for(const p of [[150,100],[100,100],[100,150],[200,190]])await click(p);
 check(JSON.stringify(await segments())===JSON.stringify(duplicateBefore),'相同角平分线不重复写入');
 check((await page.locator('.canvas-pane').innerText()).includes('结果已存在'),'重复结果提示');
 await fixture([s('existing',[100,100],[150,150],'M',-180)]);await tool('bisect');const partialBefore=await segments();
 for(const p of [[150,100],[100,100],[100,150]])await click(p);
 await hover([200,190]);check(await page.locator('[data-bisector-preview=bounded]').count()===1,'角平分有限截止预览');
 await click([200,190]);const partialAfter=await segments(),partial=partialAfter.filter(s=>!partialBefore.some(t=>t.id===s.id));
 check(geometry(partial)===geometry([{a:[150,150],b:[200,200]}]),'角平分只补缺失部分');await undoRedo(partialBefore,partialAfter,'角平分');

 await fixture();await tool('rabbitear');const rabbitBefore=await segments();
 for(const p of [[25,25],[175,25],[25,175]])await click(p);
 const rabbitPreview=await preview('[data-rabbit-preview]');check(rabbitPreview.length===3,'兔耳预览三条内线');
 check(geometry(await segments())===geometry(rabbitBefore),'兔耳确认前不写入外框或折线');
 await preset('谷折');await page.getByRole('button',{name:'确认兔耳构造',exact:true}).click();await settle();
 const rabbitAfter=await segments(),rabbit=rabbitAfter.filter(s=>s.assignment!=='B');
 check(geometry(rabbit)===geometry(rabbitPreview)&&rabbit.every(s=>s.assignment==='V'),'兔耳预览与提交一致并采用确认时线型');
 await undoRedo(rabbitBefore,rabbitAfter,'兔耳');
 await fixture();await tool('rabbitear');await click([25,25]);await click([175,25]);await click([100,25]);
 check((await page.locator('.canvas-pane').innerText()).includes('共线'),'兔耳拒绝退化第三点');
 await click([25,175]);check(await page.locator('[data-rabbit-preview]').count()===3,'兔耳错误后可重新选择第三点');
 await page.keyboard.press('Escape');await settle();check(await page.locator('[data-rabbit-preview]').count()===0&&(await segments()).length===4,'Esc取消兔耳预览');
 await click([25,25]);await click([175,25]);await click([100,0],'right');check((await segments()).length===4,'右键取消构造不删纸边');
 await click([25,25]);await tool('fishbone');check(await page.locator('[data-construction-point]').count()===0,'切换工具清空上一构造点');

 await fixture();await tool('fishbone');const fishBefore=await segments();await click([25,100]);await click([175,100]);
 const fishPreview=await preview('[data-fishbone-preview]');check(fishPreview.length===7,'鱼骨按网格间距预览七条');
 await page.getByRole('button',{name:'确认鱼骨构造',exact:true}).click();await settle();const fishAfter=await segments(),fish=fishAfter.filter(s=>s.assignment!=='B');
 check(geometry(fish)===geometry(fishPreview),'鱼骨预览与提交一致且不生成基线');check(fish.map(s=>s.assignment).join('')==='MVMVMVM','鱼骨逐取点交替山谷');await undoRedo(fishBefore,fishAfter,'鱼骨');

 await fixture([s('c1',[75,0],[75,200],'M',-180),s('c2',[125,0],[125,200],'V',180)]);await tool('continuous');const continuousBefore=await segments();
 await click([25,100]);await click([50,100]);const continuousPreview=await preview('[data-continuous-preview]');check(continuousPreview.length===3,'连续反射预览三段到纸边');
 await page.getByRole('button',{name:'确认连续反射',exact:true}).click();await settle();const continuousAfter=await segments(),continuous=continuousAfter.filter(s=>s.id.includes('::continuous:'));
 check(geometry(continuous)===geometry(continuousPreview)&&continuous.map(s=>s.assignment).join('')==='MVM','连续反射预览提交与山谷交替一致');await undoRedo(continuousBefore,continuousAfter,'连续反射');

 await fixture([s('v',[25,50],[100,50],'V',72),s('m',[25,150],[100,150],'M',-60)]);await tool('transverse');const transverseBefore=await segments();
 await click([100,25]);await click([100,175]);const transversePreview=await preview('[data-transverse-preview]');check(transversePreview.length===2,'横截反射预览两条 T 形原线');
 await page.getByRole('button',{name:'确认横截反射',exact:true}).click();await settle();const transverseAfter=await segments(),transverse=transverseAfter.filter(s=>s.id.includes('::transverse:'));
 check(geometry(transverse)===geometry(transversePreview),'横截反射预览提交一致');
 const transverseDoc=await stored();check(transverseDoc.segments.filter(s=>s.id.includes('::transverse:')).every(s=>s.assignment==='V'?s.angle===72:s.assignment==='M'&&s.angle===-60),'横截反射保留原折角');await undoRedo(transverseBefore,transverseAfter,'横截反射');

 await fixture([s('v',[100,100],[150,100],'V',72)]);await tool('localflat');const localBefore=await segments();await click([100,100]);await hover([0,110]);
 const localPreview=await preview('[data-local-flat-preview]');check(localPreview.length===1,'局部补线到有限截止预览');await click([0,110]);const localAfter=await segments();
 check(geometry(localAfter.filter(s=>s.id.includes('::localflat:')))===geometry(localPreview),'局部补线预览提交一致');const localDoc=await stored();check(localDoc.segments.filter(s=>s.id.includes('::localflat:')).every(s=>s.assignment==='V'&&s.angle===72),'局部补线继承单邻线山谷与折角');await undoRedo(localBefore,localAfter,'局部补线');

 await fixture([s('v',[100,100],[150,100],'V',72)]);await tool('foldabledraw');const freeBefore=await segments();await click([100,100]);await preset('边界');
 check(await page.locator('[data-foldable-pending]').getAttribute('data-foldable-type')==='V','自由补线预览不受当前边界预设影响');await click([75,100]);const freeAfter=await segments();const freeDoc=await stored();
 check(freeDoc.segments.some(s=>s.id.includes('::foldabledraw:')&&s.assignment==='V'&&s.angle===72),'自由补线提交继承谷折与折角');await undoRedo(freeBefore,freeAfter,'自由补线');
 await page.screenshot({path:'output/playwright/construction-audit-complete.png'});
 await save();return{passed:results.length,results};
}
