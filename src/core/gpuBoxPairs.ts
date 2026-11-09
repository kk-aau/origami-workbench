/** GPU broad phase only. Returned pairs are a conservative superset; callers
 * must retain their original double-precision bounds and geometry predicates. */
export type GpuBounds = readonly [number,number,number,number];
export interface GpuBoxPairProgress {completed:number;total:number}
export interface GpuBoxPairStats {
 backend:'webgl2';renderer:string;boxes:number;testedPairs:number;candidates:number;batches:number;
 initializationMs:number;filterMs:number;visitMs:number;totalMs:number;
}
export interface GpuBoxPairFilter {
 readonly renderer:string;
 forEachPair(visitor:(a:number,b:number)=>void,onProgress?:(progress:GpuBoxPairProgress)=>void):GpuBoxPairStats;
 dispose():void;
}
export class GpuBoxPairError extends Error {
 constructor(message:string){super(message);this.name='GpuBoxPairError';}
}

const MIN_NORMAL=2**-126,MAX_FLOAT=3.4028234663852886e38;
const floatBits=new DataView(new ArrayBuffer(4));
function validateBounds(bounds:readonly GpuBounds[]){
 for(const b of bounds)if(!Array.isArray(b)||b.length!==4||b.some(v=>!Number.isFinite(v))||b[0]>b[2]||b[1]>b[3])throw new TypeError('GPU 包围盒结构或坐标无效。');
}
/** Move a normal Float32 one representable value outward. Subnormals are
 * expanded to zero / the smallest normal so shader denormal flushing is safe. */
export function outwardGpuFloat(value:number,direction:-1|1):number {
 if(!Number.isFinite(value))throw new TypeError('GPU 包围盒坐标必须有限。');
 if(value===0)return direction*MIN_NORMAL;
 if(Math.abs(value)<MIN_NORMAL)return direction<0?(value<0?-MIN_NORMAL:0):(value>0?MIN_NORMAL:0);
 let rounded=Math.fround(value);
 if(!Number.isFinite(rounded))return direction<0?(value<0?-Infinity:MAX_FLOAT):(value>0?Infinity:-MAX_FLOAT);
 // One extra ULP also covers exactly representable inputs and signed zero.
 floatBits.setFloat32(0,rounded,true);let bits=floatBits.getUint32(0,true);
 bits+=((rounded>0)===(direction>0))?1:-1;
 floatBits.setUint32(0,bits>>>0,true);rounded=floatBits.getFloat32(0,true);
 if(Math.abs(rounded)<MIN_NORMAL)return direction<0?(rounded<0?-MIN_NORMAL:0):(rounded>0?MIN_NORMAL:0);
 return rounded;
}

/** Exposed for numeric-boundary verification. null means this GPU format
 * cannot conservatively encode the input; the complete CPU path remains valid. */
export function encodeGpuBounds(bounds:readonly GpuBounds[]):Float32Array|null {
 validateBounds(bounds);
 let encoded:Float32Array;
 try{encoded=new Float32Array(bounds.length*4);}catch(error){if(error instanceof RangeError)throw new GpuBoxPairError('GPU 包围盒上传缓冲分配失败。');throw error;}
 for(let i=0;i<bounds.length;i++)for(let k=0;k<4;k++){
  const value=outwardGpuFloat(bounds[i][k],k<2?-1:1);
  if(!Number.isFinite(value))return null;
  encoded[4*i+k]=value;
 }
 return encoded;
}

const vertexSource=`#version 300 es
void main(){vec2 p=gl_VertexID==0?vec2(-1.,-1.):gl_VertexID==1?vec2(3.,-1.):vec2(-1.,3.);gl_Position=vec4(p,0.,1.);}`;
const fragmentSource=`#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uBounds;
uniform uint uBoundsWidth;
uniform uint uCount;
uniform uint uFirstRow;
uniform uint uFirstWord;
uniform uint uWordsPerRow;
uniform uint uOutputWidth;
uniform uint uValidWords;
layout(location=0) out highp uint mask;
vec4 box(uint v){return texelFetch(uBounds,ivec2(int(v%uBoundsWidth),int(v/uBoundsWidth)),0);}
void main(){
 uint index=uint(gl_FragCoord.y)*uOutputWidth+uint(gl_FragCoord.x);
 mask=0u;if(index>=uValidWords)return;
 uint a=uFirstRow+index/uWordsPerRow;
 uint first=(uFirstWord+index%uWordsPerRow)*32u;
 vec4 x=box(a);
 for(uint k=0u;k<32u;k++){
  uint b=first+k;
  if(b<=a||b>=uCount)continue;
  vec4 y=box(b);
  if(x.x<=y.z&&y.x<=x.z&&x.y<=y.w&&y.y<=x.w)mask|=1u<<k;
 }
}`;

/** Uses only WebGL2 core formats: RGBA32F sampled bounds and a color-renderable
 * R32UI bitmask. No float render target extension, shared memory, native add-on
 * or asynchronous main-thread round trip is required by the solver Worker. */
export function createGpuBoxPairFilter(bounds:readonly GpuBounds[]):GpuBoxPairFilter|null {
 const begun=performance.now(),count=bounds.length,pairs=count*(count-1)/2;
 validateBounds(bounds);
 if(count<2||!Number.isSafeInteger(pairs)||count>0xffffffff||typeof OffscreenCanvas==='undefined')return null;
 const encoded=encodeGpuBounds(bounds);if(!encoded)return null;
 const canvas=new OffscreenCanvas(1,1);
 let gl:WebGL2RenderingContext|null;
 try{gl=canvas.getContext('webgl2',{antialias:false,depth:false,stencil:false,alpha:false,premultipliedAlpha:false,preserveDrawingBuffer:false}) as WebGL2RenderingContext|null;}catch{return null;}
 if(!gl)return null;
 const context=gl,shaders:WebGLShader[]=[];
 let program:WebGLProgram|null=null,input:WebGLTexture|null=null,output:WebGLTexture|null=null,framebuffer:WebGLFramebuffer|null=null,vao:WebGLVertexArrayObject|null=null,disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;for(const shader of shaders)context.deleteShader(shader);context.deleteProgram(program);context.deleteTexture(input);context.deleteTexture(output);context.deleteFramebuffer(framebuffer);context.deleteVertexArray(vao);context.getExtension('WEBGL_lose_context')?.loseContext();};
 const check=(stage:string)=>{if(disposed||context.isContextLost())throw new GpuBoxPairError(`GPU 筛选上下文不可用（${stage}）。`);const error=context.getError();if(error!==context.NO_ERROR)throw new GpuBoxPairError(`GPU 筛选失败（${stage}，${error}）。`);};
 try{
  const maximum=context.getParameter(context.MAX_TEXTURE_SIZE) as number,viewport=context.getParameter(context.MAX_VIEWPORT_DIMS) as Int32Array;
  const precision=context.getShaderPrecisionFormat(context.FRAGMENT_SHADER,context.HIGH_FLOAT);
  if(!precision||precision.precision<23||precision.rangeMin<126||precision.rangeMax<127||!Number.isInteger(maximum)||maximum<1){dispose();return null;}
  const inputWidth=Math.min(2048,maximum,count),inputHeight=Math.ceil(count/inputWidth);
  const width=Math.min(1024,maximum,viewport[0]),height=Math.min(256,maximum,viewport[1]),capacity=width*height;
  if(inputHeight>maximum||capacity<Math.ceil(count/32)){dispose();return null;}
  const compile=(kind:number,source:string)=>{
   const shader=context.createShader(kind);if(!shader)throw new GpuBoxPairError('GPU 筛选着色器分配失败。');shaders.push(shader);context.shaderSource(shader,source);context.compileShader(shader);
   if(!context.getShaderParameter(shader,context.COMPILE_STATUS))throw new GpuBoxPairError(`GPU 筛选着色器编译失败：${context.getShaderInfoLog(shader)??''}`);return shader;
  };
  program=context.createProgram();if(!program)throw new GpuBoxPairError('GPU 筛选程序分配失败。');
  context.attachShader(program,compile(context.VERTEX_SHADER,vertexSource));context.attachShader(program,compile(context.FRAGMENT_SHADER,fragmentSource));context.linkProgram(program);
  if(!context.getProgramParameter(program,context.LINK_STATUS))throw new GpuBoxPairError(`GPU 筛选程序链接失败：${context.getProgramInfoLog(program)??''}`);
  input=context.createTexture();output=context.createTexture();framebuffer=context.createFramebuffer();vao=context.createVertexArray();
  if(!input||!output||!framebuffer||!vao)throw new GpuBoxPairError('GPU 筛选缓冲分配失败。');
  const texture=(target:WebGLTexture)=>{context.bindTexture(context.TEXTURE_2D,target);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MIN_FILTER,context.NEAREST);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MAG_FILTER,context.NEAREST);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_S,context.CLAMP_TO_EDGE);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_T,context.CLAMP_TO_EDGE);};
  context.activeTexture(context.TEXTURE0);texture(input);context.texStorage2D(context.TEXTURE_2D,1,context.RGBA32F,inputWidth,inputHeight);
  // Avoid a padded full-size duplicate of the upload for the final partial row.
  const fullRows=Math.floor(count/inputWidth),tail=count%inputWidth;
  if(fullRows)context.texSubImage2D(context.TEXTURE_2D,0,0,0,inputWidth,fullRows,context.RGBA,context.FLOAT,encoded.subarray(0,fullRows*inputWidth*4));
  if(tail)context.texSubImage2D(context.TEXTURE_2D,0,0,fullRows,tail,1,context.RGBA,context.FLOAT,encoded.subarray(fullRows*inputWidth*4));
  texture(output);context.texStorage2D(context.TEXTURE_2D,1,context.R32UI,width,height);
  context.bindFramebuffer(context.FRAMEBUFFER,framebuffer);context.framebufferTexture2D(context.FRAMEBUFFER,context.COLOR_ATTACHMENT0,context.TEXTURE_2D,output,0);
  if(context.checkFramebufferStatus(context.FRAMEBUFFER)!==context.FRAMEBUFFER_COMPLETE)throw new GpuBoxPairError('GPU 筛选整数帧缓冲不受支持。');
  context.drawBuffers([context.COLOR_ATTACHMENT0]);context.readBuffer(context.COLOR_ATTACHMENT0);context.disable(context.BLEND);context.disable(context.DITHER);context.disable(context.DEPTH_TEST);context.disable(context.SCISSOR_TEST);
  context.bindVertexArray(vao);context.useProgram(program);context.bindTexture(context.TEXTURE_2D,input);
  const location=(name:string)=>{const value=context.getUniformLocation(program!,name);if(value===null)throw new GpuBoxPairError(`GPU 筛选缺少参数 ${name}。`);return value;};
  const locations=Object.fromEntries(['uBounds','uBoundsWidth','uCount','uFirstRow','uFirstWord','uWordsPerRow','uOutputWidth','uValidWords'].map(name=>[name,location(name)]));
  context.uniform1i(locations.uBounds,0);context.uniform1ui(locations.uBoundsWidth,inputWidth);context.uniform1ui(locations.uCount,count);context.uniform1ui(locations.uOutputWidth,width);
  context.pixelStorei(context.PACK_ALIGNMENT,4);check('初始化');
  const extension=context.getExtension('WEBGL_debug_renderer_info'),renderer=String(context.getParameter(extension?.UNMASKED_RENDERER_WEBGL??context.RENDERER));
  const readback=new Uint32Array(capacity),initializationMs=performance.now()-begun;
  return {
   renderer,dispose,
   forEachPair(visitor,onProgress){
    check('开始');let row=0,candidates=0,batches=0,filterMs=0,visitMs=0;const start=performance.now(),allWords=Math.ceil(count/32);
    onProgress?.({completed:0,total:pairs});
    while(row<count-1){
     const firstWord=Math.floor(row/32),wordsPerRow=allWords-firstWord,rows=Math.min(count-1-row,Math.max(1,Math.floor(capacity/wordsPerRow))),validWords=rows*wordsPerRow,drawHeight=Math.ceil(validWords/width);
     const before=performance.now();check('分块');
     context.viewport(0,0,width,drawHeight);context.uniform1ui(locations.uFirstRow,row);context.uniform1ui(locations.uFirstWord,firstWord);context.uniform1ui(locations.uWordsPerRow,wordsPerRow);context.uniform1ui(locations.uValidWords,validWords);
     context.drawArrays(context.TRIANGLES,0,3);context.readPixels(0,0,width,drawHeight,context.RED_INTEGER,context.UNSIGNED_INT,readback);check('回读');filterMs+=performance.now()-before;
     const visit=performance.now();
     for(let word=0;word<validWords;word++){
      let mask=readback[word];if(!mask)continue;
      const a=row+Math.floor(word/wordsPerRow),base=(firstWord+word%wordsPerRow)*32;
      while(mask){const bit=31-Math.clz32(mask&-mask),b=base+bit;mask=(mask&(mask-1))>>>0;
       if(b<=a||b>=count)throw new GpuBoxPairError('GPU 筛选返回无效纸面对索引。');
       // CPU visitor exceptions must not be reclassified as GPU failures.
       visitor(a,b);candidates++;
      }
     }
     visitMs+=performance.now()-visit;row+=rows;batches++;
     onProgress?.({completed:row*(2*count-row-1)/2,total:pairs});
    }
    return {backend:'webgl2',renderer,boxes:count,testedPairs:pairs,candidates,batches,initializationMs,filterMs,visitMs,totalMs:initializationMs+performance.now()-start};
   },
  };
 }catch(error){
  dispose();
  if(error instanceof GpuBoxPairError||error instanceof RangeError)return null;
  throw error;
 }
}
