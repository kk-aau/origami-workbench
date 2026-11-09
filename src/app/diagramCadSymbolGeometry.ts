import type {Point} from '../core/types';
import {validateDiagramCadAttributes,validateDiagramCadProperties,type DiagramSymbolAnnotation} from './diagramAnnotations';
import {cadAttributeDefinitions,cadPropertyDefinitions,getCadBlockByHandle,getCadSymbolBlock,type CadSymbolAction,type CadSymbolBlock,type CadSymbolEntity,type CadSymbolParameter} from './diagramCadSymbols';
import {diagramCadGripSources,diagramCadPropertySupported} from './diagramCadGripSource';

type Matrix=readonly [number,number,number,number,number,number];
const ID:Matrix=[1,0,0,1,0,0];
const point=(v:unknown):Point=>Array.isArray(v)?[Number(v[0])||0,Number(v[1])||0]:[0,0];
const num=(v:unknown,fallback=0)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
const add=(a:Point,b:Point):Point=>[a[0]+b[0],a[1]+b[1]];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const mul=(a:Point,k:number):Point=>[a[0]*k,a[1]*k];
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];
const unit=(a:Point):Point=>mul(a,1/(Math.hypot(...a)||1));
const near=(a:Point,b:Point)=>Math.hypot(...sub(a,b))<1e-6;
const tx=(m:Matrix,p:Point):Point=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
function compose(a:Matrix,b:Matrix):Matrix{return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function inverse(m:Matrix):Matrix{const d=m[0]*m[3]-m[1]*m[2];if(!Number.isFinite(d)||d===0)throw new Error('原插件几何变换不可逆。');return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
function around(center:Point,linear:Matrix):Matrix{return compose([1,0,0,1,...center],compose(linear,[1,0,0,1,-center[0],-center[1]]));}
function rotate(center:Point,angle:number):Matrix{const c=Math.cos(angle),s=Math.sin(angle);return around(center,[c,s,-s,c,0,0]);}
function reflect(a:Point,b:Point):Matrix{const u=unit(sub(b,a));return around(a,[2*u[0]*u[0]-1,2*u[0]*u[1],2*u[0]*u[1],2*u[1]*u[1]-1,0,0]);}

export interface CadGeometryProvenance {sourceHandle:number;sourceType:string;blockHandle:number}
export type CadSymbolPrimitive=CadGeometryProvenance&(
 {kind:'path';d:string;points:Point[];fill:'none'|'currentColor'|'white';stroke:boolean;dash?:string;start?:Point;end?:Point}|
 {kind:'text';text:string;point:Point;size:number;angle:number;anchor:'start'|'middle'|'end'}
);
export interface CadSymbolControl {key:string;id?:string;label:string;point:Point;sourceGripHandle?:number;parameterHandle?:number;read:(point:Point)=>number;readProperties?:(point:Point)=>Record<string,number>}
export interface CadSymbolJoint {bodyHandle:number;insertHandle:number;point:Point;headOrigin:Point}
export interface CadSymbolGeometry {primitives:CadSymbolPrimitive[];baseline:{start:Point;end:Point};basePoints:{id:string;point:Point;blockHandle:number}[];controls:CadSymbolControl[];joints:CadSymbolJoint[];warnings:string[];unsupportedPropertyKeys:string[]}
interface State {entity:CadSymbolEntity;matrix:Matrix;points?:Point[]}
function entityPoints(e:CadSymbolEntity):Point[]{
 if(e.entity==='LWPOLYLINE')return (e.points as unknown[]??[]).map(point);
 if(e.entity==='SPLINE')return (e.ctrl_pts as {x:number;y:number}[]??[]).map(p=>[p.x,p.y]);
 if(e.entity==='LINE')return [point(e.start),point(e.end)];
 if(e.entity==='INSERT'||e.entity==='TEXT'||e.entity==='ATTDEF')return [point(e.ins_pt)];
 if(e.entity==='CIRCLE'||e.entity==='ARC'||e.entity==='ELLIPSE')return [point(e.center)];
 if(e.entity==='WIPEOUT'){
  const origin=point(e.pt0),u=point(e.uvec),v=point(e.vvec);
  return (e.clip_verts as unknown[]??[]).map(point).map(p=>add(origin,add(mul(u,p[0]+.5),mul(v,.5-p[1]))));
 }
 return [];
}
const unsupported=(block:CadSymbolBlock,key:string)=>!diagramCadPropertySupported(block,key);

/** Linear-parameter Scale is uniform; XY-specific scale modes are not inferred from action names. */
function actionMatrix(action:CadSymbolAction,parameter:CadSymbolParameter,value:number,initial:number):Matrix|undefined{
 const base=point(action.dependent===0?action.base_pt:parameter.def_basept),end=point(parameter.def_endpt);
 if(action.object==='BLOCKROTATEACTION')return rotate(base,(value-initial)*Math.PI/180);
 if(action.object==='BLOCKFLIPACTION')return value!==initial?reflect(point(parameter.def_basept),end):ID;
 if(action.object==='BLOCKSCALEACTION')return around(base,[value/initial,0,0,value/initial,0,0]);
 return undefined;
}
function actionDisplacement(action:CadSymbolAction,parameter:CadSymbolParameter,delta:number):Point{
 const axis=unit(sub(point(parameter.def_endpt),point(parameter.def_basept))),angle=num(action.angle_offset),c=Math.cos(angle),s=Math.sin(angle);
 const factor=num(action.distance_multiplier,num(action.action_offset_x,1)),side=action.name==='BaseYDelta'?-1:1,center=parameter.parameter_base_location===1?.5:1;
 return mul([axis[0]*c-axis[1]*s,axis[0]*s+axis[1]*c],delta*factor*side*center);
}
function rawJoints(states:State[]):{body:State;head:State;index:number}[]{
 const result:{body:State;head:State;index:number}[]=[];
 for(const head of states.filter(s=>s.entity.entity==='INSERT'))for(const body of states.filter(s=>['SPLINE','LINE','LWPOLYLINE'].includes(s.entity.entity))){
  const ps=body.points??[];for(const index of [0,ps.length-1])if(ps[index]&&near(ps[index],point(head.entity.ins_pt)))result.push({body,head,index});
 }return result;
}
function evaluatedStates(block:CadSymbolBlock,a:DiagramSymbolAnnotation):{states:State[];parameterMatrices:Map<number,Matrix>;joints:ReturnType<typeof rawJoints>}{
 const states=block.entities.map(entity=>({entity,matrix:ID,points:entityPoints(entity)})),joints=rawJoints(states),parameterMatrices=new Map(block.parameters.map(p=>[p.handle,ID]));
 // Shape changes happen in the native definition before whole-component rotations/reflections.
 const priority=(action:CadSymbolAction)=>action.object==='BLOCKROTATEACTION'?2:action.object==='BLOCKFLIPACTION'?3:1;
 for(const action of [...block.actions].sort((x,y)=>priority(x)-priority(y)||x.handle-y.handle)){
  const defs=block.propertyDefinitions.filter(d=>d.parameterHandle===action.inputParameterHandle),def=defs[0],parameter=block.parameters.find(p=>p.handle===action.inputParameterHandle);
  if(!def||!parameter||unsupported(block,def.key))continue;
  const value=a.cadProperties?.[def.key]??def.defaultValue;if(defs.every(d=>(a.cadProperties?.[d.key]??d.defaultValue)===d.defaultValue))continue;
  const nativeMatrix=actionMatrix(action,parameter,value,def.defaultValue),frame=parameterMatrices.get(parameter.handle)??ID;
  // An earlier source Rotate/Flip/Scale may have moved this parameter's axis.
  // Conjugate the action through that frame instead of reflecting around stale definition coordinates.
  const matrix=nativeMatrix?compose(frame,compose(nativeMatrix,inverse(frame))):undefined;
  if(matrix){
   for(const state of states)if(action.boundEntityHandles.includes(state.entity.handle))state.matrix=compose(matrix,state.matrix);
   // Parameters included in the original dependency selection move with the same component.
   const deps=(action.deps as number[][]??[]).map(h=>h.at(-1));
   for(const p of block.parameters)if(deps.includes(p.handle)&&p.handle!==parameter.handle)parameterMatrices.set(p.handle,compose(matrix,parameterMatrices.get(p.handle)!));
  }else if(action.object==='BLOCKMOVEACTION'||action.object==='BLOCKSTRETCHACTION'||action.object==='BLOCKPOLARSTRETCHACTION'){
   let delta:Point;
   if(parameter.object==='BLOCKPOLARPARAMETER'){
    const distance=defs.find(d=>d.type==='distance')!,angle=defs.find(d=>d.type==='angle')!,base=point(parameter.def_basept),endpoint=point(parameter.def_endpt),axis=unit(sub(endpoint,base)),deltaAngle=((a.cadProperties?.[angle.key]??angle.defaultValue)-angle.defaultValue)*Math.PI/180,newDistance=a.cadProperties?.[distance.key]??distance.defaultValue;
    if(action.object==='BLOCKPOLARSTRETCHACTION'){
     const rotation=rotate(base,deltaAngle),all=[...action.boundEntityHandles,...(action.rotateBindings as number[]??[])];
     for(const state of states)if(all.includes(state.entity.handle))state.matrix=compose(rotation,state.matrix);
     delta=mul(axis,(newDistance-distance.defaultValue)*num(action.distance_multiplier,1));
    }else{
     const theta=Math.atan2(axis[1],axis[0])+deltaAngle,newEnd=add(base,[newDistance*Math.cos(theta),newDistance*Math.sin(theta)]),d=sub(newEnd,endpoint),offset=num(action.angle_offset),c=Math.cos(offset),s=Math.sin(offset);
     delta=mul([d[0]*c-d[1]*s,d[0]*s+d[1]*c],num(action.distance_multiplier,1));
    }
   }else delta=actionDisplacement(action,parameter,value-def.defaultValue);
   for(const state of states){
    if(!action.boundEntityHandles.includes(state.entity.handle))continue;
    const binding=action.vertexBindings.find(v=>v.entityHandle===state.entity.handle);
    if(action.object==='BLOCKMOVEACTION'||!binding||!state.points?.length){state.matrix=compose([1,0,0,1,...delta],state.matrix);continue;}
    if(state.entity.entity==='ELLIPSE'&&binding.indexes.some(i=>i>0))continue; // Requires the original ellipse endpoint constraint evaluator.
    state.points=state.points?.map((p,index)=>binding.indexes.includes(index)?add(p,delta):p);
   }
  }
 }
 // A source insert sitting exactly on a shaft endpoint is a real shared joint.
 // Follow endpoint motion but keep the insert's own orientation/scale, including independent angles.
 for(const joint of joints){
  const bodyEnd=tx(joint.body.matrix,joint.body.points![joint.index]),origin=tx(joint.head.matrix,joint.head.points![0]);
  joint.head.matrix=compose([1,0,0,1,...sub(bodyEnd,origin)],joint.head.matrix);
 }
 return {states,parameterMatrices,joints};
}

type Segment={kind:'line';a:Point;b:Point}|{kind:'cubic';a:Point;c:Point;d:Point;b:Point};
function ellipseSegments(center:Point,xAxis:Point,yAxis:Point,start:number,sweep:number):Segment[]{
 const pieces=Math.max(1,Math.ceil(Math.abs(sweep)/(Math.PI/4))),step=sweep/pieces,result:Segment[]=[];
 const pos=(t:number)=>add(center,add(mul(xAxis,Math.cos(t)),mul(yAxis,Math.sin(t))));
 const tangent=(t:number)=>add(mul(xAxis,-Math.sin(t)),mul(yAxis,Math.cos(t)));
 for(let i=0;i<pieces;i++){const a=start+i*step,b=a+step,k=4/3*Math.tan(step/4),pa=pos(a),pb=pos(b);result.push({kind:'cubic',a:pa,c:add(pa,mul(tangent(a),k)),d:sub(pb,mul(tangent(b),k)),b:pb});}return result;
}
function bulgeSegments(a:Point,b:Point,bulge:number):Segment[]{
 if(Math.abs(bulge)<1e-12)return [{kind:'line',a,b}];
 const chord=sub(b,a),length=Math.hypot(...chord);if(length<1e-12)return [];
 const center=add(mul(add(a,b),.5),mul([-chord[1],chord[0]],(1-bulge*bulge)/(4*bulge))),r=Math.hypot(...sub(a,center));
 return ellipseSegments(center,[r,0],[0,r],Math.atan2(a[1]-center[1],a[0]-center[0]),4*Math.atan(bulge));
}
function polySegments(points:Point[],bulges:number[],closed:boolean):Segment[]{
 const result:Segment[]=[];for(let i=0;i<points.length-(closed?0:1);i++)result.push(...bulgeSegments(points[i],points[(i+1)%points.length],bulges[i]??0));return result;
}
function deBoor(points:Point[],knots:number[],degree:number,t:number):Point{
 const last=points.length-1;let k=last;
 if(t<knots[last+1]){k=degree;while(k<last&&knots[k+1]<=t)k++;}
 const d=Array.from({length:degree+1},(_,j)=>[...points[k-degree+j]] as Point);
 for(let r=1;r<=degree;r++)for(let j=degree;j>=r;j--){const index=k-degree+j,den=knots[index+degree-r+1]-knots[index],alpha=den?(t-knots[index])/den:0;d[j]=add(mul(d[j-1],1-alpha),mul(d[j],alpha));}return d[degree];
}
/** Exact non-rational cubic B-spline spans, rather than a guessed quadratic arrow. */
function splineSegments(e:CadSymbolEntity,points:Point[]):Segment[]{
 const degree=num(e.degree),knots=e.knots as number[];
 if(degree!==3||e.rational||!knots?.length)throw new Error(`源样条 ${e.handle} 需要支持的三次非有理定义。`);
 const derivative=points.slice(1).map((p,i)=>mul(sub(p,points[i]),degree/(knots[i+degree+1]-knots[i+1]))),dk=knots.slice(1,-1),result:Segment[]=[];
 for(let i=degree;i<points.length;i++){const t0=knots[i],t1=knots[i+1];if(t0===t1)continue;const a=deBoor(points,knots,degree,t0),b=deBoor(points,knots,degree,t1),dt=(t1-t0)/3;result.push({kind:'cubic',a,c:add(a,mul(deBoor(derivative,dk,2,t0),dt)),d:sub(b,mul(deBoor(derivative,dk,2,t1),dt)),b});}return result;
}
const positiveSweep=(start:number,end:number)=>{const delta=end-start;return Math.abs(delta)>=Math.PI*2-1e-10?Math.PI*2:((delta%(Math.PI*2))+Math.PI*2)%(Math.PI*2);};
function entitySegments(e:CadSymbolEntity,ps=entityPoints(e)):Segment[]{
 if(e.entity==='LINE')return [{kind:'line',a:ps[0],b:ps[1]}];
 if(e.entity==='LWPOLYLINE')return polySegments(ps,e.bulges as number[]??[],Boolean(num(e.flag)&512));
 if(e.entity==='SPLINE')return splineSegments(e,ps);
 if(e.entity==='CIRCLE'||e.entity==='ARC'){const r=num(e.radius);return ellipseSegments(ps[0],[r,0],[0,r],num(e.start_angle),e.entity==='CIRCLE'?Math.PI*2:positiveSweep(num(e.start_angle),num(e.end_angle)));}
 if(e.entity==='ELLIPSE'){const axis=point(e.sm_axis),ratio=num(e.axis_ratio,1);return ellipseSegments(ps[0],axis,[-axis[1]*ratio,axis[0]*ratio],num(e.start_angle),positiveSweep(num(e.start_angle),num(e.end_angle)));}
 return [];
}
function hatchSegments(path:Record<string,unknown>):Segment[]{
 if(Array.isArray(path.polyline_paths)){const pts=path.polyline_paths as {point:unknown;bulge?:number}[];return polySegments(pts.map(p=>point(p.point)),pts.map(p=>num(p.bulge)),Boolean(path.closed));}
 const segments:Segment[]=[];
 for(const edge of path.segs as Record<string,unknown>[]??[]){
  if(edge.curve_type===1)segments.push({kind:'line',a:point(edge.first_endpoint),b:point(edge.second_endpoint)});
  else if(edge.curve_type===2){const r=num(edge.radius),ccw=edge.is_ccw!==0,start=num(edge.start_angle)*(ccw?1:-1),sweep=positiveSweep(num(edge.start_angle),num(edge.end_angle))*(ccw?1:-1);segments.push(...ellipseSegments(point(edge.center),[r,0],[0,r],start,sweep));}
  else throw new Error(`原填充边界类型 ${String(edge.curve_type)} 尚未支持。`);
 }return segments;
}
function pathPrimitive(segments:Segment[],matrix:Matrix,source:CadGeometryProvenance,fill:'none'|'currentColor'|'white'='none',closed=false,stroke=true,dash?:string):CadSymbolPrimitive|undefined{
 if(!segments.length)return undefined;const points:Point[]=[],xy=(p:Point)=>p.map(v=>Object.is(v,-0)?'0':String(v)).join(' ');let d='';let last:Point|undefined;
 for(const seg of segments){const a=tx(matrix,seg.a),b=tx(matrix,seg.b);if(!last||!near(last,a)){d+=`M ${xy(a)} `;points.push(a);}if(seg.kind==='line'){d+=`L ${xy(b)} `;points.push(b);}else{const c=tx(matrix,seg.c),control=tx(matrix,seg.d);d+=`C ${xy(c)} ${xy(control)} ${xy(b)} `;points.push(c,control,b);}last=b;}
 if(closed)d+='Z';return {...source,kind:'path',d:d.trim(),points,fill,stroke,dash,start:tx(matrix,segments[0].a),end:tx(matrix,segments.at(-1)!.b)};
}
const white=(entity:CadSymbolEntity)=>String((entity.color as {rgb?:string})?.rgb??'').toLowerCase().endsWith('fffffe');
function insertMatrix(e:CadSymbolEntity,child:CadSymbolBlock,origin=point(e.ins_pt)):Matrix{
 const scale=e.scale as number[]??[1,1],angle=num(e.rotation),c=Math.cos(angle),s=Math.sin(angle),base=point(child.basePoint);
 return compose([c*scale[0],s*scale[0],-s*scale[1],c*scale[1],...origin],[1,0,0,1,-base[0],-base[1]]);
}
function textPrimitive(e:CadSymbolEntity,matrix:Matrix,a:DiagramSymbolAnnotation,attributeIndex:number,source:CadGeometryProvenance):CadSymbolPrimitive{
 const aligned=num(e.horiz_alignment)!==0||num(e.vert_alignment)!==0,anchor=num(e.horiz_alignment)===1?'middle':num(e.horiz_alignment)===2?'end':'start';
 let origin=point(aligned&&Array.isArray(e.alignment_pt)?e.alignment_pt:e.ins_pt),height=num(e.height,2),angle=num(e.rotation);
 const v=num(e.vert_alignment);if(v===2)origin=add(origin,[0,-height*.35]);else if(v===3)origin=add(origin,[0,-height]);
 const x=tx(matrix,add(origin,[Math.cos(angle),Math.sin(angle)])),p=tx(matrix,origin);
 const fallback=e.entity==='ATTDEF'?String(e.default_value??''):String(e.text_value??'');
 const value=e.entity==='ATTDEF'?(a.cadAttributes?.[String(e.handle)]??(attributeIndex===0?a.text:undefined)??fallback):fallback;
 return {...source,kind:'text',text:value,point:p,size:height*Math.hypot(matrix[0],matrix[1]),angle:Math.atan2(x[1]-p[1],x[0]-p[0])*180/Math.PI,anchor};
}
function renderStates(block:CadSymbolBlock,states:State[],matrix:Matrix,a:DiagramSymbolAnnotation,primitives:CadSymbolPrimitive[],depth=0){
 if(depth>8)throw new Error('原插件符号嵌套深度异常。');let attrIndex=0;
 // Backing and fills precede their original outline entities; exported symbol has no grip graphics.
 const order=(e:CadSymbolEntity)=>e.entity==='WIPEOUT'?0:e.entity==='HATCH'?1:2;
 for(const state of [...states].sort((x,y)=>order(x.entity)-order(y.entity))){
  const e=state.entity;if(e.invisible)continue;const m=compose(matrix,state.matrix),source={sourceHandle:e.handle,sourceType:e.entity,blockHandle:block.handle};
  if(e.entity==='INSERT'){const child=getCadBlockByHandle(num(e.block_header));if(!child)throw new Error(`缺少源子块 ${String(e.block_header)}。`);renderStates(child,child.entities.map(entity=>({entity,matrix:ID,points:entityPoints(entity)})),compose(m,insertMatrix(e,child,state.points![0])),a,primitives,depth+1);continue;}
  if(e.entity==='ATTDEF'||e.entity==='TEXT'){
   const delta=sub(state.points![0],point(e.ins_pt));
   primitives.push(textPrimitive({...e,ins_pt:state.points![0],...(Array.isArray(e.alignment_pt)?{alignment_pt:add(point(e.alignment_pt),delta)}:{})},m,a,e.entity==='ATTDEF'?attrIndex++:-1,source));continue;
  }
  if(e.entity==='WIPEOUT'){
   // IMAGE clipping coordinates are centered at (-.5,-.5); the v basis maps image y downwards.
   const ps=state.points??entityPoints(e);
   const primitive=pathPrimitive(polySegments(ps,[],true),m,source,'white',true,false);if(primitive)primitives.push(primitive);continue;
  }
  if(e.entity==='HATCH'){
   if(!e.is_solid_fill)continue; // Patterned reference outlines remain supplied by their CIRCLE/LINE entities.
   for(const path of e.paths as Record<string,unknown>[]??[]){
    const bound=(path.boundary_handles as number[][]??[]).map(h=>h.at(-1)),boundary=states.find(s=>bound.includes(s.entity.handle));
    const segs=boundary?entitySegments(boundary.entity,boundary.points):hatchSegments(path),bm=boundary?compose(matrix,boundary.matrix):m;
    const primitive=pathPrimitive(segs,bm,source,white(e)?'white':'currentColor',true,false);if(primitive)primitives.push(primitive);
   }continue;
  }
  if(e.entity==='LWPOLYLINE'&&num(e.const_width)>0&&state.points?.length===2&&(e.bulges as number[]??[]).every(b=>b===1)){
   const center=mul(add(state.points[0],state.points[1]),.5),radius=Math.hypot(...sub(state.points[0],state.points[1]))/2+num(e.const_width)/2;
   const primitive=pathPrimitive(ellipseSegments(center,[radius,0],[0,radius],0,Math.PI*2),m,source,'currentColor',true,false);if(primitive)primitives.push(primitive);continue;
  }
  const segs=entitySegments(e,state.points),closed=e.entity==='CIRCLE'||(e.entity==='LWPOLYLINE'&&Boolean(num(e.flag)&512));
  const dash=e.layerName==='D-10-BdrRef'?'3 3':e.layerName==='D-05-Auxiliary'?'5 4':undefined;
  const primitive=pathPrimitive(segs,m,source,'none',closed,true,dash);if(primitive)primitives.push(primitive);
 }
}
function meaningfulBaseline(a:DiagramSymbolAnnotation,states:State[],normalization:Matrix,primitives:CadSymbolPrimitive[],controls:CadSymbolControl[]):{start:Point;end:Point}{
 if(a.symbol==='rightAngle'){
  const block=getCadSymbolBlock(a.symbol)!,baseline=block.normalization.baseline!;
  const distance=block.propertyDefinitions.find(def=>def.parameterHandle===baseline.parameterHandle);
  // The source insert origin is the virtual paper vertex. Its visible L corner
  // is inset at [1,1], so the origin lies outside on the angle-bisector extension.
  return {start:tx(normalization,point(block.basePoint)),end:controls.find(control=>control.key===distance?.key)?.point??tx(normalization,point(baseline.end))};
 }
 const path=(state:State)=>entitySegments(state.entity,state.points);
 const shaft=states.find(s=>s.entity.entity==='SPLINE')??states.find(s=>s.entity.entity==='LINE')??states.find(s=>s.entity.entity==='LWPOLYLINE'&&!Boolean(num(s.entity.flag)&512));
 if(a.symbol==='paperFront'||a.symbol==='paperBack'){
  const body=states.find(s=>s.entity.entity==='LWPOLYLINE')!,ps=body.points!,m=compose(normalization,body.matrix);return {start:tx(m,mul(add(ps[0],ps[2]),.5)),end:tx(m,ps[1])};
 }
 if(shaft&&['fold','unfold','foldSmall','swivel','swivelDouble','unfoldDouble','hold','repeatSmall','view'].includes(a.symbol)){
  const segs=path(shaft),m=compose(normalization,shaft.matrix),ps=shaft.points!;
  if(a.symbol==='repeatSmall'){const line=states.find(s=>s.entity.handle===2678)!;return {start:tx(compose(normalization,line.matrix),line.points![1]),end:tx(compose(normalization,line.matrix),line.points![0])};}
  if(a.symbol==='unfoldDouble')return {start:tx(m,ps[1]),end:tx(m,ps[0])};
  return {start:tx(m,segs[0].a),end:tx(m,segs.at(-1)!.b)};
 }
 if(a.symbol==='mountainFold'||a.symbol==='flip'){
  const curve=states.find(s=>s.entity.entity===(a.symbol==='mountainFold'?'ELLIPSE':'ARC'))!;const segs=path(curve),m=compose(normalization,curve.matrix);return {start:tx(m,segs[0].a),end:tx(m,segs.at(-1)!.b)};
 }
 if(['sink','open','pull','zoom','zoomOut'].includes(a.symbol)){
  const body=states.find(s=>s.entity.entity==='LWPOLYLINE')!,ps=body.points!,m=compose(normalization,body.matrix);
  if(a.symbol==='sink')return {start:tx(m,mul(add(ps[0],ps.at(-1)!),.5)),end:tx(m,ps[3])};
  if(a.symbol==='open')return {start:tx(m,ps.at(-1)!),end:tx(m,mul(add(ps[3],ps[4]),.5))};
  if(a.symbol==='pull')return {start:tx(m,mul(add(ps[0],ps.at(-1)!),.5)),end:tx(m,ps[3])};
  return a.symbol==='zoom'?{start:tx(m,ps[1]),end:tx(m,ps[4])}:{start:tx(m,ps.at(-1)!),end:tx(m,ps[3])};
 }
 // Composite/round glyphs use a diameter through their actual drawing envelope, not a remote CAD property axis.
 const ps=primitives.flatMap(p=>p.kind==='path'?p.points:[p.point]),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),center:Point=[(x0+x1)/2,(y0+y1)/2];
 return x1-x0>=y1-y0?{start:[x0,center[1]],end:[x1,center[1]]}:{start:[center[0],y1],end:[center[0],y0]};
}
function propertyControls(block:CadSymbolBlock,a:DiagramSymbolAnnotation,normalization:Matrix,parameterMatrices:Map<number,Matrix>):CadSymbolControl[]{
 const controls:CadSymbolControl[]=[];
 for(const source of diagramCadGripSources(a.symbol).filter(grip=>grip.supported)){
  const definitions=block.propertyDefinitions.filter(def=>source.propertyKeys.includes(def.key)),p=block.parameters.find(parameter=>parameter.handle===source.parameterHandle)!;
  const def=definitions.find(def=>def.type==='distance')??definitions[0],nativeBase=point(p.def_basept),sourcePoint=source.point,axis=unit(sub(point(p.def_endpt),nativeBase));
  const matrix=compose(normalization,parameterMatrices.get(p.handle)??ID),inv=inverse(matrix),value=a.cadProperties?.[def.key]??def.defaultValue;
  const provenance={id:source.id,sourceGripHandle:source.handle,parameterHandle:source.parameterHandle};
  // A flip axis may itself follow this rotation parameter. Inverting its
  // current matrix freezes that moving axis and reverses the pointer delta.
  // Read the angle in the grip's evaluated orbit, including all dependent
  // flips, instead of the reflected frame at the old angle. Evaluate only
  // when dragged; ordinary geometry/hover does not pay for these frames.
  const angularCoordinates=(key:string,initial:number,radiusScale:number,q:Point)=>{
   const at=(degrees:number)=>{
    const state={...a,cadProperties:{...a.cadProperties,[key]:degrees}};
    const frame=compose(normalization,evaluatedStates(block,state).parameterMatrices.get(p.handle)??ID);
    return tx(frame,tx(rotate(nativeBase,(degrees-initial)*Math.PI/180),add(nativeBase,mul(sub(sourcePoint,nativeBase),radiusScale))));
   };
   const zero=at(initial),opposite=at(initial+180),center=mul(add(zero,opposite),.5),u=sub(zero,center),v=sub(at(initial+90),center),d=sub(q,center),det=u[0]*v[1]-u[1]*v[0];
   if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw Error('符号旋转轨迹退化，无法读取旋转角度。');
   return [(d[0]*v[1]-d[1]*v[0])/det,(u[0]*d[1]-u[1]*d[0])/det] as Point;
  };
  if(p.object==='BLOCKPOLARPARAMETER'){
   const distance=definitions.find(def=>def.type==='distance')!,angle=definitions.find(def=>def.type==='angle')!,initial=sub(sourcePoint,nativeBase),initialRadius=Math.hypot(...initial);
   if(!distance||!angle||initialRadius<=1e-12||distance.defaultValue<=0)continue;
   const currentDistance=a.cadProperties?.[distance.key]??distance.defaultValue,currentAngle=a.cadProperties?.[angle.key]??angle.defaultValue,theta=(currentAngle-angle.defaultValue)*Math.PI/180;
   const local=tx(rotate(nativeBase,theta),add(nativeBase,mul(initial,currentDistance/distance.defaultValue)));
   const readProperties=(q:Point)=>{const delta=angularCoordinates(angle.key,angle.defaultValue,currentDistance/distance.defaultValue,q),angleValue=((angle.defaultValue+Math.atan2(delta[1],delta[0])*180/Math.PI)%360+360)%360;return {[distance.key]:Math.hypot(...delta)*currentDistance,[angle.key]:angleValue};};
   controls.push({...provenance,key:distance.key,label:`${distance.label} / ${angle.label}`,point:tx(matrix,local),read:q=>readProperties(q)[distance.key],readProperties});continue;
  }
  if(def.type==='flip'){
   controls.push({...provenance,key:def.key,label:`${def.label}：翻转`,point:tx(matrix,sourcePoint),read:()=>1-value});continue;
  }
  const direction=source.role==='base'?-1:1,factor=(p.parameter_base_location===1?.5:1)*direction;
  const local=def.type==='distance'?add(sourcePoint,mul(axis,(value-def.defaultValue)*factor)):tx(rotate(nativeBase,(value-def.defaultValue)*Math.PI/180),sourcePoint);
  const read=(q:Point)=>{
   if(def.type==='distance')return def.defaultValue+dot(sub(tx(inv,q),sourcePoint),axis)/factor;
   const vector=angularCoordinates(def.key,def.defaultValue,1,q);return ((def.defaultValue+Math.atan2(vector[1],vector[0])*180/Math.PI)%360+360)%360;
  };
  controls.push({...provenance,key:def.key,label:def.label+(source.role==='base'?'：基端':''),point:tx(matrix,local),read});
 }
 return controls;
}
/** Interpret immutable native DWG entities into the shared local SVG geometry. */
export function buildCadSymbolGeometry(a:DiagramSymbolAnnotation):CadSymbolGeometry{
 if(a.cadProperties!==undefined)validateDiagramCadProperties(a.symbol,a.cadProperties);
 if(a.cadAttributes!==undefined)validateDiagramCadAttributes(a.symbol,a.cadAttributes);
 // The requested counterclockwise variant uses the original block's verified
 // flip action; no duplicate paths or fabricated source entities are needed.
 if(a.symbol==='rotateCCW')a={...a,cadProperties:{...a.cadProperties,'翻转状态1':1-(a.cadProperties?.['翻转状态1']??0)}};
 const block=getCadSymbolBlock(a.symbol);if(!block)throw new Error('缺少原插件符号定义。');
 const normalization=defaultNormalization(block),{states,parameterMatrices,joints}=evaluatedStates(block,a),primitives:CadSymbolPrimitive[]=[];
 const controls=propertyControls(block,a,normalization,parameterMatrices),unsupportedPropertyKeys=block.propertyDefinitions.filter(d=>unsupported(block,d.key)).map(d=>d.key);
 if(a.symbol==='rotateCCW')for(const control of controls)if(control.key==='翻转状态1'){
  // The variant's visible native state is inverted; persist grip edits back in
  // the annotation's own 0/1 state so two clicks still round-trip exactly.
  const read=control.read;control.read=q=>1-read(q);
 }
 if(a.symbol==='swivelDouble'){
  // Two complete NSwFold copies point in the same direction. Reflect across
  // the evaluated shaft's axis, so native CAD rotations carry the pair's frame
  // rather than accidentally turning the second head in the opposite direction.
  const body=states.find(state=>state.entity.entity==='LWPOLYLINE')!,bodyMatrix=compose(normalization,body.matrix),ps=body.points!;
  const tail=tx(bodyMatrix,ps[0]),next=tx(bodyMatrix,ps[1]),head=tx(bodyMatrix,ps.at(-1)!),center=mul(add(tail,head),.5),axis=unit(sub(next,tail)),normal:Point=[-axis[1],axis[0]];
  const values=cadPropertyDefinitions(a.symbol),gap=a.cadProperties?.['箭头间距']??values.find(d=>d.key==='箭头间距')!.defaultValue,stagger=a.cadProperties?.['上下错位']??values.find(d=>d.key==='上下错位')!.defaultValue;
  const shift=add(mul(normal,gap/2),mul(axis,stagger/2)),left:Matrix=[1,0,0,1,-shift[0],-shift[1]],right=compose([1,0,0,1,...shift],reflect(center,add(center,axis)));
  const leftMatrix=compose(left,normalization),rightMatrix=compose(right,normalization);
  renderStates(block,states,leftMatrix,a,primitives);renderStates(block,states,rightMatrix,a,primitives);
  const sourceControls:CadSymbolControl[]=[];
  for(const [side,matrix] of [['left',left],['right',right]] as const)for(const control of controls){
   const placed=tx(matrix,control.point);if(sourceControls.some(other=>other.sourceGripHandle===control.sourceGripHandle&&near(other.point,placed)))continue;
   sourceControls.push({...control,id:`${control.id}:${side}`,point:placed,read:(q:Point)=>control.read(tx(inverse(matrix),q)),...(control.readProperties?{readProperties:(q:Point)=>control.readProperties!(tx(inverse(matrix),q))}:{})});
  }
  const basePoint=tx(normalization,point(block.basePoint)),basePoints=[{id:'center',point:tx(left,basePoint),blockHandle:block.handle}];
  const otherBase=tx(right,basePoint);if(!near(basePoints[0].point,otherBase))basePoints.push({id:'source-base:right',point:otherBase,blockHandle:block.handle});
  const pairJoints=[leftMatrix,rightMatrix].flatMap(matrix=>joints.map(j=>({bodyHandle:j.body.entity.handle,insertHandle:j.head.entity.handle,point:tx(compose(matrix,j.body.matrix),j.body.points![j.index]),headOrigin:tx(compose(matrix,j.head.matrix),j.head.points![0])})));
  return {primitives,basePoints,baseline:{start:mul(add(tx(left,tail),tx(right,tail)),.5),end:mul(add(tx(left,head),tx(right,head)),.5)},controls:sourceControls,joints:pairJoints,warnings:[...block.warnings],unsupportedPropertyKeys};
 }
 renderStates(block,states,normalization,a,primitives);
 return {primitives,basePoints:[{id:'center',point:tx(normalization,point(block.basePoint)),blockHandle:block.handle}],baseline:meaningfulBaseline(a,states,normalization,primitives,controls),controls,joints:joints.map(j=>({bodyHandle:j.body.entity.handle,insertHandle:j.head.entity.handle,point:tx(compose(normalization,j.body.matrix),j.body.points![j.index]),headOrigin:tx(compose(normalization,j.head.matrix),j.head.points![0])})),warnings:[...block.warnings],unsupportedPropertyKeys};
}
const normalizationCache=new Map<number,Matrix>();
function defaultNormalization(block:CadSymbolBlock):Matrix{
 const cached=normalizationCache.get(block.handle);if(cached)return cached;
 const primitives:CadSymbolPrimitive[]=[],a:DiagramSymbolAnnotation={id:'native-default',kind:'symbol',symbol:'fold',position:[0,0],size:100,rotation:0,color:'#333333',width:1,cadProperties:{}};
 renderStates(block,block.entities.map(entity=>({entity,matrix:ID,points:entityPoints(entity)})),ID,a,primitives);
 const points=primitives.flatMap(p=>p.kind==='path'?p.points:[p.point]);
 if(!points.length)throw new Error(`原插件块 ${block.cadName} 没有可绘制实体。`);
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),scale=100/Math.max(x1-x0,y1-y0,1e-9);
 const matrix:Matrix=[scale,0,0,-scale,-(x0+x1)*scale/2,(y0+y1)*scale/2];normalizationCache.set(block.handle,matrix);return matrix;
}
/** CAD property handles use source units, and reject unreachable values without silently clamping. */
export function moveCadSymbolPropertyGrip(a:DiagramSymbolAnnotation,key:string,localPoint:Point):DiagramSymbolAnnotation{
 const controls=buildCadSymbolGeometry(a).controls,control=controls.find(c=>c.id===key||c.key===key);if(!control)return structuredClone(a);
 if(Math.hypot(...sub(control.point,localPoint))<=1e-10)return structuredClone(a);
 const values=control.readProperties?.(localPoint)??{[control.key]:control.read(localPoint)},properties={...a.cadProperties};
 // The paired arrow's placement follows its shaft as well. Its angle grip
 // must read the complete placed orbit, not invert the old pair placement.
 const angleDefinition=cadPropertyDefinitions(a.symbol).find(d=>d.key===control.key&&d.type==='angle');
 if(a.symbol==='swivelDouble'&&angleDefinition){
  const initial=angleDefinition.defaultValue,at=(value:number)=>buildCadSymbolGeometry({...a,cadProperties:{...a.cadProperties,[control.key]:value}}).controls.find(c=>c.id===control.id)!.point;
  const zero=at(initial),center=mul(add(zero,at(initial+180)),.5),u=sub(zero,center),v=sub(at(initial+90),center),d=sub(localPoint,center),det=u[0]*v[1]-u[1]*v[0];
  if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw Error('符号旋转轨迹退化，无法读取旋转角度。');
  values[control.key]=((initial+Math.atan2((u[0]*d[1]-u[1]*d[0])/det,(d[0]*v[1]-d[1]*v[0])/det)*180/Math.PI)%360+360)%360;
 }
 for(const [name,raw] of Object.entries(values)){
  const def=cadPropertyDefinitions(a.symbol).find(d=>d.key===name)!;
  const value=def.values?.length?def.values.reduce((best,v)=>Math.abs(v-raw)<Math.abs(best-raw)?v:best,def.values[0]):raw;
  if(!Number.isFinite(value)||value<def.min-1e-9||value>def.max+1e-9)throw new Error(`${def.label} 超出原插件属性范围（${def.min}～${def.max}）。`);
  properties[name]=value;
 }
 return {...structuredClone(a),cadProperties:properties};
}

/** Stable attribute definitions are exposed for provenance-based render tests. */
export const cadSymbolAttributeDefinitions=cadAttributeDefinitions;
