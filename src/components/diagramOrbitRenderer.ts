import type {DiagramOrbitMesh} from '../app/diagramOrbitMesh';
import type {ModelColors} from '../app/modelColors';

const vertex=`#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
uniform mat3 u_camera;
uniform vec2 u_scale;
uniform float u_line;
out vec3 v_normal;
void main(){vec3 p=u_camera*a_position;v_normal=u_camera*a_normal;
  gl_Position=vec4(p.x*u_scale.x,-p.y*u_scale.y,-p.z*.45-u_line*.00003,1.0);
}`;
const fragment=`#version 300 es
precision highp float;
uniform vec3 u_front;uniform vec3 u_back;uniform vec3 u_ink;uniform float u_line;
in vec3 v_normal;out vec4 outColor;
void main(){
  if(u_line>.5){outColor=vec4(u_ink,1.0);return;}
  vec3 normal=normalize(v_normal)*(gl_FrontFacing?1.0:-1.0);
  float light=clamp(.78+.22*dot(normal,normalize(vec3(-.35,-.45,.82))),.58,1.0);
  outColor=vec4((gl_FrontFacing?u_front:u_back)*light,1.0);
}`;
function createProgram(gl:WebGL2RenderingContext){
  const program=gl.createProgram();if(!program)throw Error('无法创建三维预览程序。');
  const shaders:WebGLShader[]=[];
  try{
    for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){
      const shader=gl.createShader(kind);if(!shader)throw Error('无法创建三维预览着色器。');shaders.push(shader);
      gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('三维预览着色器不可用。');
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('三维预览程序不可用。');return program;
  }catch(error){gl.deleteProgram(program);throw error;}finally{shaders.forEach(shader=>gl.deleteShader(shader));}
}
const rgb=(color:string)=>[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16)/255);

/** Transient orbit preview: true depth-buffered geometry, with no whole-face
 * painter order. The committed drawing still uses its certified local regions. */
export class DiagramOrbitRenderer {
  private gl:WebGL2RenderingContext;private program:WebGLProgram;
  private triangleBuffer:WebGLBuffer;private lineBuffer:WebGLBuffer;
  private triangleVao:WebGLVertexArrayObject;private lineVao:WebGLVertexArrayObject;
  private triangles=0;private lines=0;
  constructor(private canvas:HTMLCanvasElement){
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false,preserveDrawingBuffer:false});if(!gl)throw Error('设备不支持三维实时预览。');this.gl=gl;
    this.program=createProgram(gl);
    const triangles=gl.createBuffer(),lines=gl.createBuffer(),triangleVao=gl.createVertexArray(),lineVao=gl.createVertexArray();
    if(!triangles||!lines||!triangleVao||!lineVao){gl.deleteBuffer(triangles);gl.deleteBuffer(lines);gl.deleteVertexArray(triangleVao);gl.deleteVertexArray(lineVao);gl.deleteProgram(this.program);throw Error('三维预览资源不足。');}
    this.triangleBuffer=triangles;this.lineBuffer=lines;this.triangleVao=triangleVao;this.lineVao=lineVao;
    gl.bindVertexArray(triangleVao);gl.bindBuffer(gl.ARRAY_BUFFER,triangles);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
    gl.bindVertexArray(lineVao);gl.bindBuffer(gl.ARRAY_BUFFER,lines);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);gl.disableVertexAttribArray(1);gl.vertexAttrib3f(1,0,0,1);
    gl.bindVertexArray(null);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.frontFace(gl.CW);gl.disable(gl.CULL_FACE);
  }
  setMesh(mesh:DiagramOrbitMesh){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.triangleBuffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.triangles,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.lines,gl.STATIC_DRAW);this.triangles=mesh.triangles.length/6;this.lines=mesh.lines.length/3;}
  draw(matrix:Float32Array,colors:ModelColors,width:number,height:number){
    const gl=this.gl,ratio=Math.min(2,window.devicePixelRatio||1),limit=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
    const w=Math.max(1,Math.min(limit,Math.round(width*ratio))),h=Math.max(1,Math.min(limit,Math.round(height*ratio)));
    if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
    gl.viewport(0,0,w,h);gl.clearColor(.98,.984,.969,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.program,'u_camera'),false,matrix);
    const scale=.84;gl.uniform2f(gl.getUniformLocation(this.program,'u_scale'),scale*Math.min(1,h/w),scale*Math.min(1,w/h));
    for(const [name,color] of [['u_front',colors.front],['u_back',colors.back],['u_ink',colors.line]])gl.uniform3fv(gl.getUniformLocation(this.program,name),rgb(color));
    gl.uniform1f(gl.getUniformLocation(this.program,'u_line'),0);gl.bindVertexArray(this.triangleVao);gl.drawArrays(gl.TRIANGLES,0,this.triangles);
    gl.uniform1f(gl.getUniformLocation(this.program,'u_line'),1);gl.bindVertexArray(this.lineVao);gl.drawArrays(gl.LINES,0,this.lines);gl.bindVertexArray(null);
  }
  dispose(){const gl=this.gl;gl.deleteBuffer(this.triangleBuffer);gl.deleteBuffer(this.lineBuffer);gl.deleteVertexArray(this.triangleVao);gl.deleteVertexArray(this.lineVao);gl.deleteProgram(this.program);}
}
