async page=>{
 await page.goto('http://127.0.0.1:8898/simulator/index.html');
 const result=await page.evaluate(async()=>{
  const vendor='/vendor/simulator/oristudio/packages/origami-simulator/src/';
  const {WebglSolver}=await import(vendor+'webgl/webglSolver.ts');
  const {OrigamiModel}=await import(vendor+'model.ts');
  const {ReferenceSolver}=await import(vendor+'referenceSolver.ts');
  const {SimulationClock}=await import(vendor+'simulationClock.ts');
  const {meshTopologyFor}=await import(vendor+'webgl/meshRenderer.ts');
  const {projectVertices,centroid,boundingRadius,cameraUniforms}=await import(vendor+'webgl/camera.ts');
  const {renderMeshToSvg}=await import(vendor+'svgRenderer.ts');
  const {prepareSimulationDocument}=await import('/src/engine/simmodel.ts');
  const {SimulationSurfaceLayers}=await import('/src/engine/simSurfaceLayers.ts');
  const {SimulationRasterizer}=await import('/src/engine/simRaster.ts');
  const checks=[],metrics={},check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
  const size=192;
  const camera={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],scale:90,width:size,height:size,depthRange:2,camDist:3.2};
  const reverseCamera={...camera,rotation:[-1,0,0,0,1,0,0,0,-1]};
  const settings={frontColor:[1,0,0],backColor:[0,0,1],background:[1,1,1],mountainColor:[1,0,0],valleyColor:[0,0,1],borderColor:[0,0,0],lightDir:[0,0,1],creaseWidthPx:2,creaseDepthBias:.000002,creaseWritesDepth:false,showFaces:true,showEdges:false,lighting:false,faceAlpha:1};
  const source={vertices_coords:[[0,0],[1,0],[2,0],[2,1],[1,1],[0,1]],edges_vertices:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],edges_assignment:['B','B','B','B','B','B','M'],edges_foldAngle:[null,null,null,null,null,null,-180],faces_vertices:[[0,1,4,5],[1,2,3,4]]};
  const {prepared}=prepareSimulationDocument(source),sourceText=JSON.stringify(source),model=new OrigamiModel(prepared);
  const original=model.originalPositions.slice(),radius=boundingRadius(original,centroid(original));
  const cpu=new ReferenceSolver(model,{foldPercent:100,timeStepScale:.35,damping:.5});
  const gpuCanvas=document.createElement('canvas');gpuCanvas.width=size;gpuCanvas.height=size;
  const gpu=new WebglSolver(gpuCanvas,new OrigamiModel(prepared),{foldPercent:100,timeStepScale:.35,damping:.5});
  const gallery=document.createElement('main');
  document.body.replaceChildren(gallery);document.body.style.cssText='margin:0;padding:18px;background:#f0f4f1;color:#183c31;font:14px sans-serif';
  gallery.style.cssText='display:grid;grid-template-columns:repeat(4,208px);gap:12px;align-items:start';
  const heading=document.createElement('h2');heading.textContent='100% 折叠：真实 GPU / CPU / SVG 遮挡验证';heading.style.gridColumn='1/-1';gallery.append(heading);
  const addImage=(title,pixels,width=size,height=size)=>{
   const figure=document.createElement('figure');figure.style.cssText='margin:0;background:white;padding:8px;border:1px solid #b8cec2';
   const caption=document.createElement('figcaption');caption.textContent=title;caption.style.cssText='min-height:34px;font-size:12px;line-height:1.4';
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.style.cssText='width:192px;max-height:192px;object-fit:contain';
   canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);figure.append(caption,canvas);gallery.append(figure);
  };
  const preparedFor=(positions,indices,mountainEdge)=>{
   const faces=Array.from({length:indices.length/3},(_,i)=>Array.from(indices.slice(i*3,i*3+3))),edges=[],edgesFaces=[],keys=new Map();
   const facesEdges=faces.map((face,f)=>face.map((a,k)=>{
    const b=face[(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;let edge=keys.get(key);
    if(edge===undefined){edge=edges.length;keys.set(key,edge);edges.push([a,b]);edgesFaces.push([]);}edgesFaces[edge].push(f);return edge;
   }));
   const assignments=edges.map(([a,b],e)=>mountainEdge&&((a===mountainEdge[0]&&b===mountainEdge[1])||(b===mountainEdge[0]&&a===mountainEdge[1]))?'M':edgesFaces[e].length===2?'F':'B');
   return {vertexCount:positions.length/3,faceCount:faces.length,edgeCount:edges.length,positions,originalPositions:positions.slice(),indices:new Uint32Array(indices),edgesVertices:edges,edgesAssignment:assignments,edgesFaces,facesVertices:faces,facesEdges,edgesFoldAngle:assignments.map(a=>a==='M'?-180:0),creaseParams:[],colors:new Float32Array(positions.length),diagnostics:{warnings:[],errors:[]},fold:{vertices_coords:Array.from({length:positions.length/3},(_,i)=>Array.from(positions.slice(i*3,i*3+3))),edges_vertices:edges,edges_assignment:assignments,faces_vertices:faces}};
  };
  const frameFor=mesh=>({positions:mesh.positions,topology:meshTopologyFor(mesh,Math.ceil(Math.sqrt(mesh.positions.length/3)))});
  const biasFor=(mesh,view)=>{
   if(!mesh.layerNormals)return settings.creaseDepthBias;
   const normalDepth=Math.min(...mesh.layerNormals.map(n=>Math.abs(view.rotation[6]*n[0]+view.rotation[7]*n[1]+view.rotation[8]*n[2]))),far=view.camDist+view.depthRange;
   return Math.min(settings.creaseDepthBias,mesh.layerGap*normalDepth*(view.camDist**2-view.depthRange**2)/(view.depthRange*far*far*4));
  };
  const topRows=raw=>{const pixels=new Uint8ClampedArray(raw.length),stride=size*4;for(let y=0;y<size;y++)pixels.set(raw.subarray((size-1-y)*stride,(size-y)*stride),y*stride);return pixels;};
  const drawGpu=(mesh,view=camera,configuration=settings,strain)=>{
   const frame=frameFor(mesh);if(strain)frame.strain=strain;
   return topRows(gpu.renderToImage(view,{...configuration,creaseDepthBias:biasFor(mesh,view)},size,size,frame));
  };
  const drawCpu=(mesh,view=camera,configuration=settings,strain)=>new SimulationRasterizer().render(mesh.positions,mesh,view,{...configuration,creaseDepthBias:biasFor(mesh,view)},strain).slice();
  const interiorPixels=(mesh,view)=>{
   const screen=projectVertices(mesh.positions,view).screen,[a,b,c]=Array.from(mesh.indices.slice(0,3)),ax=screen[a*2],ay=screen[a*2+1],bx=screen[b*2],by=screen[b*2+1],cx=screen[c*2],cy=screen[c*2+1],area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax),result=[];
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const wb=((x+.5-ax)*(cy-ay)-(y+.5-ay)*(cx-ax))/area,wc=((bx-ax)*(y+.5-ay)-(by-ay)*(x+.5-ax))/area,wa=1-wb-wc;
    if(Math.min(wa,wb,wc)>.15)result.push(y*size+x);
   }return result;
  };
  const channelError=(pixels,samples,rgb)=>samples.reduce((count,p)=>count+Number(rgb.some((value,c)=>Math.abs(pixels[p*4+c]-value)>2)),0);
  const redCount=pixels=>{let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>180&&pixels[i+1]<130&&pixels[i+2]<130)count++;return count;};
  const svgPixels=async(mesh,view,configuration)=>{
   const result=renderMeshToSvg(mesh.positions,frameFor(mesh).topology,view,{...configuration,creaseDepthBias:biasFor(mesh,view)},{perspective:true});
   check(!!result,'SVG 导出提供有效矢量图');
   const blob=new Blob([result.svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),image=new Image();
   try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('SVG 无法加载'));image.src=url;});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(result.width);canvas.height=Math.ceil(result.height);const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);
    return {pixels:context.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};
   }finally{URL.revokeObjectURL(url);}
  };
  try{
   const clock=new SimulationClock({chunkSteps:4,blowupStrain:0}),tick=clock.runToConvergence(cpu,100000),pose=new Float32Array(prepared.vertexCount*3);cpu.readPositions(pose);
   check(tick.converged&&tick.steps>0,'真实 CPU 单折 −180° / 100% 达到模拟时钟收敛');
   const unchanged=pose.slice(),realMesh=new SimulationSurfaceLayers(prepared,radius).build(pose);
   check(realMesh?.layerCount===2,'实际收敛姿态识别两层，而非依赖完全共面人工模型');
   check(pose.every((value,i)=>value===unchanged[i])&&JSON.stringify(source)===sourceText,'显示分层不改变源折痕与收敛顶点');
   check(realMesh.sourceVertices.length>prepared.vertexCount,'显示网格按面板复制铰接顶点');
   check(realMesh.sourceVertices.every(v=>v<prepared.vertexCount),'每个显示顶点均保留合法源节点映射');
   metrics.realConvergence={steps:tick.steps,maxVelocity:tick.maxVelocity,layers:realMesh.layerCount,sourceVertices:prepared.vertexCount,displayVertices:realMesh.sourceVertices.length};
   const realView=cameraUniforms({yaw:-.35,pitch:.55,zoom:.88},centroid(original),radius,size,size);
   addImage('真实 100% 单折：GPU 微层显示',drawGpu(realMesh,realView));addImage('真实 100% 单折：CPU 微层显示',drawCpu(realMesh,realView));

   const footprint=[[-.8,-.8],[.8,-.8],[0,.8]],resolverPositions=new Float32Array([...footprint.flatMap(([x,y])=>[x,y,0]),...footprint.flatMap(([x,y],i)=>[x,y,(i-1)*.00012])]);
   const synthetic=preparedFor(resolverPositions,[0,1,2,5,4,3]),resolver=new SimulationSurfaceLayers(synthetic,1);
   const samples=interiorPixels(synthetic,camera);check(samples.length>500,'像素采样离三角边界充分内缩，排除抗锯齿差异');
   const rawBefore=drawGpu(synthetic);let rawRed=0,rawBlue=0;for(const p of samples){rawRed+=Number(rawBefore[p*4]>250&&rawBefore[p*4+2]<5);rawBlue+=Number(rawBefore[p*4]<5&&rawBefore[p*4+2]>250);}
   check(rawRed>20&&rawBlue>20,'原始近共面残差在真实 GPU 复现两面颜色碎片');
   addImage('修复前：近共面正反色碎片',rawBefore);
   let compared=0;
   for(const sign of [1,-1]){
    const perturbed=resolverPositions.slice();for(let i=3;i<6;i++)perturbed[i*3+2]*=sign;
    const sourceCopy=perturbed.slice(),mesh=resolver.build(perturbed);check(mesh?.layerCount===2,`深度残差符号 ${sign} 均生成两层显示`);
    check(perturbed.every((value,i)=>value===sourceCopy[i]),`残差符号 ${sign} 的源坐标保持逐值不变`);
    for(const [name,view] of [['正面',camera],['背面',reverseCamera]]){
     const pixels=drawGpu(mesh,view),software=drawCpu(mesh,view),inside=interiorPixels(mesh,view);
     // Opposite-wound folded panels expose their back face on both outer sides.
     check(channelError(pixels,inside,[0,0,255])===0&&channelError(software,inside,[0,0,255])===0,`残差 ${sign} / ${name} 的 GPU 与 CPU 颜色碎片均为 0`);
     compared+=inside.length;
    }
    if(sign===1)addImage('修复后：正反面颜色碎片为 0',drawGpu(mesh));
   }
   metrics.nearCoplanar={rawRed,rawBlue,verifiedPixels:compared,colorFragmentsAfter:0};
   const stableMesh=resolver.build(resolverPositions);
   const sourceStrain=Float32Array.from({length:6},(_,i)=>i<3?0:.05),mappedStrain=Float32Array.from(stableMesh.sourceVertices,v=>sourceStrain[v]);
   check(mappedStrain.every((v,i)=>v===sourceStrain[stableMesh.sourceVertices[i]]),'应变按源节点索引复制，显示层不重新计算或错配应变');
   const strainSettings={...settings,colorMode:'strain',strainClip:5},frontStrain=drawGpu(stableMesh,camera,strainSettings,mappedStrain),backStrain=drawGpu(stableMesh,reverseCamera,strainSettings,mappedStrain);
   check(channelError(frontStrain,interiorPixels(stableMesh,camera),[255,0,0])===0,'正面应变显示选择上层源面 5% 红色');
   check(channelError(backStrain,interiorPixels(stableMesh,reverseCamera),[51,0,255])===0,'背面应变显示选择另一源面 0% 蓝紫色');
   check(channelError(drawCpu(stableMesh,camera,strainSettings,mappedStrain),interiorPixels(stableMesh,camera),[255,0,0])===0,'CPU 应变映射与 GPU 相同');
   addImage('正面应变：上层源面 5%',frontStrain);addImage('背面应变：另一源面 0%',backStrain);

   const rearPositions=new Float32Array([-.8,-.8,0,.8,-.8,0,0,.8,0,-.3,-.05,0,.3,-.05,0,-.8,-.8,.0001,.8,-.8,-.0001,0,.8,0]);
   const rearModel=preparedFor(rearPositions,[0,1,4,0,4,3,0,3,2,3,4,2,4,1,2,7,6,5],[3,4]);
   const rearMesh=new SimulationSurfaceLayers(rearModel,1).build(rearPositions);check(rearMesh?.layerCount===2,'后层独立中心 M 线所属面板与上层分离');
   check(rearMesh.edgesAssignment.filter(a=>a==='M').length===1,'测试保留后层中心 M 线，没有删除该线掩盖遮挡问题');
   const white={...settings,frontColor:[1,1,1],backColor:[1,1,1],showEdges:true};
   const hiddenGpu=drawGpu(rearMesh,camera,white),hiddenCpu=drawCpu(rearMesh,camera,white),hiddenSvg=await svgPixels(rearMesh,camera,white);
   metrics.hiddenRearInk={gpu:redCount(hiddenGpu),cpu:redCount(hiddenCpu),svg:redCount(hiddenSvg.pixels)};
   check(redCount(hiddenGpu)===0&&redCount(hiddenCpu)===0,'GPU 与 CPU 完全隐藏非共享后层中心红色折线');
   check(redCount(hiddenSvg.pixels)===0,'SVG 完全隐藏非共享后层中心红色折线');
   addImage('后层红线遮挡：GPU',hiddenGpu);addImage('后层红线遮挡：SVG',hiddenSvg.pixels,hiddenSvg.width,hiddenSvg.height);
   const visibleGpu=drawGpu(rearMesh,reverseCamera,white),visibleCpu=drawCpu(rearMesh,reverseCamera,white),visibleSvg=await svgPixels(rearMesh,reverseCamera,white);
   metrics.visibleFrontInk={gpu:redCount(visibleGpu),cpu:redCount(visibleCpu),svg:redCount(visibleSvg.pixels)};
   check(redCount(visibleGpu)>20&&redCount(visibleCpu)>20&&redCount(visibleSvg.pixels)>20,'同一折线转为前层时在 GPU / CPU / SVG 正常可见');
   addImage('背面旋转后：原后层红线可见',visibleGpu);

   const z=[.9,-.8,-.8],crossingPositions=new Float32Array([...footprint.flatMap(([x,y],i)=>[x*(3.2-z[i])/3.2,y*(3.2-z[i])/3.2,z[i]]),...footprint.flatMap(([x,y])=>[x,y,0])]);
   const crossing=preparedFor(crossingPositions,[0,1,2,5,4,3]),crossingCopy=crossingPositions.slice();
   check(new SimulationSurfaceLayers(crossing,1).build(crossingPositions)===null,'明显折角的实际交叉面不被当成近共面层拉平');
   check(crossingPositions.every((value,i)=>value===crossingCopy[i]),'真实交叉模型源顶点完全保留');
   const crossingGpu=drawGpu(crossing),crossingCpu=drawCpu(crossing);let correctCrossing=0;
   const crossScreen=projectVertices(crossingPositions,camera).screen,[ax,ay,bx,by,cx,cy]=Array.from(crossScreen.slice(0,6)),area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
   for(const p of interiorPixels(crossing,camera)){
    const x=p%size+.5,y=Math.floor(p/size)+.5,wb=((x-ax)*(cy-ay)-(y-ay)*(cx-ax))/area,wc=((bx-ax)*(y-ay)-(by-ay)*(x-ax))/area,wa=1-wb-wc,q=wa/(3.2-.9)+(wb+wc)/(3.2+.8);
    if(Math.abs(q-1/3.2)<.0002)continue;const rgb=q>1/3.2?[255,0,0]:[0,0,255];
    if(channelError(crossingGpu,[p],rgb)||channelError(crossingCpu,[p],rgb))throw Error('真实交叉面的逆距离遮挡与解析结果不一致');correctCrossing++;
   }
   check(correctCrossing>500,'明显交叉面的 GPU / CPU 遮挡保持正确');metrics.crossingPixels=correctCrossing;addImage('真实交叉面：保留原几何与遮挡',crossingGpu);

   for(const angle of [0,.0001,-.0001,.002,-.002,.05]){
    const c=Math.cos(angle),s=Math.sin(angle),view={...camera,rotation:[c,0,s,0,1,0,-s,0,c]},pixels=drawGpu(stableMesh,view),inside=interiorPixels(stableMesh,view);
    check(channelError(pixels,inside,[0,0,255])===0,`微旋转 ${angle} 弧度后层色仍不透出`);
   }
   // Exercise the visible-canvas path separately from renderToImage's PNG FBO.
   const liveFrame=frameFor(stableMesh);gpu.render(camera,settings,null,liveFrame);const gl=gpuCanvas.getContext('webgl2'),liveRaw=new Uint8Array(size*size*4);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,liveRaw);
   check(channelError(topRows(liveRaw),interiorPixels(stableMesh,camera),[0,0,255])===0,'真实 GPU 默认画布路径与离屏 PNG 路径一致');
   for(let i=0;i<3;i++)gpu.render(camera,settings,null,liveFrame);
   check(gl.getError()===gl.NO_ERROR,'多次绘制、纹理切换、微相机变化没有 WebGL 错误');
   const solverAfter=new Float32Array(prepared.vertexCount*3);cpu.readPositions(solverAfter);
   check(solverAfter.every((value,i)=>value===unchanged[i]),'GPU / CPU / SVG 显示测试后真实 CPU 求解姿态仍未修改');
   const summary=document.createElement('pre');summary.textContent=JSON.stringify({passed:checks.length,metrics,checks},null,2);summary.style.cssText='grid-column:1/-1;font-size:11px;white-space:pre-wrap;background:white;padding:12px';gallery.append(summary);
   return {passed:checks.length,metrics,checks};
  }finally{cpu.dispose();gpu.dispose();}
 });
 await page.screenshot({path:'output/playwright/simulation-surface-depth-100-20261014.png',fullPage:true});
 return {...result,screenshot:'output/playwright/simulation-surface-depth-100-20261014.png'};
}
