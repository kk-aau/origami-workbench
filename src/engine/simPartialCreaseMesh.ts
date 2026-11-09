import earcut from 'earcut';
import {buildFold,distance,pointOnSegment,polygonArea} from '../core/geometry';
import type {Doc,FoldGraph,Point,Segment} from '../core/types';

type Route=Pick<Segment,'a'|'b'>;
export interface PartialCreaseMeshOptions {
  /** Coarse regular cells; exact crease tips receive additional support lines. */
  divisions?:number;
  transitionRadius?:number;
  minimumBendingStiffness?:number;
  maxVertices?:number;
  maxTriangles?:number;
  /** Rotation-equivariant fans for convex cells; off preserves existing paths. */
  symmetricCells?:boolean;
  /** Refine only the fixed patch and its immediate conforming neighbours. */
  anchorPoint?:Point;
  anchorMaxEdgeLength?:number;
}
export interface PartialCreaseSimulationMesh {
  /** Temporary constrained triangles. Never save these helper edges to the CP. */
  fold:FoldGraph;
  materialCoordinates:Point[];
  vertexSourceVertices:(number|null)[];
  vertexSourceFaces:number[][];
  edgeSourceEdges:(number|null)[];
  triangleSourceFaces:number[];
  /** Per mesh edge: active creases stay at 1; temporary bending tapers sideways. */
  bendingStiffness:number[];
}

const pair=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;

/** CP intersections subdivide one physical short crease into several indexed
 * routes. Their junctions are material crossings, not additional free tips. */
export function coalescePartialCreaseRoutes(routes:readonly Route[],eps=1e-6):Route[]{
  const result:Route[]=[];
  for(const route of routes){
    let joined:Route={a:[...route.a],b:[...route.b]};
    for(let i=0;i<result.length;){
      const prior=result[i],length=distance(joined.a,joined.b),dx=(joined.b[0]-joined.a[0])/length,dy=(joined.b[1]-joined.a[1])/length;
      const t=(p:Point)=>(p[0]-joined.a[0])*dx+(p[1]-joined.a[1])*dy;
      const off=(p:Point)=>Math.abs((p[0]-joined.a[0])*dy-(p[1]-joined.a[1])*dx),lo=Math.min(t(prior.a),t(prior.b)),hi=Math.max(t(prior.a),t(prior.b));
      if(length<=eps||off(prior.a)>eps||off(prior.b)>eps||lo>length+eps||hi< -eps){i++;continue;}
      const endpoints=[joined.a,joined.b,prior.a,prior.b].sort((a,b)=>t(a)-t(b));
      joined={a:endpoints[0],b:endpoints[3]};result.splice(i,1);i=0;
    }
    result.push(joined);
  }
  return result;
}

function inside(point:Point,polygon:Point[],eps:number):boolean {
  let hit=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i];
    if(pointOnSegment(point,{id:'mesh-boundary',a,b,assignment:'F',angle:0},eps))return true;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }
  return hit;
}

/** Connect a finite crease to a conforming, shared-vertex material mesh. The
 * continuation is an uncreased helper: its only role is allowing the sheet to
 * curve around the tip. Original CP face identities survive every subdivision. */
export function buildPartialCreaseSimulationMesh(source:FoldGraph,routes:readonly Route[],options:PartialCreaseMeshOptions={}):PartialCreaseSimulationMesh {
  const sourceFaces=source.faces_vertices;
  if(!sourceFaces?.length||source.faces_holes?.some(row=>row.length))throw Error('局部柔性压痕需要连续、无孔的材料纸面。');
  if(!routes.length)throw Error('局部柔性压痕缺少需要压出的短折痕。');
  const points=source.vertices_coords;
  if(points.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n))))throw Error('局部柔性网格需要有效二维材料坐标。');
  const min:Point=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],max:Point=[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
  const width=max[0]-min[0],height=max[1]-min[1],span=Math.max(width,height),eps=Math.max(1e-6,span*1e-8);
  if(width<=eps||height<=eps)throw Error('局部柔性网格的纸张范围退化。');
  const divisions=options.divisions??10,minimum=options.minimumBendingStiffness??.025;
  if(!Number.isInteger(divisions)||divisions<2||divisions>24||!Number.isFinite(minimum)||minimum<=0||minimum>1)throw Error('局部柔性网格的细分或抗弯参数无效。');
  const polygons=sourceFaces.map(face=>face.map(v=>points[v]));
  const segments:Segment[]=source.edges_vertices.map(([a,b],e)=>({id:`source-${e}`,a:points[a],b:points[b],assignment:'F',angle:0}));
  let helper=0;
  const add=(a:Point,b:Point)=>{if(distance(a,b)>eps)segments.push({id:`helper-${helper++}`,a,b,assignment:'F',angle:0});};
  // A bounding arrangement is clipped to the actual source faces below. This
  // also handles a concave outline without adding paper outside its boundary.
  add([min[0],min[1]],[max[0],min[1]]);add([max[0],min[1]],[max[0],max[1]]);
  add([max[0],max[1]],[min[0],max[1]]);add([min[0],max[1]],[min[0],min[1]]);
  for(let i=1;i<divisions;i++){
    const x=min[0]+width*i/divisions,y=min[1]+height*i/divisions;
    add([x,min[1]],[x,max[1]]);add([min[0],y],[max[0],y]);
  }
  const fullLine=(point:Point,direction:Point)=>{
    const hits:Point[]=[];
    for(const axis of [0,1] as const){
      if(Math.abs(direction[axis])<=eps/span)continue;
      for(const bound of [min[axis],max[axis]]){
        const t=(bound-point[axis])/direction[axis],p:Point=[point[0]+t*direction[0],point[1]+t*direction[1]];
        if(p[0]>=min[0]-eps&&p[0]<=max[0]+eps&&p[1]>=min[1]-eps&&p[1]<=max[1]+eps&&!hits.some(q=>distance(p,q)<=eps))hits.push(p);
      }
    }
    if(hits.length===2)add(hits[0],hits[1]);
  };
  for(const route of routes){
    const length=distance(route.a,route.b);
    if(length<=eps||![route.a,route.b].every(p=>polygons.some(poly=>inside(p,poly,eps))))throw Error('局部压痕的端点必须位于真实纸张内，且不能重合。');
  }
  const supportRoutes=coalescePartialCreaseRoutes(routes,eps);
  for(const route of supportRoutes){
    const length=distance(route.a,route.b);
    const d:Point=[(route.b[0]-route.a[0])/length,(route.b[1]-route.a[1])/length];
    fullLine(route.a,d);
    // Tip-normal supports make both tips actual connected mesh vertices, even
    // when neither happens to coincide with the regular support grid.
    fullLine(route.a,[-d[1],d[0]]);fullLine(route.b,[-d[1],d[0]]);
  }
  // Nonmoving finite marks still belong to this material. Connect their free
  // tips too, rather than letting an earcut cleanup discard the CP endpoint.
  const degree=points.map(()=>0);source.edges_vertices.forEach(([a,b])=>{degree[a]++;degree[b]++;});
  points.forEach((p,v)=>{if(degree[v]===1)fullLine(p,[1,0]);});
  const doc:Doc={name:'局部压痕临时材料网格',paper:{width:Math.max(width,1),height:Math.max(height,1)},segments};
  const arrangement=buildFold(doc).graph,arrPoints=arrangement.vertices_coords;
  const triangles:number[][]=[],parents:number[]=[];
  for(const ring of arrangement.faces_vertices??[]){
    const winding=Math.sign(polygonArea(ring.map(v=>arrPoints[v]))),convex=new Set(ring).size===ring.length&&ring.every((v,k)=>{
      const a=arrPoints[v],b=arrPoints[ring[(k+1)%ring.length]],c=arrPoints[ring[(k+2)%ring.length]];
      return ((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))*winding>=-eps*span;
    });
    let cells:number[][];
    if(options.symmetricCells&&ring.length>3&&convex){
      const center:Point=[ring.reduce((s,v)=>s+arrPoints[v][0],0)/ring.length,ring.reduce((s,v)=>s+arrPoints[v][1],0)/ring.length],id=arrPoints.push(center)-1;
      cells=ring.map((a,k)=>[id,a,ring[(k+1)%ring.length]]);
    }else{
      const raw=earcut(ring.flatMap(v=>arrPoints[v]),undefined,2);
      cells=Array.from({length:raw.length/3},(_,i)=>raw.slice(i*3,i*3+3).map(k=>ring[k]));
    }
    // Restore exact collinear corners removed by earcut. Shared source tips and
    // grid crossings must remain shared IDs in both incident triangle fans.
    for(const v of new Set(ring))for(let i=0;i<cells.length;i++){
      const t=cells[i];if(t.includes(v))continue;
      for(let k=0;k<3;k++){
        const a=t[k],b=t[(k+1)%3],c=t[(k+2)%3];
        if(pointOnSegment(arrPoints[v],{id:'triangle-edge',a:arrPoints[a],b:arrPoints[b],assignment:'F',angle:0},eps)){
          cells[i]=[a,v,c];cells.push([v,b,c]);break;
        }
      }
    }
    for(const t of cells){
      const center:Point=[t.reduce((s,v)=>s+arrPoints[v][0],0)/3,t.reduce((s,v)=>s+arrPoints[v][1],0)/3];
      const owners=polygons.flatMap((poly,f)=>inside(center,poly,eps)?[f]:[]);
      if(!owners.length)continue;
      if(owners.length!==1)throw Error('局部柔性网格无法唯一确定三角片的原材料纸面。');
      const parent=owners[0],area=polygonArea(t.map(v=>arrPoints[v]));
      if(Math.abs(area)<=eps*eps)throw Error('局部柔性网格产生退化三角片，请调整短痕或附近交点。');
      triangles.push(area*polygonArea(polygons[parent])<0?[t[0],t[2],t[1]]:t);parents.push(parent);
    }
  }
  const used=new Set(triangles.flat()),coords:Point[]=points.map(p=>[...p]),remap=new Map<number,number>();
  for(const v of used){const original=points.findIndex(p=>distance(p,arrPoints[v])<=eps);remap.set(v,original>=0?original:coords.push([...arrPoints[v]])-1);}
  if(points.some((_,v)=>![...remap.values()].includes(v)))throw Error('局部柔性网格含纸外折线或未连接的材料顶点。');
  const ts=triangles.map(t=>t.map(v=>remap.get(v)!));
  if(options.anchorPoint){
    const anchor=options.anchorPoint,limit=options.anchorMaxEdgeLength??span*.1;
    if(anchor.length!==2||anchor.some(v=>!Number.isFinite(v))||!Number.isFinite(limit)||limit<=eps||!polygons.some(poly=>inside(anchor,poly,eps)))throw Error('局部固定区的坐标或细分尺寸无效。');
    // Red refinement of one selected patch, green refinement on its immediate
    // neighbours. Midpoints are shared IDs, including on original CP edges.
    // Selecting by centroid matches the app's local anchor selection exactly.
    for(let level=0;level<10;level++){
      let selected=0,best=Infinity;
      const distances=ts.map((t,f)=>{const center:Point=[t.reduce((s,v)=>s+coords[v][0],0)/3,t.reduce((s,v)=>s+coords[v][1],0)/3],d=distance(center,anchor);if(d<best){best=d;selected=f;}return d;});
      // Keep equally near central sectors together in the symmetric candidate;
      // otherwise tie-breaking one sector would reintroduce a directional bias.
      const chosen=options.symmetricCells?ts.filter((_,f)=>distances[f]<=best+eps):[ts[selected]];
      if(chosen.every(t=>Math.max(...t.map((v,k)=>distance(coords[v],coords[t[(k+1)%3]])))<=limit))break;
      const midpoints=new Map<string,number>();
      chosen.forEach(t=>t.forEach((a,k)=>{const b=t[(k+1)%3],key=pair(a,b);if(!midpoints.has(key))midpoints.set(key,coords.push([(coords[a][0]+coords[b][0])/2,(coords[a][1]+coords[b][1])/2])-1);}));
      const refined:number[][]=[],refinedParents:number[]=[];
      ts.forEach((t,f)=>{
        const mids=t.map((a,k)=>midpoints.get(pair(a,t[(k+1)%3]))),number=mids.filter(v=>v!==undefined).length;
        let children:number[][];
        if(number===0)children=[t];
        else if(number===3){const [a,b,c]=t,[u,v,w]=mids as number[];children=[[a,u,w],[u,b,v],[w,v,c],[u,v,w]];}
        else if(number===1){const k=mids.findIndex(v=>v!==undefined),a=t[k],b=t[(k+1)%3],c=t[(k+2)%3],m=mids[k]!;children=[[a,m,c],[m,b,c]];}
        else{
          const k=mids.findIndex(v=>v===undefined),a=t[k],b=t[(k+1)%3],c=t[(k+2)%3],u=mids[(k+1)%3]!,v=mids[(k+2)%3]!;
          children=[[c,v,u],[a,b,v],[b,u,v]];
        }
        refined.push(...children);refinedParents.push(...children.map(()=>parents[f]));
      });
      ts.splice(0,ts.length,...refined);parents.splice(0,parents.length,...refinedParents);
    }
    const nearest=ts.map(t=>({t,d:distance([t.reduce((s,v)=>s+coords[v][0],0)/3,t.reduce((s,v)=>s+coords[v][1],0)/3],anchor)})).sort((a,b)=>a.d-b.d)[0].t;
    if(Math.max(...nearest.map((v,k)=>distance(coords[v],coords[nearest[(k+1)%3]])))>limit)throw Error('局部固定区未能在细分预算内达到指定尺寸。');
  }
  if(coords.length>(options.maxVertices??1200)||ts.length>(options.maxTriangles??2400))throw Error('局部柔性压痕网格超过 1,200 个顶点或 2,400 个三角片，请简化本步折痕。');
  const edges:[number,number][]=[],rows:number[][]=[],incidence:number[][]=[],lookup=new Map<string,number>();
  ts.forEach((t,f)=>rows.push(t.map((a,k)=>{
    const b=t[(k+1)%3],key=pair(a,b);let e=lookup.get(key);
    if(e===undefined){e=edges.length;lookup.set(key,e);edges.push([a,b]);incidence.push([]);}
    incidence[e].push(f);return e;
  })));
  const edgeSourceEdges=edges.map(([a,b])=>{
    const e=source.edges_vertices.findIndex(([u,v])=>pointOnSegment(coords[a],{id:'source',a:points[u],b:points[v],assignment:'F',angle:0},eps)&&pointOnSegment(coords[b],{id:'source',a:points[u],b:points[v],assignment:'F',angle:0},eps));
    return e<0?null:e;
  });
  // Clipping must never silently shorten an original CP route, including a
  // segment crossing a missing region of a concave outline.
  const preserved=source.edges_vertices.map(()=>0);
  edges.forEach(([a,b],e)=>{const old=edgeSourceEdges[e];if(old!==null)preserved[old]+=distance(coords[a],coords[b]);});
  source.edges_vertices.forEach(([a,b],e)=>{if(Math.abs(preserved[e]-distance(points[a],points[b]))>eps*20)throw Error('局部柔性网格未保留完整原折痕，存在纸外线段或不一致的材料边界。');});
  const assignments=edges.map((_,e)=>{
    const old=edgeSourceEdges[e],kind=old===null?'F':source.edges_assignment[old];
    if(incidence[e].length===1){if(kind!=='B')throw Error('局部柔性网格边界与真实纸边不一致。');return 'B';}
    if(incidence[e].length!==2||kind==='B')throw Error('局部柔性网格的纸面连接无效。');
    return kind;
  });
  const bendingStiffness=edges.map(([a,b],e)=>{
    // An expanded F CP mark is allowed the same temporary curvature as an
    // invisible helper; its stored assignment and rest angle remain unchanged.
    // Existing M/V creases and the finite driven interval retain their hinges.
    if(assignments[e]!=='F'||routes.some(route=>pointOnSegment(coords[a],{id:'driven',...route,assignment:'F',angle:0},eps)&&pointOnSegment(coords[b],{id:'driven',...route,assignment:'F',angle:0},eps)))return 1;
    const midpoint:Point=[(coords[a][0]+coords[b][0])/2,(coords[a][1]+coords[b][1])/2];let weight=1;
    for(const route of supportRoutes){
      const length=distance(route.a,route.b),radius=options.transitionRadius??Math.max(span*.2,length*.45);
      if(!Number.isFinite(radius)||radius<=eps)throw Error('局部柔性压痕的过渡范围无效。');
      // A finite disk would be surrounded by a rigid cycle and could not bend
      // isometrically. The strip reaches the actual boundary along the crease
      // continuation, while smoothly recovering panel stiffness on both sides.
      const perpendicular=Math.abs((midpoint[0]-route.a[0])*(route.b[1]-route.a[1])-(midpoint[1]-route.a[1])*(route.b[0]-route.a[0]))/length;
      const t=Math.min(1,perpendicular/radius),smooth=t*t*(3-2*t);
      weight=Math.min(weight,minimum+(1-minimum)*smooth);
    }
    return weight;
  });
  const fold:FoldGraph={vertices_coords:coords,edges_vertices:edges,edges_assignment:assignments,edges_foldAngle:edges.map((_,e)=>edgeSourceEdges[e]===null?0:source.edges_foldAngle[edgeSourceEdges[e]!]),faces_vertices:ts,faces_edges:rows,edges_faces:incidence,
    zhezhi_simulation_mesh:{schema:'zhezhi-simulation-mesh-v2',sourceEdgeCount:source.edges_vertices.length,sourceFaceCount:sourceFaces.length,triangleSourceFaces:parents}};
  return {fold,materialCoordinates:coords.map(p=>[...p]),vertexSourceVertices:coords.map((_,v)=>v<points.length?v:null),vertexSourceFaces:coords.map(p=>polygons.flatMap((poly,f)=>inside(p,poly,eps)?[f]:[])),edgeSourceEdges,triangleSourceFaces:parents,bendingStiffness};
}
