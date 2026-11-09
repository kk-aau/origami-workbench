async page => {
  const checks=[],errors=[],saved={},driftResults={};
  const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const origin=await page.evaluate(()=>location.origin);
  const source={vertices_coords:[[0,0],[100,0],[200,0],[200,100],[100,100],[0,100]],edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],edges_assignment:['B','B','B','B','B','B','M'],edges_foldAngle:[0,0,0,0,0,0,-90],faces_vertices:[[0,1,4,5],[1,2,3,4]]};
  const send=message=>page.evaluate(message=>window.postMessage(message,location.origin),message);
  const state=()=>page.locator('#simulation').evaluate(node=>({...node.dataset}));
  let revision='';
  const capture=()=>page.evaluate(revision=>new Promise((resolve,reject)=>{
    const requestId='pose-check-'+crypto.randomUUID(),timer=setTimeout(()=>{window.removeEventListener('message',listener);reject(Error('姿态捕获超时'));},10000);
    const listener=event=>{if(event.data?.type==='zhezhi-sim-pose'&&event.data.requestId===requestId){clearTimeout(timer);window.removeEventListener('message',listener);event.data.error?reject(Error(event.data.error)):resolve(event.data.pose);}};
    window.addEventListener('message',listener);window.postMessage({type:'zhezhi-sim-capture-pose',requestId,revision},location.origin);
  }),revision);
  const delta=(a,b)=>Math.max(...a.map((n,i)=>Math.abs(n-b[i])));
  const projections=pose=>page.evaluate(async pose=>{
    const {prepareSimulationDocument}=await import('/src/engine/simmodel.ts');
    const {OrigamiModel}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/model.ts');
    const {cameraUniforms,projectVertices,centroid,boundingRadius}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera.ts');
    const model=new OrigamiModel(prepareSimulationDocument(pose.source).prepared),center=centroid(model.originalPositions),canvas=document.querySelector('#simulation'),rect=canvas.getBoundingClientRect();
    const camera=cameraUniforms(pose.view,center,boundingRadius(model.originalPositions,center),canvas.width,canvas.height),screen=projectVertices(new Float32Array(pose.solver.positions),camera).screen;
    return pose.solver.positions.filter((_,i)=>i%3===0).map((_,i)=>({x:rect.x+screen[2*i]/canvas.width*rect.width,y:rect.y+screen[2*i+1]/canvas.height*rect.height}));
  },pose);
  const clickPoint=async(index)=>{const points=await projections(await capture());await page.mouse.click(points[index].x,points[index].y);};
  const drag=async(index)=>{const points=await projections(await capture()),p=points[index];await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+12,p.y-7,{steps:5});await page.waitForTimeout(100);};
  const paused=()=>page.waitForFunction(()=>document.querySelector('#simulation').dataset.status==='paused');
  try{
    await page.setViewportSize({width:1100,height:760});
    for(const kind of ['webgl2','cpu']){
      revision='pose-'+kind;await page.goto(`${origin}/simulator/index.html${kind==='cpu'?'?backend=cpu':''}`);
      await page.waitForFunction(()=>document.querySelector('#simulation')?.dataset.status==='ready');
      await send({type:'zhezhi-sim-load',fold:source,revision});await page.waitForFunction(kind=>document.querySelector('#simulation')?.dataset.backend===kind,kind);
      await send({type:'zhezhi-sim-reset'});await paused();await send({type:'zhezhi-sim-camera',preset:'front'});
      check((await state()).backend===kind,`${kind} 使用指定后端`);
      const initial=await capture();check(initial.solver.displacements.length===initial.solver.positions.length,`${kind} 捕获精确位移与绝对坐标`);
      await page.getByRole('button',{name:'固定点',exact:true}).click();await clickPoint(0);
      const fixed=await capture();check(fixed.solver.pins.length===1&&Number((await state()).pinned)===1,`${kind} 单击实际顶点固定`);
      check(await page.locator('#pinned-vertices i').count()===1,`${kind} 固定点有可见标记`);
      await page.getByRole('button',{name:'顶点塑形',exact:true}).click();await drag(0);await page.mouse.up();
      check((await state()).grabbed===undefined&&delta((await capture()).solver.positions,fixed.solver.positions)===0,`${kind} 已固定顶点不能被塑形拖动`);
      await drag(2);await page.mouse.up();await paused();const sculpted=await capture();
      check(delta(sculpted.solver.positions,fixed.solver.positions)>.001,`${kind} 其他顶点可以实际塑形`);
      check(delta(sculpted.solver.positions.slice(0,3),fixed.solver.positions.slice(0,3))<1e-6&&sculpted.solver.pins.length===1,`${kind} 塑形和松手期间固定点不移动`);
      await page.getByRole('button',{name:'撤销',exact:true}).click();check(delta((await capture()).solver.positions,fixed.solver.positions)<1e-6&&(await state()).status==='paused',`${kind} 撤销塑形恢复之前形状并暂停`);
      await page.getByRole('button',{name:'重做',exact:true}).click();check(delta((await capture()).solver.positions,sculpted.solver.positions)<1e-6,`${kind} 重做恢复塑形后形状`);
      await send({type:'zhezhi-sim-camera',preset:'iso'});await page.setViewportSize({width:1040,height:700});
      check(delta((await capture()).solver.positions,sculpted.solver.positions)<1e-6&&Number((await state()).pinned)===1,`${kind} 切视角和缩放窗口保持固定与纸面位置`);
      await page.getByRole('button',{name:'解除全部',exact:true}).click();check(!(await capture()).solver.pins.length,`${kind} 解除全部固定点`);
      await page.keyboard.press('Control+z');check((await capture()).solver.pins.length===1,`${kind} Ctrl+Z 恢复固定点`);
      await page.keyboard.press('Control+Shift+z');check(!(await capture()).solver.pins.length,`${kind} Ctrl+Shift+Z 再次解除固定点`);
      const freed=await capture();await send({type:'zhezhi-sim-reset'});await paused();
      check(delta((await capture()).solver.positions,initial.solver.positions)<1e-6,`${kind} 复位恢复原始纸面`);
      await page.getByRole('button',{name:'撤销',exact:true}).click();check(delta((await capture()).solver.positions,freed.solver.positions)<1e-6,`${kind} 复位也可撤销`);
      await send({type:'zhezhi-sim-camera',preset:'front'});await page.getByRole('button',{name:'固定点',exact:true}).click();await clickPoint(0);
      const pinned=await capture();await clickPoint(0);check(!(await capture()).solver.pins.length,`${kind} 再次点击固定顶点解除`);
      await page.getByRole('button',{name:'撤销',exact:true}).click();check((await capture()).solver.pins.length===1,`${kind} 单点解除也可撤销`);
      saved[kind]=await capture();
      const validation=await page.evaluate(async pose=>{const {validateSimulationPose}=await import('/src/engine/simPose.ts');try{validateSimulationPose(pose);return true;}catch(error){return error.message;}},saved[kind]);
      check(validation===true,`${kind} 实际保存姿态通过完整校验（${validation}）`);
      await send({type:'zhezhi-sim-load',fold:source,revision,pose:saved[kind]});await paused();
      const restored=await capture();check(delta(restored.solver.positions,saved[kind].solver.positions)<1e-6&&restored.solver.pins.length===1,`${kind} 重载姿态保持形状和固定点`);
      const idle=await capture();await page.waitForTimeout(150);check(delta((await capture()).solver.positions,idle.solver.positions)===0,`${kind} 恢复后保持暂停且无漂移`);

      const drift=await page.evaluate(async({kind,free,pinned})=>{
        const {prepareSimulationDocument}=await import('/src/engine/simmodel.ts');const {OrigamiModel}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/model.ts');
        const {ReferenceSolver}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver.ts');const {WebglSolver}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/webgl/webglSolver.ts');
        const model=new OrigamiModel(prepareSimulationDocument(free.source).prepared),element=document.createElement('canvas');element.width=64;element.height=64;
        const solver=kind==='cpu'?new ReferenceSolver(model,free.settings):new WebglSolver(element,model,free.settings),center=positions=>[0,1,2].map(axis=>positions.reduce((sum,n,i)=>sum+(i%3===axis?n:0),0)/(positions.length/3));
        try{solver.restorePose(free.solver);solver.setFoldPercent(free.progress*100);const start=center(solver.capturePose().positions);solver.step(2000);const after=solver.capturePose(),end=center(after.positions);
          solver.restorePose(pinned.solver);solver.setFoldPercent(pinned.progress*100);solver.step(2000);const held=solver.capturePose();return {drift:Math.hypot(...end.map((n,i)=>n-start[i])),finite:after.positions.every(Number.isFinite)&&held.positions.every(Number.isFinite),pinError:Math.max(...held.pins.flatMap(pin=>pin.position.map((n,axis)=>Math.abs(n-held.positions[pin.index*3+axis]))))};
        }finally{solver.dispose();}
      },{kind,free:freed,pinned:saved[kind]});
      driftResults[kind]=drift;check(drift.finite&&drift.drift<1e-5,`${kind} 恢复后求解2000步重心漂移${drift.drift.toExponential(2)}`);check(drift.pinError<1e-6,`${kind} 恢复固定姿态后求解2000步固定点误差${drift.pinError}`);
    }
    for(const kind of ['webgl2','cpu']){
      await page.goto(`${origin}/scripts/fixtures/simulation-pose.html${kind==='cpu'?'?backend=cpu':''}`);
      await page.waitForFunction(()=>window.poseMessages.some(message=>message.status==='ready'));
      await page.evaluate(({pose,kind})=>document.querySelector('iframe').contentWindow.postMessage({type:'zhezhi-sim-load',fold:pose.source,pose,revision:'iframe-'+kind},location.origin),{pose:saved[kind],kind});
      await page.waitForFunction(()=>window.poseMessages.some(message=>message.status==='paused'&&message.poseRestored===true));
      const status=await page.evaluate(()=>window.poseMessages.findLast(message=>message.type==='zhezhi-sim-status'));
      check(status.backend===kind&&status.poseRestored===true&&status.pinnedVertices===1,`${kind} iframe 状态明确报告已恢复姿态及固定点`);
      await page.evaluate(kind=>document.querySelector('iframe').contentWindow.postMessage({type:'zhezhi-sim-capture-pose',requestId:'iframe-capture',revision:'iframe-'+kind},location.origin),kind);
      await page.waitForFunction(()=>window.poseMessages.some(message=>message.requestId==='iframe-capture'));
      const reply=await page.evaluate(()=>window.poseMessages.find(message=>message.requestId==='iframe-capture'));
      check(!reply.error&&delta(reply.pose.solver.positions,saved[kind].solver.positions)<1e-6,`${kind} iframe 请求捕获与恢复后的姿态一致`);
    }
    check(errors.length===0,'固定点与姿态历史全流程无页面异常');return {passed:checks.length,checks,driftResults,errors};
  }finally{page.off('pageerror',onError);}
}
