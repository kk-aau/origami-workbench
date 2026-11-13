import type {Point,Segment} from '../core/types';
import type {CreaseDisplay} from '../app/creaseDisplay';
import {DISPLAY_PIXEL_MM} from '../app/creaseDisplay';
import {creaseVertexShape} from '../app/creaseVertices';
import {creaseLineStroke,creaseShortLineTitle} from '../app/creaseLineStyle';
import {DIAGNOSTIC_HIGHLIGHT_COLOR} from '../app/diagnosticHighlights';
import type {CreaseSegmentPresentation} from '../app/diagramCPPresentation';
import {CREASE_GPU_STRIDE,packCreaseGpuScene,creaseGpuRgba as rgba,runCreaseGpuBatches,sameCreaseGpuLines,type PackedCreaseGpuScene,type CreaseGpuPreparationOptions} from './creaseGpuScenePreparation';
export {CREASE_GPU_STRIDE,packCreaseGpuScene} from './creaseGpuScenePreparation';
export type {PackedCreaseGpuScene} from './creaseGpuScenePreparation';

export interface CreaseGpuView {x:number;y:number;w:number;h:number}
export interface CreaseGpuScene {
  segments:readonly Segment[];
  selected:ReadonlySet<string>;
  diagnostic?:ReadonlySet<string>;
  hiddenId:string|null;
  main:boolean;auxiliary:boolean;
  display:CreaseDisplay;
  vertices:readonly Point[];
  solidCreases?:boolean;
  segmentPresentation?:ReadonlyMap<string,CreaseSegmentPresentation>;
}
export const CREASE_GPU_THRESHOLD=2000;

/** Native SVG titles need a small hit overlay when strokes live on the GPU.
 * Call only after the pointer settles, never during camera navigation. */
export function creaseGpuHoverTitle(scene:CreaseGpuScene,point:Point,units:number,drag:Point,adaptive:boolean):string|undefined{
  for(let i=scene.segments.length-1;i>=0;i--){
    const s=scene.segments[i];if(s.id===scene.hiddenId||!(s.assignment==='A'?scene.auxiliary:scene.main))continue;
    const active=scene.selected.has(s.id),dx=active?drag[0]:0,dy=active?drag[1]:0;
    const info=scene.segmentPresentation?.get(s.id),width=(s.assignment==='A'?scene.display.auxLineWidth:scene.display.lineWidth)*(info?.emphasis?1.3:1);
    const radius=(active?Math.max(5,width/2):width/2)*units+units;
    const x=point[0]-dx,y=point[1]-dy;
    if(x<Math.min(s.a[0],s.b[0])-radius||x>Math.max(s.a[0],s.b[0])+radius||y<Math.min(s.a[1],s.b[1])-radius||y>Math.max(s.a[1],s.b[1])+radius)continue;
    const vx=s.b[0]-s.a[0],vy=s.b[1]-s.a[1],length2=vx*vx+vy*vy,t=length2?Math.max(0,Math.min(1,((x-s.a[0])*vx+(y-s.a[1])*vy)/length2)):0;
    if(Math.hypot(x-s.a[0]-vx*t,y-s.a[1]-vy*t)>radius)continue;
    const stroke=creaseLineStroke(s,scene.display.lineStyle,width,units,adaptive,scene.display.roundedEnds,scene.display.auxLineStyle,scene.solidCreases);
    return info?.title??creaseShortLineTitle(s,stroke.limited);
  }
  return undefined;
}

const lineVertex=`#version 300 es
precision highp float;
layout(location=0) in vec4 a_high;
layout(location=1) in vec4 a_low;
layout(location=2) in vec4 a_color;
layout(location=3) in vec4 a_dashA;
layout(location=4) in vec2 a_dashB;
layout(location=5) in vec4 a_style;
uniform vec2 u_viewHigh,u_viewLow,u_scale,u_size,u_drag;
uniform float u_adaptive,u_round;
out vec2 v_local;
flat out vec4 v_color,v_dashA,v_metrics;
flat out vec2 v_dashB,v_flags;
float dashAt(int i){if(i==0)return a_dashA.x;if(i==1)return a_dashA.y;if(i==2)return a_dashA.z;if(i==3)return a_dashA.w;if(i==4)return a_dashB.x;return a_dashB.y;}
void main(){
  vec2 start=((a_high.xy-u_viewHigh)+(a_low.xy-u_viewLow)+u_drag*a_style.y)*u_scale;
  vec2 delta=((a_high.zw-a_high.xy)+(a_low.zw-a_low.xy))*u_scale;
  float len=length(delta),width=a_style.x,period=0.0,minGap=1e30,minInk=1e30;
  for(int i=0;i<6;i++){if(float(i)<a_style.w){float d=dashAt(i);period+=d;if(i%2==0)minInk=min(minInk,d);else minGap=min(minGap,d);}}
  float factor=1.0,phase=0.0;
  if(u_adaptive>0.5&&period>0.0&&len>0.0){
    float floorWidth=min(width,0.65),cap=u_round*width;
    float pitch=max(1.0,max((0.7+cap)/minGap,max(0.0,0.65-cap)/minInk));
    if(len/(period*pitch)>=2.0)factor=pitch;
    else{
      bool found=false;
      for(int j=0;j<2;j++){
        float candidate=min(pitch,len/period/(2.0-float(j))),gap=minGap*candidate;
        float available=u_round>0.5?gap-0.7:width;
        float shown=min(width,available);
        if(!found&&gap>=0.7&&available>=floorWidth&&minInk*candidate+u_round*shown>=0.65){factor=candidate;width=shown;phase=a_dashA.x*factor/2.0;found=true;}
      }
      if(!found){period=0.0;width=floorWidth;}
    }
  }
  v_color=a_color;v_dashA=a_dashA*factor;v_dashB=a_dashB*factor;
  v_metrics=vec4(len,width,phase,period*factor);v_flags=a_style.yz;
  vec2 direction=len>0.0?delta/len:vec2(1.0,0.0),normal=vec2(-direction.y,direction.x);
  float margin=max(width/2.0,a_style.y>0.5?5.0:0.0)+1.5;
  int id=gl_VertexID;
  float along=(id==1||id==2||id==4)?len+margin:-margin;
  float side=(id==2||id==4||id==5)?margin:-margin;
  v_local=vec2(along,side);
  vec2 screen=start+direction*along+normal*side;
  gl_Position=vec4(screen/u_size*vec2(2.0,-2.0)+vec2(-1.0,1.0),0.0,1.0);
}`;
const lineFragment=`#version 300 es
precision highp float;
in vec2 v_local;
flat in vec4 v_color,v_dashA,v_metrics;
flat in vec2 v_dashB,v_flags;
uniform float u_round,u_aa;
uniform vec3 u_diagnostic;
out vec4 outColor;
float dashAt(int i){if(i==0)return v_dashA.x;if(i==1)return v_dashA.y;if(i==2)return v_dashA.z;if(i==3)return v_dashA.w;if(i==4)return v_dashB.x;return v_dashB.y;}
float coverage(float d){return u_aa>0.0?clamp(0.5-d/u_aa,0.0,1.0):float(d<=0.0);}
float strokeDistance(float a,float b){
  float x=v_local.x,y=v_local.y,w=v_metrics.y*0.5;
  if(u_round>0.5)return length(vec2(x-clamp(x,a,b),y))-w;
  vec2 q=vec2(abs(x-(a+b)*0.5)-(b-a)*0.5,abs(y)-w);
  return length(max(q,0.0))+min(max(q.x,q.y),0.0);
}
void over(inout vec4 result,vec3 color,float alpha){result=vec4(color*alpha+result.rgb*(1.0-alpha),alpha+result.a*(1.0-alpha));}
void main(){
  float len=v_metrics.x,period=v_metrics.w;vec4 color=vec4(0.0);
  vec3 halo=v_flags.y>0.5?u_diagnostic:vec3(0.1372549,0.5215686,0.4039216);
  if(v_flags.x>0.5){float d=max(abs(v_local.y)-5.0,max(-v_local.x,v_local.x-len));over(color,halo,0.2*coverage(d));}
  float dist=1e30;
  if(period<=0.0)dist=strokeDistance(0.0,len);
  else{
    float cycle=floor((v_local.x+v_metrics.z)/period);
    for(int turn=-1;turn<=1;turn++){
      float at=(cycle+float(turn))*period-v_metrics.z;
      for(int i=0;i<6;i++){
        float d=dashAt(i);
        if(i%2==0&&d>0.0){float a=max(0.0,at),b=min(len,at+d);if(b>=a)dist=min(dist,strokeDistance(a,b));}
        at+=d;
      }
    }
  }
  over(color,v_color.rgb,coverage(dist)*v_color.a);
  if(v_flags.x>0.5){
    float r=min(length(v_local),length(v_local-vec2(len,0.0)));
    vec3 border=v_flags.y>0.5?u_diagnostic:vec3(0.1215686,0.3960784,0.3176471);
    over(color,border,coverage(r-4.25));over(color,vec3(1.0),coverage(r-2.75));
  }
  if(color.a<=0.0)discard;outColor=color;
}`;
const pointVertex=`#version 300 es
precision highp float;
layout(location=0) in vec4 a_point;
uniform vec2 u_viewHigh,u_viewLow,u_scale,u_size;
uniform float u_radius;
out vec2 v_local;
void main(){
  int id=gl_VertexID;float edge=u_radius+1.5;
  v_local=vec2((id==1||id==2||id==4)?edge:-edge,(id==2||id==4||id==5)?edge:-edge);
  vec2 screen=((a_point.xy-u_viewHigh)+(a_point.zw-u_viewLow))*u_scale+v_local;
  gl_Position=vec4(screen/u_size*vec2(2.0,-2.0)+vec2(-1.0,1.0),0.0,1.0);
}`;
const pointFragment=`#version 300 es
precision highp float;
in vec2 v_local;
uniform float u_radius,u_border,u_pointRound,u_aa;
uniform vec3 u_pointFill,u_pointStroke;
out vec4 outColor;
float coverage(float d){return u_aa>0.0?clamp(0.5-d/u_aa,0.0,1.0):float(d<=0.0);}
void main(){float radius=u_pointRound>0.5?length(v_local):max(abs(v_local.x),abs(v_local.y));
  float outer=coverage(radius-u_radius),inner=coverage(radius-u_radius+u_border);
  if(outer<=0.0)discard;outColor=vec4(u_pointFill*inner+u_pointStroke*(outer-inner),outer);
}`;

function program(gl:WebGL2RenderingContext,vertex:string,fragment:string):WebGLProgram{
  const result=gl.createProgram();if(!result)throw new Error('GPU program allocation failed');
  const shaders:WebGLShader[]=[];
  try{
    for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
      const shader=gl.createShader(kind);if(!shader)throw new Error('GPU shader allocation failed');shaders.push(shader);
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)??'GPU shader compilation failed');
      gl.attachShader(result,shader);
    }
    gl.linkProgram(result);if(!gl.getProgramParameter(result,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(result)??'GPU shader link failed');
    return result;
  }catch(error){gl.deleteProgram(result);throw error;}finally{shaders.forEach(shader=>gl.deleteShader(shader));}
}

/** All per-segment work is confined to setScene. draw only changes uniforms,
 * viewport and two instanced draw calls, including adaptive short-line styles. */
export class CreaseGpuRenderer {
  readonly gl:WebGL2RenderingContext;
  private lines:WebGLProgram;private points:WebGLProgram;
  private lineVao:WebGLVertexArrayObject;private pointVao:WebGLVertexArrayObject;
  private lineBuffer:WebGLBuffer;private pointBuffer:WebGLBuffer;
  private count=0;private pointCount=0;private scene:CreaseGpuScene|null=null;
  private generation=0;private packedLines:Float32Array<ArrayBuffer>|null=null;
  private maxBufferSize:number;
  private uniforms=new Map<WebGLProgram,Map<string,WebGLUniformLocation|null>>();
  uploads=0;draws=0;lineUploads=0;
  constructor(private canvas:HTMLCanvasElement){
    const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
    if(!gl)throw new Error('WebGL2 unavailable');this.gl=gl;this.maxBufferSize=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
    this.lines=program(gl,lineVertex,lineFragment);
    try{this.points=program(gl,pointVertex,pointFragment);}catch(error){gl.deleteProgram(this.lines);throw error;}
    const lineVao=gl.createVertexArray(),pointVao=gl.createVertexArray(),lineBuffer=gl.createBuffer(),pointBuffer=gl.createBuffer();
    if(!lineVao||!pointVao||!lineBuffer||!pointBuffer){gl.deleteVertexArray(lineVao);gl.deleteVertexArray(pointVao);gl.deleteBuffer(lineBuffer);gl.deleteBuffer(pointBuffer);gl.deleteProgram(this.lines);gl.deleteProgram(this.points);throw new Error('GPU buffer allocation failed');}
    this.lineVao=lineVao;this.pointVao=pointVao;this.lineBuffer=lineBuffer;this.pointBuffer=pointBuffer;
    gl.bindVertexArray(lineVao);gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);
    for(const [index,size,offset] of [[0,4,0],[1,4,4],[2,4,8],[3,4,12],[4,2,16],[5,4,18]]){
      gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,CREASE_GPU_STRIDE*4,offset*4);gl.vertexAttribDivisor(index,1);
    }
    gl.bindVertexArray(pointVao);gl.bindBuffer(gl.ARRAY_BUFFER,pointBuffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,0);gl.vertexAttribDivisor(0,1);
    gl.bindVertexArray(null);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  }
  private location(p:WebGLProgram,name:string){let locations=this.uniforms.get(p);if(!locations){locations=new Map();this.uniforms.set(p,locations);}if(!locations.has(name))locations.set(name,this.gl.getUniformLocation(p,name));return locations.get(name)!;}
  setScene(scene:CreaseGpuScene){
    const packed=packCreaseGpuScene(scene);this.setPackedScene(scene,packed);
  }
  clearScene(){
    this.generation++;this.count=0;this.pointCount=0;this.scene=null;this.packedLines=null;
    this.gl.clearColor(0,0,0,0);this.gl.clear(this.gl.COLOR_BUFFER_BIT);this.canvas.dataset.segmentCount='0';this.canvas.dataset.sceneState='empty';
  }
  private validatePacked(scene:CreaseGpuScene,packed:PackedCreaseGpuScene){
    if(!Number.isSafeInteger(packed.count)||packed.count<0||packed.count>scene.segments.length||!(packed.lines instanceof Float32Array)||packed.lines.length!==packed.count*CREASE_GPU_STRIDE||!(packed.points instanceof Float32Array)||packed.points.length!==scene.vertices.length*4)throw new Error('Incomplete GPU scene');
  }
  private publish(scene:CreaseGpuScene,packed:PackedCreaseGpuScene,lineUpload=true){
    this.count=packed.count;this.pointCount=scene.vertices.length;this.scene=scene;this.packedLines=packed.lines;this.uploads++;
    this.canvas.dataset.bufferUploads=String(this.uploads);this.canvas.dataset.segmentCount=String(this.count);this.canvas.dataset.sceneState='ready';
    if(lineUpload)this.lineUploads++;this.canvas.dataset.lineBufferUploads=String(this.lineUploads);
  }
  setPackedScene(scene:CreaseGpuScene,packed:PackedCreaseGpuScene){
    this.validatePacked(scene,packed);this.clearScene();const gl=this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,packed.lines,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);gl.bufferData(gl.ARRAY_BUFFER,packed.points,gl.STATIC_DRAW);
    if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw new Error('GPU upload failed');
    this.publish(scene,packed);
  }
  async setPackedSceneAsync(scene:CreaseGpuScene,packed:PackedCreaseGpuScene,options:CreaseGpuPreparationOptions={}):Promise<void>{
    this.validatePacked(scene,packed);
    const keepLines=this.scene!==null&&sameCreaseGpuLines(this.scene,scene)&&this.packedLines===packed.lines;
    if(keepLines){this.generation++;this.pointCount=0;}else this.clearScene();
    const generation=this.generation,gl=this.gl;let allocated=false,part=keepLines?1:0,offset=0,written=0;
    const buffers=[packed.lines,packed.points],total=(keepLines?0:packed.lines.byteLength)+packed.points.byteLength;
    this.canvas.dataset.sceneState='uploading';
    await runCreaseGpuBatches(()=>{
      if(generation!==this.generation)throw new DOMException('折痕显示已更新。','AbortError');
      if(!allocated){
        if(!keepLines){gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,packed.lines.byteLength,gl.STATIC_DRAW);}
        gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);gl.bufferData(gl.ARRAY_BUFFER,packed.points.byteLength,gl.STATIC_DRAW);allocated=true;
      }else{
        const deadline=performance.now()+4;
        for(let chunks=0;part<2&&chunks<4&&performance.now()<deadline;){
          const data=buffers[part];if(offset===data.length){part++;offset=0;continue;}
          const end=Math.min(offset+262144,data.length);gl.bindBuffer(gl.ARRAY_BUFFER,part===0?this.lineBuffer:this.pointBuffer);
          gl.bufferSubData(gl.ARRAY_BUFFER,offset*4,data.subarray(offset,end));written+=(end-offset)*4;offset=end;chunks++;
        }
      }
      if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw new Error('GPU upload failed');
      options.onProgress?.(total?written/total:1);
      if(options.signal?.aborted||generation!==this.generation)throw new DOMException('折痕显示已更新。','AbortError');
      if(part===2){this.publish(scene,packed,!keepLines);return true;}return undefined;
    },options);
  }
  draw(view:CreaseGpuView,size:{w:number;h:number},drag:Point,adaptive:boolean,showMarkers:boolean){
    const gl=this.gl,scene=this.scene;if(!scene)return;
    if(gl.isContextLost())throw new Error('GPU context lost');
    const dpr=Math.max(1,window.devicePixelRatio||1),max=this.maxBufferSize;
    const ratio=Math.min(dpr,max/size.w,max/size.h),w=Math.max(1,Math.round(size.w*ratio)),h=Math.max(1,Math.round(size.h*ratio));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    const camera=(p:WebGLProgram)=>{
      gl.useProgram(p);gl.uniform2f(this.location(p,'u_viewHigh'),Math.fround(view.x),Math.fround(view.y));
      gl.uniform2f(this.location(p,'u_viewLow'),view.x-Math.fround(view.x),view.y-Math.fround(view.y));
      gl.uniform2f(this.location(p,'u_scale'),size.w/view.w,size.h/view.h);gl.uniform2f(this.location(p,'u_size'),size.w,size.h);
      gl.uniform1f(this.location(p,'u_aa'),scene.display.antiAlias?1/ratio:0);
    };
    camera(this.lines);gl.uniform2f(this.location(this.lines,'u_drag'),drag[0],drag[1]);
    gl.uniform1f(this.location(this.lines,'u_adaptive'),adaptive?1:0);gl.uniform1f(this.location(this.lines,'u_round'),scene.display.roundedEnds?1:0);
    const diagnostic=rgba(DIAGNOSTIC_HIGHLIGHT_COLOR);gl.uniform3f(this.location(this.lines,'u_diagnostic'),diagnostic[0],diagnostic[1],diagnostic[2]);
    gl.bindVertexArray(this.lineVao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,this.count);
    if(showMarkers&&scene.main&&scene.display.pointSize>0&&Math.hypot(...drag)<1e-7){
      camera(this.points);const markerScale=Math.min(DISPLAY_PIXEL_MM/(view.w/size.w),1),shape=creaseVertexShape(scene.display,markerScale)!;
      gl.uniform1f(this.location(this.points,'u_radius'),shape.radius);
      gl.uniform1f(this.location(this.points,'u_border'),shape.strokeWidth);
      gl.uniform1f(this.location(this.points,'u_pointRound'),shape.round?1:0);
      const fill=rgba(shape.fill),stroke=rgba(shape.stroke==='none'?shape.fill:shape.stroke);
      gl.uniform3f(this.location(this.points,'u_pointFill'),fill[0],fill[1],fill[2]);
      gl.uniform3f(this.location(this.points,'u_pointStroke'),stroke[0],stroke[1],stroke[2]);
      gl.bindVertexArray(this.pointVao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,this.pointCount);
    }
    gl.bindVertexArray(null);if(gl.getError()!==gl.NO_ERROR)throw new Error('GPU draw failed');
    this.draws++;this.canvas.dataset.draws=String(this.draws);
  }
  dispose(){this.generation++;this.scene=null;this.packedLines=null;this.count=0;this.pointCount=0;const gl=this.gl;gl.deleteBuffer(this.lineBuffer);gl.deleteBuffer(this.pointBuffer);gl.deleteVertexArray(this.lineVao);gl.deleteVertexArray(this.pointVao);gl.deleteProgram(this.lines);gl.deleteProgram(this.points);}
}
