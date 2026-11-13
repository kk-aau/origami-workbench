import type {Doc,Point,Segment} from '../core/types';
import {validateDoc} from '../core/types';
import {BoundsIndex,type Bounds2} from '../core/boundsIndex';
import {distance,interpolate,parameter,polygonArea,segmentIntersection} from '../core/geometry';
import {hasMaterialTopology} from '../core/materialTopology';
import {materialOrientation} from '../core/materialTraceGeometry';
import {overlappingSegmentPairs} from '../core/segmentPairs';
import {pointBounds} from '../core/pointBounds';

export interface PaperShape {paper:{width:number;height:number};boundary:{a:Point;b:Point}[]}
export type PaperShapeKind='square'|'rectangle'|'triangle'|'regular';
type Edge=PaperShape['boundary'][number];
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const point=(value:unknown):value is Point=>Array.isArray(value)&&value.length===2&&value.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1_000_000);
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=1_000_000;
const same=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1];
const pointKey=(p:Point)=>`${p[0]},${p[1]}`;
const boundsOf=({a,b}:Edge):Bounds2=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
const onEdge=(p:Point,e:Edge)=>materialOrientation(e.a,e.b,p)===0&&p[0]>=Math.min(e.a[0],e.b[0])&&p[0]<=Math.max(e.a[0],e.b[0])&&p[1]>=Math.min(e.a[1],e.b[1])&&p[1]<=Math.max(e.a[1],e.b[1]);
const bad=():never=>{throw Error('纸形边界必须真实闭合且不分叉，不能有重合、自交或退化边。');};

/** Exact endpoint identities distinguish a closed ring from a nearby gap. */
function boundaryLoops(boundary:readonly Edge[]):Point[][] {
 const vertices:Point[]=[],byPoint=new Map<string,number>(),edges:[number,number][]=[],usedEdges=new Set<string>();
 const id=(p:Point)=>{const key=pointKey(p);let v=byPoint.get(key);if(v===undefined){v=vertices.length;vertices.push(p);byPoint.set(key,v);}return v;};
 for(const edge of boundary){const a=id(edge.a),b=id(edge.b);if(a===b)bad();const key=a<b?`${a}:${b}`:`${b}:${a}`;if(usedEdges.has(key))bad();usedEdges.add(key);edges.push([a,b]);}
 const adjacent=vertices.map(()=>[] as number[]);edges.forEach(([a,b],e)=>{adjacent[a].push(e);adjacent[b].push(e);});
 if(!edges.length||adjacent.some(row=>row.length!==2))bad();
 for(const [i,j] of overlappingSegmentPairs(boundary,0)){
  const a=boundary[i],b=boundary[j],shared=edges[i].find(v=>edges[j].includes(v));
  if(shared!==undefined){
   const otherA=vertices[edges[i].find(v=>v!==shared)!],otherB=vertices[edges[j].find(v=>v!==shared)!];
   if(onEdge(otherA,b)||onEdge(otherB,a))bad();
   continue;
  }
  const ab1=materialOrientation(a.a,a.b,b.a),ab2=materialOrientation(a.a,a.b,b.b),ba1=materialOrientation(b.a,b.b,a.a),ba2=materialOrientation(b.a,b.b,a.b);
  if(ab1*ab2<0&&ba1*ba2<0||ab1===0&&onEdge(b.a,a)||ab2===0&&onEdge(b.b,a)||ba1===0&&onEdge(a.a,b)||ba2===0&&onEdge(a.b,b))bad();
 }
 const used=new Set<number>(),loops:Point[][]=[];
 for(let seed=0;seed<edges.length;seed++){
  if(used.has(seed))continue;const start=edges[seed][0],ring:Point[]=[];let v=start,e=seed;
  do{if(used.has(e))bad();used.add(e);ring.push(vertices[v]);v=edges[e][0]===v?edges[e][1]:edges[e][0];e=adjacent[v].find(other=>other!==e)!;}while(v!==start);
  if(ring.length<3||!Number.isFinite(polygonArea(ring))||polygonArea(ring)===0)bad();loops.push(ring);
 }
 return loops;
}

/** Sanitise a boundary snapshot, retaining all independent rings and holes. */
export function validatePaperShape(raw:unknown):PaperShape {
 if(!object(raw)||Object.keys(raw).some(key=>!['paper','boundary'].includes(key))||!object(raw.paper)||Object.keys(raw.paper).some(key=>!['width','height'].includes(key))||!positive(raw.paper.width)||!positive(raw.paper.height)||!Array.isArray(raw.boundary)||!raw.boundary.length)throw Error('纸形数据或宽高无效。');
 const boundary:Edge[]=raw.boundary.map(value=>{if(!object(value)||Object.keys(value).some(key=>!['a','b'].includes(key))||!point(value.a)||!point(value.b))throw Error('纸形边界坐标须为有限二维坐标，且不超过 ±1000000。');return {a:[...value.a],b:[...value.b]};});
 boundaryLoops(boundary);
 const bounds=pointBounds(boundary.flatMap(edge=>[edge.a,edge.b])),width=bounds.maxX-bounds.minX,height=bounds.maxY-bounds.minY,tolerance=Math.max(width,height)*1e-12;
 if(!positive(width)||!positive(height)||Math.abs(width-raw.paper.width)>tolerance||Math.abs(height-raw.paper.height)>tolerance)throw Error('纸形宽高必须与真实边界范围一致。');
 for(const edge of boundary)for(const p of [edge.a,edge.b]){p[0]-=bounds.minX;p[1]-=bounds.minY;}
 if(bounds.minX!==0||bounds.minY!==0)boundaryLoops(boundary);
 return {paper:{width,height},boundary};
}

function assertOrdinaryPaper(doc:Doc):void {
 if(hasMaterialTopology(doc)||doc.metadata&&['materialCurveModel','materialCurveConstruction'].some(key=>Object.hasOwn(doc.metadata!,key)))throw Error('当前工程包含材料拓扑或参数构造身份，不能直接替换纸张边界；请使用普通折痕工程。');
 if(doc.metadata&&Object.hasOwn(doc.metadata,'curveDesign'))throw Error('曲面设计不能直接设置普通纸张形状，请先新建或打开折痕工程。');
}

export function paperShapeFromDoc(doc:Doc):PaperShape {
 assertOrdinaryPaper(doc);validateDoc(doc);
 const boundary=doc.segments.filter(edge=>edge.assignment==='B').map(({a,b})=>({a:[...a] as Point,b:[...b] as Point}));
 if(!boundary.length)throw Error('当前工程没有可保存的真实闭合纸张边界。');
 const bounds=pointBounds(boundary.flatMap(edge=>[edge.a,edge.b]));
 return validatePaperShape({paper:{width:bounds.maxX-bounds.minX,height:bounds.maxY-bounds.minY},boundary});
}

export function createPaperShape(kind:PaperShapeKind,ratio:Point=[1,1],sides=6,longest=300):PaperShape {
 if(!['square','rectangle','triangle','regular'].includes(kind)||!positive(longest))throw Error('纸张形状或长边长度无效。');
 let vertices:Point[];
 if(kind==='square'||kind==='rectangle'){
  if(!Array.isArray(ratio)||ratio.length!==2||ratio.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<=0))throw Error('纸张宽高比例须为有限正数。');
  const [w,h]=kind==='square'?[1,1]:ratio,scale=Math.max(w,h),width=w/scale*longest,height=h/scale*longest;
  vertices=[[0,0],[width,0],[width,height],[0,height]];
 }else{
  const count=kind==='triangle'?3:sides;if(!Number.isSafeInteger(count)||count<3||count>64)throw Error('正多边形边数须为 3—64 的整数。');
  const regular=Array.from({length:count},(_,i):Point=>{const angle=-Math.PI/2+i*2*Math.PI/count;return [Math.cos(angle),Math.sin(angle)];}),bounds=pointBounds(regular),span=Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY);
  vertices=regular.map(([x,y])=>[(x-bounds.minX)/span*longest,(y-bounds.minY)/span*longest]);
 }
 const bounds=pointBounds(vertices);
 return validatePaperShape({paper:{width:bounds.maxX-bounds.minX,height:bounds.maxY-bounds.minY},boundary:vertices.map((a,i)=>({a,b:vertices[(i+1)%vertices.length]}))});
}

export function paperShapeDoc(shape:PaperShape,name='纸形'):Doc {
 const checked=validatePaperShape(shape),doc:Doc={schemaVersion:2,name,paper:checked.paper,objects:[],segments:checked.boundary.map(({a,b},i)=>({id:`paper-shape-edge-${i+1}`,a,b,assignment:'B',angle:0}))};
 validateDoc(doc);return doc;
}

function boundarySignature(boundary:readonly Edge[]):string {
 const rings=boundaryLoops(boundary).map(ring=>{
  const points=ring.filter((p,i)=>materialOrientation(ring[(i+ring.length-1)%ring.length],p,ring[(i+1)%ring.length])!==0),keys=points.map(pointKey);
  let start=0;for(let i=1;i<keys.length;i++)if(keys[i]<keys[start])start=i;
  const forward=keys.map((_,i)=>keys[(start+i)%keys.length]).join(';'),backward=keys.map((_,i)=>keys[(start-i+keys.length)%keys.length]).join(';');return forward<backward?forward:backward;
 });
 return rings.sort().join('|');
}

/** Clip every non-boundary segment against the real even/odd paper region.
 * Objects remain editor annotations. Material contracts are never discarded. */
export function preparePaperShapeChange(doc:Doc,shape:PaperShape):{doc:Doc;clipped:number;removed:number} {
 assertOrdinaryPaper(doc);validateDoc(doc);const checked=validatePaperShape(shape),oldLongest=Math.max(checked.paper.width,checked.paper.height),longest=Math.max(doc.paper.width,doc.paper.height);
 const scale=(value:number)=>oldLongest===longest?value:value/oldLongest*longest;
 const fitted=validatePaperShape({paper:{width:scale(checked.paper.width),height:scale(checked.paper.height)},boundary:checked.boundary.map(({a,b})=>({a:a.map(scale),b:b.map(scale)}))});
 const oldBoundary=doc.segments.filter(edge=>edge.assignment==='B'),oldBounds=oldBoundary.length?pointBounds(oldBoundary.flatMap(edge=>[edge.a,edge.b])):{minX:0,minY:0,maxX:doc.paper.width,maxY:doc.paper.height};
 let origin:Point=[oldBounds.minX/2+oldBounds.maxX/2-fitted.paper.width/2,oldBounds.minY/2+oldBounds.maxY/2-fitted.paper.height/2];
 let boundary=fitted.boundary.map(({a,b})=>({a:[a[0]+origin[0],a[1]+origin[1]] as Point,b:[b[0]+origin[0],b[1]+origin[1]] as Point}));
 // Reusing an identical physical contour avoids a translate/back round trip
 // changing a distant imported endpoint by one floating-point unit.
 try{
  const current=paperShapeFromDoc(doc);
  if(current.paper.width===fitted.paper.width&&current.paper.height===fitted.paper.height&&boundarySignature(current.boundary)===boundarySignature(fitted.boundary)){
   boundary=oldBoundary.map(({a,b})=>({a:[...a],b:[...b]}));origin=[oldBounds.minX,oldBounds.minY];
  }
 }catch{/* Replacing an open ordinary CP boundary is an explicit repair. */}
 boundaryLoops(boundary);
 const index=new BoundsIndex(boundary.map(boundsOf)),asSegment=(e:Edge):Segment=>({id:'boundary',a:e.a,b:e.b,assignment:'B',angle:0});
 const inside=(p:Point)=>{
  if(p[0]<origin[0]||p[0]>origin[0]+fitted.paper.width||p[1]<origin[1]||p[1]>origin[1]+fitted.paper.height)return false;
  let parity=false;for(const e of index.query([p[0],p[1],origin[0]+fitted.paper.width,p[1]])){
   const edge=boundary[e];if(onEdge(p,edge))return false;const sign=materialOrientation(edge.a,edge.b,p);
   if(edge.a[1]<=p[1]&&edge.b[1]>p[1]&&sign>0||edge.b[1]<=p[1]&&edge.a[1]>p[1]&&sign<0)parity=!parity;
  }return parity;
 };
 const ids=new Set([...doc.segments.map(edge=>edge.id),...(doc.objects??[]).map(object=>object.id)]),allocate=(base:string)=>{let next=base,n=2;while(ids.has(next))next=`${base}:${n++}`;ids.add(next);return next;};
 let clipped=0,removed=0;const retained:Segment[]=[];
 for(const source of doc.segments){
  if(source.assignment==='B')continue;
  if(distance(source.a,source.b)===0){if(inside(source.a))retained.push(structuredClone(source));else removed++;continue;}
  const cuts=new Map<number,Point>([[0,[...source.a]],[1,[...source.b]]]);
  const addCut=(t:number,p:Point)=>{const prior=cuts.get(t);if(prior&&!same(prior,p))throw Error('不同纸边交点无法在当前数值精度下分离，当前纸张未修改。');cuts.set(t,[...p]);};
  const addEndpoint=(p:Point)=>{
   if(same(p,source.a)||same(p,source.b))return;const t=parameter(p,source);
   if(!(t>0&&t<1))throw Error('纸边交点过于接近线段端点，无法可靠裁剪，请调整几何后重试。');addCut(t,p);
  };
  for(const e of index.query(boundsOf(source))){
   const edge=boundary[e];
   if(onEdge(edge.a,source))addEndpoint(edge.a);if(onEdge(edge.b,source))addEndpoint(edge.b);
   const a=materialOrientation(source.a,source.b,edge.a),b=materialOrientation(source.a,source.b,edge.b),c=materialOrientation(edge.a,edge.b,source.a),d=materialOrientation(edge.a,edge.b,source.b);
   if(a*b<0&&c*d<0){const hit=segmentIntersection(source,asSegment(edge),0);if(!hit||!(hit.t>0&&hit.t<1))throw Error('无法可靠确认纸边交点，当前纸张未修改。');addCut(hit.t,hit.point);}
  }
  const times=[...cuts.keys()].sort((a,b)=>a-b),parts:{from:number;to:number}[]=[];
  for(let i=1;i<times.length;i++){
   const from=times[i-1],to=times[i],middle=from/2+to/2;
   if(!(middle>from&&middle<to))throw Error('相邻纸边交点过近，无法确认完整裁剪区间。');
   if(!inside(interpolate(source.a,source.b,middle)))continue;
   const previous=parts.at(-1);if(previous?.to===from)previous.to=to;else parts.push({from,to});
  }
  if(!parts.length){removed++;continue;}
  if(parts.length===1&&parts[0].from===0&&parts[0].to===1){retained.push(structuredClone(source));continue;}
  clipped++;
  parts.forEach(({from,to},i)=>retained.push({...structuredClone(source),id:allocate(`${source.id}::paper:${i+1}`),a:[...cuts.get(from)!],b:[...cuts.get(to)!]}));
 }
 let sameBoundary=false;
 try{sameBoundary=boundarySignature(oldBoundary)===boundarySignature(boundary);}catch{/* A new real boundary can repair an open ordinary CP. */}
 if(sameBoundary&&!clipped&&!removed&&doc.paper.width===fitted.paper.width&&doc.paper.height===fitted.paper.height)return {doc,clipped,removed};
 const boundarySegments:Segment[]=sameBoundary?structuredClone(oldBoundary):boundary.map(({a,b},i)=>({id:allocate(`paper-boundary-${i+1}`),a:[...a],b:[...b],assignment:'B',angle:0}));
 const next:Doc={...structuredClone(doc),paper:fitted.paper,segments:[...boundarySegments,...retained]};
 delete next.flatFold;validateDoc(next);return {doc:next,clipped,removed};
}
