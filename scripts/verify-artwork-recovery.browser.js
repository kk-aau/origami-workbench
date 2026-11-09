async page=>{
  const fixtureName='完整恢复闭环验收-'+Date.now();
  const checks=[],errors=[],check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
  const button=name=>page.getByRole('button',{name,exact:true});
  page.on('pageerror',error=>errors.push(error.message));
  page.removeAllListeners('dialog');
  await page.unroute('**/api/artwork-recovery');
  await page.setViewportSize({width:1366,height:768});
  const setup=async()=>{
    await page.getByLabel('工程名称',{exact:true}).waitFor();
    for(const name of ['设置并开始使用','关闭窗口','保留当前工程','知道了'])if(await button(name).isVisible().catch(()=>false))await button(name).click();
    await page.evaluate(()=>{
      window.confirm=()=>true;window.__recoveryDownloads=[];
      const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
      URL.createObjectURL=function(blob){window.__recoveryDownloads.push(blob.text());return create.call(this,blob);};
      HTMLAnchorElement.prototype.click=function(){if(!this.download)return click.call(this);};
    });
  };
  const list=()=>page.evaluate(async()=>{const {createArtworkRecoveryStore}=await import('/src/app/artworkRecovery.ts');return (await createArtworkRecoveryStore().list()).entries;});
  const save=async()=>{
    const n=await page.evaluate(()=>window.__recoveryDownloads.length);await button('保存完整作品').click();
    await page.waitForFunction(n=>window.__recoveryDownloads.length>n,n);
    return page.evaluate(async n=>JSON.parse(await window.__recoveryDownloads[n]),n);
  };
  await setup();
  const fixture=await page.evaluate(async fixtureName=>{
    const [{blankDoc},{prepareProjectImport},{buildFold},{computeFlatFold},models,diagram,{tessPreset},{exportArtworkProject},{prepareSimulationDocument},{OrigamiModel},{ReferenceSolver},{DEFAULT_SIMULATION_SOLVER_SETTINGS}]=await Promise.all([
      import('/src/app/state.ts'),import('/src/app/prepareProjectImport.ts'),import('/src/core/geometry.ts'),import('/src/core/flatFold.ts'),import('/src/app/foldedModelCollection.ts'),import('/src/app/diagramProject.ts'),import('/src/app/tessellation.ts'),import('/src/app/artworkProject.ts'),import('/src/engine/simmodel.ts'),import('/vendor/simulator/oristudio/packages/origami-simulator/src/model.ts'),import('/vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver.ts'),import('/src/engine/simSettings.ts')]);
    const editor=blankDoc(fixtureName,100,100);editor.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'M',angle:-180});
    editor.objects=[{id:'circle',kind:'circle',center:[25,30],radius:8,color:'#367d86'}];
    const doc=prepareProjectImport(editor),fold=buildFold(doc).graph,model=computeFlatFold(doc);
    const collection=models.foldedModelCollectionReducer(models.emptyFoldedModelCollection(),{type:'add',id:'saved-model',name:'保留平折模型',source:{doc,graph:fold},result:model});
    let drawing=diagram.createDiagramProject(doc);drawing=diagram.updateDiagramStep(drawing,drawing.activeStepId,{title:'恢复前标题'});
    const settings={...DEFAULT_SIMULATION_SOLVER_SETTINGS},backend=new ReferenceSolver(new OrigamiModel(prepareSimulationDocument(fold).prepared));
    backend.setMaterial(settings);backend.setFoldPercent(20);backend.step(80);backend.arrestDynamics();
    const raw=backend.capturePose();raw.pins=[{index:0,position:raw.positions.slice(0,3)}];
    const simulation={version:1,source:fold,solver:raw,progress:.2,settings,view:{yaw:.7,pitch:.4,zoom:1.1}};backend.dispose();
    return exportArtworkProject({editor:doc,models:collection,diagram:drawing,simulation,construction:{tessellation:tessPreset('ring'),curve:null}});
  },fixtureName);
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,text)=>{const transfer=new DataTransfer();transfer.items.add(new File([text],'recovery.zhezhi-artwork.json'));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},fixture);
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,fixtureName);
  const sim=page.frameLocator('iframe[title="三维折叠模拟画布"]');
  await sim.locator('#simulation[data-status="paused"]').waitFor();
  let original;
  for(let attempt=0;attempt<80&&!original;attempt++){
    original=(await list()).find(entry=>entry.name===fixtureName&&entry.simulation&&entry.models===1&&entry.steps===1);
    if(!original)await page.waitForTimeout(200);
  }
  check(!!original,'未点击下载也自动写入含模型、折序、三维的完整磁盘副本');
  await page.getByRole('button',{name:/^作品总览/}).click();
  check(await page.getByRole('table',{name:'当前作品内容'}).getByText('当前姿态、固定点与视角').isVisible(),'总览明确列出当前三维保存范围');
  await page.screenshot({path:'output/playwright/artwork-recovery-overview.png'});
  await button('关闭窗口').click();
  await page.evaluate(()=>window.addEventListener('beforeunload',event=>event.stopImmediatePropagation(),{capture:true}));
  await page.reload();await setup();
  check((await list()).some(entry=>entry.id===original.id&&entry.revision===original.revision),'刷新后磁盘副本仍存在且未被启动空白作品覆盖');
  await page.getByRole('button',{name:/^作品总览/}).click();
  await page.locator('.artwork-recovery-list li').filter({hasText:fixtureName}).first().getByRole('button',{name:'恢复此作品'}).click();
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,fixtureName);
  await sim.locator('#simulation[data-status="paused"]').waitFor();
  const restored=await save(),expected=JSON.parse(fixture);
  check(restored.editor.objects[0].radius===8&&restored.models.entries[0].name==='保留平折模型','刷新恢复保留辅助圆、模型与来源');
  check(restored.diagram.steps[0].title==='恢复前标题'&&restored.construction.tessellation.family==='ring','刷新恢复保留折序和独立构造参数');
  check(restored.simulation.solver.pins.length===1&&restored.simulation.progress===.2&&JSON.stringify(restored.simulation.view)===JSON.stringify(expected.simulation.view),'刷新恢复保留固定点、目标比例与自由视角');
  const delta=Math.max(...restored.simulation.solver.positions.map((value,index)=>Math.abs(value-expected.simulation.solver.positions[index])));
  check(delta<1e-6,'刷新恢复后形状没有漂移');
  await sim.getByRole('button',{name:'解除全部',exact:true}).click();
  await sim.locator('#simulation[data-pinned="0"]').waitFor();
  await sim.getByRole('button',{name:'撤销',exact:true}).click();
  await sim.locator('#simulation[data-pinned="1"]').waitFor();
  check((await save()).simulation.solver.pins.length===1,'恢复后继续操作固定点、撤销并再次导出成功');
  await button('折序绘图').click();
  await page.getByRole('button',{name:/^作品总览/}).click();
  await button('立即暂存完整作品').click();
  await page.waitForFunction(()=>document.querySelector('.artwork-recovery-status')?.textContent.includes('已暂存'));
  const newEntries=await list();
  check(newEntries.filter(entry=>entry.name===fixtureName).length>=2,'恢复到新窗口的新记录，不接管或覆盖旧窗口副本');
  check(newEntries.some(entry=>entry.id===original.id&&entry.revision===original.revision),'恢复和后续编辑均保留旧版副本');
  await button('关闭窗口').click();await button('三维模拟').click();
  await page.route('**/api/artwork-recovery',route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'验收模拟磁盘写入失败'})}):route.continue());
  await page.getByLabel('工程名称',{exact:true}).fill('磁盘失败后当前作品');
  await page.getByRole('button',{name:/^作品总览/}).click();
  await button('立即暂存完整作品').click();
  await page.getByRole('alert').filter({hasText:'验收模拟磁盘写入失败'}).waitFor();
  check((await list()).every(entry=>entry.name!=='磁盘失败后当前作品'),'写入失败不替换上一次成功副本');
  await page.unroute('**/api/artwork-recovery');await button('立即暂存完整作品').click();
  await page.waitForFunction(()=>document.querySelector('.artwork-recovery-status')?.textContent.includes('已暂存'));
  check((await list()).some(entry=>entry.name==='磁盘失败后当前作品'),'修复存储后重试保存当前全部内容');
  await button('关闭窗口').click();
  const dimensions=await page.evaluate(()=>({width:innerWidth,page:document.documentElement.scrollWidth,nav:document.querySelector('.workspaces').scrollWidth}));
  check(dimensions.page<=dimensions.width+1&&dimensions.nav<=dimensions.width+1,'1366×768工作区导航无新增横向滚动');
  check(errors.length===0,`无运行时异常：${errors.join(';')}`);
  return {passed:checks.length,checks,delta,dimensions};
}
