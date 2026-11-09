import {DIAGRAM_ANNOTATION_LIMITS,DIAGRAM_SYMBOL_PARAM_LIMITS,type DiagramAnnotation,type DiagramLineStyle,type DiagramSymbolAnnotation,type DiagramSymbolKind,type DiagramSymbolParams} from './diagramAnnotations';
import {diagramLineDasharray} from './diagramLineStyles';
import {adaptiveLineStroke,type AdaptiveLineOptions} from './adaptiveLineStyle';
import type {Point} from '../core/types';
import {getSymbolParameters,SYMBOL_CATALOG} from './diagramSymbolCatalog';
import {buildCadSymbolGeometry,moveCadSymbolPropertyGrip,type CadSymbolControl} from './diagramCadSymbolGeometry';
import {cadPropertyDefinitions} from './diagramCadSymbols';
import {diagramSymbolTurnAngle,isDiagramRotationSymbol} from './diagramSymbolRotation';
import {diagramTearWindowLocalOutline} from './diagramTearWindowGeometry';
export {diagramTearWindowPath,diagramTearWindowContainsPoint,diagramTearWindowOutline,diagramTearWindowHidesFace} from './diagramTearWindowGeometry';

export const SYMBOL_LABELS=Object.fromEntries(SYMBOL_CATALOG.map(item=>[item.kind,item.label])) as Record<DiagramSymbolKind,string>;
export const LINE_LABELS:Record<DiagramLineStyle,string>={valley:'谷折线',mountain:'峰折线',crease:'已有折痕',auxiliary:'辅助线',boundary:'边界线'};
const n=(value:number)=>Object.is(value,-0)?'0':String(value);
const xy=(point:Point)=>point.map(n).join(' ');
const add=(a:Point,b:Point):Point=>[a[0]+b[0],a[1]+b[1]];
const mul=(a:Point,k:number):Point=>[a[0]*k,a[1]*k];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];
const unit=(a:Point):Point=>{const norm=Math.hypot(...a)||1;return [a[0]/norm,a[1]/norm];};
function finite(value:number):number {if(!Number.isFinite(value))throw new Error('折图对象坐标和尺寸必须为有限数字。');return value;}
function positive(value:number):number {if(finite(value)<=0)throw new Error('折图对象尺寸和线宽必须大于零。');return value;}
const safeColor=(value:string)=>/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)?value:'#333333';
const escapeXML=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
type Key=keyof DiagramSymbolParams;
interface Control {key:Key;label:string;point:Point;read:(point:Point)=>number}
type HitShape={kind:'path';d:string;filled:boolean;stroke:boolean;dash?:string}|{kind:'circle';center:Point;radius:number;filled:boolean}|{kind:'text';a:Point;b:Point};
interface NativeEndpoints {start:Point;end:Point}
type NativeCurve={kind:'quadratic';a:Point;c:Point;b:Point;offset?:Point}|{kind:'cubic';a:Point;c:Point;d:Point;b:Point};
class Sketch {
  chunks:string[]=[];points:Point[]=[];controls:Control[]=[];hitShapes:HitShape[]=[];
  cadControls:CadSymbolControl[]=[];
  cadOrigins?:{id:string;point:Point;blockHandle:number}[];
  nativeEndpoints?:NativeEndpoints;nativeCurve?:NativeCurve;base:Point=[0,0];
  path(d:string,points:Point[],fill:'none'|'currentColor'|'white'='none',dash?:string,stroke=fill!=='currentColor',sourceHandle?:number){
    this.chunks.push(`<path d="${d}"${fill==='none'?'':` fill="${fill}"`}${stroke?'':' stroke="none"'}${dash?` stroke-dasharray="${dash}"`:''}${sourceHandle===undefined?'':` data-source-handle="${sourceHandle}"`}/>`);this.points.push(...points);
    this.hitShapes.push({kind:'path',d,filled:fill!=='none',stroke,dash});
  }
  poly(points:Point[],closed=false,fill:'none'|'currentColor'|'white'='none',dash?:string){this.path(points.map((p,i)=>`${i?'L':'M'} ${xy(p)}`).join(' ')+(closed?' Z':''),points,fill,dash);}
  quad(a:Point,c:Point,b:Point){this.path(`M ${xy(a)} Q ${xy(c)} ${xy(b)}`,[a,c,b]);}
  cubic(a:Point,c:Point,d:Point,b:Point){this.path(`M ${xy(a)} C ${xy(c)} ${xy(d)} ${xy(b)}`,[a,c,d,b]);}
  circle(center:Point,radius:number,filled=false){this.chunks.push(`<circle cx="${n(center[0])}" cy="${n(center[1])}" r="${n(radius)}"${filled?' fill="currentColor" stroke="none"':''}/>`);this.points.push(add(center,[-radius,-radius]),add(center,[radius,radius]));this.hitShapes.push({kind:'circle',center,radius,filled});}
  rect(x:number,y:number,w:number,h:number,filled=false){this.poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],true,filled?'currentColor':'none');}
  text(text:string,point:Point,size:number,middle=false,angle=0,anchor:'start'|'middle'|'end'=middle?'middle':'start',attributeKey?:string){
    // Use a generous advance estimate so fallback fonts and wide W/CJK glyphs
    // are contained even when an exported SVG is opened on another computer.
    const width=Array.from(text).reduce((sum,c)=>sum+(c.codePointAt(0)!>0xffff?2:c.charCodeAt(0)>255?1.3:1)*size,0);
    this.chunks.push(`<text x="${n(point[0])}" y="${n(point[1])}" font-family="Arial,Microsoft YaHei,sans-serif" font-size="${n(size)}" fill="currentColor" stroke="none"${attributeKey===undefined?'':` data-cad-attribute="${escapeXML(attributeKey)}"`}${anchor==='start'?'':` text-anchor="${anchor}"`}${angle?` transform="rotate(${n(angle)} ${xy(point)})"`:''}>${escapeXML(text)}</text>`);
    const left=point[0]-(anchor==='middle'?width/2:anchor==='end'?width:0),a:Point=[left,point[1]-size*1.2],b:Point=[left+width,point[1]+size*.4];
    const theta=angle*Math.PI/180,rotate=(p:Point):Point=>add(point,[(p[0]-point[0])*Math.cos(theta)-(p[1]-point[1])*Math.sin(theta),(p[0]-point[0])*Math.sin(theta)+(p[1]-point[1])*Math.cos(theta)]),corners:Point[]=[a,[b[0],a[1]],b,[a[0],b[1]]].map(p=>rotate(p as Point));
    this.points.push(...corners);if(text.trim())this.hitShapes.push({kind:'path',d:corners.map((p,i)=>`${i?'L':'M'} ${xy(p)}`).join(' ')+' Z',filled:true,stroke:false});
  }
  control(key:Key,point:Point,read:(point:Point)=>number,label?:string){
    const existing=this.controls.findIndex(control=>control.key===key),control={key,label:label??({length:'长度',height:'高度',curve:'弧度',headLength:'箭头长度',headWidth:'箭头宽度',radius:'圆半径',gap:'组件间距',count:'重复个数',markSize:'标记尺寸'}[key]),point,read};
    if(existing<0)this.controls.push(control);else this.controls[existing]=control;
  }
  get markup(){return this.chunks.join('');}
}
function arrowHead(s:Sketch,tip:Point,direction:Point,p:DiagramSymbolParams,filled=false,controls=true){
  const u=unit(direction),v:Point=[-u[1],u[0]],base=sub(tip,mul(u,p.headLength));
  const a=add(base,mul(v,p.headWidth/2)),b=sub(base,mul(v,p.headWidth/2));
  s.poly([a,tip,b],filled,filled?'currentColor':'none');
  if(controls){s.control('headLength',base,q=>dot(sub(tip,q),u));s.control('headWidth',a,q=>2*Math.abs(dot(sub(q,base),v)));}
}
function arc(s:Sketch,center:Point,radius:number,start:number,end:number){
  const pieces=Math.max(1,Math.ceil(Math.abs(end-start)/(Math.PI/2))),step=(end-start)/pieces;
  for(let i=0;i<pieces;i++){
    const a=start+i*step,b=a+step,k=4/3*Math.tan(step/4);
    const pa=add(center,[radius*Math.cos(a),radius*Math.sin(a)]),pb=add(center,[radius*Math.cos(b),radius*Math.sin(b)]);
    s.cubic(pa,add(pa,[-radius*Math.sin(a)*k,radius*Math.cos(a)*k]),add(pb,[radius*Math.sin(b)*k,-radius*Math.cos(b)*k]),pb);
  }
}
function dimensions(s:Sketch,p:DiagramSymbolParams,tip:Point=[p.length/2,0],heightPoint:Point=[0,p.height/2]){
  s.control('length',tip,q=>2*Math.abs(q[0]));s.control('height',heightPoint,q=>2*Math.abs(q[1]));
}
function label(s:Sketch,a:DiagramSymbolAnnotation,p:DiagramSymbolParams,point:Point,middle=false,prefix=''){
  const value=typeof a.text==='string'&&a.text.trim()?a.text:String(p.count);
  s.text(prefix&&value.toLowerCase().startsWith(prefix.trim().toLowerCase())?value:prefix+value,point,p.markSize,middle);
  s.control('markSize',add(point,[0,p.markSize]),q=>Math.abs(q[1]-point[1]),'标签字号');
}
function curveControl(a:DiagramSymbolAnnotation,fallback:Point):Point {
  if(a.curveControl===undefined)return fallback;
  if(!Array.isArray(a.curveControl)||a.curveControl.length!==2)throw new Error('折纸符号曲线控制点无效。');
  return a.curveControl.map(finite) as Point;
}

function rotationLabel(s:Sketch,a:DiagramSymbolAnnotation):void{
  if(!isDiagramRotationSymbol(a.symbol))return;
  const text=`${diagramSymbolTurnAngle(a)}°`,size=Math.min(16,56/[...text].length),label=new Sketch();
  label.text(text,[0,size*.35],size,true);
  // The arrow may rotate or reflect as a drawing object. Cancel that frame
  // only for its readable central number, retaining the object's own scale.
  const rotation=finite(a.rotation)%360,sign=a.mirrored?-1:1,theta=-rotation*Math.PI/180,c=Math.cos(theta),sin=Math.sin(theta);
  const local=(p:Point):Point=>[sign*(c*p[0]-sin*p[1]),sin*p[0]+c*p[1]],corners=label.points.map(local);
  s.chunks.push(`<g data-role="rotation-angle" transform="scale(${sign} 1) rotate(${n(-rotation)})">${label.markup}</g>`);
  s.points.push(...corners);
  s.hitShapes.push({kind:'path',d:corners.map((p,i)=>`${i?'L':'M'} ${xy(p)}`).join(' ')+' Z',filled:true,stroke:false});
}

/** Build code-native geometry and the matching component controls in local units. */
function symbolSketch(a:DiagramSymbolAnnotation):Sketch {
  if(a.symbol!=='tearWindow'&&(a.cadProperties!==undefined||SYMBOL_CATALOG.find(item=>item.kind===a.symbol)?.sourceOnly)){
    const geometry=buildCadSymbolGeometry(a),s=new Sketch();
    for(const primitive of geometry.primitives){
      if(primitive.kind==='path')s.path(primitive.d,primitive.points,primitive.fill,primitive.dash,primitive.stroke,primitive.sourceHandle);
      else s.text(primitive.text,primitive.point,primitive.size,primitive.anchor==='middle',primitive.angle,primitive.anchor,primitive.sourceType==='ATTDEF'?String(primitive.sourceHandle):undefined);
    }
    const origin=geometry.basePoints[0].point,end=geometry.baseline.end;
    s.nativeEndpoints={start:origin,end:Math.hypot(...sub(end,origin))>1e-9?end:geometry.baseline.start};s.cadOrigins=geometry.basePoints;s.cadControls=geometry.controls;rotationLabel(s,a);return s;
  }
  const p=getSymbolParameters(a),s=new Sketch(),l=p.length,h=p.height,r=p.radius,g=p.gap,m=p.markSize;
  switch(a.symbol){
    case 'tearWindow':{
      const outline=diagramTearWindowLocalOutline(r),d=outline.map((point,i)=>`${i?'L':'M'} ${xy(point)}`).join(' ')+' Z';
      // Pick the torn edge. Its unpainted interior must stay available for
      // selecting the genuine lower-layer fold lines revealed by this window.
      s.chunks.push(`<path data-role="tear-window-fibre-edge" d="${d}" fill="none" stroke="#fffdf4" stroke-width="${n(r*.075)}" stroke-linejoin="round"/>`);
      const fibres:Point[]=[];
      for(let i=1;i<outline.length;i+=3){
        const point=outline[i],length=Math.hypot(...point),delta=r*(.025+(i%7)*.004),tip:Point=[point[0]*(1+delta/length)-point[1]*.012,point[1]*(1+delta/length)+point[0]*.012];
        fibres.push(point,tip);
        s.chunks.push(`<path data-role="tear-window-fibre" d="M ${xy(point)} L ${xy(tip)}" fill="none" stroke="#fffdf4" stroke-width="${n(r*.018)}"/>`);
      }
      s.path(d,outline);
      s.points.push(...fibres,[-r*1.12,-r*1.12],[r*1.12,r*1.12]);
      s.nativeEndpoints={start:[-r,0],end:[r,0]};
      s.control('radius',[r*Math.SQRT1_2,r*Math.SQRT1_2],point=>Math.hypot(...point),'透视窗口半径');
      break;
    }
    case 'paperFront':case 'paperBack':{
      const tip:Point=[p.headLength/2,0];s.poly([[-p.headLength/2,-p.headWidth/2],tip,[-p.headLength/2,p.headWidth/2]],a.symbol==='paperBack',a.symbol==='paperBack'?'currentColor':'none');
      s.base=[-p.headLength/2,-p.headWidth/2];
      s.control('headLength',tip,q=>Math.abs(q[0])*2);s.control('headWidth',[-p.headLength/2,p.headWidth/2],q=>Math.abs(q[1])*2);break;
    }
    case 'referencePoint':case 'angleMarker':
      s.circle([0,0],r,a.symbol==='angleMarker');s.control('radius',[r,0],q=>Math.hypot(...q));break;
    case 'equalLength':{
      s.base=[-l/2,-g/2];
      for(const y of [-g/2,g/2]){
        s.poly([[-l/2,y],[l/2,y]],false,'none','6 4');
        for(let i=0;i<p.count;i++){const x=l/2-8-i*m*1.3;s.poly([[x+m*.5,y-m*.5],[x,y],[x+m*.5,y+m*.5]]);}
      }
      s.control('length',[l/2,0],q=>Math.abs(q[0])*2);s.control('gap',[0,g/2],q=>Math.abs(q[1])*2);s.control('markSize',[l/2-8+m*.5,g/2+m*.5],q=>Math.abs(q[1]-g/2)*2);break;
    }
    case 'equalAngle':{
      s.base=p.count===1?[g/2,g/2]:[-g/2,-g/2];
      for(let i=0;i<p.count;i++){const t=p.count===1?.5:i/(p.count-1)-.5;s.circle([t*g,t*g],m/2,true);}
      s.control('gap',[g/2,g/2],q=>Math.abs(q[0])*2);s.control('markSize',[g/2+m/2,g/2],q=>Math.abs(q[0]-g/2)*2);break;
    }
    case 'rightAngle':
      // Match the CAD insert's virtual vertex outside the inset visible L.
      s.base=[-l/2-l/3,h/2+h/3];
      s.poly([[-l/2,-h/2],[-l/2,h/2],[l/2,h/2]]);s.rect(-l/2,h/2-m,m,m,true);
      dimensions(s,p,[l/2,h/2],[-l/2,-h/2]);s.control('markSize',[-l/2+m,h/2-m],q=>Math.abs(q[0]+l/2));break;
    case 'fold':case 'unfold':case 'foldSmall':case 'mountainFold':case 'unfoldDouble':{
      const start:Point=[-l/2,h/2],end:Point=[l/2,-h/2],control=curveControl(a,a.symbol==='mountainFold'?[-l/2-p.curve,-h/2-p.curve/2]:[0,p.curve]);
      const offsets=a.symbol==='unfoldDouble'?[-g/2,g/2]:[0];
      for(const y of offsets){
        const delta:Point=[0,y],aa=add(start,delta),bb=add(end,delta),cc=add(control,delta);s.quad(aa,cc,bb);
        s.nativeEndpoints={start:aa,end:bb};s.nativeCurve={kind:'quadratic',a:aa,c:cc,b:bb,offset:delta};
        if(a.symbol==='unfold')arrowHead(s,aa,sub(aa,cc),p,false,false);
        arrowHead(s,bb,sub(bb,cc),p,a.symbol==='fold'||a.symbol==='mountainFold');
      }
      dimensions(s,p,end,start);
      s.control('curve',control,q=>a.symbol==='mountainFold'?-q[0]-l/2:q[1]);
      if(a.symbol==='unfoldDouble')s.control('gap',add(control,[0,g/2]),q=>Math.abs(q[1]-control[1])*2);break;
    }
    case 'swivel':{
      const end:Point=[l/2,-h/2];s.poly([[-l/2,h/2],[-g/2,h/2],[g/2,-h/2],end]);arrowHead(s,end,[1,0],p);
      s.nativeEndpoints={start:[-l/2,h/2],end};
      dimensions(s,p,end,[-l/2,h/2]);s.control('gap',[g/2,-h/2],q=>Math.abs(q[0])*2);break;
    }
    case 'sink':case 'open':case 'pull':{
      const tip:Point=[l/2,0],neck=l/2-p.headLength;
      const body=a.symbol==='sink'?h*.18:h/2;
      const points:Point[]=[[-l/2,-h/2],[neck,-body],[neck,-p.headWidth/2],tip,[neck,p.headWidth/2],[neck,body],[-l/2,h/2]];
      if(a.symbol==='open')points.push([-l/2+p.curve,0]);
      s.poly(points,true,a.symbol==='sink'?'currentColor':'white');dimensions(s,p,tip,[-l/2,h/2]);
      s.nativeEndpoints={start:[-l/2,0],end:tip};
      s.control('headLength',[neck,0],q=>l/2-q[0]);s.control('headWidth',[neck,p.headWidth/2],q=>Math.abs(q[1])*2);
      if(a.symbol==='open')s.control('curve',[-l/2+p.curve,0],q=>q[0]+l/2);break;
    }
    case 'flip':{
      const start:Point=[-l/2,h/2],end:Point=[l/2,-h/2];
      const c=curveControl(a,[-l/4,-p.curve]),d:Point=[r,-p.curve],b:Point=[r,0];
      s.cubic(start,c,d,b);s.nativeCurve={kind:'cubic',a:start,c,d,b};s.base=start;
      s.cubic([r,0],[r,r],[-r,r],[-r,0]);s.cubic([-r,0],[-r,-r],[l/4,-p.curve],end);
      arrowHead(s,end,sub(end,[l/4,-p.curve]),p);dimensions(s,p,end,start);
      s.control('radius',[r,0],q=>Math.abs(q[0]));s.control('curve',[-l/4,-p.curve],q=>-q[1]);break;
    }
    case 'rotate':{
      const angle=g/(r+80)*Math.PI,start=-Math.PI/2+angle,end=Math.PI/2-angle;
      for(const offset of [0,Math.PI]){arc(s,[0,0],r,start+offset,end+offset);const tip:Point=[r*Math.cos(end+offset),r*Math.sin(end+offset)];arrowHead(s,tip,[-Math.sin(end+offset),Math.cos(end+offset)],p);}
      s.control('radius',[r,0],q=>Math.hypot(...q));s.control('gap',[r*Math.cos(start),r*Math.sin(start)],q=>((Math.atan2(q[1],q[0])+Math.PI/2+Math.PI*2)%(Math.PI*2))/Math.PI*(r+80));break;
    }
    case 'zoom':case 'zoomOut':{
      const sign=a.symbol==='zoom'?1:-1,start:Point=[-l/2,sign*h/2],tip:Point=[l/2,-sign*h/2],control=curveControl(a,[0,-sign*p.curve]);
      const u=unit(sub(tip,control)),v:Point=[-u[1],u[0]],neck=sub(tip,mul(u,p.headLength));
      const startU=unit(sub(control,start)),startV:Point=[-startU[1],startU[0]],a0=add(start,mul(startV,h/4)),b0=sub(start,mul(startV,h/4));
      const a1=add(neck,mul(v,h/4)),b1=sub(neck,mul(v,h/4)),ha=add(neck,mul(v,p.headWidth/2)),hb=sub(neck,mul(v,p.headWidth/2)),ca=add(control,mul(v,h/4)),cb=sub(control,mul(v,h/4));
      s.path(`M ${xy(a0)} Q ${xy(ca)} ${xy(a1)} L ${xy(ha)} L ${xy(tip)} L ${xy(hb)} L ${xy(b1)} Q ${xy(cb)} ${xy(b0)} Z`,[a0,ca,a1,ha,tip,hb,b1,cb,b0],'white');
      s.nativeEndpoints={start,end:tip};
      // The visible ribbon's midline ends at the neck; arrow tip is a separate
      // endpoint. Keep its grip on the actual ribbon, not on a hidden extension.
      s.nativeCurve={kind:'quadratic',a:start,c:control,b:neck};
      dimensions(s,p,tip,start);s.control('curve',control,q=>-sign*q[1]);s.control('headLength',neck,q=>dot(sub(tip,q),u));s.control('headWidth',ha,q=>Math.abs(dot(sub(q,neck),v))*2);break;
    }
    case 'repeat':{
      s.rect(-l/2,-h/2,l,h);s.poly([[-l/2-g,h/2+g],[-l/2,h/2]]);s.circle([-l/2-g,h/2+g],3,true);
      s.base=[-l/2-g,h/2+g];
      label(s,a,p,[0,m*.35],true);for(let i=0;i<p.count;i++)s.circle([(i-(p.count-1)/2)*4,h/2-3],.6,true);
      dimensions(s,p);s.control('gap',[-l/2-g,h/2+g],q=>Math.max(0,-q[0]-l/2));break;
    }
    case 'return':{
      s.rect(-l/2,-h/2,l,h);label(s,a,p,[0,m*.35],true,'To ');
      s.base=[-l/2,h/2];
      for(let i=0;i<p.count;i++)s.circle([(i-(p.count-1)/2)*4,h/2-3],.6,true);dimensions(s,p);break;
    }
    case 'repeatSmall':{
      const tip:Point=[-l/2,h/2],end:Point=[l/2,-h/2];s.poly([tip,end]);arrowHead(s,tip,sub(tip,end),p);
      s.nativeEndpoints={start:end,end:tip};
      for(let i=0;i<p.count;i++){const x=end[0]-i*m*.8;s.poly([[x-m/2,end[1]-m/2],[x+m/2,end[1]+m/2]]);s.poly([[x-m/2,end[1]+m/2],[x+m/2,end[1]-m/2]]);}
      label(s,a,p,[0,h/2+m]);dimensions(s,p,end,tip);break;
    }
    case 'hold':{
      const start:Point=[-l/2,0],tip:Point=[l/2,0];s.poly([start,tip]);s.circle(start,r,true);arrowHead(s,tip,[1,0],p);
      s.nativeEndpoints={start,end:tip};
      s.control('length',tip,q=>Math.abs(q[0])*2);s.control('radius',add(start,[0,r]),q=>Math.hypot(...sub(q,start)));break;
    }
    case 'flapFront':case 'flapBack':{
      const start=-Math.PI*.8,end=Math.PI*.8,outer=r+g/2,inner=Math.max(.1,r-g/2),points:Point[]=[];
      for(let i=0;i<=40;i++){const t=start+(end-start)*i/40;points.push([outer*Math.cos(t),outer*Math.sin(t)]);}
      for(let i=40;i>=0;i--){const t=start+(end-start)*i/40;points.push([inner*Math.cos(t),inner*Math.sin(t)]);}
      s.poly(points,true,'white',a.symbol==='flapBack'?'3 3':undefined);
      const tip:Point=[r*Math.cos(start),r*Math.sin(start)],u:Point=[Math.sin(start),-Math.cos(start)],v:Point=[-u[1],u[0]],base=sub(tip,mul(u,p.headLength));
      arrowHead(s,tip,u,p);s.poly([add(base,mul(v,p.headWidth/2)),tip,sub(base,mul(v,p.headWidth/2))],true,'white');
      for(let i=0;i<p.count;i++)s.circle([-r-g-m*.2,(i-(p.count-1)/2)*m*.8],m*.13,true);
      label(s,a,p,[0,m*.35],true);s.control('radius',[r,0],q=>Math.abs(q[0]));s.control('gap',[outer,0],q=>Math.max(0,(q[0]-r)*2));break;
    }
    case 'star':{
      const points:Point[]=[];for(let i=0;i<p.count*2;i++){const angle=-Math.PI/2+i*Math.PI/p.count,rr=i%2?m:r;points.push([rr*Math.cos(angle),rr*Math.sin(angle)]);}
      s.poly(points,true,'currentColor');s.control('radius',[0,-r],q=>Math.hypot(...q));s.control('markSize',[m*Math.sin(Math.PI/p.count),-m*Math.cos(Math.PI/p.count)],q=>Math.hypot(...q));break;
    }
    case 'view':{
      const aa:Point=[-l/2,h/2],bb:Point=[-l/2+g,-h/2],cc:Point=[l/2,h/2];s.poly([aa,bb,cc],true);
      s.poly([bb,cc,add(cc,[-m,0])],true,'currentColor');const eye:Point=[l/2+g,-h/2],target:Point=[g/2,0];s.poly([eye,target]);arrowHead(s,target,sub(target,eye),p);
      s.nativeEndpoints={start:eye,end:target};
      s.circle(eye,m/3);s.poly([add(eye,[-m/2,-m/3]),add(eye,[m/2,m/3])]);if(typeof a.text==='string')label(s,a,p,add(eye,[m,m/2]));
      dimensions(s,p,cc,bb);s.control('gap',bb,q=>q[0]+l/2);s.control('markSize',add(eye,[m/3,0]),q=>Math.hypot(...sub(q,eye))*3);break;
    }
    case 'cut':{
      const neck=l/2-p.headLength;s.poly([[-l/2,-h/2],[neck,-h/2],[l/2,0],[neck,h/2],[-l/2,h/2]],true,'currentColor');
      s.poly([[-l/2+g,-h/2+g],[neck-g,-h/2+g],[neck-g,h/2-g],[-l/2+g,h/2-g]],true,'white');
      s.base=[-l/2,0];
      dimensions(s,p);s.control('headLength',[neck,0],q=>l/2-q[0]);s.control('gap',[-l/2+g,-h/2+g],q=>q[0]+l/2);break;
    }
    case 'blow':{
      const top:Point=[l/2,-g/2],bottom:Point=[l/2,g/2];
      const c=curveControl(a,[p.curve,-h/2]),d:Point=[-l/2,-h/2],b:Point=[-l/2,0];
      s.cubic(top,c,d,b);s.nativeCurve={kind:'cubic',a:top,c,d,b};
      s.cubic([-l/2,0],[-l/2,h/2],[p.curve,h/2],bottom);
      s.poly([top,[l/2+m,-g/2]]);s.poly([bottom,[l/2+m,g/2]]);s.poly([[l/2+m,0],[l/2,0]]);
      s.poly([[l/2+m*.3,-m*.25],[l/2,0],[l/2+m*.3,m*.25]]);dimensions(s,p,top,[0,h/2]);
      s.nativeEndpoints={start:[-l/2,0],end:[l/2,0]};
      s.control('curve',[p.curve,-h/2],q=>q[0]);s.control('gap',top,q=>Math.abs(q[1])*2);s.control('markSize',[l/2+m,0],q=>q[0]-l/2);break;
    }
    default:throw new Error('未知的折纸符号。');
  }
  const keys=new Set(SYMBOL_CATALOG.find(item=>item.kind===a.symbol)!.parameters.map(field=>field.key));
  s.controls=s.controls.filter(control=>keys.has(control.key)&&control.key!=='count');
  rotationLabel(s,a);return s;
}
function localBounds(s:Sketch){
  const xs=s.points.map(p=>p[0]),ys=s.points.map(p=>p[1]);return {x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};
}
function toWorld(a:DiagramSymbolAnnotation,point:Point):Point {
  const scale=positive(a.size/100),theta=finite(a.rotation)%360*Math.PI/180,x=point[0]*scale*(a.mirrored?-1:1),y=point[1]*scale;
  return [finite(a.position[0])+x*Math.cos(theta)-y*Math.sin(theta),finite(a.position[1])+x*Math.sin(theta)+y*Math.cos(theta)];
}
function toLocal(a:DiagramSymbolAnnotation,point:Point):Point {
  const scale=positive(a.size/100),theta=finite(a.rotation)%360*Math.PI/180,dx=finite(point[0])-finite(a.position[0]),dy=finite(point[1])-finite(a.position[1]);
  return [(dx*Math.cos(theta)+dy*Math.sin(theta))/scale*(a.mirrored?-1:1),(-dx*Math.sin(theta)+dy*Math.cos(theta))/scale];
}
export function symbolComponentHandles(annotation:DiagramSymbolAnnotation):{key:Key;label:string;point:Point}[]{
  return symbolSketch(annotation).controls.map(control=>({key:control.key,label:control.label,point:toWorld(annotation,control.point)}));
}
export function moveSymbolComponent(annotation:DiagramSymbolAnnotation,key:Key,worldPoint:Point):DiagramSymbolAnnotation {
  const control=symbolSketch(annotation).controls.find(control=>control.key===key);if(!control)return structuredClone(annotation);
  const [min,max]=DIAGRAM_SYMBOL_PARAM_LIMITS[key],value=Math.min(max,Math.max(min,finite(control.read(toLocal(annotation,worldPoint)))));
  const result={...structuredClone(annotation),params:{...annotation.params,[key]:value}};
  if(key==='curve')delete result.curveControl;
  return keepSymbolRoot(annotation,result);
}

export type DiagramSymbolGripSemantic='move'|'scale'|'rotate'|'mirror'|'shape';
export interface DiagramSymbolNativeGrip {id:string;kind:'anchor'|'endpoint'|'component'|'rotation';semantic:DiagramSymbolGripSemantic;label:string;point:Point;component?:Key;sourceGripHandle?:number;sourceBlockHandle?:number;parameterHandle?:number}
export interface DiagramSymbolNativeBaseline {start:Point;end:Point;anchor:Point;rooted:boolean}
export const isDiagramRepeatSymbol=(symbol:DiagramSymbolKind)=>symbol==='repeat'||symbol==='repeatSmall'||symbol==='repeatMark';
const ROOTED_SYMBOLS:readonly DiagramSymbolKind[]=['fold','open','pull','hold','rightAngle'];
const hasSymbolRoot=(annotation:DiagramSymbolAnnotation)=>ROOTED_SYMBOLS.includes(annotation.symbol)||annotation.symbol!=='tearWindow'&&(annotation.cadProperties!==undefined||!!SYMBOL_CATALOG.find(item=>item.kind===annotation.symbol)?.sourceOnly);
function localSymbolAnchor(annotation:DiagramSymbolAnnotation,source:NativeEndpoints):Point {
  return hasSymbolRoot(annotation)?source.start:midpoint(source.start,source.end);
}
/** Baseline geometry remains available when the root replaces its coincident start grip. */
export function symbolNativeBaseline(annotation:DiagramSymbolAnnotation):DiagramSymbolNativeBaseline|null {
  const source=symbolSketch(annotation).nativeEndpoints;if(!source)return null;
  return {start:toWorld(annotation,source.start),end:toWorld(annotation,source.end),anchor:toWorld(annotation,localSymbolAnchor(annotation,source)),rooted:hasSymbolRoot(annotation)};
}
/** The repeat box is horizontal at zero object rotation. Its diagonal leader
 * is not the box's orientation. The small repeat arrow uses its own baseline. */
export function diagramRepeatVisualAngle(annotation:DiagramSymbolAnnotation,drawingRotation=0):number {
  if(annotation.symbol==='repeat'||annotation.symbol==='repeatMark')return annotation.rotation+drawingRotation;
  const baseline=symbolNativeBaseline(annotation);
  return (baseline?Math.atan2(baseline.end[1]-baseline.start[1],baseline.end[0]-baseline.start[0])*180/Math.PI:annotation.rotation)+drawingRotation;
}
export function setDiagramRepeatVisualAngle(annotation:DiagramSymbolAnnotation,angle:number,drawingRotation=0):DiagramSymbolAnnotation {
  if(!Number.isFinite(angle)||!Number.isFinite(drawingRotation))throw new Error('重复符号角度无效。');
  const rotation=annotation.rotation+angle-diagramRepeatVisualAngle(annotation,drawingRotation);
  return {...annotation,rotation:((rotation+180)%360+360)%360-180};
}
export function orientDiagramRepeatSymbol(annotation:DiagramSymbolAnnotation,drawingRotation:number):DiagramSymbolAnnotation {
  return annotation.symbol==='repeat'||annotation.symbol==='repeatSmall'?setDiagramRepeatVisualAngle(annotation,diagramRepeatVisualAngle(annotation,0),drawingRotation):annotation;
}
function curveMidpoint(curve:NativeCurve):Point {
  return curve.kind==='quadratic'?add(add(mul(curve.a,.25),mul(curve.c,.5)),mul(curve.b,.25)):
    add(add(mul(curve.a,.125),mul(curve.c,.375)),add(mul(curve.d,.375),mul(curve.b,.125)));
}
function nativeControls(annotation:DiagramSymbolAnnotation,sketch:Sketch):Control[] {
  const p=getSymbolParameters(annotation);
  return sketch.controls.map(control=>{
    if(annotation.symbol==='equalLength'&&control.key==='length')return {...control,point:[p.length/2,-p.gap/2] as Point};
    if(annotation.symbol==='equalLength'&&control.key==='gap')return {...control,point:[-p.length/2,p.gap/2] as Point};
    if(annotation.symbol==='equalAngle'&&control.key==='gap')return {...control,point:[p.gap/2,p.gap/2+p.markSize/2] as Point,read:(q:Point)=>Math.max(0,(q[1]-p.markSize/2)*2)};
    if(annotation.symbol==='repeat'&&control.key==='gap')return {...control,point:[-p.length/2-p.gap/2,p.height/2+p.gap/2] as Point,read:(q:Point)=>Math.max(0,(-q[0]-p.length/2)*2)};
    if(annotation.symbol==='flip'&&control.key==='height'){
      // The latter cubic's midpoint is visible and separate from the base and
      // tip. Its y coordinate depends linearly on the vertical end offset.
      const point=curveMidpoint({kind:'cubic',a:[-p.radius,0],c:[-p.radius,-p.radius],d:[p.length/4,-p.curve],b:[p.length/2,-p.height/2]});
      return {...control,point,read:(q:Point)=>-(q[1]+p.radius*.375+p.curve*.375)*16};
    }
    return control;
  });
}
/** CAD-style grips live on the symbol's geometry, without an external frame. */
export function symbolNativeGrips(annotation:DiagramSymbolAnnotation,_rotationOffset?:number):DiagramSymbolNativeGrip[] {
  const s=symbolSketch(annotation);
  if(s.cadOrigins){
    const baseline=s.nativeEndpoints,origin=baseline&&toWorld(annotation,localSymbolAnchor(annotation,baseline));
    const end=baseline&&toWorld(annotation,baseline.end),axis=origin&&end?sub(end,origin):null,length=axis&&Math.hypot(...axis);
    const rotate:DiagramSymbolNativeGrip[]=isDiagramRepeatSymbol(annotation.symbol)&&origin&&axis&&length? [{id:'rotate',kind:'rotation',semantic:'rotate',label:'重复符号整体旋转',point:add(origin,[-axis[1]/length*Math.max(20,length*.3),axis[0]/length*Math.max(20,length*.3)])}]:[];
    return [...s.cadOrigins.map(origin=>({id:origin.id,kind:'anchor' as const,semantic:'move' as const,label:'原插件插入基点：移动',point:toWorld(annotation,origin.point),sourceBlockHandle:origin.blockHandle})),...rotate,
      ...s.cadControls.map(control=>{
        const definition=cadPropertyDefinitions(annotation.symbol).find(def=>def.key===control.key),semantic:DiagramSymbolGripSemantic=definition?.type==='flip'?'mirror':definition?.type==='angle'||control.readProperties?'rotate':'scale';
        return {id:`cad:${control.id}`,kind:'component' as const,semantic,label:annotation.symbol==='rightAngle'&&semantic==='scale'?'直角标记整体缩放':control.label,point:toWorld(annotation,control.point),sourceGripHandle:control.sourceGripHandle,parameterHandle:control.parameterHandle};
      })];
  }
  const anchor=s.nativeEndpoints?localSymbolAnchor(annotation,s.nativeEndpoints):s.base;
  const origin:DiagramSymbolNativeGrip={id:s.nativeEndpoints?'center':'base',kind:'anchor',semantic:'move',label:annotation.symbol==='tearWindow'?'透视区域中心：移动':'绘图定位点：移动',point:toWorld(annotation,anchor)};
  if(annotation.symbol==='tearWindow'){
    const radius=nativeControls(annotation,s).find(control=>control.key==='radius')!;
    return [origin,{id:'component:radius',kind:'component',semantic:'scale',label:'透视半径',component:'radius',point:toWorld(annotation,radius.point)}];
  }
  // Legacy sketches retain saved artwork, but have no reliable transform from
  // DWG grip positions to their different parameterized paths. Keep positioning
  // only; legacy shape/scale/rotation remain available in the properties panel.
  return [origin];
}
function checkedPosition(point:Point):Point {
  if(point.some(value=>!Number.isFinite(value)||Math.abs(value)>DIAGRAM_ANNOTATION_LIMITS.coordinate))throw new Error('符号基点超出绘图坐标范围，请移近画面后调整。');
  return point;
}
function checkedCurveControl(point:Point):Point {
  if(point.some(value=>!Number.isFinite(value)||Math.abs(value)>1000))throw new Error('曲线控制点超出可调范围（每轴 −1000～1000），请缩小弯曲程度。');
  return point;
}
function anchoredPosition(annotation:DiagramSymbolAnnotation,localCenter:Point,worldCenter:Point):Point {
  const scale=positive(annotation.size/100),theta=finite(annotation.rotation)%360*Math.PI/180;
  const x=localCenter[0]*scale*(annotation.mirrored?-1:1),y=localCenter[1]*scale;
  return checkedPosition([worldCenter[0]-x*Math.cos(theta)+y*Math.sin(theta),worldCenter[1]-x*Math.sin(theta)-y*Math.cos(theta)]);
}
/** Component edits may move native CAD base geometry; keep its paper contact root fixed. */
function keepSymbolRoot(previous:DiagramSymbolAnnotation,next:DiagramSymbolAnnotation):DiagramSymbolAnnotation {
  if(!hasSymbolRoot(previous))return next;
  const beforeSketch=symbolSketch(previous),afterSketch=symbolSketch(next),before=beforeSketch.nativeEndpoints,after=afterSketch.nativeEndpoints;
  if(beforeSketch.cadOrigins&&afterSketch.cadOrigins){
    const original=beforeSketch.cadOrigins[0].point,changed=afterSketch.cadOrigins[0].point;
    if(original[0]===changed[0]&&original[1]===changed[1])return next;
    return {...next,position:anchoredPosition(next,changed,toWorld(previous,original))};
  }
  if(!before||!after)return previous.symbol==='rightAngle'?{...next,position:anchoredPosition(next,afterSketch.base,toWorld(previous,beforeSketch.base))}:next;
  return {...next,position:anchoredPosition(next,after.start,toWorld(previous,before.start))};
}
/** A mirror grip is a click toggle rather than a drag, while its contact root stays fixed. */
export function toggleSymbolNativeMirror(annotation:DiagramSymbolAnnotation,id:string):DiagramSymbolAnnotation {
  if(!id.startsWith('cad:'))return structuredClone(annotation);
  const key=id.slice(4),control=symbolSketch(annotation).cadControls.find(control=>control.id===key||control.key===key),definition=cadPropertyDefinitions(annotation.symbol).find(def=>def.key===control?.key&&def.type==='flip'&&def.editable);
  if(!definition||!control)return structuredClone(annotation);
  return keepSymbolRoot(annotation,moveCadSymbolPropertyGrip(annotation,key,add(control.point,[1,0])));
}
function dragEndpoint(annotation:DiagramSymbolAnnotation,id:'start'|'end',target:Point):DiagramSymbolAnnotation {
  const source=symbolSketch(annotation).nativeEndpoints!,start=toWorld(annotation,source.start),end=toWorld(annotation,source.end),localCenter=localSymbolAnchor(annotation,source),center=toWorld(annotation,localCenter),axis=unit(sub(end,start));
  const projection=dot(sub(target,center),axis)*(id==='end'?1:-1),radius=Math.hypot(...sub(end,start))/(hasSymbolRoot(annotation)?1:2);
  if(projection<=0)throw new Error(annotation.symbol==='rightAngle'?'缩放点不能越过固定锚点，请沿基线在原有一侧调整。':hasSymbolRoot(annotation)?'箭头尖端不能越过根部，请沿基线在原有一侧调整。':'端点不能越过基线中点，请沿基线在原有一侧调整。');
  const size=annotation.size*projection/radius;
  if(!Number.isFinite(size)||size<DIAGRAM_ANNOTATION_LIMITS.minimumSize||size>DIAGRAM_ANNOTATION_LIMITS.size)throw new Error(`符号尺寸超出可调范围（${DIAGRAM_ANNOTATION_LIMITS.minimumSize}～${DIAGRAM_ANNOTATION_LIMITS.size}），请把端点拖回基线上。`);
  // Motion perpendicular to the baseline does not resize or rotate the arrow.
  if(Math.abs(size-annotation.size)<=Math.max(1,annotation.size)*1e-10)return structuredClone(annotation);
  const result={...structuredClone(annotation),size};result.position=anchoredPosition(result,localCenter,center);return result;
}
function dragRotation(annotation:DiagramSymbolAnnotation,target:Point):DiagramSymbolAnnotation {
  const source=symbolSketch(annotation).nativeEndpoints!,start=toWorld(annotation,source.start),end=toWorld(annotation,source.end),localCenter=localSymbolAnchor(annotation,source),center=toWorld(annotation,localCenter),axis=sub(end,start),normal:Point=[-axis[1],axis[0]],direction=sub(target,center);
  if(Math.hypot(...direction)<1e-10)throw new Error(hasSymbolRoot(annotation)?'旋转点不能放在根部定位点，请拖到根部周围。':'旋转点不能放在基线中点，请拖到中点周围。');
  const angle=Math.atan2(direction[1],direction[0])-Math.atan2(normal[1],normal[0]),delta=Math.atan2(Math.sin(angle),Math.cos(angle));
  if(Math.abs(delta)<=1e-12)return structuredClone(annotation);
  const result={...structuredClone(annotation),rotation:((annotation.rotation+delta*180/Math.PI)%360+360)%360};
  result.position=anchoredPosition(result,localCenter,center);return result;
}
function dragCurve(annotation:DiagramSymbolAnnotation,target:Point):DiagramSymbolAnnotation {
  const s=symbolSketch(annotation),curve=s.nativeCurve;if(!curve)return moveSymbolComponent(annotation,'curve',target);
  const point=toLocal(annotation,target);let control:Point;
  if(curve.kind==='cubic')control=mul(sub(sub(mul(point,8),curve.a),add(mul(curve.d,3),curve.b)),1/3);
  else if(annotation.symbol==='zoom'||annotation.symbol==='zoomOut'){
    // The broad-arrow shaft ends at its neck. Its direction, and therefore
    // that neck, depends on C; solve the midpoint equation analytically.
    const p=getSymbolParameters(annotation),tip=s.nativeEndpoints!.end;
    const k=sub(mul(point,2),mul(add(curve.a,tip),.5)),d=sub(tip,k),distance=Math.hypot(...d);
    if(distance<=p.headLength/2+1e-9)throw new Error('曲线中点太靠近箭头尖端，请拖到箭身中部。');
    control=add(k,mul(d,p.headLength/(2*distance)));
  }else control=sub(sub(mul(point,2),mul(add(curve.a,curve.b),.5)),curve.offset??[0,0]);
  const result:DiagramSymbolAnnotation={...structuredClone(annotation),curveControl:checkedCurveControl(control)};
  const scalar=s.controls.find(c=>c.key==='curve')?.read(control),[min,max]=DIAGRAM_SYMBOL_PARAM_LIMITS.curve;
  // Flip's second cubic control also uses its scalar; keep that preset stable
  // so moving C1 does not accidentally move the fixed curve midpoint again.
  if(annotation.symbol!=='flip'&&scalar!==undefined&&Number.isFinite(scalar)&&scalar>=min&&scalar<=max)result.params={...annotation.params,curve:scalar};
  return result;
}
/** Scale along the baseline about the symbol's contact root or ordinary midpoint. */
export function moveSymbolNativeGrip(annotation:DiagramSymbolAnnotation,id:string,worldPoint:Point):DiagramSymbolAnnotation {
  const s=symbolSketch(annotation);worldPoint=worldPoint.map(finite) as Point;
  const current=symbolNativeGrips(annotation).find(grip=>grip.id===id);
  if(current&&Math.hypot(...sub(current.point,worldPoint))<=1e-10)return structuredClone(annotation);
  if(s.cadOrigins&&current?.semantic==='move')return {...structuredClone(annotation),position:checkedPosition(add(annotation.position,sub(worldPoint,current.point)))};
  // The perpendicular marker's native distance action translates all of its
  // vertices together. Its blue drawing grip instead scales the complete
  // marker along the displayed baseline, keeping the red paper anchor fixed.
  // Preserve the original CAD property action for explicit property edits.
  if(annotation.symbol==='rightAngle'&&current?.semantic==='scale')return dragEndpoint(annotation,'end',worldPoint);
  if(id==='start'&&s.nativeEndpoints&&hasSymbolRoot(annotation))return {...structuredClone(annotation),position:checkedPosition(add(annotation.position,sub(worldPoint,toWorld(annotation,s.nativeEndpoints.start))))};
  if((id==='start'||id==='end')&&s.nativeEndpoints)return dragEndpoint(annotation,id,worldPoint);
  if(id==='rotate'&&s.nativeEndpoints)return dragRotation(annotation,worldPoint);
  if(id==='center'&&s.nativeEndpoints){const center=toWorld(annotation,localSymbolAnchor(annotation,s.nativeEndpoints));return {...structuredClone(annotation),position:checkedPosition(add(annotation.position,sub(worldPoint,center)))};}
  if(id==='base'&&!s.nativeEndpoints){const delta=sub(worldPoint,toWorld(annotation,s.base));return {...structuredClone(annotation),position:checkedPosition(add(annotation.position,delta))};}
  if(id.startsWith('cad:'))return keepSymbolRoot(annotation,moveCadSymbolPropertyGrip(annotation,id.slice(4),toLocal(annotation,worldPoint)));
  if(id==='component:curve'&&s.nativeCurve)return keepSymbolRoot(annotation,dragCurve(annotation,worldPoint));
  const control=nativeControls(annotation,s).find(c=>id===`component:${c.key}`);
  if(!control)return structuredClone(annotation);
  const [min,max]=DIAGRAM_SYMBOL_PARAM_LIMITS[control.key],value=Math.min(max,Math.max(min,finite(control.read(toLocal(annotation,worldPoint)))));
  const result={...structuredClone(annotation),params:{...annotation.params,[control.key]:value}};
  if(control.key==='curve')delete result.curveControl;
  return keepSymbolRoot(annotation,result);
}

const midpoint=(a:Point,b:Point):Point=>mul(add(a,b),.5);
function segmentDistance(point:Point,a:Point,b:Point):number {
  const d=sub(b,a),lengthSquared=dot(d,d),t=lengthSquared?Math.max(0,Math.min(1,dot(sub(point,a),d)/lengthSquared)):0;
  return Math.hypot(...sub(point,add(a,mul(d,t))));
}
function orientation(a:Point,b:Point,c:Point){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function segmentsMeet(a:Point,b:Point,c:Point,d:Point){
  const u=orientation(a,b,c),v=orientation(a,b,d),w=orientation(c,d,a),z=orientation(c,d,b);
  if(u*v<0&&w*z<0)return true;
  return segmentDistance(a,c,d)<1e-10||segmentDistance(b,c,d)<1e-10||segmentDistance(c,a,b)<1e-10||segmentDistance(d,a,b)<1e-10;
}
function segmentPairDistance(a:Point,b:Point,c:Point,d:Point){return segmentsMeet(a,b,c,d)?0:Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b));}
function insidePolygon(point:Point,points:Point[]):boolean {
  let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
function flattenQuadratic(a:Point,c:Point,b:Point,error:number,out:Point[],depth=0){
  if(depth>=16||segmentDistance(c,a,b)<=error){out.push(b);return;}
  const ac=midpoint(a,c),cb=midpoint(c,b),center=midpoint(ac,cb);flattenQuadratic(a,ac,center,error,out,depth+1);flattenQuadratic(center,cb,b,error,out,depth+1);
}
function flattenCubic(a:Point,c:Point,d:Point,b:Point,error:number,out:Point[],depth=0){
  if(depth>=16||Math.max(segmentDistance(c,a,b),segmentDistance(d,a,b))<=error){out.push(b);return;}
  const ac=midpoint(a,c),cd=midpoint(c,d),db=midpoint(d,b),left=midpoint(ac,cd),right=midpoint(cd,db),center=midpoint(left,right);
  flattenCubic(a,ac,left,center,error,out,depth+1);flattenCubic(center,right,db,b,error,out,depth+1);
}
/** Parse only our own M/L/Q/C/Z paths; never evaluate imported SVG or script. */
function flattenedPaths(d:string,error:number):Point[][] {
  const tokens=d.match(/[MLQCZ]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)??[],paths:Point[][]=[];let i=0,current:Point=[0,0],start:Point=[0,0],path:Point[]=[];
  const point=():Point=>[Number(tokens[i++]),Number(tokens[i++])];
  while(i<tokens.length){
    const command=tokens[i++].toUpperCase();
    if(command==='M'){if(path.length)paths.push(path);current=point();start=current;path=[current];}
    else if(command==='L'){current=point();path.push(current);}
    else if(command==='Q'){const control=point(),end=point();flattenQuadratic(current,control,end,error,path);current=end;}
    else if(command==='C'){const c=point(),control=point(),end=point();flattenCubic(current,c,control,end,error,path);current=end;}
    else if(command==='Z'){path.push(start);current=start;}
    else throw new Error('内部折纸符号路径无效。');
  }if(path.length)paths.push(path);return paths;
}
function visibleSegments(points:Point[],dash?:string):[Point,Point][] {
  if(!dash)return points.slice(1).map((point,index)=>[points[index],point]);
  const lengths=dash.split(/\s+/).map(Number),segments:[Point,Point][]=[];let phase=0,remaining=lengths[0];
  for(let i=1;i<points.length;i++){
    const from=points[i-1],to=points[i],distance=Math.hypot(...sub(to,from));if(!distance)continue;let walked=0;
    while(walked<distance-1e-12){const amount=Math.min(remaining,distance-walked);if(!(phase%2))segments.push([add(from,mul(sub(to,from),walked/distance)),add(from,mul(sub(to,from),(walked+amount)/distance))]);walked+=amount;remaining-=amount;if(remaining<=1e-12){phase=(phase+1)%lengths.length;remaining=lengths[phase];}}
  }return segments;
}
function shapeSegmentHits(shape:HitShape,from:Point,to:Point,tolerance:number,width:number,error:number):boolean {
  if(shape.kind==='circle'){
    const min=segmentDistance(shape.center,from,to),max=Math.max(Math.hypot(...sub(from,shape.center)),Math.hypot(...sub(to,shape.center)));
    return shape.filled?min<=shape.radius+tolerance:min<=shape.radius+width/2+tolerance&&max>=shape.radius-width/2-tolerance;
  }
  if(shape.kind==='text'){
    const points:Point[]=[shape.a,[shape.b[0],shape.a[1]],shape.b,[shape.a[0],shape.b[1]],shape.a];
    return insidePolygon(from,points)||insidePolygon(to,points)||visibleSegments(points).some(([a,b])=>segmentPairDistance(from,to,a,b)<=tolerance);
  }
  for(const points of flattenedPaths(shape.d,error)){
    if(shape.filled&&(insidePolygon(from,points)||insidePolygon(to,points)||visibleSegments(points).some(([a,b])=>segmentPairDistance(from,to,a,b)<=tolerance)))return true;
    if(shape.stroke&&visibleSegments(points,shape.dash).some(([a,b])=>segmentPairDistance(from,to,a,b)<=width/2+tolerance+error))return true;
  }return false;
}
/** Hit real strokes/fills and label ink areas, rather than the overall envelope. */
export function pointHitsDiagramSymbol(annotation:DiagramSymbolAnnotation,point:Point,tolerance:number):boolean {
  return symbolIntersectsSegment(annotation,point,point,tolerance);
}
/** Swept erasing checks the same actual geometry used by the renderer. */
export function symbolIntersectsSegment(annotation:DiagramSymbolAnnotation,from:Point,to:Point,tolerance:number):boolean {
  const scale=positive(annotation.size/100),width=positive(annotation.width)/scale,localTolerance=Math.max(0,finite(tolerance))/scale;
  const a=toLocal(annotation,from),b=toLocal(annotation,to),error=Math.max(1e-7,Math.min(.25,(localTolerance+width/2)*.12));
  return symbolSketch(annotation).hitShapes.some(shape=>shapeSegmentHits(shape,a,b,localTolerance,width,error));
}
/** Rectangle selection intersects real ink/fills, including isolated filled dots. */
export function symbolIntersectsBox(annotation:DiagramSymbolAnnotation,from:Point,to:Point,tolerance=.001):boolean {
  const x0=Math.min(finite(from[0]),finite(to[0])),x1=Math.max(from[0],to[0]),y0=Math.min(finite(from[1]),finite(to[1])),y1=Math.max(from[1],to[1]);
  const corners:Point[]=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(point=>toLocal(annotation,point as Point)),edges:[Point,Point][]=corners.map((point,index)=>[point,corners[(index+1)%4]]);
  const scale=positive(annotation.size/100),width=positive(annotation.width)/scale,localTolerance=Math.max(0,finite(tolerance))/scale,error=Math.max(1e-7,Math.min(.25,(localTolerance+width/2)*.12));
  const inBox=(point:Point)=>insidePolygon(point,corners)||edges.some(([a,b])=>segmentDistance(point,a,b)<=localTolerance);
  for(const shape of symbolSketch(annotation).hitShapes){
    if(edges.some(([a,b])=>shapeSegmentHits(shape,a,b,localTolerance,width,error)))return true;
    if(shape.kind==='circle'){
      if(shape.filled&&inBox(shape.center))return true;
      const r=shape.radius;
      if([[r,0],[-r,0],[0,r],[0,-r]].some(delta=>inBox(add(shape.center,delta as Point))))return true;
    }else if(shape.kind==='text'){
      if([shape.a,shape.b,[shape.b[0],shape.a[1]],[shape.a[0],shape.b[1]]].some(point=>inBox(point as Point)))return true;
    }else for(const points of flattenedPaths(shape.d,error)){
      if(shape.filled&&points.some(inBox))return true;
      if(shape.stroke&&visibleSegments(points,shape.dash).some(([a,b])=>inBox(a)||inBox(b)))return true;
    }
  }return false;
}

/** Internal palette markup fitted to viewBox="-50 -50 100 100" using the same paths. */
export function diagramSymbolPreview(symbol:DiagramSymbolKind):string {
  const sketch=symbolSketch({id:'preview',kind:'symbol',symbol,position:[0,0],size:100,rotation:0,color:'#333333',width:2.5,cadProperties:{}}),b=localBounds(sketch);
  const fit=80/Math.max(1,b.right-b.x,b.bottom-b.y),cx=(b.x+b.right)/2,cy=(b.y+b.bottom)/2;
  return `<g transform="translate(${n(-cx*fit)} ${n(-cy*fit)}) scale(${n(fit)})" fill="none" stroke="currentColor" stroke-width="${n(2.5/fit)}" stroke-linecap="round" stroke-linejoin="round">${sketch.markup}</g>`;
}
/** Render one step annotation in world coordinates; no editor handles are emitted. */
export function diagramAnnotationMarkup(annotation:DiagramAnnotation,lineDisplay?:AdaptiveLineOptions&{minimumWidth?:number}):string {
  const stroke=safeColor(annotation.color),width=positive(annotation.width);
  if(annotation.kind==='line'){
    const [ax,ay]=annotation.a.map(finite),[bx,by]=annotation.b.map(finite);
    const originalDash=diagramLineDasharray(annotation.style,width,annotation.strokePattern);
    const penWidth=lineDisplay?.minimumWidth?Math.max(width,lineDisplay.minimumWidth):width;
    const paint=lineDisplay?adaptiveLineStroke(Math.hypot(bx-ax,by-ay),penWidth,originalDash,{...lineDisplay,linecap:'round'}):{width,dash:originalDash,limited:false,dashOffset:undefined};
    const attributes=`x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" fill="none" stroke="${stroke}" stroke-width="${n(paint.width)}" stroke-linecap="round"${paint.dash?` stroke-dasharray="${paint.dash}"`:''}${paint.dashOffset!==undefined?` stroke-dashoffset="${n(paint.dashOffset)}"`:''}`;
    const adjusted=paint.width!==width||paint.dash!==originalDash||paint.dashOffset!==undefined||paint.limited;
    return lineDisplay?.enabled&&adjusted?`<line ${attributes} data-adaptive-line="true"${paint.limited?' data-line-detail-limited="true"':''}><title>${LINE_LABELS[annotation.style]}${paint.limited?' · 当前显示过小，放大查看线型':''}</title></line>`:`<line ${attributes}/>`;
  }
  if(annotation.kind!=='symbol')throw new Error('未知的折图对象。');
  const [x,y]=annotation.position.map(finite),scale=positive(annotation.size/100),localWidth=positive(width/scale),rotation=finite(annotation.rotation)%360;
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rotation)}) scale(${n(annotation.mirrored?-scale:scale)} ${n(scale)})" color="${stroke}" fill="none" stroke="currentColor" stroke-width="${n(localWidth)}" stroke-linecap="round" stroke-linejoin="round">${symbolSketch(annotation).markup}</g>`;
}
export interface DiagramAnnotationBounds {x:number;y:number;width:number;height:number}
/** Dynamic conservative bounds contain curves, arrow components, text and stroke. */
export function annotationBounds(annotations:readonly DiagramAnnotation[]):DiagramAnnotationBounds|null {
  if(!annotations.length)return null;let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const annotation of annotations){
    const half=positive(annotation.width)/2;let points:Point[];
    if(annotation.kind==='line')points=[annotation.a.map(finite) as Point,annotation.b.map(finite) as Point];
    else if(annotation.kind==='symbol'){
      const b=localBounds(symbolSketch(annotation));points=[[b.x,b.y],[b.right,b.y],[b.right,b.bottom],[b.x,b.bottom]].map(p=>toWorld(annotation,p as Point));
    }else throw new Error('未知的折图对象。');
    for(const [x,y] of points){left=Math.min(left,x-half);right=Math.max(right,x+half);top=Math.min(top,y-half);bottom=Math.max(bottom,y+half);}
  }
  return {x:left,y:top,width:right-left,height:bottom-top};
}
