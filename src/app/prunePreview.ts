import {changeTessParams,readTessParams,tessGeometryError,type TessGraph,type TessParams,type XY} from './tessellation';

export type PrunePreview={
  states:('keep'|'remove')[];
  kept:number;
  removed:number;
  components:number;
  problem:string;
};
export type PrunePaperMode='inscribed'|'mother';

/** Whole-tile pruning precedes the explicit paper fit; external extension cannot retain a fixed crop. */
export function pruneParamsForBoundary(params:TessParams,boundary:XY[],paperMode:PrunePaperMode='inscribed'):TessParams{
  const paper=params.paper&&paperMode==='inscribed'?{...params.paper,fit:'inscribed' as const,
    margin:Math.min(.45,params.paper.margin)}:undefined;
  const next=changeTessParams(params,{pruneBoundary:structuredClone(boundary),paper});
  if(!paper)delete next.paper;
  return next;
}

/** Same contact-inclusive rule as backend/tessellation_prune.py, including concave tiles. */
export function prunePolygonsIntersect(first:XY[],second:XY[]):boolean{
  const turn=(p:XY,q:XY,r:XY)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const onSegment=(p:XY,q:XY,r:XY)=>Math.abs(turn(p,q,r))<=1e-9*Math.max(1,Math.abs(q[0]-p[0]),Math.abs(q[1]-p[1]))&&
    r[0]>=Math.min(p[0],q[0])-1e-9&&r[0]<=Math.max(p[0],q[0])+1e-9&&
    r[1]>=Math.min(p[1],q[1])-1e-9&&r[1]<=Math.max(p[1],q[1])+1e-9;
  const contains=(polygon:XY[],point:XY)=>{
    let inside=false;
    for(let i=0;i<polygon.length;i++){
      const p=polygon[i],q=polygon[(i+1)%polygon.length];
      if(onSegment(p,q,point))return true;
      if((p[1]>point[1])!==(q[1]>point[1])&&p[0]+(point[1]-p[1])*(q[0]-p[0])/(q[1]-p[1])>point[0])inside=!inside;
    }
    return inside;
  };
  if(first.some(p=>contains(second,p))||second.some(p=>contains(first,p)))return true;
  for(let i=0;i<first.length;i++)for(let j=0;j<second.length;j++){
    const p=first[i],q=first[(i+1)%first.length],r=second[j],s=second[(j+1)%second.length];
    if(onSegment(p,q,r)||onSegment(p,q,s)||onSegment(r,s,p)||onSegment(r,s,q)||
      turn(p,q,r)*turn(p,q,s)<0&&turn(r,s,p)*turn(r,s,q)<0)return true;
  }
  return false;
}

export function pruneBoundaryError(points:XY[]):string{
  if(points.length<3||points.length>32)return '修剪轮廓需保留 3–32 个点。';
  return tessGeometryError(points,-10,10,[points.map((_,i)=>i)])?
    '修剪轮廓需为无自交的凸多边形，坐标在 −10 至 10 之间。':'';
}

/** Check exactly the retained face adjacency and Euler condition used by prune_mesh. */
export function previewPrune(mesh:TessGraph|null|undefined,boundary:XY[]):PrunePreview{
  const problem=pruneBoundaryError(boundary);
  if(!mesh?.faces_vertices.length)return {states:[],kept:0,removed:0,components:0,problem:problem||'母结构尚未生成，请先生成有效母结构。'};
  if(problem)return {states:mesh.faces_vertices.map(()=> 'remove'),kept:0,removed:mesh.faces_vertices.length,components:0,problem};
  const states=mesh.faces_vertices.map(face=>prunePolygonsIntersect(face.map(i=>mesh.vertices_coords[i]),boundary)?'keep' as const:'remove' as const);
  const keptFaces=mesh.faces_vertices.filter((_,i)=>states[i]==='keep'),kept=keptFaces.length,removed=states.length-kept;
  if(!kept)return {states,kept,removed,components:0,problem:'修剪范围没有接触任何拼块，请调整轮廓。'};
  const owners=new Map<string,number[]>(),vertices=new Set<number>(),neighbors=keptFaces.map(()=>new Set<number>());
  keptFaces.forEach((face,index)=>face.forEach((a,j)=>{
    vertices.add(a);const b=face[(j+1)%face.length],key=a<b?`${a},${b}`:`${b},${a}`,uses=owners.get(key)??[];
    for(const prior of uses){neighbors[prior].add(index);neighbors[index].add(prior);}
    uses.push(index);owners.set(key,uses);
  }));
  const visited=new Set<number>();let components=0;
  for(let start=0;start<kept;start++)if(!visited.has(start)){
    components++;visited.add(start);const queue=[start];
    for(let j=0;j<queue.length;j++)for(const next of neighbors[queue[j]])if(!visited.has(next)){visited.add(next);queue.push(next);}
  }
  return {states,kept,removed,components,problem:components!==1||vertices.size-owners.size+kept!==1?
    '修剪后拼块未共边连成无孔洞的整片，请调整轮廓。':''};
}

export function rectangularPruneBoundary(points:XY[]):XY[]{
  const valid=points.filter(p=>p.every(Number.isFinite));
  const ranges=[0,1].map(k=>{
    let low=valid.length?Math.max(-10,Math.min(...valid.map(p=>p[k]))):-1;
    let high=valid.length?Math.min(10,Math.max(...valid.map(p=>p[k]))):1;
    if(high-low<1e-8){const center=Math.max(-9.5,Math.min(9.5,(low+high)/2));low=center-.5;high=center+.5;}
    return [low,high];
  });
  return [[ranges[0][0],ranges[1][0]],[ranges[0][1],ranges[1][0]],[ranges[0][1],ranges[1][1]],[ranges[0][0],ranges[1][1]]];
}

export function defaultPruneBoundary(mesh:TessGraph|null|undefined):XY[]{
  const box=rectangularPruneBoundary(mesh?.vertices_coords??[]),[low,high]=[box[0],box[2]];
  const x=(high[0]-low[0])*.2,y=(high[1]-low[1])*.2;
  return [[low[0]+x,low[1]+y],[high[0]-x,low[1]+y],[high[0]-x,high[1]-y],[low[0]+x,high[1]-y]];
}

/** Ask once for the unpruned mother graph; tile-twist sources can exceed their final CP budget. */
export function pruneMotherPreviewParams(params:TessParams):TessParams|null{
  const patch:Record<string,unknown>={pruneBoundary:undefined,dualTargets:undefined,paper:undefined};
  if(params.family==='primal-dual'&&params.motherParams){
    const original=pruneMotherPreviewParams(params.motherParams);
    if(!original)return null;
    patch.motherParams=original;
    Object.assign(patch,{dualEdgeFlips:undefined,visibleTopFace:undefined,faceupFace:undefined});
  }
  if(params.family==='custom')Object.assign(patch,{customOutput:'tiling',tileTwists:undefined,stationaryFace:undefined,
    monolithicOptions:undefined,unitRegularCentered:undefined,unitTriangle:undefined,unitCyclic:undefined,
    unitQuadrilateralSplit:undefined,archimedeanPatch:undefined,twoColorableArchimedeanPatch:undefined,twoUniformPatch:undefined});
  return readTessParams(changeTessParams(params,patch));
}
