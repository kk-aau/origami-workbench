import {faceVertexFilterData,faceVertexPredicate} from './faceVertexFilter';
import {reportFlatComputationProgress} from './flatComputationProgress';
import {layerPairScreeningBackend} from './layerPairScreening';
import type {Point} from './types';

const vertexShader=`#version 300 es
void main(){
 vec2 p=gl_VertexID==0?vec2(-1.,-1.):gl_VertexID==1?vec2(3.,-1.):vec2(-1.,3.);
 gl_Position=vec4(p,0.,1.);
}`;
const fragmentShader=`#version 300 es
precision highp int;
precision highp float;
uniform highp sampler2D points,edges;
uniform int inputWidth,pointCount,firstFace;
uniform float tolerance;
layout(location=0) out highp uint candidates;
ivec2 at(int index){return ivec2(index%inputWidth,index/inputWidth);}
float side(vec4 edge,vec2 p){
 vec2 d=p-edge.xy;return edge.z*d.y-edge.w*d.x;
}
void main(){
 int e=(firstFace+int(gl_FragCoord.y))*4;
 vec4 a=texelFetch(edges,at(e),0),b=texelFetch(edges,at(e+1),0);
 vec4 c=texelFetch(edges,at(e+2),0),d=texelFetch(edges,at(e+3),0);
 int start=int(gl_FragCoord.x)*32;candidates=0u;
 for(int k=0;k<32;k++){
  if(start+k>=pointCount)break;
  vec2 p=texelFetch(points,at(start+k),0).xy;
  vec4 s=vec4(side(a,p),side(b,p),side(c,p),side(d,p));
  if(!(any(greaterThan(s,vec4(tolerance)))&&any(lessThan(s,vec4(-tolerance)))))
   candidates|=1u<<uint(k);
 }
}`;

class GpuUnavailable extends Error {}

/** Buffer a bounded batch of 32 vertex candidates per integer pixel. A device
 * failure discards all private results before the caller retries on CPU. */
export function gpuFaceVertices(points:Point[],faces:number[][],epsilon:number):Set<number>[]|undefined{
 const backend=layerPairScreeningBackend();
 if(backend==='cpu'||typeof OffscreenCanvas==='undefined'||points.length*faces.length<8_000_000)return;
 let gl:WebGL2RenderingContext|null;
 try{gl=new OffscreenCanvas(1,1).getContext('webgl2',{powerPreference:'high-performance',failIfMajorPerformanceCaveat:true,antialias:false,depth:false,stencil:false});}catch{return;}
 if(!gl)return;
 const ctx=gl,shaders:WebGLShader[]=[],textures:WebGLTexture[]=[];
 let program:WebGLProgram|null=null,framebuffer:WebGLFramebuffer|null=null;
 const check=()=>{if(ctx.isContextLost()||ctx.getError()!==ctx.NO_ERROR)throw new GpuUnavailable();};
 try{
  const precision=ctx.getShaderPrecisionFormat(ctx.FRAGMENT_SHADER,ctx.HIGH_FLOAT);
  if(!precision||precision.precision<23||precision.rangeMin<126||precision.rangeMax<127)return;
  const maximum=ctx.getParameter(ctx.MAX_TEXTURE_SIZE) as number,viewport=ctx.getParameter(ctx.MAX_VIEWPORT_DIMS) as Int32Array;
  const width=Math.min(1024,maximum),columns=Math.ceil(points.length/32);
  const batch=Math.min(256,maximum,viewport[1],Math.floor(262144/columns));
  if(!batch||columns>Math.min(viewport[0],maximum)||Math.max(points.length,faces.length*4)>width*maximum)return;
  const data=faceVertexFilterData(points,faces,epsilon);
  if(!data)return;
  const compile=(kind:number,source:string)=>{
   const shader=ctx.createShader(kind);if(!shader)throw new GpuUnavailable();shaders.push(shader);
   ctx.shaderSource(shader,source);ctx.compileShader(shader);
   if(!ctx.getShaderParameter(shader,ctx.COMPILE_STATUS))throw new GpuUnavailable();
   return shader;
  };
  program=ctx.createProgram();if(!program)return;
  ctx.attachShader(program,compile(ctx.VERTEX_SHADER,vertexShader));ctx.attachShader(program,compile(ctx.FRAGMENT_SHADER,fragmentShader));
  ctx.linkProgram(program);if(!ctx.getProgramParameter(program,ctx.LINK_STATUS))return;
  ctx.useProgram(program);
  const texture=(unit:number,format:number,w:number,h:number)=>{
   const tex=ctx.createTexture();if(!tex)throw new GpuUnavailable();textures.push(tex);
   ctx.activeTexture(ctx.TEXTURE0+unit);ctx.bindTexture(ctx.TEXTURE_2D,tex);
   ctx.texParameteri(ctx.TEXTURE_2D,ctx.TEXTURE_MIN_FILTER,ctx.NEAREST);ctx.texParameteri(ctx.TEXTURE_2D,ctx.TEXTURE_MAG_FILTER,ctx.NEAREST);
   ctx.texStorage2D(ctx.TEXTURE_2D,1,format,w,h);return tex;
  };
  const upload=(unit:number,values:Float32Array,channels:2|4)=>{
   const count=values.length/channels,rows=Math.floor(count/width),tail=count%width;
   const format=channels===2?ctx.RG:ctx.RGBA;
   texture(unit,channels===2?ctx.RG32F:ctx.RGBA32F,width,Math.ceil(count/width));
   if(rows)ctx.texSubImage2D(ctx.TEXTURE_2D,0,0,0,width,rows,format,ctx.FLOAT,values);
   if(tail)ctx.texSubImage2D(ctx.TEXTURE_2D,0,0,rows,tail,1,format,ctx.FLOAT,values,rows*width*channels);
  };
  const coords=new Float32Array(points.length*2);
  for(let v=0;v<points.length;v++){coords[v*2]=points[v][0];coords[v*2+1]=points[v][1];}
  upload(0,coords,2);upload(1,data.edges,4);
  const output=texture(2,ctx.R32UI,columns,batch);
  framebuffer=ctx.createFramebuffer();if(!framebuffer)return;
  ctx.bindFramebuffer(ctx.FRAMEBUFFER,framebuffer);ctx.framebufferTexture2D(ctx.FRAMEBUFFER,ctx.COLOR_ATTACHMENT0,ctx.TEXTURE_2D,output,0);
  if(ctx.checkFramebufferStatus(ctx.FRAMEBUFFER)!==ctx.FRAMEBUFFER_COMPLETE)return;
  ctx.disable(ctx.BLEND);ctx.disable(ctx.DITHER);
  const location=(name:string)=>ctx.getUniformLocation(program!,name);
  ctx.uniform1i(location('points'),0);ctx.uniform1i(location('edges'),1);ctx.uniform1i(location('inputWidth'),width);
  ctx.uniform1i(location('pointCount'),points.length);ctx.uniform1f(location('tolerance'),data.tolerance);
  const firstFace=location('firstFace'),words=new Uint32Array(columns*batch);
  const draw=(first:number,count:number)=>{
   ctx.viewport(0,0,columns,count);ctx.uniform1i(firstFace,first);ctx.drawArrays(ctx.TRIANGLES,0,3);
   ctx.readPixels(0,0,columns,count,ctx.RED_INTEGER,ctx.UNSIGNED_INT,words);check();
  };
  const collect=(face:number,row:number)=>{
   const result=new Set<number>(),accept=faceVertexPredicate(points,faces[face],epsilon);
   for(let col=0;col<columns;col++){
    let mask=words[row*columns+col];
    while(mask){
     const v=col*32+31-Math.clz32(mask&-mask);mask&=mask-1;
     if(v>=points.length)throw new GpuUnavailable();
     if(accept(v))result.add(v);
    }
   }
   return result;
  };
  // Include transfer and exact survivor checks in calibration. The dispersed
  // oracle rows also detect a driver that incorrectly discarded a real hit.
  const samples=Math.min(4,faces.length),pilot=Math.min(8,batch,Math.floor(faces.length/samples));
  let cpuMs=0,gpuMs=0;draw(0,1);
  for(let s=0;s<samples;s++){
   const first=Math.floor(s*faces.length/samples),begin=performance.now();draw(first,pilot);
   const hits=Array.from({length:pilot},(_,i)=>collect(first+i,i));gpuMs+=performance.now()-begin;
   const cpu=performance.now();
   for(let i=0;i<pilot;i++){
    const accept=faceVertexPredicate(points,faces[first+i],epsilon);
    for(let v=0;v<points.length;v++)if(accept(v)!==hits[i].has(v))return;
   }
   cpuMs+=performance.now()-cpu;
  }
  if(backend==='auto'&&gpuMs>=cpuMs*.8)return;
  const result:Set<number>[]=[];
  for(let first=0;first<faces.length;first+=batch){
   reportFlatComputationProgress({stage:'gpu-contact-faces',label:'GPU 筛选顶点 · CPU 复核纸面覆盖',completed:first,total:faces.length});
   const count=Math.min(batch,faces.length-first);draw(first,count);
   for(let i=0;i<count;i++)result.push(collect(first+i,i));
  }
  return result;
 }catch(error){if(!(error instanceof GpuUnavailable)&&!(error instanceof RangeError))throw error;}
 finally{
  for(const tex of textures)ctx.deleteTexture(tex);for(const shader of shaders)ctx.deleteShader(shader);
  ctx.deleteFramebuffer(framebuffer);ctx.deleteProgram(program);ctx.getExtension('WEBGL_lose_context')?.loseContext();
 }
}
