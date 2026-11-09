import type {FlatFoldResult,FoldGraph} from '../core/types';

/** A certificate for one exact CP and the currently selected flat-fold solution.
 * Relations retain FOLD semantics: their sign is relative to the second face's
 * normal. They are not a global paint order or a collision certificate. */
export interface SimulationLayerOrder {
  sourceSignature:string;
  sourceFaceCount:number;
  faceOrders:[number,number,number][];
}

const MAX_VERTICES=8192,MAX_EDGES=40_000,MAX_FACES=8192,MAX_CORNERS=65_536,MAX_RELATIONS=1_000_000,MAX_SIGNATURE=8_000_000;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const index=(value:unknown,count:number)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<count;
const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e9;
const every=(values:unknown[],check:(value:unknown,i:number)=>boolean)=>Array.from(values).every(check);

/** Exact indexed topology and targets, with a fixed field order. Deliberately
 * ignores titles, styling, cached layer results and other presentation metadata.
 * Invalid/unbounded input has no usable signature. */
export function simulationSourceSignature(source:unknown):string {
  if(!record(source))return '';
  const vertices=source.vertices_coords,edges=source.edges_vertices,faces=source.faces_vertices;
  if(!Array.isArray(vertices)||vertices.length<3||vertices.length>MAX_VERTICES||
    !every(vertices,p=>Array.isArray(p)&&(p.length===2||p.length===3)&&every(p,finite))||
    !Array.isArray(edges)||!edges.length||edges.length>MAX_EDGES||
    !every(edges,e=>Array.isArray(e)&&e.length===2&&every(e,v=>index(v,vertices.length))&&e[0]!==e[1])||
    !Array.isArray(faces)||!faces.length||faces.length>MAX_FACES)return '';
  let corners=0;
  const vertexRing=(r:unknown,min=3):r is number[]=>Array.isArray(r)&&r.length>=min&&
    (corners+=r.length)<=MAX_CORNERS&&every(r,v=>index(v,vertices.length));
  if(!every(faces,f=>vertexRing(f)))return '';
  const assignments=source.edges_assignment,angles=source.edges_foldAngle;
  if(assignments!==undefined&&(!Array.isArray(assignments)||assignments.length!==edges.length||
    !every(assignments,a=>typeof a==='string'&&['B','M','V','F','U','A','C','J'].includes(a))))return '';
  if(angles!==undefined&&(!Array.isArray(angles)||angles.length!==edges.length||
    !every(angles,a=>a===null||typeof a==='number'&&Number.isFinite(a)&&Math.abs(a)<=180)))return '';
  const payload:Record<string,unknown>={vertices_coords:vertices,edges_vertices:edges};
  if(assignments!==undefined)payload.edges_assignment=assignments;
  if(angles!==undefined)payload.edges_foldAngle=angles;
  payload.faces_vertices=faces;
  const rows=(raw:unknown,count:number,entryCount:number,nullable=false,lengths?:number[])=>
    Array.isArray(raw)&&raw.length===count&&every(raw,(row,i)=>Array.isArray(row)&&
      (lengths===undefined||row.length===lengths[i])&&row.length<=MAX_CORNERS&&
      // Rabbit Ear uses undefined boundary slots in faces_faces; JSON uses null.
      // Both represent the same missing neighbour and serialize identically.
      every(row,v=>nullable&&(v===null||v===undefined)||index(v,entryCount)));
  const lengths=faces.map(f=>(f as unknown[]).length);
  for(const [field,count,entryCount,nullable,rowLengths] of [
    ['faces_edges',faces.length,edges.length,false,lengths],
    ['edges_faces',edges.length,faces.length,false,undefined],
    ['faces_faces',faces.length,faces.length,true,lengths],
  ] as const){
    if(source[field]===undefined)continue;
    if(!rows(source[field],count,entryCount,nullable,rowLengths))return '';
    payload[field]=source[field];
  }
  const holes=source.faces_holes;
  if(holes!==undefined){
    if(!Array.isArray(holes)||holes.length!==faces.length||!every(holes,row=>Array.isArray(row)&&every(row,r=>vertexRing(r,2))))return '';
    payload.faces_holes=holes;
  }
  for(const [field,count,nullable] of [['faces_holeEdges',edges.length,false],['faces_holeFaces',faces.length,true]] as const){
    const raw=source[field];if(raw===undefined)continue;
    if(!Array.isArray(holes)||!Array.isArray(raw)||raw.length!==faces.length||
      !every(raw,(row,f)=>rows(row,(holes[f] as unknown[]).length,count,nullable,(holes[f] as unknown[][]).map(r=>r.length))))return '';
    payload[field]=raw;
  }
  if(source.zhezhi_flatCreases!==undefined){
    if(source.zhezhi_flatCreases!=='marks')return '';
    payload.zhezhi_flatCreases='marks';
  }
  const signature=JSON.stringify(payload);
  return signature.length<=MAX_SIGNATURE?signature:'';
}

/** Validate the cross-frame boundary against the exact loaded CP. Do not
 * require a global total order: distinct overlap regions can form a cycle. */
export function validateSimulationLayerOrder(value:unknown,sourceSignature:string,sourceFaceCount:number):SimulationLayerOrder|null {
  if(typeof sourceSignature!=='string'||!sourceSignature||sourceSignature.length>MAX_SIGNATURE||!Number.isSafeInteger(sourceFaceCount)||sourceFaceCount<1||sourceFaceCount>MAX_FACES||
    !record(value)||Object.keys(value).some(key=>!['sourceSignature','sourceFaceCount','faceOrders'].includes(key))||
    value.sourceSignature!==sourceSignature||value.sourceFaceCount!==sourceFaceCount)return null;
  const relations=value.faceOrders;
  if(!Array.isArray(relations)||!relations.length||relations.length>Math.min(MAX_RELATIONS,sourceFaceCount*(sourceFaceCount-1)/2))return null;
  const pairs=new Set<string>(),faceOrders:[number,number,number][]=[];
  for(const relation of relations){
    if(!Array.isArray(relation)||relation.length!==3||!index(relation[0],sourceFaceCount)||!index(relation[1],sourceFaceCount)||
      relation[0]===relation[1]||(relation[2]!==1&&relation[2]!==-1))return null;
    const [a,b,sign]=relation as [number,number,number],key=a<b?`${a}:${b}`:`${b}:${a}`;
    if(pairs.has(key))return null;
    pairs.add(key);faceOrders.push([a,b,sign]);
  }
  return {sourceSignature,sourceFaceCount,faceOrders};
}

/** M/V endpoints must actually target their signed half-turn. The flat solver
 * reflects M/V faces even for a requested 0-degree target, so its certificate
 * also cannot describe that unfolded simulator endpoint. */
export function simulationLayerOrderSupported(source:unknown):boolean {
  if(!simulationSourceSignature(source)||!record(source))return false;
  const assignments=source.edges_assignment,angles=source.edges_foldAngle;
  if(!Array.isArray(assignments))return false;
  for(let e=0;e<assignments.length;e++){
    const assignment=assignments[e],angle=Array.isArray(angles)?angles[e]:undefined;
    if(assignment==='M'||assignment==='V'){
      if(angle!==undefined&&angle!==(assignment==='M'?-180:180))return false;
    }else if(assignment!=='B'&&assignment!=='F'||angle!==undefined&&angle!==null&&angle!==0)return false;
  }
  return true;
}

export function simulationLayerOrder(source:FoldGraph,result:FlatFoldResult):SimulationLayerOrder|null {
  if(!simulationLayerOrderSupported(source)||!record(result)||!record(result.geometry)||!record(result.layers))return null;
  const sourceSignature=simulationSourceSignature(source),geometry=result.geometry,layers=result.layers;
  if(geometry.status!=='ready'||geometry.modified!==undefined&&geometry.modified!==false||layers.status!=='solved'||
    !Array.isArray(geometry.vertices)||geometry.vertices.length!==source.vertices_coords.length||
    !every(geometry.vertices,p=>Array.isArray(p)&&p.length===2&&every(p,finite))||
    JSON.stringify(geometry.faces)!==JSON.stringify(source.faces_vertices))return null;
  return validateSimulationLayerOrder({sourceSignature,sourceFaceCount:source.faces_vertices!.length,faceOrders:layers.faceOrders},sourceSignature,source.faces_vertices!.length);
}
