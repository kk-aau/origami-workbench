async page=>{
 const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const response=predicate=>page.waitForResponse(r=>{
   if(!r.url().endsWith('/api/tessellate'))return false;
   try{return predicate(r.request().postDataJSON());}catch{return false;}
 });
 await page.setViewportSize({width:1000,height:720});
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 await button('镶嵌设计').click();await button('11 分裂扭转').click();
 let wait=response(p=>p.variant==='unit-offset');
 await page.getByLabel('分裂方式',{exact:true}).selectOption('unit-offset');
 let r=await(await wait).json();
 check(r.source.variant==='unit-offset'&&r.source.split===true&&r.source.unitQuadrilateral.sideIndex===2,'原版单位四边形偏置分裂生成精确折痕');
 check(r.stats.checks.geometry.status==='passed'&&r.stats.checks.local.status==='passed','默认几何和局部平折检查通过');
 const initial=JSON.stringify(r.mother.vertices_coords);
 await button('计算平折').click();
 await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent?.includes('层序已解'));
 check(await page.locator('[data-tess-flat-face]').count()>0,'默认赋型在同一画布生成已解层序的平折面');
 check(await page.locator('.inspector').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'1000×720 参数侧栏无需滚动');
 wait=response(p=>p.variant==='unit-offset'&&p.angles?.join(',')==='72,85,95');
 await page.getByLabel('内角 1',{exact:true}).fill('72');r=await(await wait).json();
 check(JSON.stringify(r.mother.vertices_coords)!==initial&&r.source.unitQuadrilateral.angles[0]===72,'内角变化重建四边形母结构');
 const angleShape=JSON.stringify(r.mother.vertices_coords);
 wait=response(p=>p.variant==='unit-offset'&&p.side===1.05);
 await page.getByLabel('指定边长',{exact:true}).fill('1.05');r=await(await wait).json();
 check(JSON.stringify(r.mother.vertices_coords)!==angleShape&&r.source.unitQuadrilateral.side===1.05,'指定边长变化重建母结构');
 const sideShape=JSON.stringify(r.mother.vertices_coords);
 wait=response(p=>p.variant==='unit-offset'&&p.sideIndex===4);
 await page.getByLabel('单位四边形指定边',{exact:true}).selectOption('4');r=await(await wait).json();
 check(JSON.stringify(r.mother.vertices_coords)!==sideShape&&r.source.unitQuadrilateral.sideIndex===4,'指定边序号变化重建母结构');
 for(const [index,value] of [[1,'20'],[2,'20'],[3,'20']]){
   if(index===3)wait=response(p=>p.variant==='unit-offset'&&p.angles?.join(',')==='20,20,20');
   await page.getByLabel(`内角 ${index}`,{exact:true}).fill(value);
 }
 const bad=await wait;check(bad.status()===422,'不可能的内角组合明确拒绝');
 await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.textContent==='参数需调整');
 check(await button('采用折痕副本 →').isDisabled(),'无效组合不能采用');
 for(const [index,value] of [[1,'72'],[2,'85'],[3,'95']]){
   if(index===3)wait=response(p=>p.variant==='unit-offset'&&p.angles?.join(',')==='72,85,95'&&p.sideIndex===4);
   await page.getByLabel(`内角 ${index}`,{exact:true}).fill(value);
 }
 r=await(await wait).json();check(r.stats.checks.geometry.status==='passed'&&await button('采用折痕副本 →').isEnabled(),'恢复合法角度后恢复可采用候选');
 await button('采用折痕副本 →').click();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();
 await button('镶嵌设计').click();await button('01 单元扭转').click();
 wait=response(p=>p.variant==='unit-offset'&&p.sideIndex===4&&p.side===1.05&&p.angles?.join(',')==='72,85,95');
 await button('读取工程参数').click();r=await(await wait).json();
 check(r.source.unitQuadrilateral.sideIndex===4&&r.source.unitQuadrilateral.side===1.05&&r.source.unitQuadrilateral.angles.join(',')==='72,85,95','保存恢复保留原版角度与指定边参数');
 return {passed:checks.length,checks};
}
