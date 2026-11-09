import {validateDoc,type Assignment,type Doc,type FoldGraph,type Point} from '../core/types';
import {createMaterialTopology,inspectMaterialTopology} from '../core/materialTopology';

export type LinearSpacePolyhedralCPRecipe =
 | {model:'linear-chain';sectorsDeg:[number,number,number,number][];lengthsMm:number[];spineTypes:('M'|'V')[];rightWidthMm:number;leftWidthMm:number}
 | {model:'space-curve';pointsMm:[number,number,number][];leftWidthMm:number;rightWidthMm:number;sigmaLeftDeg:number;sigmaRightDeg:number;initialCPDirectionDeg:number;osculatingVectorNear:[number,number,number]|null};
type Vec3=[number,number,number];
type Four=[number,number,number,number];
type Type='B'|'M'|'V'|'U';
export const LINEAR_SPACE_POLYHEDRAL_CP_NAMESPACE='originalLinearSpacePolyhedralCP';
export const LINEAR_SPACE_POLYHEDRAL_CP_SCHEMA='original-in2414-in2448-polyhedral-cp-v2';
const LEGACY_SCHEMA='original-in2414-in2448-polyhedral-cp-v1';
const NS=LINEAR_SPACE_POLYHEDRAL_CP_NAMESPACE,SCHEMA=LINEAR_SPACE_POLYHEDRAL_CP_SCHEMA;
const SHA='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9',D=Math.PI/180;
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:Record<string,any>,ks:string[])=>Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k));
function fail(message:string):never{throw Error(message);}
const v3=(x:unknown):x is Vec3=>Array.isArray(x)&&x.length===3&&x.every(v=>finite(v)&&Math.abs(v)<=100000);
const positive=(x:unknown)=>finite(x)&&x>=.0001&&x<=10000;

/** Exact recipe fields; inputs are copied, never rescaled, snapped, or repaired. */
export function validateLinearSpacePolyhedralCPRecipe(raw:unknown):LinearSpacePolyhedralCPRecipe{
 if(!object(raw))fail('纸带参数必须是完整对象。');
 if(raw.model==='linear-chain'){
  if(!keys(raw,['model','sectorsDeg','lengthsMm','spineTypes','rightWidthMm','leftWidthMm']))fail('线性链参数字段不完整或包含未知字段。');
  if(!Array.isArray(raw.sectorsDeg)||raw.sectorsDeg.length<2||raw.sectorsDeg.length>128||raw.sectorsDeg.some((r:unknown)=>!Array.isArray(r)||r.length!==4||r.some(x=>!finite(x)||x<=0||x>=180)))fail('线性链需要 2–128 站，每站四个介于 0° 与 180° 的有限扇区角。');
  if(!Array.isArray(raw.lengthsMm)||raw.lengthsMm.length!==raw.sectorsDeg.length-1||raw.lengthsMm.some((x:unknown)=>!positive(x)))fail('长度须为 0.0001–10000 mm，且长度条数等于站数减一。');
  if(!Array.isArray(raw.spineTypes)||raw.spineTypes.length!==raw.lengthsMm.length||raw.spineTypes.some((t:unknown)=>t!=='M'&&t!=='V'))fail('每段脊线须明确填写 M 或 V。');
  if(!positive(raw.rightWidthMm)||!positive(raw.leftWidthMm))fail('两侧宽度须为 0.0001–10000 mm。');
 }else if(raw.model==='space-curve'){
  if(!keys(raw,['model','pointsMm','leftWidthMm','rightWidthMm','sigmaLeftDeg','sigmaRightDeg','initialCPDirectionDeg','osculatingVectorNear']))fail('空间纸带参数字段不完整或包含未知字段。');
  if(!Array.isArray(raw.pointsMm)||raw.pointsMm.length<3||raw.pointsMm.length>128||raw.pointsMm.some((p:unknown)=>!v3(p)))fail('空间纸带需要 3–128 个有限毫米三维点；相同首末点仍是独立站。');
  if(!positive(raw.leftWidthMm)||!positive(raw.rightWidthMm))fail('两侧宽度须为 0.0001–10000 mm。');
  if(![raw.sigmaLeftDeg,raw.sigmaRightDeg].every(x=>finite(x)&&Math.abs(x)>0&&Math.abs(x)<180)||Math.sign(raw.sigmaLeftDeg)!==Math.sign(raw.sigmaRightDeg)||Math.abs(raw.sigmaLeftDeg+raw.sigmaRightDeg)>180)fail('初始左右子弧须同号、非零、各小于 180°，且原首脊线角须在 ±180° 内。');
  if(!finite(raw.initialCPDirectionDeg)||Math.abs(raw.initialCPDirectionDeg)>3600)fail('首 CP 方位须为 ±3600° 内有限角度。');
  if(raw.osculatingVectorNear!==null&&(!v3(raw.osculatingVectorNear)||Math.hypot(...raw.osculatingVectorNear)===0))fail('密切向量须为非零三维向量或明确 null。');
 }else fail('纸带模型必须为 linear-chain 或 space-curve。');
 return structuredClone(raw) as LinearSpacePolyhedralCPRecipe;
}
export function linearSpacePolyhedralCPPreset(model:LinearSpacePolyhedralCPRecipe['model']='linear-chain'):LinearSpacePolyhedralCPRecipe{
 if(model==='linear-chain')return {model,sectorsDeg:[[90,90,90,90],[60,120,120,60],[120,60,60,120],[90,90,90,90]],lengthsMm:[1,1,1],spineTypes:['V','M','V'],rightWidthMm:.33,leftWidthMm:.33};
 if(model==='space-curve')return {model,pointsMm:[[0,0,0],[2.5,2.5,0],[2.5,5,0],[0,7.5,0]],leftWidthMm:1,rightWidthMm:1,sigmaLeftDeg:60,sigmaRightDeg:30,initialCPDirectionDeg:0,osculatingVectorNear:null};
 return fail('未知纸带模型。');
}
const PRIMITIVE_NAMES=['hypot','sin','cos','tan','atan','atan2','acos','sqrt'] as const;
type PrimitiveName=typeof PRIMITIVE_NAMES[number];
type PrimitiveMath=Record<PrimitiveName,(...args:number[])=>number>;
type PrimitiveCall={op:PrimitiveName;args:number[];value:number};
type PrimitiveTrace={schema:'original-polyhedral-libm-trace-v1';recipeKey:string;maximumCalls:65536;maximumRelativeEPS:16;calls:PrimitiveCall[]};
/** Persist primitive evaluations, never final vertices. Replay retains original scalar operation order. */
function primitiveArithmetic(recipe:LinearSpacePolyhedralCPRecipe,raw?:unknown){
 const recipeKey=JSON.stringify(recipe),calls:PrimitiveCall[]=[];let saved:PrimitiveCall[]|undefined,index=0;
 if(raw!==undefined){
  if(!object(raw)||!keys(raw,['schema','recipeKey','maximumCalls','maximumRelativeEPS','calls'])||raw.schema!=='original-polyhedral-libm-trace-v1'||raw.recipeKey!==recipeKey||raw.maximumCalls!==65536||raw.maximumRelativeEPS!==16||!Array.isArray(raw.calls)||raw.calls.length>65536)fail('原算术追踪格式、参数键或固定预算不一致；没有迁移旧图或放宽几何。');
  saved=raw.calls;
 }
 const invoke=(op:PrimitiveName,args:number[]):number=>{
  if(index>=65536||args.some(x=>!finite(x)))fail('原算术追踪超过 65536 个派生调用，或参数不是有限数。');
  const fresh=(Math[op] as (...x:number[])=>number)(...args);if(!finite(fresh))fail('原派生函数未返回有限实数。');
  let value=fresh;
  if(saved){
   const row=saved[index];if(!object(row)||!keys(row,['op','args','value'])||row.op!==op||!Array.isArray(row.args)||row.args.length!==args.length||row.args.some((x,i)=>!finite(x)||x!==args[i])||!finite(row.value))fail('原算术调用顺序或精确输入不一致；没有吸附或修复。');
   value=row.value;
   // libm comparisons do not apply to vertices, recipe values, branch flags, or indexed topology.
   const identity=fresh===0||(op==='sin'||op==='cos')&&Math.abs(fresh)===1||op==='sqrt'&&(args[0]===0||args[0]===1)||op==='acos'&&(args[0]===0||Math.abs(args[0])===1);
   const tolerance=16*Number.EPSILON*Math.max(Number.MIN_VALUE,Math.abs(fresh),Math.abs(value));
   if(identity?value!==fresh:Math.abs(value-fresh)>tolerance)fail('原派生值超出固定 libm roundoff 范围，或修改了精确零／基本恒等值。');
   if((op==='sin'||op==='cos')&&Math.abs(value)>1||(op==='sqrt'||op==='hypot')&&value<0||op==='acos'&&(value<0||value>Math.PI)||op==='atan'&&Math.abs(value)>Math.PI/2||op==='atan2'&&Math.abs(value)>Math.PI)fail('原派生值超出实数函数的原值域。');
  }
  calls.push({op,args:[...args],value});index++;return value;
 };
 const math=Object.fromEntries(PRIMITIVE_NAMES.map(op=>[op,(...args:number[])=>invoke(op,args)])) as PrimitiveMath;
 return {math,finish:():PrimitiveTrace=>{if(saved&&index!==saved.length)fail('原算术追踪包含未使用调用。');return {schema:'original-polyhedral-libm-trace-v1',recipeKey,maximumCalls:65536,maximumRelativeEPS:16,calls};}};
}
function sourceFunctions(kernel:PrimitiveMath){
const add3=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+b[i]) as Vec3;
const sub3=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v-b[i]) as Vec3;
const mul3=(a:Vec3,s:number):Vec3=>a.map(v=>v*s) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:Vec3)=>kernel.hypot(...a);
function unit(a:Vec3):Vec3{const n=norm(a);if(!finite(n)||n<=1e-12)fail('原 NormalizeReal 遇到零长、共线或无法分离的方向；未替换密切向量。');return mul3(a,1/n);}
/** Original DirectedAngle3D: ArcTan[a.b Mag[c],a.(b Cross c)]. */
const directed=(a:Vec3,b:Vec3,c:Vec3)=>kernel.atan2(dot(a,cross(b,c)),dot(a,b)*norm(c));
function rotate3(a:Vec3,t:number,axis:Vec3):Vec3{const c=kernel.cos(t),s=kernel.sin(t);return add3(add3(mul3(a,c),mul3(cross(axis,a),s)),mul3(axis,dot(axis,a)*(1-c)));}
const u=(t:number):Point=>[kernel.cos(t),kernel.sin(t)];
const rotate2=(p:Point,t:number):Point=>[p[0]*kernel.cos(t)-p[1]*kernel.sin(t),p[0]*kernel.sin(t)+p[1]*kernel.cos(t)];
const plus2=(a:Point,b:Point,s=1):Point=>[a[0]+s*b[0],a[1]+s*b[1]];
const invert=(t:'M'|'V')=>t==='M'?'V':'M';
const foldType=(t:number):Type=>t>.5*D?'V':t<-.5*D?'M':'U';
const acos=(x:number)=>{if(!finite(x)||Math.abs(x)>1+16*Number.EPSILON)fail('原扇区点积超出实数 ArcCos 域。');return kernel.acos(Math.max(-1,Math.min(1,x)));};

type Vertex3D={sectorsRad:Four;gammaRad:Four;sigmaRad:Four;sectorVectors:Vec3[];foldVectors:Vec3[];q:Vec3;oddCreaseIndex:number;majorCreaseIndices:number[];minorCreaseIndices:number[];sectorSumResidual:number};
/** Literal In2336 -> In2353 -> In2156/In2239, rho=1. */
function degree4FromSubarcs(g4:Vec3,g2:Vec3,s3:number,s4:number,near:Vec3):Vertex3D{
 const ss=Math.sign(s3);if(ss===0||ss!==Math.sign(s4))fail('原 In2336 子弧符号分支不相容；未改种子。');
 const s1=2*kernel.atan(kernel.tan(s3/2)),s2=2*kernel.atan(kernel.tan(s4/2));
 let q=unit(cross(g2,g4));if(dot(q,near)<0)q=mul3(q,-1);
 const a1=rotate3(q,-s1,g2),a2=rotate3(q,s2,g2),a3=rotate3(q,-s3,g4),a4=rotate3(q,s4,g4);
 let g1=unit(cross(a4,a1)),g3=unit(cross(a3,a2));if(dot(g1,q)*ss<0){g1=mul3(g1,-1);g3=mul3(g3,-1);}
 const gg=[g1,g2,g3,g4].map(unit),aa=gg.map((g,i)=>unit(cross(g,gg[(i+1)%4])));
 const gamma=gg.map((g,i)=>directed(aa[(i+3)%4],aa[i],g)) as Four;
 const alpha=gg.map((g,i)=>acos(dot(g,gg[(i+1)%4]))) as Four;
 const cd=gamma.map(Math.sign);if(Math.abs(cd.filter(x=>x===1).length-cd.filter(x=>x===-1).length)!==2)fail('原 In2239 Maekawa 奇折线分支未通过；保留原拒绝。');
 const odd=-cd.reduce((a,b)=>a+b,0)/2,odi=cd.indexOf(odd)+1;
 const f=(i:number)=>((i+odi-4)%4+4)%4;
 q=unit(cross(gg[f(2)],gg[f(4)]));
 const sigma0=[directed(aa[f(1)],q,gg[f(2)]),-directed(aa[f(2)],q,gg[f(2)]),directed(aa[f(3)],q,gg[f(4)]),-directed(aa[f(4)],q,gg[f(4)])];
 const shift=((3-odi)%4+4)%4,sigma=sigma0.map((_,i)=>sigma0[(i+shift)%4]) as Four;
 const residual=Math.abs(alpha.reduce((a,b)=>a+b,0)-2*Math.PI);
 if(residual>1e-9)fail('原四度折向量没有形成可展开材料扇区；未归一化源扇区角。');
 return {sectorsRad:alpha,gammaRad:gamma,sigmaRad:sigma,sectorVectors:aa,foldVectors:gg,q,oddCreaseIndex:odi,majorCreaseIndices:[f(2)+1,f(4)+1],minorCreaseIndices:[f(1)+1,f(3)+1],sectorSumResidual:residual};
}
type Station={index:number;spineCPMm:Point;sectorsDeg:Four;cpDirectionDeg:number;leftCreaseLengthMm:number;rightCreaseLengthMm:number;spine3DMm:Vec3|null;sigmaDeg:(number|null)[]|null;gammaDeg:Four|null;foldVectors3D:Vec3[]|null;sectorVectors3D:Vec3[]|null;osculatingVector:Vec3|null;torsionDeg:number|null;vertex3D:Vertex3D|null};
function incidence(vertices:Point[],edges:[number,number][],faces:number[][],types:Assignment[],angles:(number|null)[]):FoldGraph{
 const lookup=new Map(edges.map(([a,b],i)=>[[a,b].sort((x,y)=>x-y).join(','),i]));
 const fe=faces.map(f=>f.map((a,i)=>{const e=lookup.get([a,f[(i+1)%f.length]].sort((x,y)=>x-y).join(','));if(e===undefined)fail('源面环引用未知边。');return e;})),ef=edges.map(()=>[] as number[]);fe.forEach((r,f)=>r.forEach(e=>ef[e].push(f)));
 const ff=fe.map((r,f)=>r.map(e=>ef[e].find(o=>o!==f)??null));
 return {vertices_coords:vertices,edges_vertices:edges,edges_assignment:[...types],edges_foldAngle:[...angles],faces_vertices:faces,faces_edges:fe,edges_faces:ef,faces_faces:ff as unknown as number[][]};
}
function linear(recipe:Extract<LinearSpacePolyhedralCPRecipe,{model:'linear-chain'}>){
 const aa=recipe.sectorsDeg.map(r=>r.map(a=>a*D)),wr=recipe.rightWidthMm,wl=recipe.leftWidthMm,dd=recipe.lengthsMm,tt=recipe.spineTypes;
 let p:Point=[0,0],phi=0,wrd=wr/kernel.sin(aa[0][0]),wld=wl/kernel.sin(aa[0][3]);
 const vertices:Point[]=[plus2(p,u(-aa[0][3]),wrd),[...p],plus2(p,u(aa[0][0]),wld)],edges:[number,number][]=[[0,1],[1,2]],faces:number[][]=[],raw:Type[]=['B','B'];
 const stations:Station[]=[{index:0,spineCPMm:[...p],sectorsDeg:[...recipe.sectorsDeg[0]],cpDirectionDeg:0,leftCreaseLengthMm:wld,rightCreaseLengthMm:wrd,spine3DMm:null,sigmaDeg:null,gammaDeg:null,foldVectors3D:null,sectorVectors3D:null,osculatingVector:null,torsionDeg:null,vertex3D:null}];
 for(let i=0;i<dd.length;i++){
  const nv=vertices.length,a=aa[i+1];p=plus2(p,u(phi),dd[i]);phi+=Math.PI-a[0]-a[1];
  wrd=wr*kernel.sqrt(1/(kernel.sin(a[0])*kernel.sin(a[1])));wld=wl*kernel.sqrt(1/(kernel.sin(a[3])*kernel.sin(a[2])));
  vertices.push(plus2(p,u(phi-a[3]),wrd),[...p],plus2(p,u(phi+a[0]),wld));
  edges.push([nv-3,nv],[nv-2,nv+1],[nv-1,nv+2]);raw.push('B',tt[i],'B');
  faces.push([nv-3,nv,nv+1,nv-2],[nv-2,nv+1,nv+2,nv-1]);edges.push([nv,nv+1],[nv+1,nv+2]);
  if(i!==dd.length-1){let t2:'M'|'V',t4:'M'|'V';
   if(tt[i]===tt[i+1]){if(Math.min(a[0],a[1])<Math.min(a[2],a[3])){t4=tt[i];t2=invert(tt[i]);}else{t2=tt[i];t4=invert(tt[i]);}}
   else if(Math.min(a[1],a[2])<Math.min(a[0],a[3]))t4=t2=tt[i+1];else t2=t4=tt[i];
   raw.push(t4,t2);
  }else raw.push('B','B');
  stations.push({index:i+1,spineCPMm:[...p],sectorsDeg:[...recipe.sectorsDeg[i+1]],cpDirectionDeg:phi/D,leftCreaseLengthMm:wld,rightCreaseLengthMm:wrd,spine3DMm:null,sigmaDeg:null,gammaDeg:null,foldVectors3D:null,sectorVectors3D:null,osculatingVector:null,torsionDeg:null,vertex3D:null});
 }
 // MakeTLinearChain assigns M/V but supplies no source target fold angles.
 const angles=raw.map(t=>t==='B'?0:null);
 return {stations,graph:incidence(vertices,edges,faces,raw,angles),rawSourceTypes:raw,rawSourceFoldAnglesDeg:angles,sourceVertices3D:null,maximumWidthsMm:null,boundaryEncoding:[] as {edge:number;rawType:'B';materialType:'F';reason:string}[]};
}
function space(recipe:Extract<LinearSpacePolyhedralCPRecipe,{model:'space-curve'}>){
 const pp=recipe.pointsMm,nn=pp.length-1,rr:Vec3[]=pp.slice(1).map((p,i)=>unit(sub3(p,pp[i]))),ll=pp.slice(1).map((p,i)=>norm(sub3(p,pp[i])));
 const sigma:(number|null)[][]=[],gamma:Four[]=[],alpha:Four[]=[],gg:Vec3[][]=[],aa:Vec3[][]=[],qq:Vec3[]=[],tl:number[]=[],tr:number[]=[],ta:number[]=[0],it:(Vertex3D|null)[]=[null];
 let sl=recipe.sigmaLeftDeg*D,sr=recipe.sigmaRightDeg*D;qq[0]=unit(cross(rr[0],rr[1]));
 if(recipe.osculatingVectorNear!==null&&!(dot(qq[0],recipe.osculatingVectorNear)>0))qq[0]=mul3(qq[0],-1);
 function end(i:number,r:Vec3){sigma[i]=i===0?[sr,sl,null,null]:[null,null,sl,sr];gamma[i]=[0,sr+sl,0,sr+sl];alpha[i]=[Math.PI/2,Math.PI/2,Math.PI/2,Math.PI/2];gg[i]=[rotate3(qq[i],Math.PI/2-sr,r),r,rotate3(qq[i],-(Math.PI/2-sl),r),mul3(r,-1)];aa[i]=[rotate3(qq[i],sr,r),rotate3(qq[i],-sl,r),rotate3(qq[i],-sl,mul3(r,-1)),rotate3(qq[i],sr,mul3(r,-1))];tl[i]=recipe.leftWidthMm;tr[i]=recipe.rightWidthMm;}
 end(0,rr[0]);
 for(let i=1;i<nn;i++){
  let q=unit(cross(rr[i-1],rr[i]));if(dot(q,qq[i-1])<0)q=mul3(q,-1);ta[i]=directed(qq[i-1],q,rr[i-1]);
  const vertex=degree4FromSubarcs(mul3(rr[i-1],-1),rr[i],sigma[i-1][1]!-ta[i],sigma[i-1][0]!+ta[i],qq[i-1]);it[i]=vertex;
  sigma[i]=[...vertex.sigmaRad];gamma[i]=[...vertex.gammaRad];alpha[i]=[...vertex.sectorsRad];aa[i]=vertex.sectorVectors;gg[i]=vertex.foldVectors;qq[i]=vertex.q;
  tl[i]=recipe.leftWidthMm/kernel.sqrt(kernel.sin(alpha[i][1])*kernel.sin(alpha[i][2]));tr[i]=recipe.rightWidthMm/kernel.sqrt(kernel.sin(alpha[i][0])*kernel.sin(alpha[i][3]));
 }
 qq[nn]=qq[nn-1];sl=sigma[nn-1][1]!;sr=sigma[nn-1][0]!;end(nn,rr[nn-1]);ta[nn]=0;it[nn]=null;
 const r:Point[]=[u(recipe.initialCPDirectionDeg*D)],p:Point[]=[[0,0]];
 for(let i=1;i<nn;i++)r[i]=rotate2(r[i-1],alpha[i][3]+alpha[i][0]-Math.PI);
 for(let i=1;i<=nn;i++)p[i]=plus2(p[i-1],r[i-1],ll[i-1]);
 const v:Point[]=[],v3s:Vec3[]=[],stations:Station[]=[];
 for(let i=0;i<=nn;i++){
  const right=rotate2(r[i===nn?nn-1:i],i===0||i===nn?-Math.PI/2:-alpha[i][0]);
  const left=rotate2(r[i===nn?nn-1:i],i===0||i===nn?Math.PI/2:alpha[i][1]);
  v.push(plus2(p[i],left,tl[i]),[...p[i]],plus2(p[i],right,tr[i]));
  v3s.push(add3(pp[i],mul3(gg[i][2],tl[i])),[...pp[i]],add3(pp[i],mul3(gg[i][0],tr[i])));
  stations.push({index:i,spineCPMm:[...p[i]],sectorsDeg:alpha[i].map(a=>a/D) as Four,cpDirectionDeg:kernel.atan2(r[i===nn?nn-1:i][1],r[i===nn?nn-1:i][0])/D,leftCreaseLengthMm:tl[i],rightCreaseLengthMm:tr[i],spine3DMm:[...pp[i]],sigmaDeg:sigma[i].map(a=>a===null?null:a/D),gammaDeg:gamma[i].map(a=>a/D) as Four,foldVectors3D:gg[i],sectorVectors3D:aa[i],osculatingVector:qq[i],torsionDeg:ta[i]/D,vertex3D:it[i]});
 }
 let wlm=Infinity,wrm=Infinity;
 for(let i=1;i<=nn;i++){
  const dl=1/kernel.tan(alpha[i-1][1])+1/kernel.tan(alpha[i][2]),dr=1/kernel.tan(alpha[i-1][0])+1/kernel.tan(alpha[i][3]);
  const l=ll[i-1]/dl,r=ll[i-1]/dr;if(dl!==0&&l>0&&l<wlm)wlm=l;if(dr!==0&&r>0&&r<wrm)wrm=r;
 }
 const edges:[number,number][]=[[0,1],[1,2]],raw:Type[]=['B','B'],angles:number[]=[0,0],faces:number[][]=[];
 for(let i=1;i<=nn;i++){
  edges.push([3*i-3,3*i],[3*i-2,3*i+1],[3*i-1,3*i+2]);raw.push('B',foldType(gamma[0][1]),'B');angles.push(0,gamma[0][1]/D,0);
  edges.push([3*i,3*i+1],[3*i+1,3*i+2]);
  // Literal In2448: i < nn-1, not i < nn. Preserve last interior B/0.
  if(i<nn-1){raw.push(foldType(gamma[i][2]),foldType(gamma[i][0]));angles.push(gamma[i][2]/D,gamma[i][0]/D);}else{raw.push('B','B');angles.push(0,0);}
  faces.push([3*i-3,3*i-2,3*i+1,3*i],[3*i-2,3*i-1,3*i+2,3*i+1]);
 }
 const graph=incidence(v,edges,faces,raw,angles),boundaryEncoding:{edge:number;rawType:'B';materialType:'F';reason:string}[]=[];
 raw.forEach((t,i)=>{if(t==='B'&&graph.edges_faces![i].length===2){graph.edges_assignment[i]='F';boundaryEncoding.push({edge:i,rawType:'B',materialType:'F',reason:'Explicit local semantic conversion: original border label B/0 contradicts its two-face shared incidence; preserve source B/BorderLine and use F/0 for the connected material seam. Original assignment is not claimed equal.'});}});
 return {stations,graph,rawSourceTypes:raw,rawSourceFoldAnglesDeg:angles,sourceVertices3D:v3s,maximumWidthsMm:[finite(wlm)?wlm:null,finite(wrm)?wrm:null],boundaryEncoding};
}
function proof3D(graph:FoldGraph,world:Vec3[]|null,rawTypes:Type[]){
 if(!world)return {available:false,perFaceIsometryChecked:false,sharedVertexIdentityChecked:false,sourceGammaChecked:false,maximumDistanceResidualMm:null,maximumPlanarityResidualMm:null,maximumTargetAngleResidualDeg:null,angleMismatches:[] as {edge:number;sourceAngleDeg:number;actualAngleDeg:number;sourceType:string}[],poseCertified:false};
 let distanceResidual=0,planarityResidual=0,angleResidual=0;const normals:Vec3[]=[],mismatches:{edge:number;sourceAngleDeg:number;actualAngleDeg:number;sourceType:string}[]=[];
 for(const face of graph.faces_vertices!){const o=world[face[0]],n=unit(cross(sub3(world[face[1]],o),sub3(world[face[2]],o)));normals.push(n);for(const i of face){planarityResidual=Math.max(planarityResidual,Math.abs(dot(sub3(world[i],o),n)));for(const j of face)distanceResidual=Math.max(distanceResidual,Math.abs(norm(sub3(world[i],world[j]))-kernel.hypot(graph.vertices_coords[i][0]-graph.vertices_coords[j][0],graph.vertices_coords[i][1]-graph.vertices_coords[j][1])));}}
 graph.edges_vertices.forEach(([a,b],i)=>{const faces=graph.edges_faces![i];if(faces.length!==2)return;let [l,r]=faces;
  const face=graph.faces_vertices![l],k=face.indexOf(a);if(k<0||face[(k+1)%face.length]!==b)[l,r]=[r,l];
  const actual=directed(normals[r],normals[l],unit(sub3(world[b],world[a])))/D,target=graph.edges_foldAngle[i]!;
  const delta=Math.abs(actual-target);angleResidual=Math.max(angleResidual,delta);if(delta>1e-7)mismatches.push({edge:i,sourceAngleDeg:target,actualAngleDeg:actual,sourceType:rawTypes[i]});
 });
 const scale=Math.max(1,...world.flat().map(Math.abs)),metricOk=distanceResidual<=1e-8*scale&&planarityResidual<=1e-8*scale;
 return {available:true,perFaceIsometryChecked:metricOk,sharedVertexIdentityChecked:world.length===graph.vertices_coords.length,sourceGammaChecked:true,maximumDistanceResidualMm:distanceResidual,maximumPlanarityResidualMm:planarityResidual,maximumTargetAngleResidualDeg:angleResidual,angleMismatches:mismatches,poseCertified:metricOk&&mismatches.length===0};
}
 return {linear,space,proof3D};
}
function evaluateWithArithmetic(raw:unknown,replay?:unknown){
 const recipe=validateLinearSpacePolyhedralCPRecipe(raw),arithmetic=primitiveArithmetic(recipe,replay),functions=sourceFunctions(arithmetic.math),c=recipe.model==='linear-chain'?functions.linear(recipe):functions.space(recipe),g=c.graph,N=c.stations.length;
 if(g.vertices_coords.length!==3*N||g.edges_vertices.length!==5*N-3||g.faces_vertices!.length!==2*N-2)fail('原 3N/5N−3/2N−2 拓扑计数不一致。');
 const poseProof=functions.proof3D(g,c.sourceVertices3D,c.rawSourceTypes);
 return {schema:SCHEMA,recipe,...c,arithmeticTrace:arithmetic.finish(),sourcePlane:g.vertices_coords,worldVerticesMm:c.sourceVertices3D,sourceGraph:{...g,edges_assignment:[...c.rawSourceTypes],edges_foldAngle:[...c.rawSourceFoldAnglesDeg]},topology:{stations:N,vertices:3*N,edges:5*N-3,quadFaces:2*N-2,stationIdentity:'index; same 3D coordinates do not weld stations',sourceVertexOrder:recipe.model==='linear-chain'?'right,spine,left':'left,spine,right'},poseProof,
  sourceRoleEvidence:{borderSymbol:{cell:'In[1796]',role:'B is a symbolic type label for a border edge; not an unfolded label'},assignment:{cell:'In[1798]',role:'AddTAssignedTo only attaches EdgeTypes; source Edges and Faces remain unchanged'},graph3D:{cell:'In[1407]',role:'AddTGraph3DTo only attaches Vertices3D and FoldAngles; no cut or duplicate vertices'},display:{cell:'In[1832]',role:'B -> BorderLine, U -> UnfoldedLine'},internalBorderInterpretation:recipe.model==='space-curve'?'literal source internal border labels contradict connected two-face incidence; local F/0 is explicit physical encoding, raw source assignment/style retained':'no source assignment conversion',literalEdgeAssignmentsEqualToMaterial:recipe.model==='linear-chain'},
  provenance:{notebookSHA256:SHA,function:recipe.model==='linear-chain'?'MakeTLinearChain':'MakeTSpaceCurve',cell:recipe.model==='linear-chain'?'In[2414] / In[2415]':'In[2448]',notebookLines:recipe.model==='linear-chain'?[170842,173464]:[173465,175771],primitiveCells:recipe.model==='linear-chain'?[]:['In[2336]','In[2353]','In[2156]','In[2239]','In[720]','In[1808]','In[1809]'],sourceWidthOrder:recipe.model==='linear-chain'?['rightWidthMm','leftWidthMm']:['leftWidthMm','rightWidthMm'],millimetres:'1 original unit = 1 mm; inputs used once unchanged',originalCPSpineOrigin:[0,0],initialCPDirectionDeg:recipe.model==='linear-chain'?0:recipe.initialCPDirectionDeg,coordinateWelding:false,coordinateNormalization:false,coordinateSnapping:false,mathematicaExecuted:false,interiorLastCrossingRule:recipe.model==='space-curve'?'literal i < nn-1; final interior crossing B/0':null,longitudinalGammaRule:recipe.model==='space-curve'?'literal Gamma[0][2] for every spine edge':null,unusedCPFourthVectorRule:recipe.model==='space-curve'?'literal -r[i-1]; r[0] is undefined at first interior station and unused by pl/pr':null},
  numericalPolicy:{arithmetic:'binary64 source formula replay; no interval certificate',maximumStations:128,maximumMaterialPairs:2000000,normalizationMinimumMagnitude:1e-12,acosRoundoffDomainSlack:16*Number.EPSILON,sectorClosureAbsoluteRadians:1e-9,poseDistanceRelativeTolerance:1e-8,poseAngleAbsoluteToleranceDeg:1e-7,sourceGuard:'exact saved primitive-trace arithmetic replay; bounded libm result comparison only; no geometry tolerance',intervalCertified:false},
  scope:{finitePolyhedralCP:true,originalStatic3DAvailable:c.sourceVertices3D!==null,originalStatic3DPoseCertified:poseProof.poseCertified,rigidMotion:false,flatFold:false,layerOrder:false,collisionFree:false}};
}
export function evaluateLinearSpacePolyhedralCPSource(raw:unknown){return evaluateWithArithmetic(raw);}
export type LinearSpacePolyhedralCPSource=ReturnType<typeof evaluateLinearSpacePolyhedralCPSource>;
function fromSource(source:LinearSpacePolyhedralCPSource):Doc{
 const graph=structuredClone(source.graph),x=graph.vertices_coords.map(p=>p[0]),y=graph.vertices_coords.map(p=>p[1]);
 const doc:Doc={schemaVersion:2,name:source.recipe.model==='linear-chain'?'原线性链多面纸带 CP':'原空间曲线多面纸带 CP',paper:{width:Math.max(...x)-Math.min(...x),height:Math.max(...y)-Math.min(...y)},objects:[],segments:graph.edges_vertices.map(([a,b],i)=>({id:'linear-space-polyhedral-edge-'+i,a:[...graph.vertices_coords[a]],b:[...graph.vertices_coords[b]],assignment:graph.edges_assignment[i] as Assignment,angle:graph.edges_foldAngle[i]})),metadata:{[NS]:structuredClone(source)}};
 validateDoc(doc);doc.metadata!.materialTopology=createMaterialTopology(doc,graph,doc.segments.map(s=>s.id));return doc;
}
export function linearSpacePolyhedralCPDocument(raw:unknown):Doc{return fromSource(evaluateLinearSpacePolyhedralCPSource(raw));}
/** Recipe recovery remains available after editing; recovery is not source certification. */
export function readLinearSpacePolyhedralCPRecipe(doc:Doc):LinearSpacePolyhedralCPRecipe|null{try{const s=doc.metadata?.[NS];return object(s)&&(s.schema===SCHEMA||s.schema===LEGACY_SCHEMA)?validateLinearSpacePolyhedralCPRecipe(s.recipe):null;}catch{return null;}}
const same=(a:unknown,b:unknown):boolean=>Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):object(b)?object(a)&&keys(a,Object.keys(b))&&Object.keys(b).every(k=>same(a[k],b[k])):a===b;
export function linearSpacePolyhedralCPSourceMatches(doc:Doc):boolean{
 try{validateDoc(doc);const recipe=readLinearSpacePolyhedralCPRecipe(doc);if(!recipe||Object.hasOwn(doc,'flatFold'))return false;
  const own=doc.metadata![NS];if(!object(own))return false;
  let expected:Doc;
  if(own.schema===LEGACY_SCHEMA){
   if(Object.hasOwn(own,'arithmeticTrace'))return false;
   // Legacy same-runtime byte-equivalent sources remain accepted. A missing trace cannot be invented from a final graph.
   expected=linearSpacePolyhedralCPDocument(recipe);const old=expected.metadata![NS] as Record<string,any>;old.schema=LEGACY_SCHEMA;delete old.arithmeticTrace;old.numericalPolicy.sourceGuard='exact deterministic replay of all saved source and material fields';
  }else{
   if(!Object.hasOwn(own,'arithmeticTrace'))return false;
   const replay=evaluateWithArithmetic(recipe,own.arithmeticTrace),fresh=evaluateLinearSpacePolyhedralCPSource(recipe);
   const flags=(s:LinearSpacePolyhedralCPSource)=>({topology:s.topology,rawSourceTypes:s.rawSourceTypes,boundaryEncoding:s.boundaryEncoding,sourceRoleEvidence:s.sourceRoleEvidence,provenance:s.provenance,numericalPolicy:s.numericalPolicy,scope:s.scope,
    graph:{edges_vertices:s.graph.edges_vertices,edges_assignment:s.graph.edges_assignment,faces_vertices:s.graph.faces_vertices,faces_edges:s.graph.faces_edges,edges_faces:s.graph.edges_faces,faces_faces:s.graph.faces_faces},
    branches:s.stations.map(st=>({index:st.index,spine3DMm:st.spine3DMm,odd:st.vertex3D?.oddCreaseIndex??null,major:st.vertex3D?.majorCreaseIndices??null,minor:st.vertex3D?.minorCreaseIndices??null})),
    pose:{available:s.poseProof.available,perFaceIsometryChecked:s.poseProof.perFaceIsometryChecked,sharedVertexIdentityChecked:s.poseProof.sharedVertexIdentityChecked,sourceGammaChecked:s.poseProof.sourceGammaChecked,poseCertified:s.poseProof.poseCertified,mismatches:s.poseProof.angleMismatches.map(m=>({edge:m.edge,sourceType:m.sourceType}))}});
   if(!same(flags(replay),flags(fresh)))return false;
   expected=fromSource(replay);
  }
  const actual=inspectMaterialTopology(doc);if(!actual.ok||actual.foldedVertices||actual.startingFace!==undefined)return false;
  if(!same(doc.metadata![NS],expected.metadata![NS])||!same(doc.metadata!.materialTopology,expected.metadata!.materialTopology)||!same(doc.paper,expected.paper)||doc.segments.length!==expected.segments.length)return false;
  return expected.segments.every((s,i)=>{const a=doc.segments[i];return !!a&&a.id===s.id&&a.assignment===s.assignment&&a.angle===s.angle&&same(a.a,s.a)&&same(a.b,s.b);});
 }catch{return false;}
}
function freeze(x:any):void{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}}
export function prepareLinearSpacePolyhedralCPPreview(raw:unknown){
 const recipe=validateLinearSpacePolyhedralCPRecipe(raw),source=evaluateLinearSpacePolyhedralCPSource(recipe),doc=fromSource(source);freeze(source);freeze(recipe);
 const scene=source.poseProof.poseCertified&&source.sourceVertices3D!==null?{vertices:structuredClone(source.sourceVertices3D),faces:structuredClone(source.graph.faces_vertices!),edges:structuredClone(source.graph.edges_vertices),label:'原字面公式静态姿态；逐面等距、共享顶点和目标 Γ 已核验',motion:false,layers:false}:null;
 return {recipe,source,doc,scene,summary:{model:recipe.model,stations:source.topology.stations,vertices:source.topology.vertices,edges:source.topology.edges,faces:source.topology.quadFaces,poseCertified:source.poseProof.poseCertified,poseAngleMismatches:source.poseProof.angleMismatches.length},build:(nextRaw:unknown=recipe)=>{const next=validateLinearSpacePolyhedralCPRecipe(nextRaw);if(!same(next,recipe))fail('源参数已改变，请重新生成预览；旧快照未静默替换种子。');return fromSource(source);}};
}
