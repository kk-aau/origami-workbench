async page => {
  const checks=[],errors=[],results={};
  const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const origin=await page.evaluate(()=>location.origin);
  const source={vertices_coords:[[0,0],[100,0],[200,0],[200,100],[100,100],[0,100]],edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],edges_assignment:['B','B','B','B','B','B','M'],edges_foldAngle:[0,0,0,0,0,0,-90],faces_vertices:[[0,1,4,5],[1,2,3,4]]};
  const send=message=>page.evaluate(message=>document.querySelector('iframe').contentWindow.postMessage(message,location.origin),message);
  const status=()=>page.evaluate(()=>window.poseMessages.findLast(m=>m.type==='zhezhi-sim-status'));
  let revision='';
  const capture=async(finishGesture=true)=>{
    const requestId='angles-'+Date.now()+'-'+Math.random();await send({type:'zhezhi-sim-capture-pose',requestId,revision,finishGesture});
    await page.waitForFunction(id=>window.poseMessages.some(m=>m.type==='zhezhi-sim-pose'&&m.requestId===id),requestId);
    return page.evaluate(id=>window.poseMessages.find(m=>m.type==='zhezhi-sim-pose'&&m.requestId===id),requestId);
  };
  const waitPaused=()=>page.waitForFunction(()=>window.poseMessages.findLast(m=>m.type==='zhezhi-sim-status')?.status==='paused');
  try{
    for(const kind of ['webgl2','cpu']){
      revision='convergence-'+kind;
      await page.goto(`${origin}/scripts/fixtures/simulation-pose.html${kind==='cpu'?'?backend=cpu':''}`);
      await page.waitForFunction(()=>window.poseMessages.some(m=>m.status==='ready'));
      await send({type:'zhezhi-sim-load',fold:source,revision});
      await page.waitForFunction(kind=>window.poseMessages.some(m=>m.status==='loaded'&&m.backend===kind),kind);
      check((await status()).solveState==='solving',`${kind} 初始求解状态明确为进行中`);
      await send({type:'zhezhi-sim-reset'});await waitPaused();
      const initial=(await capture()).pose;check(!!initial,`${kind} 初始姿态可捕获`);
      let current=await status();check(current.solveState==='paused'&&current.angleDiagnostics.status==='available'&&current.angleDiagnostics.maxAbsoluteErrorDegrees<1e-6,`${kind} 复位显示用户暂停和真实零偏差`);
      const locked=JSON.parse(JSON.stringify(initial));locked.progress=1;
      locked.solver.pins=locked.solver.positions.filter((_,i)=>i%3===0).map((_,index)=>({index,position:locked.solver.positions.slice(index*3,index*3+3)}));
      await send({type:'zhezhi-sim-load',fold:source,revision,pose:locked});await waitPaused();
      current=await status();check(current.pinnedVertices===locked.solver.pins.length&&current.solveState==='paused',`${kind} 全固定恢复态保持暂停`);
      check(current.angleDiagnostics.creaseCount===1&&Math.abs(current.angleDiagnostics.maxAbsoluteErrorDegrees-90)<1e-6&&Math.abs(current.angleDiagnostics.worstSignedErrorDegrees-90)<1e-6,`${kind} 被锁平纸面仍正确报告目标角偏差 +90°`);
      await send({type:'zhezhi-sim-resume'});
      await page.waitForFunction(()=>window.poseMessages.findLast(m=>m.type==='zhezhi-sim-status')?.solveState==='low-velocity');
      current=await status();check(current.maxVelocity===0&&Math.abs(current.angleDiagnostics.maxAbsoluteErrorDegrees-90)<1e-6,`${kind} 低速暂稳不伪装为目标角达成`);
      await send({type:'zhezhi-sim-camera',preset:'front'});
      await page.waitForFunction(()=>window.poseMessages.findLast(m=>m.type==='zhezhi-sim-status')?.view==='front');
      check((await status()).solveState==='low-velocity',`${kind} 切视角保留暂稳状态`);
      await send({type:'zhezhi-sim-pause'});await waitPaused();
      check((await status()).solveState==='paused',`${kind} 用户暂停区别于自动暂稳`);
      await send({type:'zhezhi-sim-reset'});await waitPaused();
      const frame=page.frames().find(frame=>frame.url().includes('/simulator/index.html'));
      const canvas=frame.locator('#simulation'),box=await canvas.boundingBox();
      await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
      await page.mouse.move(box.x+box.width*.5+20,box.y+box.height*.5+10,{steps:3});
      const yaw1=Number(await canvas.getAttribute('data-yaw'));
      const busy=await capture(false);check(busy.error==='三维交互进行中，稍后暂存',`${kind} 自动暂存遇到视角拖动明确跳过`);
      await page.mouse.move(box.x+box.width*.5+50,box.y+box.height*.5+10,{steps:3});
      check(Math.abs(Number(await canvas.getAttribute('data-yaw'))-yaw1)>.01,`${kind} 自动暂存不打断持续视角拖动`);
      await page.mouse.up();check(!!(await capture(false)).pose,`${kind} 松手后自动暂存恢复可用`);
      await send({type:'zhezhi-sim-camera',preset:'front'});
      await page.waitForFunction(()=>window.poseMessages.findLast(m=>m.type==='zhezhi-sim-status')?.view==='front');
      const pose=(await capture()).pose;
      const point=await frame.evaluate(async pose=>{
        const {prepareSimulationDocument}=await import('/src/engine/simmodel.ts');
        const {OrigamiModel}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/model.ts');
        const {cameraUniforms,projectVertices,centroid,boundingRadius}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera.ts');
        const model=new OrigamiModel(prepareSimulationDocument(pose.source).prepared),center=centroid(model.originalPositions),canvas=document.querySelector('#simulation'),rect=canvas.getBoundingClientRect();
        const camera=cameraUniforms(pose.view,center,boundingRadius(model.originalPositions,center),canvas.width,canvas.height),screen=projectVertices(new Float32Array(pose.solver.positions),camera).screen;
        return {x:rect.x+screen[4]/canvas.width*rect.width,y:rect.y+screen[5]/canvas.height*rect.height};
      },pose);
      await frame.getByRole('button',{name:'顶点塑形',exact:true}).click();
      await page.mouse.move(point.x+box.x,point.y+box.y);await page.mouse.down();await page.mouse.move(point.x+box.x+7,point.y+box.y-4,{steps:3});
      check((await capture(false)).error==='三维交互进行中，稍后暂存',`${kind} 自动暂存遇到塑形拖动明确跳过`);
      check(await canvas.getAttribute('data-grabbed')!==null,`${kind} 自动暂存不会解除塑形约束`);
      check(!!(await capture()).pose&&await canvas.getAttribute('data-grabbed')===null,`${kind} 手动保存仍然结束手势并捕获姿态`);
      await page.mouse.up();

      const actual=await page.evaluate(async({kind,source})=>{
        const {prepareSimulationDocument}=await import('/src/engine/simmodel.ts');const {OrigamiModel}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/model.ts');
        const {ReferenceSolver}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver.ts');const {WebglSolver}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/webgl/webglSolver.ts');
        const {SimulationAngleAnalyzer}=await import('/src/engine/simConvergence.ts');
        const {prepared}=prepareSimulationDocument(source),model=new OrigamiModel(prepared),element=document.createElement('canvas');element.width=64;element.height=64;
        const solver=kind==='cpu'?new ReferenceSolver(model,{foldPercent:50,timeStepScale:.35,damping:.5}):new WebglSolver(element,model,{foldPercent:50,timeStepScale:.35,damping:.5});
        try{solver.step(1200);const before=solver.capturePose(),velocity=solver.maxVelocity(),steps=solver.stepCount;
          const positions=new Float32Array(prepared.vertexCount*3),history=new Float32Array(prepared.creaseParams.length),analyzer=new SimulationAngleAnalyzer(prepared);
          const count=solver.readCreaseAngles(history);solver.readPositions(positions);analyzer.measure(positions,history);const diagnostic=analyzer.evaluate(.5),after=solver.capturePose();
          return {diagnostic,count,creases:prepared.creaseParams.length,unchanged:JSON.stringify(before)===JSON.stringify(after)&&steps===solver.stepCount&&velocity===solver.maxVelocity(),history:JSON.stringify(Array.from(history))===JSON.stringify(before.creaseAngles)};
        }finally{solver.dispose();}
      },{kind,source});
      results[kind]=actual;
      check(actual.count===actual.creases&&actual.history,`${kind} 实际角度读回与纹理/CPU状态一致`);
      check(actual.unchanged,`${kind} 诊断不修改姿态、固定点、速度或步数`);
      check(actual.diagnostic.status==='available'&&actual.diagnostic.meanAbsoluteErrorDegrees<45,`${kind} 实际求解后角度偏差降低`);
    }
    await page.goto(`${origin}/scripts/fixtures/simulation-pose.html?backend=cpu`);
    await page.waitForFunction(()=>window.poseMessages.some(m=>m.status==='ready'));
    const animation=await page.evaluate(async source=>{
      const {prepareSimulationDocument}=await import('/src/engine/simmodel.ts');const {OrigamiModel}=await import('/vendor/simulator/oristudio/packages/origami-simulator/src/model.ts');
      const {simulationSourceSignature}=await import('/src/engine/simLayerOrder.ts');
      const {prepared}=prepareSimulationDocument(source),model=new OrigamiModel(prepared);
      return {version:1,sourceSignature:simulationSourceSignature(source),initialPositions:Array.from(model.originalPositions),ranges:prepared.creaseParams.map(c=>({edge:c.edge,fromAngle:0,toAngle:c.targetAngle})),fixedVertices:prepared.fold.vertices_coords.flatMap((p,i)=>p[0]<=100?[i]:[])};
    },source);
    await send({type:'zhezhi-sim-load',fold:source,revision:'step-angle-unavailable',animation});
    await page.waitForFunction(()=>window.poseMessages.some(m=>m.status==='loaded'&&m.animation));
    check((await status()).angleDiagnostics.status==='unavailable'&&/独立姿态轨迹/.test((await status()).angleDiagnostics.reason),'步骤动画明确不把轨迹目标当作实测折角');
    await send({type:'zhezhi-sim-progress',value:.6});await waitPaused();
    check((await status()).angleDiagnostics.status==='unavailable'&&(await status()).solveState==='paused','步骤动画更新后也不误报角度达成或低速收敛');
    check(errors.length===0,'全部真实浏览器检查无页面异常');
    return {passed:checks.length,checks,results};
  }finally{page.off('pageerror',onError);}
}
