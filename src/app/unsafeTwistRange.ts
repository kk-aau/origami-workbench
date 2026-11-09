import type {Point} from '../core/types';
/** Literal five inputs of In[3338]; source face and boundary indices are 1-based. */
export type UnsafeTwistQuery={pverts:Point[];pfaces:number[][];dverts:Point[];dfaces:number[][];bverts:number[]};
export type UnsafeTriple={face:number;start:number;indices:[number,number,number];points:[Point,Point,Point];angleRad:number};
export type UnsafeTwistResult={schema:'origamica-primal-dual-unsafe-range-v1';query:UnsafeTwistQuery;
 source:{function:'PrimalDualUnsafeTwistAngleRange';definitionCell:'In[3338]';definitionLines:[243855,243976];
  originalArguments:['pverts','pfaces','dverts','dfaces','bverts'];indexBase:1;angleUnits:'radians';rotationInterval:'(-Pi,Pi]';
  originalAuthorStatus:'IN PROGRESS / TBD';primalSelection:'first-non-boundary-start-per-face';dualSelection:'all-cyclic-triples-of-first-dual-face';
  originalOutput:'{Min[allangles],Max[allangles]}';publicOptions:[];fullWolframDomain:false;wolframExecuted:false;
  localAssignmentCertified:false;creasePatternCertified:false;layerOrderCertified:false};
 data:{primal:UnsafeTriple[];dual:UnsafeTriple[];allAnglesRad:number[];originalReturn:[number,number];rangeDeg:[number,number];ignoredDualFaces:number}};
/** Deliberate local finite example, never the held In[3339] call or its Out. */
export const LOCAL_UNSAFE_INPUT_EXAMPLE:UnsafeTwistQuery={pverts:[[0,0],[1,0],[1,1],[0,1],[.5,.5]],
 pfaces:[[1,2,5],[2,3,5],[3,4,5],[4,1,5]],dverts:[[.5,.1],[.9,.5],[.5,.9],[.1,.5]],dfaces:[[1,2,3,4]],bverts:[1,2,3,4]};
function fail(message:string):never{throw Error(message);}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keyset=(r:Record<string,unknown>,s:string)=>Object.keys(r).sort().join(',')===s.split(',').sort().join(',');
export function readUnsafeTwistQuery(raw:unknown):UnsafeTwistQuery{
 if(!record(raw)||!keyset(raw,'pverts,pfaces,dverts,dfaces,bverts'))fail('需要原五输入 pverts/pfaces/dverts/dfaces/bverts，不支持附加选项。');
 for(const name of ['pverts','dverts'] as const){const p=raw[name];if(!Array.isArray(p)||p.length>512||p.some(v=>!Array.isArray(v)||v.length!==2||v.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e8)))fail(`${name} 须是最多512个二维有限点，坐标范围±10⁸。`);}
 let total=0;
 for(const [name,points]of [['pfaces','pverts'],['dfaces','dverts']] as const){const faces=raw[name],n=(raw[points] as Point[]).length;
  if(!Array.isArray(faces)||faces.length>256||name==='dfaces'&&!faces.length||faces.some(f=>!Array.isArray(f)||f.length<3||f.length>128||f.some(v=>!Number.isInteger(v)||v<1||v>n)))fail(`${name} 须是原1-based有序面，3–128个有效点索引；dfaces至少一面。`);
  total+=faces.reduce((sum,f)=>sum+f.length,0);
 }
 if(total>4096)fail('原面角总数超过4096的有限查询容量。');
 if(!Array.isArray(raw.bverts)||raw.bverts.length>512||raw.bverts.some(v=>!Number.isInteger(v)||v<1||v>(raw.pverts as Point[]).length))fail('bverts 须是原pverts的1-based边界点索引。');
 return structuredClone(raw) as unknown as UnsafeTwistQuery;
}
/** ArcTan[dot,cross] from In[272], scaled only inside the angle calculation. */
export function originalUnsafeRotation(a:Point,b:Point):number{
 const ma=Math.max(Math.abs(a[0]),Math.abs(a[1])),mb=Math.max(Math.abs(b[0]),Math.abs(b[1]));
 if(!ma||!mb||!Number.isFinite(ma)||!Number.isFinite(mb))fail('原 RotationAngle 遇到零长或非有限方向；没有原有限角值。');
 const x=a.map(v=>v/ma),y=b.map(v=>v/mb),r=Math.atan2(x[0]*y[1]-x[1]*y[0],x[0]*y[0]+x[1]*y[1]);
 return r===-Math.PI?Math.PI:r;
}
export function unsafeTwistRange(raw:unknown):UnsafeTwistResult{
 const query=readUnsafeTwistQuery(raw),boundary=new Set(query.bverts);
 const triple=(vertices:Point[],face:number[],f:number,start:number):UnsafeTriple=>{
  const indices=[face[start],face[(start+1)%face.length],face[(start+2)%face.length]] as [number,number,number];
  const points=indices.map(i=>[...vertices[i-1]]) as [Point,Point,Point],a=points[0],b=points[1],c=points[2];
  return{face:f+1,start:start+1,indices,points,angleRad:originalUnsafeRotation([b[0]-a[0],b[1]-a[1]],[c[0]-b[0],c[1]-b[1]])};
 };
 const primal=query.pfaces.map((face,f)=>{const start=face.findIndex(index=>!boundary.has(index));
  if(start<0)fail(`原pface ${f+1} 没有非bverts的首三点；原Part/Take选择未得数值，不补造范围。`);
  return triple(query.pverts,face,f,start);
 });
 const dual=query.dfaces[0].map((_,i)=>triple(query.dverts,query.dfaces[0],0,i)),pa=primal.map(t=>t.angleRad),da=dual.map(t=>t.angleRad);
 const allAnglesRad=[...pa,...da,...pa.map(a=>Math.PI-a),...da.map(a=>Math.PI-a)];
 const originalReturn:[number,number]=[Math.min(...allAnglesRad),Math.max(...allAnglesRad)];
 return{schema:'origamica-primal-dual-unsafe-range-v1',query,source:{function:'PrimalDualUnsafeTwistAngleRange',definitionCell:'In[3338]',definitionLines:[243855,243976],
  originalArguments:['pverts','pfaces','dverts','dfaces','bverts'],indexBase:1,angleUnits:'radians',rotationInterval:'(-Pi,Pi]',
  originalAuthorStatus:'IN PROGRESS / TBD',primalSelection:'first-non-boundary-start-per-face',dualSelection:'all-cyclic-triples-of-first-dual-face',
  originalOutput:'{Min[allangles],Max[allangles]}',publicOptions:[],fullWolframDomain:false,wolframExecuted:false,
  localAssignmentCertified:false,creasePatternCertified:false,layerOrderCertified:false},
  data:{primal,dual,allAnglesRad,originalReturn,rangeDeg:originalReturn.map(a=>a*180/Math.PI) as [number,number],ignoredDualFaces:query.dfaces.length-1}};
}
export function writeUnsafeTwistParameters(q:UnsafeTwistQuery):string{
 return JSON.stringify({format:'origamica-primal-dual-unsafe-five-inputs',version:1,query:readUnsafeTwistQuery(q)},null,2)+'\n';
}
export function readUnsafeTwistParameters(text:string):UnsafeTwistQuery{
 let raw:unknown;try{raw=JSON.parse(text);}catch{fail('原五输入参数JSON格式无效。');}
 if(!record(raw)||!keyset(raw,'format,version,query')||raw.format!=='origamica-primal-dual-unsafe-five-inputs'||raw.version!==1)fail('需要完整原五输入参数文件。');
 return readUnsafeTwistQuery(raw.query);
}
export function readUnsafeTwistResult(text:string):UnsafeTwistResult{
 let raw:unknown;try{raw=JSON.parse(text);}catch{fail('原角域结果JSON格式无效。');}
 if(!record(raw)||!keyset(raw,'schema,query,source,data'))fail('原角域结果字段不完整。');
 const expected=unsafeTwistRange(raw.query);
 const angleFields=new Set(['angleRad','allAnglesRad','originalReturn','rangeDeg']);
 const same=(a:unknown,b:unknown,field=''):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&
   (angleFields.has(field)?Math.abs(a-b)<=2e-13*Math.max(1,Math.abs(b)):a===b):
  Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((x,i)=>same(a[i],x,field)):
  record(b)?record(a)&&Object.keys(a).sort().join(',')===Object.keys(b).sort().join(',')&&Object.entries(b).every(([k,v])=>same(a[k],v,k)):a===b;
 if(!same(raw,expected))fail('原面序、首非边界三点、首对偶面、完整角表/范围或来源回读不符。');
 return expected;
}
