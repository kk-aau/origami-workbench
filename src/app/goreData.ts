import {apiWhenIdle} from './api';
import type {XY} from './tessellation';
export type GoreFunction='SingleGoreData'|'MultipleGoreData'|'SphereSingleGoreData'|'SphereMultipleGoreData';
export type GoreQuery={family:'gore-data-native';function:GoreFunction;sectors:number;points?:XY[];divisions?:number};
export type GorePaperParams={family:'gore-paper';profile:'sphere'|'points';sectors:number;typeMinimumAngleDeg:number;divisions?:number;crossSection?:XY[];petals?:'multiple'};
export const GORE_FUNCTIONS={SingleGoreData:'In[3448]',MultipleGoreData:'In[3450]',SphereSingleGoreData:'In[3452]',SphereMultipleGoreData:'In[3454]'} as const;
export const gorePaperPreset=():GorePaperParams=>({family:'gore-paper',profile:'sphere',sectors:6,divisions:16,typeMinimumAngleDeg:.5});
export const sphereGoreProfile=(n:number):XY[]=>Array.from({length:n+1},(_,i)=>i===0?[0,0]:i===n?[0,2]:2*i===n?[1,1]:[Math.sin(Math.PI*i/n),1-Math.cos(Math.PI*i/n)]);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),integer=(x:unknown,a:number,b:number):x is number=>finite(x)&&Number.isInteger(x)&&x>=a&&x<=b;
const pointList=(x:unknown):x is XY[]=>Array.isArray(x)&&x.length>=2&&x.length<=65&&x.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>finite(v)&&Math.abs(v)<=1000));
export function readGorePaperParams(raw:Record<string,unknown>):GorePaperParams|null{
 if(raw.family!=='gore-paper'||Object.keys(raw).some(k=>!['family','profile','sectors','typeMinimumAngleDeg','divisions','crossSection','petals'].includes(k))||'petals'in raw&&raw.petals!=='multiple')return null;
 const profile=raw.profile??'sphere',sectors=raw.sectors??6,typeMinimumAngleDeg=raw.typeMinimumAngleDeg??.5;if(!integer(sectors,3,32)||!finite(typeMinimumAngleDeg)||typeMinimumAngleDeg<0||typeMinimumAngleDeg>90||!['sphere','points'].includes(String(profile)))return null;
 const multiple=raw.petals==='multiple',extra=multiple?{petals:'multiple' as const}:{};
 if(profile==='sphere'){const divisions=raw.divisions??16;if('crossSection'in raw||!integer(divisions,2,64)||multiple&&!multipleGoreBudget(divisions+1,sectors))return null;return{family:'gore-paper',profile,sectors,divisions,typeMinimumAngleDeg,...extra};}
 const points=raw.crossSection??[[0,0],[1,1],[1,2],[0,3]];
 if('divisions'in raw||!pointList(points)||points.some((p,i)=>p[0]<0||i>0&&i<points.length-1&&p[0]===0||i>0&&Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])<=1e-8)||multiple&&!multipleGoreBudget(points.length,sectors))return null;
 return{family:'gore-paper',profile:'points',sectors,typeMinimumAngleDeg,crossSection:structuredClone(points),...extra};
}
const multipleGoreBudget=(nr:number,m:number)=>m*(nr-1)<=600&&m*(2*nr**2+12*(nr-1))<=65536;
/** Existing integer input limits, additionally bounded by actual materials and complete original data. */
export function gorePaperLimits(params:GorePaperParams):{sectors:number;divisions:number}{
 if(params.petals!=='multiple')return{sectors:32,divisions:64};
 const nr=params.profile==='sphere'?params.divisions!+1:params.crossSection!.length;
 let sectors=3,divisions=2;
 for(let m=3;m<=32;m++)if(multipleGoreBudget(nr,m))sectors=m;
 for(let n=2;n<=64;n++)if(multipleGoreBudget(n+1,params.sectors))divisions=n;
 return{sectors,divisions};
}
export function readGoreQuery(raw:unknown):GoreQuery|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const r=raw as Record<string,unknown>,fn=r.function??'SphereSingleGoreData',m=r.sectors??6;
 if(r.family!=='gore-data-native'||typeof fn!=='string'||!Object.hasOwn(GORE_FUNCTIONS,fn)||!integer(m,3,32))return null;
 const spherical=fn.startsWith('Sphere');if(Object.keys(r).some(k=>!['family','function','sectors',spherical?'divisions':'points'].includes(k)))return null;
 const q:GoreQuery={family:'gore-data-native',function:fn as GoreFunction,sectors:m};let nr:number;
 if(spherical){const n=r.divisions??16;if(!integer(n,2,64))return null;q.divisions=n;nr=n+1;}
 else{const p=r.points??[[0,0],[1,1],[1,2],[0,3]];if(!pointList(p))return null;q.points=structuredClone(p);nr=p.length;}
 if((fn.includes('Multiple')?m:1)*(2*nr**2+12*(nr-1))>65536)return null;return q;
}
export type GoreDataKey='targetPolygons'|'radialPolygons'|'cylindricalPolygons'|'flatLines';
export type GoreResult={schema:'origamica-gore-data-v1';query:GoreQuery;source:{function:GoreFunction;definitionCell:string;singleDefinitionCell:'In[3448]';inputPoints:XY[];arcLengths:number[];halfWidths:number[];originalOutputOrder:string[];repeatedFlatLinesPreserved:true;wolframExecuted:false};data:Record<GoreDataKey,number[][][]|number[][][][]>};
/** Independent literal scalar In[3448] and rotations; no backend flags prove it. */
export function goreDataReference(query:GoreQuery):GoreResult{
 const q=readGoreQuery(query);if(!q)throw Error('原Gore输入或完整图形预算无效。');const p=q.function.startsWith('Sphere')?sphereGoreProfile(q.divisions!):q.points!,r=[0],t=q.sectors===4?1:Math.tan(Math.PI/q.sectors);
 for(let i=1;i<p.length;i++)r.push(r[i-1]+Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]));
 const w=p.map(v=>v[0]*t),maximum=Math.max(...p.map(v=>v[0])),target=p.map((v,i)=>[v[0],w[i],v[1]]),radial=r.map((v,i)=>[v,w[i],0]),cylinder=r.map((v,i)=>[maximum,w[i],v+1-r.at(-1)!/2]);
 const panels=(b:number[][])=>b.slice(1).map((_,i)=>[b[i],b[i+1],[b[i+1][0],-b[i+1][1],b[i+1][2]],[b[i][0],-b[i][1],b[i][2]]]),c=r.map((v,i)=>[v,w[i]-w[0]]),outline=[...c,...[...c].reverse().map(v=>[v[0],-v[1]])];
 const single:Record<GoreDataKey,number[][][]>={targetPolygons:panels(target),radialPolygons:panels(radial),cylindricalPolygons:panels(cylinder),flatLines:p.map(()=>structuredClone(outline))};let data:GoreResult['data']=single;
 if(q.function.includes('Multiple'))data=Object.fromEntries(Object.entries(single).map(([key,value])=>[key,Array.from({length:q.sectors},(_,j)=>{const a=2*Math.PI*j/q.sectors,co=Math.cos(a),si=Math.sin(a);return value.map(primitive=>primitive.map(v=>[co*v[0]-si*v[1],si*v[0]+co*v[1],...v.slice(2)]));})])) as GoreResult['data'];
 return{schema:'origamica-gore-data-v1',query:q,source:{function:q.function,definitionCell:GORE_FUNCTIONS[q.function],singleDefinitionCell:'In[3448]',inputPoints:p,arcLengths:r,halfWidths:w,originalOutputOrder:['t3d','r3d','c3d','u2d'],repeatedFlatLinesPreserved:true,wolframExecuted:false},data};
}
export function readGoreResult(raw:unknown,q:GoreQuery):GoreResult{
 const expected=goreDataReference(q),scale=Math.max(1,...expected.source.arcLengths.map(Math.abs),...expected.source.inputPoints.flat().map(Math.abs));
 const same=(a:unknown,b:any):boolean=>typeof b==='number'?finite(a)&&Math.abs(a-b)<=3e-10*scale:Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):b&&typeof b==='object'?!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).sort().join(',')===Object.keys(b).sort().join(',')&&Object.entries(b).every(([k,v])=>same((a as any)[k],v)):a===b;
 if(!same(raw,expected))throw Error('原Gore剖面、四组图形、旋转顺序或重复线的独立回读失败。');return raw as GoreResult;
}
export async function fetchGoreData(q:GoreQuery,signal?:AbortSignal){return readGoreResult(await apiWhenIdle('tessellation/gore-data',q,signal),q);}

/** Bind every indexed paper vertex, panel and edge to the complete original data. */
export function gorePaperSourceValid(source:Record<string,unknown>,fold:unknown,params?:GorePaperParams):boolean{
 try{
  if(source.spatialKind==='origamica-multiple-gore')return multipleGorePaperSourceValid(source,fold,params);
  if(source.spatialKind!=='origamica-single-gore'||source.derivedIndexedPaper!==true||!source.originalGoreData||!fold||typeof fold!=='object')return false;
  const raw=source.originalGoreData as GoreResult,q=readGoreQuery(raw.query);
  if(!q||!['SingleGoreData','SphereSingleGoreData'].includes(q.function))return false;
  const original=readGoreResult(raw,q),paper=readGorePaperParams({family:'gore-paper',profile:q.function.startsWith('Sphere')?'sphere':'points',sectors:q.sectors,...(q.divisions===undefined?{crossSection:q.points}:{divisions:q.divisions})});
  if(!paper)return false;
  if(params&&(params.profile!==paper.profile||params.sectors!==paper.sectors||params.divisions!==paper.divisions||JSON.stringify(params.crossSection)!==JSON.stringify(paper.crossSection)))return false;
  const cp:number[][]=[],ff:number[][]=[],rows:number[][]=[];
  original.source.inputPoints.forEach((p,i)=>{const r=original.source.arcLengths[i],w=original.source.halfWidths[i],a=cp.length;cp.push([r,w]);ff.push([p[0],w,p[1]]);let b=a;if(w!==0){b=cp.length;cp.push([r,-w]);ff.push([p[0],-w,p[1]]);}rows.push([a,b]);});
  const faces=rows.slice(1).map((b,i)=>{const a=rows[i],face=[a[1],b[1],b[0],a[0]];return face.filter((v,j)=>v!==face[(j+face.length-1)%face.length]);});
  const graph=fold as Record<string,unknown>,tolerance=3e-10*Math.max(1,...original.source.arcLengths);
  const coordinates=(a:unknown,b:number[][])=>Array.isArray(a)&&a.length===b.length&&b.every((p,i)=>Array.isArray(a[i])&&a[i].length===p.length&&p.every((v,j)=>finite(a[i][j])&&Math.abs(a[i][j]-v)<=tolerance));
  if(!coordinates(graph.vertices_coords,cp)||!coordinates(source.foldedForm3D,ff)||JSON.stringify(source.radialRowVertices)!==JSON.stringify(rows)||JSON.stringify(graph.faces_vertices)!==JSON.stringify(faces))return false;
  const counts=new Map<string,number>(),key=(a:number,b:number)=>a<b?`${a},${b}`:`${b},${a}`;
  for(const face of faces)for(let i=0;i<face.length;i++){const edge=key(face[i],face[(i+1)%face.length]);counts.set(edge,(counts.get(edge)??0)+1);}
  const edges=graph.edges_vertices,types=graph.edges_assignment;if(!Array.isArray(edges)||!Array.isArray(types)||edges.length!==counts.size||types.length!==edges.length)return false;
  const seen=new Set<string>();return edges.every((edge,i)=>{if(!Array.isArray(edge)||edge.length!==2||!edge.every(v=>integer(v,0,cp.length-1)))return false;const k=key(edge[0],edge[1]),n=counts.get(k);if(!n||seen.has(k)||!(n===1?types[i]==='B':['M','V','U','F'].includes(types[i])))return false;seen.add(k);return true;});
 }catch{return false;}
}

type IndexedGore={cp:XY[];ff:number[][];faces:number[][];rows:number[][]};
function indexedSingleGore(original:GoreResult):IndexedGore{
 const cp:XY[]=[],ff:number[][]=[],rows:number[][]=[];
 original.source.inputPoints.forEach((p,i)=>{const r=original.source.arcLengths[i],w=original.source.halfWidths[i],a=cp.length;cp.push([r,w]);ff.push([p[0],w,p[1]]);let b=a;if(w!==0){b=cp.length;cp.push([r,-w]);ff.push([p[0],-w,p[1]]);}rows.push([a,b]);});
 const faces=rows.slice(1).map((b,i)=>{const a=rows[i],f=[a[1],b[1],b[0],a[0]];return f.filter((v,j)=>v!==f[(j+f.length-1)%f.length]);});
 return{cp,ff,faces,rows};
}
function multipleGorePaperSourceValid(source:Record<string,unknown>,fold:unknown,params?:GorePaperParams):boolean{
 if(source.algorithm!=='Origamica P43 MultipleGoreData independent radial materials'||source.version!==1||source.output!=='spatial-3d'||source.derivedIndexedPaper!==true||source.staticGlobalIsometryChecked!==true||source.standardSingleSheetFold!==false||source.coordinateWeldingApplied!==false||source.gluingApplied!==false||source.continuousRigidPathChecked!==false||source.selfCollisionChecked!==false||source.layerOrderChecked!==false||!fold||typeof fold!=='object'||Array.isArray(fold))return false;
 const saved=source.paperParameters;if(!saved||typeof saved!=='object'||Array.isArray(saved))return false;
 const paper=readGorePaperParams(saved as Record<string,unknown>);
 if(!paper||paper.petals!=='multiple'||Object.keys(paper).sort().join(',')!==Object.keys(saved).sort().join(',')||Object.entries(paper).some(([k,v])=>JSON.stringify(v)!==JSON.stringify((saved as Record<string,unknown>)[k]))||params&&JSON.stringify(paper)!==JSON.stringify(readGorePaperParams(params as unknown as Record<string,unknown>)))return false;
 const query:GoreQuery={family:'gore-data-native',function:paper.profile==='sphere'?'SphereMultipleGoreData':'MultipleGoreData',sectors:paper.sectors,...(paper.profile==='sphere'?{divisions:paper.divisions}:{points:paper.crossSection})};
 const original=readGoreResult(source.originalGoreData,query),single=indexedSingleGore(original),cp:XY[]=[],ff:number[][]=[],faces:number[][]=[],materials:any[]=[];
 const counts=new Map<string,number>(),key=(a:number,b:number)=>`${Math.min(a,b)},${Math.max(a,b)}`;
 const templateEdges=[...new Set(single.faces.flatMap(f=>f.map((a,i)=>key(a,f[(i+1)%f.length]))))].map(k=>k.split(',').map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 for(let j=0;j<paper.sectors;j++){
  const a=2*Math.PI*j/paper.sectors,c=Math.cos(a),s=Math.sin(a),v0=cp.length,f0=faces.length,e0=j*templateEdges.length;
  const rotate=(p:number[])=>[c*p[0]-s*p[1],s*p[0]+c*p[1],...p.slice(2)];
  cp.push(...single.cp.map(p=>rotate(p) as XY));ff.push(...single.ff.map(rotate));faces.push(...single.faces.map(f=>f.map(v=>v+v0)));
  materials.push({id:`gore-petal-${j}`,petalIndex:j,rotationRad:a,vertices:Array.from({length:single.cp.length},(_,v)=>v+v0),edges:Array.from({length:templateEdges.length},(_,e)=>e+e0),faces:Array.from({length:single.faces.length},(_,f)=>f+f0),radialRowVertices:single.rows.map(r=>r.map(v=>v+v0))});
 }
 const graph=fold as Record<string,unknown>,tolerance=3e-10*Math.max(1,...original.source.arcLengths);
 const coordinates=(a:unknown,b:number[][])=>Array.isArray(a)&&a.length===b.length&&b.every((p,i)=>Array.isArray(a[i])&&a[i].length===p.length&&p.every((v,k)=>finite(a[i][k])&&Math.abs(a[i][k]-v)<=tolerance));
 if(!coordinates(graph.vertices_coords,cp)||!coordinates(source.foldedForm3D,ff)||JSON.stringify(graph.faces_vertices)!==JSON.stringify(faces)||JSON.stringify(source.independentMaterials)!==JSON.stringify(materials))return false;
 for(const f of faces)for(let i=0;i<f.length;i++){const e=key(f[i],f[(i+1)%f.length]);counts.set(e,(counts.get(e)??0)+1);}
 const expectedEdges=materials.flatMap(p=>templateEdges.map(e=>e.map(v=>v+p.vertices[0]))),edges=graph.edges_vertices,types=graph.edges_assignment,angles=graph.edges_foldAngle;
 if(JSON.stringify(edges)!==JSON.stringify(expectedEdges)||!Array.isArray(types)||!Array.isArray(angles)||types.length!==expectedEdges.length||angles.length!==types.length)return false;
 const sub=(a:number[],b:number[])=>a.map((x,i)=>x-b[i]),cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0);
 const normals=single.faces.map(f=>{const n=cross(sub(single.ff[f[1]],single.ff[f[0]]),sub(single.ff[f[2]],single.ff[f[0]])),length=Math.hypot(...n);return n.map(x=>x/length);}),directed=new Map<string,number>();
 single.faces.forEach((f,i)=>f.forEach((a,j)=>directed.set(`${a},${f[(j+1)%f.length]}`,i)));
 const templateTypes=templateEdges.map(([u,v])=>{const left=directed.get(`${u},${v}`),right=directed.get(`${v},${u}`);if(left===undefined||right===undefined)return{kind:'B',angle:null};const a=normals[right],b=normals[left],edge=sub(single.ff[v],single.ff[u]),angle=Math.atan2(dot(a,cross(b,edge)),dot(a,b)*Math.hypot(...edge)),epsilon=paper.typeMinimumAngleDeg*Math.PI/180;return{kind:angle>epsilon?'V':angle< -epsilon?'M':'U',angle:angle*180/Math.PI};});
 return expectedEdges.every((e,i)=>{const expected=templateTypes[i%templateTypes.length],n=counts.get(key(e[0],e[1]));return types[i]===expected.kind&&(n===1?angles[i]===null:n===2&&finite(angles[i])&&expected.angle!==null&&Math.abs(angles[i]-expected.angle)<=1e-8);});
}
