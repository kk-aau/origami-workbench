async page=>{
 const checks=[],errors=[],views=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const button=name=>page.getByRole('button',{name,exact:true}),pane=page.locator('.editable-cp-pane'),canvas=pane.locator('svg.crease-canvas'),model=page.getByLabel('实际平折面几何，点击面查看原始位置',{exact:true});
 const onError=error=>errors.push(error.message);page.on('pageerror',onError);
 await page.setViewportSize({width:1540,height:1000});
 await page.getByLabel('工程名称',{exact:true}).waitFor();
 for(const name of ['设置并开始使用','关闭窗口','保留当前工程'])if(await button(name).isVisible().catch(()=>false))await button(name).click();
 await page.evaluate(()=>{window.__flatNavigationConfirm=window.confirm;window.confirm=()=>true;});
 // Run against a Vite development server. Fixtures are made with production
 // serializers, then enter through the actual file input and Compute button.
 const fixtures=await page.evaluate(async()=>{
  const [{blankDoc},{exportDocument},{materialCanonical},{createMaterialTopology}]=await Promise.all([
   import('/src/app/state.ts'),import('/src/core/formats.ts'),import('/src/core/materialFaceCommon.ts'),import('/src/core/materialTopology.ts')]);
  const folded=blankDoc('平折导航浏览器回归',200,200);
  folded.segments.push({id:'navigation-fold',a:[100,0],b:[100,200],assignment:'M',angle:-180});
  const points=[[0,0],[200,0],[200,200],[0,200],[80,80],[120,80],[120,120],[80,120]],edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]];
  const graph=materialCanonical(points,edges,edges.map(()=>'B'),edges.map(()=>0),[[0,1,2,3]],[[0,1,2,3]],[[[4,7,6,5]]],[[[7,6,5,4]]]);
  const hole=blankDoc('带孔纸面导航浏览器回归',200,200);
  hole.segments=edges.map(([a,b],i)=>({id:`navigation-hole-${i}`,a:points[a],b:points[b],assignment:'B',angle:0}));
  hole.metadata={materialTopology:createMaterialTopology(hole,graph,hole.segments.map(s=>s.id),{foldedVertices:points,startingFace:0})};
  return [{name:folded.name,text:exportDocument(folded,'json').text},{name:hole.name,text:exportDocument(hole,'json').text}];
 });
 const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const camera=async locator=>(await locator.getAttribute('viewBox')).trim().split(/\s+/).map(Number);
 const same=(a,b)=>a.length===b.length&&a.every((value,i)=>Math.abs(value-b[i])<1e-7);
 const cpState=()=>canvas.evaluate(svg=>({
  segments:Array.from(svg.querySelectorAll('[data-segment]')).map(group=>({id:group.getAttribute('data-segment'),assignment:group.getAttribute('data-assignment'),line:['x1','y1','x2','y2'].map(k=>group.querySelector('[data-crease-stroke]').getAttribute(k))})),
  selected:Array.from(svg.querySelectorAll('[data-segment]')).filter(group=>group.querySelector('circle')).map(group=>group.getAttribute('data-segment'))
 }));
 const blankPoint=()=>canvas.evaluate(svg=>{
  const bounds=svg.getBoundingClientRect(),matrix=svg.getScreenCTM(),lines=Array.from(svg.querySelectorAll('[data-crease-stroke]')).map(line=>{
   const a=new DOMPoint(+line.getAttribute('x1'),+line.getAttribute('y1')).matrixTransform(matrix),b=new DOMPoint(+line.getAttribute('x2'),+line.getAttribute('y2')).matrixTransform(matrix);return [a,b];
  });
  for(const fx of [.12,.2,.3,.4,.55,.7,.85])for(const fy of [.55,.7,.4,.82,.25]){
   const x=bounds.x+bounds.width*fx,y=bounds.y+bounds.height*fy,target=document.elementFromPoint(x,y);
   if(target?.closest('svg.crease-canvas')!==svg)continue;
   const clear=lines.every(([a,b])=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a.x-t*dx,y-a.y-t*dy)>14;});
   if(clear)return {x,y};
  }
  throw Error('未找到可直接命中的 CP 空白位置');
 });
 // Inspect the actual geometric fill so the same driver works for polygon
 // faces and even-odd paths with holes, without forced clicks or DOM events.
 const facePoint=()=>model.evaluate(svg=>{
  for(const shape of svg.querySelectorAll('[data-region-top],[data-face-id]')){
   if(!(shape instanceof SVGGeometryElement))continue;
   const bounds=shape.getBBox(),matrix=shape.getScreenCTM();if(!matrix)continue;
   for(const fx of [.3,.7,.2,.8,.5])for(const fy of [.3,.7,.2,.8,.5]){
    const local=new DOMPoint(bounds.x+bounds.width*fx,bounds.y+bounds.height*fy);if(!shape.isPointInFill(local))continue;
    const point=local.matrixTransform(matrix),screen=svg.getBoundingClientRect();
    if(point.x>screen.left+5&&point.x<screen.right-5&&point.y>screen.top+5&&point.y<screen.bottom-5)return {x:point.x,y:point.y,tag:shape.tagName,face:Number(shape.getAttribute('data-region-top')??shape.getAttribute('data-face-id'))};
   }
  }
  throw Error('未找到可见平折纸面的内部位置');
 });
 const hitIsModel=point=>page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.canvas-fold-overlay'),point);
 const cpClick=async()=>{const p=await blankPoint();await page.mouse.click(p.x,p.y);await frames();};
 const clearFace=async()=>{if(await button('取消面选择').isVisible().catch(()=>false))await button('取消面选择').click();};
 const mark=async target=>{
  await clearFace();const p=target==='fold'?await facePoint():await blankPoint(),beforeCP=await camera(canvas),beforeModel=await camera(model);
  await page.mouse.click(p.x,p.y,{button:'middle'});await frames();
  check(await pane.getAttribute('data-navigation-target')===target,`鼠标中键点选标记${target==='fold'?'平折结果':'CP'}`);
  check(same(beforeCP,await camera(canvas))&&same(beforeModel,await camera(model)),'中键仅点击时不改变任一相机');
 };
 const drag=async(label,dx=28,dy=17)=>{
  await clearFace();const p=await facePoint(),before=await camera(model),cpBefore=await camera(canvas);
  check(await hitIsModel(p),`${label}：真实鼠标命中平折纸面`);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:5});await page.mouse.up();await frames();
  const after=await camera(model);views.push({label,before,after});
  check(!same(before.slice(0,2),after.slice(0,2))&&same(before.slice(2),after.slice(2)),`${label}：左键拖动只平移模型`);
  check(same(cpBefore,await camera(canvas)),`${label}：CP 视图保持不变`);
  check(await page.evaluate(()=>!!document.activeElement?.closest('.canvas-fold-overlay')),`${label}：模型持有键盘焦点`);
 };
 const zoom=async(label,target='fold',position='fold')=>{
  await clearFace();const p=position==='fold'?await facePoint():await blankPoint(),active=target==='fold'?model:canvas,other=target==='fold'?canvas:model,before=await camera(active),otherBefore=await camera(other);
  await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,-80);
  await page.waitForFunction(({width,target})=>{const svg=document.querySelector(target==='fold'?'.canvas-fold-overlay svg[data-model-render-mode]':'.editable-cp-pane svg.crease-canvas');return svg&&Number(svg.getAttribute('viewBox').split(/\s+/)[2])<width;},{width:before[2],target});
  const after=await camera(active);check(after[2]<before[2]&&after[3]<before[3],`${label}：滚轮放大已标记${target==='fold'?'模型':'CP'}`);
  check(same(otherBefore,await camera(other)),`${label}：未标记对象视图保持不变`);
 };
 const zoomButtons=async target=>{
  const active=target==='fold'?model:canvas,other=target==='fold'?canvas:model,name=target==='fold'?'平折结果':'画布',before=await camera(active),otherBefore=await camera(other);
  await button(`放大${name}`).click();await frames();const enlarged=await camera(active);
  check(enlarged[2]<before[2]&&same(otherBefore,await camera(other)),`＋ 按钮只放大已标记${target==='fold'?'模型':'CP'}`);
  await button(`缩小${name}`).click();await frames();
  check((await camera(active))[2]>enlarged[2]&&same(otherBefore,await camera(other)),`− 按钮只缩小已标记${target==='fold'?'模型':'CP'}`);
 };
 const middleDrag=async target=>{
  await clearFace();const p=target==='fold'?await facePoint():await blankPoint(),active=target==='fold'?model:canvas,other=target==='fold'?canvas:model,before=await camera(active),otherBefore=await camera(other);
  await page.mouse.move(p.x,p.y);await page.mouse.down({button:'middle'});await page.mouse.move(p.x+24,p.y+14,{steps:5});await page.mouse.up({button:'middle'});await frames();
  const after=await camera(active);check(await pane.getAttribute('data-navigation-target')===target,`中键拖动同时标记${target==='fold'?'模型':'CP'}`);
  check(!same(before.slice(0,2),after.slice(0,2))&&same(before.slice(2),after.slice(2)),`中键拖动正常平移${target==='fold'?'模型':'CP'}`);
  check(same(otherBefore,await camera(other)),`中键拖动${target==='fold'?'模型':'CP'}时另一个对象保持不变`);
 };
 const upload=async fixture=>{
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,fixture)=>{const transfer=new DataTransfer();transfer.items.add(new File([fixture.text],'flat-navigation.zhezhi.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},fixture);
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,fixture.name);
  await canvas.waitFor({state:'visible'});await button('计算平折').click();
  await model.locator('[data-face-id]').first().waitFor({timeout:60000});
  await button('平折参数').click();await frames();
 };
 try{
  await upload(fixtures[0]);check(await model.locator('polygon[data-face-id]').count()===2,'真实导入单山折并计算得到两个平折面');
  const initialCP=await cpState();
  check(await pane.getAttribute('data-navigation-target')==='fold','计算完成后默认标记平折结果');
  await mark('crease');await zoom('标记 CP 后在模型纸面上滚轮','crease','fold');await zoomButtons('crease');
  await mark('fold');await zoom('标记模型后在 CP 空白处滚轮','fold','crease');await zoomButtons('fold');
  await cpClick();check(await button('绘图工具').getAttribute('aria-pressed')==='true','点击 CP 空白后右栏切换为绘图工具');
  check(await pane.getAttribute('data-navigation-target')==='fold','普通 CP 点击不改变中键标记的导航目标');
  await drag('点击 CP 后恢复模型拖动');
  await cpClick();await zoom('点击 CP 后恢复模型缩放');
  await clearFace();const point=await facePoint();await page.mouse.click(point.x,point.y);await button('取消面选择').waitFor({state:'visible'});
  check(await button('平折参数').getAttribute('aria-pressed')==='true','纸面短按仍选择折叠面并显示平折参数');await clearFace();

  await middleDrag('crease');await zoom('中键改标记 CP 后在 CP 空白处滚轮','crease','crease');
  await middleDrag('fold');

  // Explicit tool selection is different from a plain CP click: drawing must
  // still reach the CP underneath the model until model controls are selected.
  await page.locator('.tool-rail').getByRole('button',{name:'线段',exact:true}).click();
  check(!(await hitIsModel(await facePoint())),'显式选择左侧绘图工具后模型允许鼠标穿透到 CP');
  check(await pane.getAttribute('data-navigation-target')==='crease','显式选择绘图工具将导航目标切回 CP');
  await mark('fold');await drag('选绘图工具后通过中键标记恢复模型拖动',-20,12);
  await button('绘图工具').click();check(!(await hitIsModel(await facePoint())),'显式点击右栏绘图工具后模型允许鼠标穿透到 CP');
  await button('平折参数').click();await zoom('绘图工具页切回平折参数后恢复缩放');

  // Keyboard focus must follow navigation. Ctrl+A on a model cannot select CP
  // lines; Delete on a model cannot remove an existing CP selection.
  await page.locator('.tool-rail button[data-tool="select"]').click();await button('平折参数').click();await cpClick();
  check((await cpState()).selected.length===0,'键盘隔离检查前 CP 没有选中线段');
  await drag('键盘隔离前模型拖动',-12,-8);await page.keyboard.press('Control+a');await frames();
  check((await cpState()).selected.length===0,'模型拖动后 Ctrl+A 不会选中 CP 线段');
  await cpClick();await page.keyboard.press('Control+a');await frames();check((await cpState()).selected.length>0,'CP 获得焦点时 Ctrl+A 正常选中山折');
  const selectedCP=await cpState();await drag('保留 CP 选中项时模型拖动',12,-8);await page.keyboard.press('Delete');await frames();
  check(JSON.stringify(await cpState())===JSON.stringify(selectedCP),'模型拖动后 Delete 不删除或改变 CP 选中项');

  await clearFace();const start=await facePoint(),beforeCancel=await camera(model);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+35,start.y+20,{steps:5});await frames();
  check(!same(beforeCancel,await camera(model)),'Esc 检查前拖动已产生真实模型位移');
  await page.keyboard.press('Escape');await frames();check(same(beforeCancel,await camera(model)),'Esc 恢复本次拖动前的模型相机');
  await page.mouse.move(start.x+50,start.y+30,{steps:3});await page.mouse.up();await frames();
  check(same(beforeCancel,await camera(model)),'取消后继续移动和松开不会重新提交拖动');
  check(JSON.stringify((await cpState()).segments)===JSON.stringify(initialCP.segments),'导航、选面和快捷键检查均未修改原始 CP 几何');
  await page.screenshot({path:'output/playwright/flat-navigation.png'});

  await upload(fixtures[1]);check(await model.locator('path[data-face-id]').count()===1,'带孔材料真实计算后以 path 纸面显示');
  await mark('crease');await mark('fold');await cpClick();await drag('带孔 path 纸面中键标记后拖动');
  await cpClick();await zoom('带孔 path 纸面标记后在 CP 空白处滚轮','fold','crease');
  await clearFace();const holePoint=await facePoint();await page.mouse.click(holePoint.x,holePoint.y);await button('取消面选择').waitFor({state:'visible'});
  check(true,'带孔 path 纸面仍能点击选择原始面');
  await clearFace();const holeCenter=await model.locator('path[data-face-id]').evaluate(path=>{
   const bounds=path.getBBox(),local=new DOMPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2),point=local.matrixTransform(path.getScreenCTM());
   return {x:point.x,y:point.y,filled:path.isPointInFill(local)};
  });
  check(!holeCenter.filled,'带孔纸面中心实际不属于 path 填充');
  const beforeHoleCP=await camera(canvas),beforeHoleModel=await camera(model);await page.mouse.click(holeCenter.x,holeCenter.y,{button:'middle'});await frames();
  check(await pane.getAttribute('data-navigation-target')==='crease','中键点击模型孔洞空白标记 CP，不误标记周围纸面');
  check(same(beforeHoleCP,await camera(canvas))&&same(beforeHoleModel,await camera(model)),'中键点击孔洞不会平移任一相机');
  await button('镶嵌设计').click();await button('折痕编辑').click();await button('继续当前折痕').click();await canvas.waitFor({state:'visible'});await model.waitFor({state:'visible'});
  await mark('fold');await mark('crease');await mark('fold');await drag('切换镶嵌再返回折痕后的中键绑定',-12,8);
  await page.screenshot({path:'output/playwright/flat-navigation-hole.png'});
  check(errors.length===0,`平折导航全过程没有页面异常 (${errors.join('; ')})`);
  const result={passed:checks.length,checks,views,errors};await page.evaluate(result=>window.__flatNavigationResult=result,result);return result;
 }catch(error){
  const state={model:await camera(model).catch(()=>null),cp:await camera(canvas).catch(()=>null),drawing:await button('绘图工具').getAttribute('aria-pressed').catch(()=>null)};
  throw Error(`${error.message}; 已通过 ${checks.length} 项; 最近检查=${JSON.stringify(checks.slice(-6))}; 状态=${JSON.stringify(state)}`);
 }finally{await page.mouse.up().catch(()=>{});await page.mouse.up({button:'middle'}).catch(()=>{});page.off('pageerror',onError);await page.evaluate(()=>{window.confirm=window.__flatNavigationConfirm;delete window.__flatNavigationConfirm;}).catch(()=>{});}
}
