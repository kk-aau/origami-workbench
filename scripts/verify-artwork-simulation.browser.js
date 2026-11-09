async page=>{
  const checks=[],errors=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);},button=name=>page.getByRole('button',{name,exact:true});
  const pageError=error=>errors.push(error.message);page.on('pageerror',pageError);
  await page.setViewportSize({width:1366,height:768});
  const custom=await page.evaluate(async()=>{const mod=await import('/src/app/simulationPreferences.ts'),next=mod.defaultSimulationPreferences();next.solver={...next.solver,axialStiffness:43,damping:.61,creaseStiffness:.8,maxStepsPerFrame:32};mod.saveSimulationPreferences(next);return next.solver;});
  await page.getByLabel('工程名称',{exact:true}).waitFor();
  for(const name of ['设置并开始使用','关闭窗口','保留当前工程','知道了'])if(await button(name).isVisible().catch(()=>false))await button(name).click();
  await page.evaluate(()=>{
    window.__simArtworkDownloads=[];window.__simArtworkURL=URL.createObjectURL;window.__simArtworkClick=HTMLAnchorElement.prototype.click;window.__simArtworkConfirm=window.confirm;
    window.confirm=()=>true;window.__artworkStatus=[];
    window.addEventListener('message',event=>{if(event.data?.type==='zhezhi-sim-status')window.__artworkStatus.push(event.data);});
    URL.createObjectURL=function(blob){if(blob instanceof Blob)window.__simArtworkDownloads.push(blob.text());return window.__simArtworkURL.call(this,blob);};
    HTMLAnchorElement.prototype.click=function(){if(!this.download)return window.__simArtworkClick.call(this);};
  });
  const upload=async text=>page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,text)=>{const transfer=new DataTransfer();transfer.items.add(new File([text],'simulation.zhezhi-artwork.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},text);
  const save=async()=>{const count=await page.evaluate(()=>window.__simArtworkDownloads.length);await button('保存完整作品').click();await page.waitForFunction(n=>window.__simArtworkDownloads.length>n,count);return page.evaluate(async n=>JSON.parse(await window.__simArtworkDownloads[n]),count);};
  try{
    const plain=await page.evaluate(async()=>{
      const [{blankDoc},{prepareProjectImport},{emptyFoldedModelCollection},{tessPreset},{exportArtworkProject}]=await Promise.all([import('/src/app/state.ts'),import('/src/app/prepareProjectImport.ts'),import('/src/app/foldedModelCollection.ts'),import('/src/app/tessellation.ts'),import('/src/app/artworkProject.ts')]);
      const doc=blankDoc('完整作品三维验收',100,100);doc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'M',angle:-180});
      return exportArtworkProject({editor:prepareProjectImport(doc),models:emptyFoldedModelCollection(),diagram:null,simulation:null,construction:{tessellation:tessPreset('ring'),curve:null}});
    });
    await upload(plain);await page.waitForFunction(()=>document.querySelector('[aria-label="工程名称"]')?.value==='完整作品三维验收');
    await button('三维模拟').click();
    await page.waitForFunction(()=>window.__artworkStatus.some(status=>status.backend&&status.solverSettings?.axialStiffness===43));
    const initialStatus=await page.evaluate(()=>window.__artworkStatus.filter(status=>status.backend).at(-1));
    check(JSON.stringify(initialStatus.solverSettings)===JSON.stringify(custom),'首次载入保留已保存的非默认材质参数，不被backend尚未就绪的状态覆盖');
    await page.locator('iframe[title="三维折叠模拟画布"]').evaluate(frame=>frame.contentWindow.postMessage({type:'zhezhi-sim-pause'},location.origin));
    const saved=await save();check(saved.simulation!==null&&saved.simulation.source&&saved.simulation.solver.positions.length>0,'主应用保存完整作品实际捕获运行iframe的三维姿态');
    check(JSON.stringify(saved.simulation.settings)===JSON.stringify(custom),'三维完整文件包含非默认材质参数');
    saved.editor.name='三维恢复后编辑CP';saved.simulation.solver.pins=[{index:0,position:saved.simulation.solver.positions.slice(0,3)}];
    saved.simulation.progress=.37;saved.simulation.view={yaw:.62,pitch:.41,zoom:1.3};
    await page.evaluate(()=>{window.__artworkStatus=[];});await upload(JSON.stringify(saved));
    await page.waitForFunction(()=>window.__artworkStatus.some(status=>status.poseRestored&&status.backend&&status.status==='paused'));
    const restored=await save(),status=await page.evaluate(()=>window.__artworkStatus.filter(status=>status.backend).at(-1));
    check(status.status==='paused'&&status.poseRestored===true,'完整作品导入重建三维iframe并保持暂停');
    check(restored.simulation.solver.pins.length===1&&restored.simulation.solver.pins[0].index===0,'保存的三维固定点随作品恢复');
    check(restored.simulation.progress===.37&&JSON.stringify(restored.simulation.view)===JSON.stringify(saved.simulation.view),'目标进度与自由视角准确恢复');
    const delta=Math.max(...restored.simulation.solver.positions.map((n,i)=>Math.abs(n-saved.simulation.solver.positions[i])));
    check(delta<1e-6,'导入后保存当前三维顶点形状未因重建产生漂移');
    check(restored.simulation.source.file_title==='完整作品三维验收'&&restored.editor.name==='三维恢复后编辑CP','编辑CP与三维源独立保存，不错误替换已保存姿态的来源');
    await button('保存折痕').click();await page.waitForFunction(()=>document.querySelector('.document-name')?.textContent.includes('折痕已保存'));
    await page.evaluate(()=>{window.__artworkDiscardPrompts=0;window.confirm=()=>{window.__artworkDiscardPrompts++;return false;};});
    await upload(plain);await page.waitForFunction(()=>window.__artworkDiscardPrompts>0&&document.body.textContent.includes('已取消打开完整作品'));
    check(await page.getByLabel('工程名称',{exact:true}).inputValue()==='三维恢复后编辑CP','CP已保存而三维另有姿态时切换工程仍提醒，取消后CP保持');
    await page.evaluate(()=>{window.confirm=()=>true;});const cancelled=await save();
    check(cancelled.simulation.solver.pins.length===1&&cancelled.simulation.progress===.37,'取消切换后当前三维姿态和固定点完整保留');
    await page.screenshot({path:'output/playwright/artwork-simulation-1366x768.png'});
    await button('折痕编辑').click();const hidden=await save();
    check(hidden.simulation!==null&&hidden.simulation.solver.pins.length===1,'切换回折痕工作区后仍可完整保存已暂停三维姿态');
    const dimensions=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,header:document.querySelector('.app-header').getBoundingClientRect().right,buttons:[...document.querySelectorAll('.app-header button')].map(el=>el.getBoundingClientRect().right)}));
    check(dimensions.page<=dimensions.viewport+1&&dimensions.buttons.every(right=>right<=dimensions.viewport+1),'1366×768视口新增完整作品按钮未造成页面或页眉水平溢出');
    await page.screenshot({path:'output/playwright/artwork-project-1366x768.png'});
    check(errors.length===0,`完整作品三维集成没有运行时异常 (${errors.join('; ')})`);
    return {passed:checks.length,checks,delta,dimensions,backend:status.backend,errors};
  }catch(error){const status=await page.evaluate(()=>window.__artworkStatus?.slice(-3));throw Error(`${error.message}; 已通过 ${checks.length} 项；status=${JSON.stringify(status)}`);}
  finally{page.off('pageerror',pageError);await page.evaluate(()=>{window.confirm=window.__simArtworkConfirm;URL.createObjectURL=window.__simArtworkURL;HTMLAnchorElement.prototype.click=window.__simArtworkClick;}).catch(()=>{});}
}
