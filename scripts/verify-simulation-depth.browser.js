async page=>{
 await page.goto('http://127.0.0.1:8898/simulator/index.html');
 const result=await page.evaluate(async()=>{
  const base='/vendor/simulator/oristudio/packages/origami-simulator/src/webgl/';
  const {GlCore}=await import(base+'glCore.ts');
  const {MeshRenderer}=await import(base+'meshRenderer.ts');
  const {SimulationRasterizer}=await import('/src/engine/simRaster.ts');
  const {projectVertices}=await import(base+'camera.ts');
  const checks=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
  const core=GlCore.create(canvas);check(!!core,'真实 WebGL2 浮点上下文创建成功');
  const gl=core.gl;
  const camera={center:[0,0,0],rotation:[1,0,0,0,1,0,0,0,1],scale:40,width:96,height:96,depthRange:2,camDist:3.2};
  const settings={frontColor:[1,0,0],backColor:[0,0,1],background:[1,1,1],mountainColor:[1,0,0],valleyColor:[0,0,1],borderColor:[0,0,0],lightDir:[0,0,1],creaseWidthPx:1.6,creaseDepthBias:.000002,creaseWritesDepth:false,showFaces:true,showEdges:false,lighting:false,faceAlpha:1};
  const footprint=[[-.8,-.8],[.8,-.8],[0,.8]],z=[.9,-.8,-.8];
  const positions=new Float32Array([...footprint.flatMap(([x,y],i)=>[x*(3.2-z[i])/3.2,y*(3.2-z[i])/3.2,z[i]]),...footprint.flatMap(([x,y])=>[x,y,0])]);
  const draw=(positions,indices,edges=[],assignments=[],config=settings)=>{
   const dim=Math.ceil(Math.sqrt(positions.length/3)),original=new Float32Array(dim*dim*4);
   for(let i=0;i<positions.length/3;i++)original.set(positions.subarray(i*3,i*3+3),i*4);
   for(const [name,data] of [['u_originalPosition',original],['u_lastPosition',new Float32Array(original.length)],['u_lastVelocity',new Float32Array(original.length)]])core.createTexture(name,{width:dim,height:dim,data});
   const renderer=new MeshRenderer(core,{faceIndices:new Uint32Array(indices),edgeIndices:new Uint32Array(edges.flat()),edgeAssignments:new Uint8Array(assignments),textureDim:dim});
   try{
    renderer.render(camera,config,null);
    const raw=new Uint8Array(96*96*4),pixels=new Uint8ClampedArray(raw.length);
    gl.readPixels(0,0,96,96,gl.RGBA,gl.UNSIGNED_BYTE,raw);
    for(let y=0;y<96;y++)pixels.set(raw.subarray((95-y)*96*4,(96-y)*96*4),y*96*4);
    check(gl.getError()===gl.NO_ERROR,'深度渲染没有 WebGL 错误');
    return pixels;
   }finally{renderer.dispose();}
  };
  try{
   const first=draw(positions,[0,1,2,5,4,3]),reverse=draw(positions,[5,4,3,0,1,2]);
   const model={indices:new Uint32Array([0,1,2,5,4,3]),edgesVertices:[],edgesAssignment:[]};
   const software=new SimulationRasterizer().render(positions,model,camera,settings);
   const projected=projectVertices(positions,camera).screen;
   const [ax,ay,bx,by,cx,cy]=Array.from(projected.slice(0,6)),area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
   let verified=0;
   for(let y=20;y<76;y++)for(let x=20;x<76;x++){
    const wb=((x+.5-ax)*(cy-ay)-(y+.5-ay)*(cx-ax))/area,wc=((bx-ax)*(y+.5-ay)-(by-ay)*(x+.5-ax))/area,wa=1-wb-wc;
    if(Math.min(wa,wb,wc)<.05)continue;
    const q=wa/(3.2-.9)+(wb+wc)/(3.2+.8);
    if(Math.abs(q-1/3.2)<.002)continue;
    const offset=(y*96+x)*4;
    for(let c=0;c<3;c++)if(first[offset+c]!==software[offset+c]||reverse[offset+c]!==software[offset+c])throw Error(`GPU/CPU 遮挡不一致：${x},${y}`);
    verified++;
   }
   check(verified>500,`GPU/CPU ${verified} 个交叠内部像素遮挡一致，交换绘制顺序也一致`);
   const layered=new Float32Array([-1,-1,0,1,-1,0,0,1,0,-.4,0,-.0001,.4,0,-.0001]);
   const white={...settings,frontColor:[1,1,1],backColor:[1,1,1],showEdges:true};
   const hidden=draw(layered,[0,1,2],[[3,4]],[1],white);
   check(Array.from({length:16},(_,i)=>i+40).every(x=>[0,1,2].every(c=>hidden[(48*96+x)*4+c]===255)),'紧贴纸面后的红色折线保持隐藏');
   const visible=layered.slice();visible[11]=.0001;visible[14]=.0001;
   const front=draw(visible,[0,1,2],[[3,4]],[1],white);
   check(front[(48*96+48)*4+1]<200,'纸面前的红色折线正常可见');
   const coplanar=draw(layered,[0,1,2,2,1,0]);
   check(coplanar[(48*96+48)*4]===255&&coplanar[(48*96+48)*4+2]===0,'完全重合纸面采用固定拓扑顺序');
   check(draw(layered,[0,1,2,2,1,0]).every((value,i)=>value===coplanar[i]),'重合纸面重复绘制保持稳定');
   return {passed:checks.length,verified,checks};
  }finally{core.dispose();}
 });
 return result;
}
