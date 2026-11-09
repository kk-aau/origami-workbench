import earcut from 'earcut';
import {buildFold,distance,pointOnSegment,polygonArea,segmentIntersection} from '../core/geometry';
import type {Doc,FoldGraph,Point,Segment} from '../core/types';
import type {PartialCreaseSimulationMesh} from './simPartialCreaseMesh';

type Route=Pick<Segment,'a'|'b'>;
export interface PartialCreaseConeOptions {rayCount?:number;avoidDirections?:readonly Point[];maxVertices?:number;maxTriangles?:number}
export interface PartialCreaseConeMesh extends PartialCreaseSimulationMesh {
  apex:Point;
  apexVertex:number;
  rayDirections:Point[];
  rayAngles:number[];
  rays:Array<{vertex:number;angle:number;direction:Point}>;
  activeRay:number;
  /** Sector i runs counterclockwise from ray i to ray (i+1) mod N. */
  triangleSectors:number[];
  vertexSectors:number[][];
  sectorTriangles:number[][];
}
export type PartialCreaseConeDescriptor=Pick<PartialCreaseConeMesh,'apexVertex'|'rays'|'activeRay'|'triangleSectors'|'vertexSectors'>;
export interface PartialCreaseConesMesh extends PartialCreaseSimulationMesh {cones:PartialCreaseConeDescriptor[]}

const edgeKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
const tau=2*Math.PI;
const angle=(n:number)=>((n+Math.PI)%tau+tau)%tau-Math.PI;
const difference=(a:number,b:number)=>Math.abs(angle(a-b));

/** A single interior cone vertex carries the finite crease. Its continuation
 * lies inside a rigid sector, never on an invented opposite crease. Existing F
 * marks merely subdivide sectors and retain their source material identities. */
export function buildPartialCreaseConeMesh(source:FoldGraph,route:Route,options:PartialCreaseConeOptions={}):PartialCreaseConeMesh {
  if(source.faces_vertices?.length!==1||source.faces_holes?.some(row=>row.length)||source.edges_assignment.some(a=>a!=='B'&&a!=='F'))throw Error('锥扇短痕网格暂仅支持一张凸的展开纸面及 F 标记。');
  const points=source.vertices_coords,outer=source.faces_vertices[0],polygon=outer.map(v=>points[v]),span=Math.max(...[0,1].map(k=>Math.max(...points.map(p=>p[k]))-Math.min(...points.map(p=>p[k])))),eps=Math.max(1e-6,span*1e-8),winding=Math.sign(polygonArea(polygon));
  if(!winding||outer.some((v,k)=>{const a=points[v],b=points[outer[(k+1)%outer.length]],c=points[outer[(k+2)%outer.length]];return ((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))*winding< -eps*span;}))throw Error('锥扇短痕网格需要凸纸边，不能跨越凹缺口。');
  const boundaries=source.edges_vertices.flatMap(([a,b],e)=>source.edges_assignment[e]==='B'?[{id:`boundary-${e}`,a:points[a],b:points[b],assignment:'B' as const,angle:0}]:[]);
  const onBoundary=(p:Point)=>boundaries.some(s=>pointOnSegment(p,s,eps)),aBoundary=onBoundary(route.a),bBoundary=onBoundary(route.b);
  if(aBoundary===bBoundary||distance(route.a,route.b)<=eps)throw Error('锥扇短痕需要一端位于纸边、另一端位于纸内。');
  const apex:Point=[...(aBoundary?route.b:route.a)],activeEnd:Point=[...(aBoundary?route.a:route.b)];
  const inPaper=(p:Point)=>polygon.every((a,k)=>{const b=polygon[(k+1)%polygon.length];return ((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))*winding>=-eps*span;});
  if(!inPaper(apex)||onBoundary(apex)||points.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n))||!inPaper(p)))throw Error('锥扇短痕或已有 F 标记超出真实凸纸面。');
  const rayCount=options.rayCount??16;
  if(!Number.isInteger(rayCount)||rayCount<8||rayCount>32)throw Error('锥扇射线数量必须为 8 到 32 的整数。');
  const activeAngle=angle(Math.atan2(activeEnd[1]-apex[1],activeEnd[0]-apex[0])),avoided=[angle(activeAngle+Math.PI),...(options.avoidDirections??[]).map(p=>Math.atan2(p[1],p[0]))];
  const angles=[activeAngle];
  for(let i=1;i<rayCount;i++){
    let candidate=angle(activeAngle+tau*(i+.23)/rayCount);
    for(let attempt=0;attempt<8&&avoided.some(a=>difference(a,candidate)<.005);attempt++)candidate=angle(candidate+tau/rayCount*.071);
    if(avoided.some(a=>difference(a,candidate)<.005))throw Error('锥扇辅助射线与需避开的真实折痕方向重合。');
    angles.push(candidate);
  }
  angles.sort((a,b)=>a-b);
  const activeRay=angles.findIndex(a=>difference(a,activeAngle)<1e-12),directions=angles.map((a):Point=>[Math.cos(a),Math.sin(a)]);
  const ends=directions.map((d,i):Point=>{
    if(i===activeRay)return activeEnd;
    const beam:Segment={id:'ray',a:apex,b:[apex[0]+d[0]*span*4,apex[1]+d[1]*span*4],assignment:'F',angle:0};
    const hits=boundaries.flatMap(s=>{const hit=segmentIntersection(beam,s,eps);return hit&&distance(hit.point,apex)>eps?[hit.point]:[];}).sort((a,b)=>distance(apex,a)-distance(apex,b));
    if(!hits.length)throw Error('锥扇射线没有找到真实纸边。');return hits[0];
  });
  const segments:Segment[]=source.edges_vertices.map(([a,b],e)=>({id:`source-${e}`,a:points[a],b:points[b],assignment:'F',angle:0}));
  ends.forEach((end,i)=>segments.push({id:`cone-ray-${i}`,a:apex,b:end,assignment:'F',angle:0}));
  // A finite old F mark may otherwise leave an untriangulated dangling tip.
  // These connectors remain inside their existing sector and are never hinges.
  const degree=points.map(()=>0);source.edges_vertices.forEach(([a,b])=>{degree[a]++;degree[b]++;});
  points.forEach((p,v)=>{if(degree[v]===1&&distance(p,apex)>eps&&!onBoundary(p))segments.push({id:`cone-mark-tip-${v}`,a:apex,b:p,assignment:'F',angle:0});});
  const doc:Doc={name:'有限短痕锥扇材料网格',paper:{width:Math.max(1,span),height:Math.max(1,span)},segments},arrangement=buildFold(doc).graph,arr=arrangement.vertices_coords,rawTriangles:number[][]=[];
  for(const ring of arrangement.faces_vertices??[]){
    const raw=earcut(ring.flatMap(v=>arr[v]),undefined,2),cells=Array.from({length:raw.length/3},(_,i)=>raw.slice(i*3,i*3+3).map(k=>ring[k]));
    for(const v of new Set(ring))for(let i=0;i<cells.length;i++){
      const t=cells[i];if(t.includes(v))continue;
      for(let k=0;k<3;k++){
        const a=t[k],b=t[(k+1)%3],c=t[(k+2)%3];
        if(pointOnSegment(arr[v],{id:'mesh',a:arr[a],b:arr[b],assignment:'F',angle:0},eps)){cells[i]=[a,v,c];cells.push([v,b,c]);break;}
      }
    }
    rawTriangles.push(...cells);
  }
  const coordinates:Point[]=points.map(p=>[...p]),remap=new Map<number,number>();
  for(const v of new Set(rawTriangles.flat())){const old=points.findIndex(p=>distance(p,arr[v])<=eps);remap.set(v,old>=0?old:coordinates.push([...arr[v]])-1);}
  const used=new Set(remap.values());if(points.some((_,v)=>!used.has(v)))throw Error('锥扇网格丢失原 F 标记端点，未生成不完整材料。');
  const triangles=rawTriangles.map(t=>{const row=t.map(v=>remap.get(v)!);return polygonArea(row.map(v=>coordinates[v]))*winding<0?[row[0],row[2],row[1]]:row;});
  if(coordinates.length>(options.maxVertices??1200)||triangles.length>(options.maxTriangles??2400))throw Error('锥扇短痕网格超过交互求解预算。');
  const apexVertex=coordinates.findIndex(p=>distance(p,apex)<=eps),rayVertices=ends.map(p=>coordinates.findIndex(q=>distance(p,q)<=eps));
  if(apexVertex<0||rayVertices.some(v=>v<0))throw Error('锥扇网格缺少实际顶点或射线端点。');
  const triangleSectors=triangles.map(t=>{
    const center:Point=[t.reduce((s,v)=>s+coordinates[v][0],0)/3,t.reduce((s,v)=>s+coordinates[v][1],0)/3],theta=angle(Math.atan2(center[1]-apex[1],center[0]-apex[0]));
    let sector=angles.length-1;for(let i=0;i<angles.length;i++)if(theta>=angles[i])sector=i;return sector;
  }),sectorTriangles=angles.map(()=>[] as number[]),vertexSectors=coordinates.map(()=>[] as number[]);
  triangles.forEach((t,f)=>{const s=triangleSectors[f];sectorTriangles[s].push(f);t.forEach(v=>{if(!vertexSectors[v].includes(s))vertexSectors[v].push(s);});});
  if(sectorTriangles.some(row=>!row.length)||vertexSectors[apexVertex].length!==rayCount)throw Error('锥扇顶点未形成完整的闭合材料扇。');
  const edges:[number,number][]=[],incidence:number[][]=[],lookup=new Map<string,number>();
  const rows=triangles.map((t,f)=>t.map((a,k)=>{const b=t[(k+1)%3],key=edgeKey(a,b);let e=lookup.get(key);if(e===undefined){e=edges.length;lookup.set(key,e);edges.push([a,b]);incidence.push([]);}incidence[e].push(f);return e;}));
  const edgeSourceEdges=edges.map(([a,b])=>{const e=source.edges_vertices.findIndex(([u,v])=>[a,b].every(i=>pointOnSegment(coordinates[i],{id:'source',a:points[u],b:points[v],assignment:'F',angle:0},eps)));return e<0?null:e;});
  const assignments=edges.map(([a,b],e)=>{
    if(incidence[e].length===2)return 'F';
    if(incidence[e].length!==1||!boundaries.some(s=>pointOnSegment(coordinates[a],s,eps)&&pointOnSegment(coordinates[b],s,eps)))throw Error('锥扇三角网格的实际纸边或共享边不完整。');return 'B';
  });
  const covered=source.edges_vertices.map(()=>0);edges.forEach(([a,b],e)=>{const old=edgeSourceEdges[e];if(old!==null)covered[old]+=distance(coordinates[a],coordinates[b]);});
  source.edges_vertices.forEach(([a,b],e)=>{if(Math.abs(covered[e]-distance(points[a],points[b]))>eps*20)throw Error('锥扇网格没有保留完整原 CP 线段。');});
  const area=triangles.reduce((sum,t)=>sum+Math.abs(polygonArea(t.map(v=>coordinates[v]))),0);
  if(triangles.some(t=>polygonArea(t.map(v=>coordinates[v]))*winding<=eps*eps)||Math.abs(area-Math.abs(polygonArea(polygon)))>eps*span*20)throw Error('锥扇三角片未完整覆盖真实材料。');
  const bendingStiffness=edges.map(([a,b],e)=>{
    if(assignments[e]==='B'||incidence[e].length!==2||triangleSectors[incidence[e][0]]===triangleSectors[incidence[e][1]])return 1;
    return pointOnSegment(coordinates[a],{id:'active',...route,assignment:'F',angle:0},eps)&&pointOnSegment(coordinates[b],{id:'active',...route,assignment:'F',angle:0},eps)?1:.15;
  });
  const parents=triangles.map(()=>0),rays=angles.map((a,i)=>({angle:a,vertex:rayVertices[i],direction:directions[i]})),fold:FoldGraph={vertices_coords:coordinates,edges_vertices:edges,edges_assignment:assignments,edges_foldAngle:edges.map(()=>0),faces_vertices:triangles,faces_edges:rows,edges_faces:incidence,zhezhi_simulation_mesh:{schema:'zhezhi-simulation-mesh-v2',sourceEdgeCount:source.edges_vertices.length,sourceFaceCount:1,triangleSourceFaces:parents},zhezhi_partial_crease_cone:{apexVertex,rays,activeRay,triangleSectors,vertexSectors}};
  return {fold,materialCoordinates:coordinates.map(p=>[...p]),vertexSourceVertices:coordinates.map((_,v)=>v<points.length?v:null),vertexSourceFaces:coordinates.map(()=>[0]),edgeSourceEdges,triangleSourceFaces:parents,bendingStiffness,apex,apexVertex,rayDirections:directions,rayAngles:angles,rays,activeRay,triangleSectors,vertexSectors,sectorTriangles};
}

/** Several reversible cone instructions share one conforming material mesh.
 * Each cone keeps its own rigid-sector partition of that exact same mesh; a
 * later planner activates one cone at a time and restores the common seed. */
export function buildPartialCreaseConesMesh(source:FoldGraph,routes:readonly Route[],options:PartialCreaseConeOptions={}):PartialCreaseConesMesh {
  if(!routes.length||routes.length>4)throw Error('共用锥扇网格需要一到四条完整的纸边到纸内短痕。');
  const directions=routes.flatMap(r=>{const d:Point=[r.b[0]-r.a[0],r.b[1]-r.a[1]];return [d,[-d[0],-d[1]] as Point];}),configuration={...options,rayCount:options.rayCount??8,avoidDirections:[...(options.avoidDirections??[]),...directions]};
  // Reuse the independently checked single-cone boundary construction. Its
  // helper triangulation is discarded; only the exact apex/ray geometry enters
  // the common arrangement, together with every original source CP segment.
  const seeds=routes.map(route=>buildPartialCreaseConeMesh(source,route,configuration)),points=source.vertices_coords,span=Math.max(...[0,1].map(k=>Math.max(...points.map(p=>p[k]))-Math.min(...points.map(p=>p[k])))),eps=Math.max(1e-6,span*1e-8);
  const segments:Segment[]=source.edges_vertices.map(([a,b],e)=>({id:`source-${e}`,a:points[a],b:points[b],assignment:source.edges_assignment[e] as Segment['assignment'],angle:0}));
  seeds.forEach((seed,c)=>seed.rays.forEach((ray,r)=>segments.push({id:`shared-cone-${c}-ray-${r}`,a:seed.apex,b:seed.materialCoordinates[ray.vertex],assignment:'F',angle:0})));
  const aggregate=buildFold({name:'共用多短痕锥扇材料',paper:{width:Math.max(1,span),height:Math.max(1,span)},segments},{flatCreases:'marks'}).graph;
  const common=buildPartialCreaseConeMesh(aggregate,routes[0],configuration),coordinates:Point[]=points.map(p=>[...p]);
  const remap=common.materialCoordinates.map(p=>{const old=points.findIndex(q=>distance(p,q)<=eps);return old>=0?old:coordinates.push([...p])-1;});
  if(new Set(remap).size!==common.materialCoordinates.length)throw Error('共用锥扇网格混淆了独立材料顶点。');
  const triangles=common.fold.faces_vertices!.map(t=>t.map(v=>remap[v])),edges=common.fold.edges_vertices.map(([a,b])=>[remap[a],remap[b]] as [number,number]);
  const cones:PartialCreaseConeDescriptor[]=seeds.map(seed=>{
    const rays=seed.rays.map(r=>({angle:r.angle,direction:[...r.direction] as Point,vertex:coordinates.findIndex(p=>distance(p,seed.materialCoordinates[r.vertex])<=eps)})),apexVertex=coordinates.findIndex(p=>distance(p,seed.apex)<=eps);
    if(apexVertex<0||rays.some(r=>r.vertex<0))throw Error('共用锥扇网格缺少实际 apex 或纸边射线端点。');
    const triangleSectors=triangles.map(t=>{
      const center:Point=[t.reduce((s,v)=>s+coordinates[v][0],0)/3,t.reduce((s,v)=>s+coordinates[v][1],0)/3],theta=angle(Math.atan2(center[1]-seed.apex[1],center[0]-seed.apex[0]));
      let sector=rays.length-1;rays.forEach((ray,i)=>{if(theta>=ray.angle)sector=i;});return sector;
    }),vertexSectors=coordinates.map(()=>[] as number[]);
    triangles.forEach((t,f)=>t.forEach(v=>{const sector=triangleSectors[f];if(!vertexSectors[v].includes(sector))vertexSectors[v].push(sector);}));
    if(vertexSectors[apexVertex].length!==rays.length||new Set(triangleSectors).size!==rays.length)throw Error('共用网格未保留每个锥扇的完整闭环。');
    // Every corner, not only the centroid, must belong to its declared sector.
    triangles.forEach((t,f)=>{const s=triangleSectors[f],a=rays[s].direction,b=rays[(s+1)%rays.length].direction;t.forEach(v=>{const x=coordinates[v][0]-seed.apex[0],y=coordinates[v][1]-seed.apex[1];if(a[0]*y-a[1]*x< -eps*4||x*b[1]-y*b[0]< -eps*4)throw Error('共用锥扇三角片跨越了未细分的扇区射线。');});});
    return {apexVertex,rays,activeRay:seed.activeRay,triangleSectors,vertexSectors};
  });
  const edgeSourceEdges=edges.map(([a,b])=>{const e=source.edges_vertices.findIndex(([u,v])=>[a,b].every(i=>pointOnSegment(coordinates[i],{id:'source',a:points[u],b:points[v],assignment:'F',angle:0},eps)));return e<0?null:e;});
  const covered=source.edges_vertices.map(()=>0);edges.forEach(([a,b],e)=>{const old=edgeSourceEdges[e];if(old!==null)covered[old]+=distance(coordinates[a],coordinates[b]);});
  source.edges_vertices.forEach(([a,b],e)=>{if(Math.abs(covered[e]-distance(points[a],points[b]))>eps*20)throw Error('共用锥扇网格没有保留完整原 CP 线段。');});
  const bendingStiffness=edges.map(([a,b],e)=>{
    const owners=common.fold.edges_faces![e];if(common.fold.edges_assignment[e]==='B'||owners.length!==2||routes.some(route=>[a,b].every(v=>pointOnSegment(coordinates[v],{id:'pending',...route,assignment:'F',angle:0},eps))))return 1;
    return cones.some(cone=>cone.triangleSectors[owners[0]]!==cone.triangleSectors[owners[1]]) ? .15 : 1;
  });
  const parents=triangles.map(()=>0),fold:FoldGraph={...common.fold,vertices_coords:coordinates,edges_vertices:edges,faces_vertices:triangles,zhezhi_simulation_mesh:{schema:'zhezhi-simulation-mesh-v2',sourceEdgeCount:source.edges_vertices.length,sourceFaceCount:1,triangleSourceFaces:parents},zhezhi_partial_crease_cones:cones};
  delete fold.zhezhi_partial_crease_cone;
  return {fold,materialCoordinates:coordinates.map(p=>[...p]),vertexSourceVertices:coordinates.map((_,v)=>v<points.length?v:null),vertexSourceFaces:coordinates.map(()=>[0]),edgeSourceEdges,triangleSourceFaces:parents,bendingStiffness,cones};
}
