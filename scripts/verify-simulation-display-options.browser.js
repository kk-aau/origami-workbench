async page=>{
 await page.goto('http://127.0.0.1:8927/simulator/index.html',{waitUntil:'domcontentloaded',timeout:20000});
 const result=await page.evaluate(async()=>{
  const vendor='/vendor/simulator/oristudio/packages/origami-simulator/src/';
  const {GlCore}=await import(vendor+'webgl/glCore.ts');
  const {MeshRenderer,meshTopologyFor}=await import(vendor+'webgl/meshRenderer.ts');
  const {renderMeshToSvg}=await import(vendor+'svgRenderer.ts');
  const {cameraUniforms}=await import(vendor+'webgl/camera.ts');
  const {SimulationRasterizer}=await import('/src/engine/simRaster.ts');
  const {displaySettings,DEFAULT_SIMULATION_DISPLAY_OPTIONS}=await import('/src/engine/simDisplay.ts');
  const checks=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
  const core=GlCore.create(canvas);check(!!core,'真实WebGL2浮点上下文创建成功');
  const gl=core.gl;
  const camera={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],scale:40,width:96,height:96,depthRange:2,camDist:3.2};
  // Compare full-coverage interior pixels; WebGL multisample antialiasing and
  // the software raster's single sample intentionally differ at ribbon edges.
  const base={frontColor:[1,0,0],backColor:[0,1,0],background:[1,1,1],mountainColor:[.76,.2,.23],valleyColor:[.18,.38,.72],borderColor:[.1,.12,.14],lightDir:[0,0,1],creaseWidthPx:4,creaseDepthBias:.000002,creaseWritesDepth:false,showFaces:true,showEdges:true,lighting:true,faceAlpha:1};
  const pixel=(pixels,x,y)=>Array.from(pixels.slice((y*96+x)*4,(y*96+x)*4+3));
  const same=(a,b,tolerance=1)=>a.every((value,index)=>Math.abs(value-b[index])<=tolerance);
  const draw=(positions,model,config,activeCamera=camera,strain)=>{
   const dim=Math.ceil(Math.sqrt(positions.length/3)),original=new Float32Array(dim*dim*4),velocity=new Float32Array(original.length);
   for(let index=0;index<positions.length/3;index++){
    original.set(positions.subarray(index*3,index*3+3),index*4);velocity[index*4+3]=strain?.[index]??0;
   }
   for(const [name,data] of [['u_originalPosition',original],['u_lastPosition',new Float32Array(original.length)],['u_lastVelocity',velocity]])core.createTexture(name,{width:dim,height:dim,data});
   const renderer=new MeshRenderer(core,meshTopologyFor(model,dim));
   try{
    renderer.render(activeCamera,config,null);
    const raw=new Uint8Array(96*96*4),gpu=new Uint8ClampedArray(raw.length);
    gl.readPixels(0,0,96,96,gl.RGBA,gl.UNSIGNED_BYTE,raw);
    for(let y=0;y<96;y++)gpu.set(raw.subarray((95-y)*96*4,(96-y)*96*4),y*96*4);
    check(gl.getError()===gl.NO_ERROR,'GPU显示设置渲染无WebGL错误');
    const cpu=new SimulationRasterizer().render(positions,model,activeCamera,config,strain).slice();
    const svg=renderMeshToSvg(positions,meshTopologyFor(model),activeCamera,config,{strain});
    return {gpu,cpu,svg};
   }finally{renderer.dispose();}
  };
  try{
   const assignments=['B','M','V','F','U'],flags=['boundaries','mountains','valleys','facets','unassigned'];
   const positions=new Float32Array(assignments.flatMap((_,index)=>[-.8,(index-2)*.4,0,.8,(index-2)*.4,0]));
   const model={indices:new Uint32Array(),edgesVertices:assignments.map((_,index)=>[index*2,index*2+1]),edgesAssignment:assignments};
   const topologyBefore=JSON.stringify(meshTopologyFor(model)),positionsBefore=Array.from(positions);
   for(const style of ['assignment','crease'])for(let selected=0;selected<5;selected++){
    const options={...DEFAULT_SIMULATION_DISPLAY_OPTIONS,boundaries:false,mountains:false,valleys:false,facets:false,unassigned:false,[flags[selected]]:true};
    const settings=displaySettings(base,'wireframe',style,options),{gpu,cpu,svg}=draw(positions,model,settings);
    check((svg.svg.match(/<line /g)??[]).length===1,`${style} SVG仅导出${assignments[selected]}类型线条`);
    for(let index=0;index<5;index++){
     const y=48-(index-2)*16;
     const gpuInk=pixel(gpu,48,y),cpuInk=pixel(cpu,48,y);
     check(same(gpuInk,cpuInk),`${style} ${assignments[index]}线GPU/CPU像素一致：${gpuInk}/${cpuInk}`);
     check(index===selected?!same(gpuInk,[240,243,239]):same(gpuInk,[240,243,239]),`${style} ${assignments[index]}独立开关实际生效`);
    }
    if(selected>=3)check(svg.svg.includes(selected===3?'#b8801f':'#8252ad'),`${style} F金色/U紫色保持角色区分`);
   }
   const hidden=draw(positions,model,displaySettings(base,'wireframe','assignment',{...DEFAULT_SIMULATION_DISPLAY_OPTIONS,showEdges:false}));
   check(hidden.svg===null&&same(pixel(hidden.gpu,48,48),[240,243,239])&&same(pixel(hidden.cpu,48,48),[240,243,239]),'总线条开关同时隐藏GPU、CPU和SVG线条');
   check(JSON.stringify(meshTopologyFor(model))===topologyBefore&&positions.every((value,index)=>value===positionsBefore[index]),'显示开关不修改模拟顶点或拓扑');
   const trianglePositions=new Float32Array([-.8,-.8,0,.8,-.8,0,0,.8,0]);
   const triangleModel={indices:new Uint32Array([0,1,2]),edgesVertices:[],edgesAssignment:[]};
   const strain=new Float32Array([.02,.02,.02]),strainColors=[];
   for(const strainClip of [1,5]){
    const settings=displaySettings(base,'strain','assignment',{...DEFAULT_SIMULATION_DISPLAY_OPTIONS,showEdges:false,strainClip});
    const {gpu,cpu,svg}=draw(trianglePositions,triangleModel,settings,camera,strain);
    const color=pixel(gpu,48,48);strainColors.push(color);
    check(same(color,pixel(cpu,48,48)),`${strainClip}%热图阈值GPU/CPU颜色一致`);
    const svgColor='#'+pixel(cpu,48,48).map(value=>value.toString(16).padStart(2,'0')).join('');
    check(svg.svg.includes(`fill="${svgColor}"`),`${strainClip}%热图SVG使用相同颜色`);
   }
   check(!same(strainColors[0],strainColors[1]),'改变热图阈值实际改变同一应变的颜色');
   const reflected=cameraUniforms({yaw:.35,pitch:.6,zoom:.88},[0,0,0],1.3,96,96);
   for(const activeCamera of [camera,reflected])for(const reverse of [false,true]){
    const normalModel={...triangleModel,indices:new Uint32Array(reverse?[2,1,0]:[0,1,2])};
    const settings={...displaySettings(base,'normals'),showEdges:false,lighting:true};
    const {gpu,cpu,svg}=draw(trianglePositions,normalModel,settings,activeCamera);
    check(same(pixel(gpu,48,48),pixel(cpu,48,48)),`法线着色${activeCamera===camera?'正向':'反射'}视角${reverse?'背面':'正面'}GPU/CPU一致`);
    const svgColor='#'+pixel(cpu,48,48).map(value=>value.toString(16).padStart(2,'0')).join('');
    check(svg.svg.includes(`fill="${svgColor}"`),'法线SVG保留方向颜色且不受纸张双色或光照覆盖');
   }
   return {passed:checks.length,checks};
  }finally{core.dispose();}
 });
 return result;
}
