async page=>{
 const checks=[],runs=[],errors=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const send=message=>page.evaluate(data=>window.postMessage(data,location.origin),message);
 const state=()=>page.locator('#simulation').evaluate(element=>({...element.dataset,message:document.querySelector('#status')?.textContent??''}));
 const noContactPause=sample=>!Object.hasOwn(sample,'contactStatus')&&!Object.hasOwn(sample,'contactFaces')&&
  !/纸面(?:穿越|接触)|接触检查|检测到.*穿越|退回安全姿态|尚未达到/.test(sample.message);
 const waitStatus=expected=>page.waitForFunction(status=>document.querySelector('#simulation')?.dataset.status===status,expected,{timeout:30000});
 const pause=async()=>{
  await send({type:'zhezhi-sim-pause'});await waitStatus('paused');return state();
 };
 const exported=async()=>{
  const waiting=page.waitForEvent('download');await send({type:'zhezhi-sim-export-fold'});const download=await waiting;
  const stream=await download.createReadStream();if(!stream)throw Error('FOLD 实际下载流为空');
  const parts=[];for await(const chunk of stream)parts.push(Array.from(chunk));
  if(await download.failure())throw Error(`FOLD 下载失败: ${await download.failure()}`);
  return page.evaluate(parts=>JSON.parse(new TextDecoder().decode(new Uint8Array(parts.flat()))),parts);
 };
 const foldSteps=fold=>Number(fold.frame_title?.match(/·\s*(\d+)\s*步\s*$/)?.[1]);
 const checkFold=(fold,label)=>{
  check(Number.isInteger(foldSteps(fold)),`${label}: 下载 FOLD 记录实际求解步数`);
  check(fold.vertices_coords.length>=3&&fold.vertices_coords.every(point=>point.length===3&&point.every(Number.isFinite)),`${label}: 实际导出三维坐标有限`);
  const metadata=[fold.frame_title,fold.frame_description].filter(Boolean).join('\n');
  check(!/纸面(?:穿越|接触)|接触检查|退回安全姿态|尚未达到|contact(?:Status|Faces|Pause)/i.test(metadata)&&
   !['contact','contactStatus','contactFaces','contactPause','selfContact'].some(key=>Object.hasOwn(fold,key)),`${label}: FOLD 无穿越保护暂停标记`);
 };
 const pageError=error=>errors.push(error.message);page.on('pageerror',pageError);
 try{
  for(const backend of ['webgl2','cpu'])for(const [fixture,previousStop] of [['default-ring',156],['saved-accordion',208]]){
   const label=`${backend}/${fixture}`;
   await page.goto(`http://127.0.0.1:8898/simulator/index.html${backend==='cpu'?'?backend=cpu':''}`);
   await page.waitForFunction(()=>document.querySelector('#simulation')?.dataset.status==='ready',null,{timeout:60000});
   const fold=await page.evaluate(async name=>{
    const response=await fetch(`/tests/fixtures/simulation-self-contact-${name}.fold.json`);
    if(!response.ok)throw Error(`fixture HTTP ${response.status}`);return response.json();
   },fixture);
   await send({type:'zhezhi-sim-progress',value:1});
   await send({type:'zhezhi-sim-load',fold,revision:`no-contact-guard-${backend}-${fixture}`});
   await page.waitForFunction(()=>['loaded','running','paused','error'].includes(document.querySelector('#simulation')?.dataset.status),null,{timeout:60000});
   let paused;
   // dataset.steps is a status sample, not a live solver clock. Pause the
   // solver to refresh it before comparing against the former stop points.
   for(let attempt=0;attempt<120;attempt++){
    const sample=await state();
    check(sample.status!=='error',`${label}: 推进阶段无数值错误${attempt?` #${attempt}`:''} (${sample.message})`);
    await page.waitForTimeout(150);paused=await pause();
    if(Number(paused.steps)>previousStop)break;
    check(noContactPause(paused),`${label}: 未越过旧停点前无接触暂停 #${attempt}`);
    await send({type:'zhezhi-sim-resume'});
   }
   check(paused.backend===backend,`${label}: 使用指定实际后端`);
   check(paused.targetProgress==='1'&&Number(paused.steps)>previousStop,`${label}: 目标 100% 实际步数 ${paused.steps} 超过原停点 ${previousStop}`);
   check(noContactPause(paused),`${label}: 暂停状态不含接触保护字段或文案`);
   const beforeStep=await exported();checkFold(beforeStep,`${label}/before-step`);
   check(foldSteps(beforeStep)===Number(paused.steps),`${label}: 暂停 dataset 与实际下载步数一致`);
   const actualBefore=foldSteps(beforeStep);
   await send({type:'zhezhi-sim-step'});
   await page.waitForFunction(expected=>{
    const dataset=document.querySelector('#simulation')?.dataset;
    return dataset?.status==='error'||dataset?.status==='paused'&&Number(dataset.steps)===expected;
   },actualBefore+20,{timeout:30000});
   const stepped=await state();
   check(stepped.status==='paused'&&Number(stepped.steps)===actualBefore+20,`${label}: 单步完整推进 20 个数值步`);
   check(noContactPause(stepped),`${label}: 单步没有触发接触暂停`);
   const baseline=await exported();checkFold(baseline,`${label}/after-step`);
   check(foldSteps(baseline)===actualBefore+20,`${label}: 实际下载验证单步增量为 20`);
   for(const style of ['crease','assignment','crease']){
    await send({type:'zhezhi-sim-crease-style',style});
    await page.waitForFunction(expected=>document.querySelector('#simulation')?.dataset.creaseStyle===expected,style);
    check((await state()).creaseStyle===style,`${label}: 折痕样式 ${style} 切换成功`);
   }
   await send({type:'zhezhi-sim-camera',preset:'back'});
   await page.waitForFunction(()=>document.querySelector('#simulation')?.dataset.view==='back');
   await page.getByRole('button',{name:'视角复位',exact:true}).click();
   const box=await page.locator('#simulation').boundingBox();if(!box)throw Error(`${label}: 模拟画布不可见`);
   await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55);await page.mouse.down();
   await page.mouse.move(box.x+box.width*.5+35,box.y+box.height*.55+24,{steps:8});await page.mouse.up();
   await page.waitForFunction(()=>document.querySelector('#simulation')?.dataset.view==='free');
   await page.waitForTimeout(160);
   const afterOrbit=await exported(),orbitState=await state();checkFold(afterOrbit,`${label}/after-orbit`);
   check(JSON.stringify(afterOrbit.vertices_coords)===JSON.stringify(baseline.vertices_coords),`${label}: 切换样式与旋转后暂停坐标完全不漂移`);
   check(JSON.stringify(afterOrbit.edges_assignment)===JSON.stringify(baseline.edges_assignment),`${label}: 样式与相机不改变山谷赋型`);
   check(orbitState.status==='paused'&&foldSteps(afterOrbit)===actualBefore+20&&Number(orbitState.steps)===actualBefore+20,`${label}: 样式与相机不推进求解步数`);
   check(noContactPause(orbitState),`${label}: 视角操作后仍无接触暂停状态`);
   await page.screenshot({path:`output/playwright/simulation-no-contact-guard-${backend}-${fixture}.png`});
   runs.push({backend,fixture,previousStop,pausedSteps:actualBefore,singleStepSteps:foldSteps(baseline),afterOrbitSteps:foldSteps(afterOrbit),frameTitle:afterOrbit.frame_title});
  }
  check(errors.length===0,`两个后端与两个复现工程均无页面异常 (${errors.join('; ')})`);
  return {passed:checks.length,checks,runs,errors};
 }catch(error){
  const latest=await state().catch(()=>null);
  throw Error(`${error.message}; 已通过 ${checks.length} 项; 状态=${JSON.stringify(latest)}`);
 }finally{page.off('pageerror',pageError);}
}
