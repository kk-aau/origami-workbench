import type {Point} from '../core/types';
import type {SimulationSurfaceMesh} from './simSurfaceLayers';

type Vector=[number,number,number];
type Panel={faces:number[];vertices:number[]};
type Weights=Array<[number,number]>;
interface LocalOptions {
  mesh:SimulationSurfaceMesh;positions:Float32Array;panels:Panel[];displayPanels:Uint32Array;sourceIndices:Uint32Array;
  group:{panels:number[];plane:{normal:Vector;offset:number};basis:[Vector,Vector];origin:Vector;rank:(cover:number[])=>Map<number,number>|null};
  epsilon:number;gap:number;
}
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const polygonArea=(polygon:Point[])=>polygon.length<3?0:Math.abs(polygon.reduce((area,p,i)=>area+cross(polygon[0],p,polygon[(i+1)%polygon.length]),0))/2;
function triangleNormal(points:ArrayLike<number>,a:number,b:number,c:number):Vector {
  const u=[0,1,2].map(k=>points[b*3+k]-points[a*3+k]),v=[0,1,2].map(k=>points[c*3+k]-points[a*3+k]);
  return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
}

type OverlapCell={polygon:Point[];faces:number[]};
/** The editor's general overlap preview merges nearby planar intersections.
 * That is too coarse for a converged Float32 stack: deleting a tiny crossing
 * can leave a whole slab self-intersecting. Use the actual source edges here,
 * split at every finite segment crossing and query each new cell's real cover.
 * Budgets keep this endpoint-only fallback bounded; failure preserves the
 * unchanged solver surface instead of emitting a partial paper group. */
function exactOverlapCells(projected:Point[][],sources:number[][]):OverlapCell[]|null {
  const edges=new Map<string,[Point,Point]>();
  sources.forEach((triangle,f)=>triangle.forEach((a,k)=>{
    const b=triangle[(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
    if(!edges.has(key))edges.set(key,[projected[f][k],projected[f][(k+1)%3]]);
  }));
  const segments=[...edges.values()];if(segments.length>1024)return null;
  const xs=segments.flatMap(([a,b])=>[a[0],b[0]]),scale=Math.max(1,...projected.flat().flatMap(p=>p.map(Math.abs))),roundoff=scale*Number.EPSILON*32;
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const [a,b]=segments[i],[c,d]=segments[j];
    if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.max(c[0],d[0])<Math.min(a[0],b[0])||
       Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.max(c[1],d[1])<Math.min(a[1],b[1]))continue;
    const ab:Point=[b[0]-a[0],b[1]-a[1]],cd:Point=[d[0]-c[0],d[1]-c[1]],ac:Point=[c[0]-a[0],c[1]-a[1]],denominator=ab[0]*cd[1]-ab[1]*cd[0];
    if(denominator===0)continue;
    const t=(ac[0]*cd[1]-ac[1]*cd[0])/denominator,u=(ac[0]*ab[1]-ac[1]*ab[0])/denominator;
    if(t>0&&t<1&&u>0&&u<1)xs.push(a[0]+t*ab[0]);
  }
  const breaks:number[]=[];
  for(const x of xs.sort((a,b)=>a-b))if(!breaks.length||x-breaks[breaks.length-1]>roundoff)breaks.push(x);
  if(breaks.length>8192)return null;
  const bounds=projected.map(t=>[Math.min(...t.map(p=>p[0])),Math.min(...t.map(p=>p[1])),Math.max(...t.map(p=>p[0])),Math.max(...t.map(p=>p[1]))]),orientations=projected.map(t=>Math.sign(cross(t[0],t[1],t[2]))),cells:OverlapCell[]=[];
  let coverWork=0;
  for(let i=1;i<breaks.length;i++){
    const left=breaks[i-1],right=breaks[i],mid=left+(right-left)/2;
    if(mid===left||mid===right)continue;
    const crossings=segments.filter(([a,b])=>Math.min(a[0],b[0])<mid&&Math.max(a[0],b[0])>mid).map(([a,b])=>{
      const y=(x:number)=>a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0]);return {middle:y(mid),left:y(left),right:y(right)};
    }).sort((a,b)=>a.middle-b.middle);
    for(let j=1;j<crossings.length;j++){
      const low=crossings[j-1],high=crossings[j],height=high.middle-low.middle;
      if(height<=roundoff||(right-left)*height<=roundoff*roundoff)continue;
      if((coverWork+=projected.length)>20_000_000)return null;
      const probe:Point=[mid,low.middle+height/2],faces=projected.flatMap((triangle,f)=>{
        const bound=bounds[f];if(probe[0]<bound[0]||probe[0]>bound[2]||probe[1]<bound[1]||probe[1]>bound[3])return [];
        return triangle.every((a,k)=>orientations[f]*cross(a,triangle[(k+1)%3],probe)>=0)?[f]:[];
      });
      if(!faces.length)continue;
      // Any substantial inversion means a segment crossing was not resolved;
      // never fan-triangulate a bow tie or retain its midpoint's stale cover.
      if(low.left>high.left+roundoff||low.right>high.right+roundoff)return null;
      const polygon:Point[]=[[left,Math.min(low.left,high.left)],[right,Math.min(low.right,high.right)],[right,Math.max(low.right,high.right)],[left,Math.max(low.left,high.left)]];
      cells.push({polygon:polygon.filter((p,k)=>p[0]!==polygon[(k+3)%4][0]||p[1]!==polygon[(k+3)%4][1]),faces});
      if(cells.length>100000)return null;
    }
  }
  return cells;
}

/** A region's midpoint identifies its cover, but numerically near-coincident
 * edges can leave its corners outside one covered triangle. Intersect the
 * actual polygons before constructing source coordinates; never extrapolate
 * or clamp an out-of-paper corner into a material triangle. */
function clipTriangle(polygon:Point[],triangle:Point[]):Point[] {
  let output=polygon;
  const orientation=Math.sign(cross(triangle[0],triangle[1],triangle[2]));
  if(!orientation)return [];
  for(let k=0;k<3;k++){
    const a=triangle[k],b=triangle[(k+1)%3],input=output;output=[];
    for(let i=0;i<input.length;i++){
      const p=input[i],q=input[(i+1)%input.length],first=orientation*cross(a,b,p),last=orientation*cross(a,b,q);
      if(first>=0)output.push(p);
      if(first>=0&&last<0||first<0&&last>=0){
        const t=first/(first-last);
        output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
      }
    }
    if(output.length<3)return [];
  }
  // Exact boundary hits can appear twice. Only delete identical corners;
  // a short but nonzero cell still belongs to the original sheet.
  return output.filter((p,i)=>p[0]!==output[(i+output.length-1)%output.length][0]||p[1]!==output[(i+output.length-1)%output.length][1]);
}

function barycentric(point:Point,triangle:Point[],sources:number[]):Weights|null {
  const area=cross(triangle[0],triangle[1],triangle[2]);if(Math.abs(area)<1e-20)return null;
  const raw=[cross(point,triangle[1],triangle[2])/area,cross(triangle[0],point,triangle[2])/area,cross(triangle[0],triangle[1],point)/area];
  if(raw.some(w=>!Number.isFinite(w)||w< -1e-10||w>1+1e-10))return null;
  const sum=raw.reduce((s,w)=>s+Math.max(0,Math.min(1,w)),0);
  return raw.flatMap((weight,i)=>Math.abs(weight)<1e-8?[]:[[sources[i],Math.max(0,Math.min(1,weight))/sum] as [number,number]]);
}

/** Intersect one original paper edge with a convex overlap cell. */
function clipSegment(a:Point,b:Point,polygon:Point[],epsilon:number):[number,number]|null {
  const orientation=polygon.reduce((area,p,i)=>area+p[0]*polygon[(i+1)%polygon.length][1]-p[1]*polygon[(i+1)%polygon.length][0],0)>=0?1:-1;
  let lo=0,hi=1;
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],first=orientation*cross(p,q,a),last=orientation*cross(p,q,b),change=last-first;
    if(Math.abs(change)<epsilon*epsilon){if(first< -epsilon)return null;continue;}
    const t=-first/change;if(change>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi+epsilon)return null;
  }
  return hi-lo>epsilon?[Math.max(0,lo),Math.min(1,hi)]:null;
}

/** Split only the display surface into constant-coverage cells. A locally valid
 * layer cycle has no global z rank; each cell uses only faces present there.
 * Solver topology/coordinates and original export edges remain untouched. */
export function localSurfaceLayers(options:LocalOptions):SimulationSurfaceMesh|null {
  const {mesh,positions,panels,displayPanels,sourceIndices,group,epsilon,gap}=options,selected=new Set(group.panels);
  if(mesh.sourceVertices.length>200_000||mesh.indices.length>250_000*3)return null;
  const triangles=group.panels.flatMap(panel=>panels[panel].faces.map(face=>({panel,face,sources:Array.from(sourceIndices.slice(face*3,face*3+3))})));
  // Complex groups stay on the unchanged geometry rather than blocking a frame
  // with an unbounded planar arrangement. Ordinary unambiguous stacks use the
  // linear topology-preserving fast path before reaching this fallback.
  if(triangles.length>512)return null;
  const project=(source:number):Point=>group.basis.map(axis=>axis.reduce((sum,n,k)=>sum+n*(positions[source*3+k]-group.origin[k]),0)) as Point;
  const projected=triangles.map(triangle=>triangle.sources.map(project));
  const cells=exactOverlapCells(projected,triangles.map(triangle=>triangle.sources));if(!cells)return null;
  const cellOrders=cells.map(cell=>{
    const cover=[...new Set(cell.faces.map(f=>triangles[f].panel))];
    // Self-overlap within an F-linked panel is not a trustworthy flat sheet.
    return cover.length>=2&&cover.length===cell.faces.length?group.rank(cover):null;
  });
  if(!cellOrders.some(Boolean))return null;
  const coverage=triangles.map(()=>0);

  const source=Array.from(mesh.sourceVertices),weights:Weights[]=source.map((s,v)=>mesh.sourceVertexWeights?.[v]?.map(row=>[...row] as [number,number])??[[s,1]]),target=Array.from(mesh.positions),indices:number[]=[],edgesVertices:[number,number][]=[],edgesAssignment=[...mesh.edgesAssignment].slice(0,0),lookup=new Map<string,number>(),seenEdges=new Set<string>();
  const gapBases=Array.from(mesh.gapBasePositions??Float64Array.from(mesh.positions)),gapDirections=Array.from(mesh.gapDirections??new Float64Array(mesh.positions.length)),sourceTriangles:number[]=[];
  const isSelected=(v:number)=>v<displayPanels.length&&selected.has(displayPanels[v]);
  for(let i=0;i<mesh.indices.length;i+=3)if(!isSelected(mesh.indices[i])){indices.push(mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]);sourceTriangles.push(mesh.sourceTriangles?.[i/3]??i/3);}
  const retainedIndexCount=indices.length,triangleOwners:number[]=[];
  mesh.edgesVertices.forEach(([a,b],e)=>{if(!isSelected(a)){edgesVertices.push([a,b]);edgesAssignment.push(mesh.edgesAssignment[e]);}});
  const add=(panel:number,rawWeights:Weights,rank:number|null)=>{
    const normalized=rawWeights.filter(([,w])=>w>1e-8).sort((a,b)=>a[0]-b[0]),total=normalized.reduce((sum,[,w])=>sum+w,0);
    for(const row of normalized)row[1]/=total;
    const key=panel+':'+(rank??'base')+':'+normalized.map(([s,w])=>s+','+Math.round(w*1e8)).join(';');
    const cached=lookup.get(key);if(cached!==undefined)return cached;
    const p:Vector=[0,0,0];for(const [s,w] of normalized)for(let axis=0;axis<3;axis++)p[axis]+=positions[s*3+axis]*w;
    if(rank!==null){const distance=group.plane.offset-p.reduce((sum,n,axis)=>sum+n*group.plane.normal[axis],0);for(let axis=0;axis<3;axis++)p[axis]+=distance*group.plane.normal[axis];}
    if(source.length>=200_000)return -1;
    const v=source.length;source.push(normalized.reduce((best,row)=>row[1]>best[1]?row:best,normalized[0])[0]);weights.push(normalized);gapBases.push(...p);
    for(let axis=0;axis<3;axis++){const direction=rank===null?0:rank*group.plane.normal[axis];gapDirections.push(direction);target.push(p[axis]+direction*gap);}
    lookup.set(key,v);return v;
  };
  const originalEdges=mesh.edgesVertices.flatMap(([a,b],e)=>isSelected(a)?[{a:mesh.sourceVertices[a],b:mesh.sourceVertices[b],panel:displayPanels[a],assignment:mesh.edgesAssignment[e]}]:[]);
  for(let ci=0;ci<cells.length;ci++){
    const cell=cells[ci],order=cellOrders[ci];
    for(const f of cell.faces){
      const triangle=triangles[f],clipped=clipTriangle(cell.polygon,projected[f]),area=polygonArea(clipped);
      if(!area)continue;
      coverage[f]+=area;
      const polygon=clipped.map(p=>barycentric(p,projected[f],triangle.sources));
      if(polygon.some(p=>!p))return null;
      const ids=polygon.map(p=>add(triangle.panel,p!,order?.get(triangle.panel)??null));
      if(ids.some(v=>v<0))return null;
      const reverse=cross(projected[f][0],projected[f][1],projected[f][2])*clipped.reduce((sum,p,i)=>sum+cross(clipped[0],p,clipped[(i+1)%clipped.length]),0)<0;
      for(let i=1;i+1<ids.length;i++){
        if(indices.length>=250_000*3)return null;
        indices.push(ids[0],ids[reverse?i+1:i],ids[reverse?i:i+1]);triangleOwners.push(f);
      }
    }
    const cover=new Set(cell.faces.map(f=>triangles[f].panel));
    for(const edge of originalEdges){
      if(!cover.has(edge.panel))continue;
      const interval=clipSegment(project(edge.a),project(edge.b),cell.polygon,epsilon);if(!interval)continue;
      const ids=interval.map(t=>add(edge.panel,[[edge.a,1-t],[edge.b,t]],order?.get(edge.panel)??null));
      if(ids.some(v=>v<0))return null;
      if(ids[0]===ids[1])continue;
      const key=`${Math.min(...ids)}:${Math.max(...ids)}:${edge.assignment}`;if(seenEdges.has(key))continue;seenEdges.add(key);
      edgesVertices.push([ids[0],ids[1]]);edgesAssignment.push(edge.assignment);
    }
  }
  // A malformed arrangement must not replace a whole paper group with a
  // partial display. Verify each actual source triangle, including regions
  // whose layer relation is unknown and consequently remain unshifted.
  if(coverage.some((area,f)=>Math.abs(area-polygonArea(projected[f]))>Math.max(1e-12,polygonArea(projected[f])*1e-8)))return null;
  const finalPositions=new Float32Array(target),finalIndices=indices.slice(0,retainedIndexCount),roundingArea=triangles.map(()=>0),normals=triangles.map(triangle=>triangleNormal(positions,triangle.sources[0],triangle.sources[1],triangle.sources[2]));
  for(let i=retainedIndexCount;i<indices.length;i+=3){
    const a=indices[i],b=indices[i+1],c=indices[i+2],owner=triangleOwners[(i-retainedIndexCount)/3],normal=triangleNormal(finalPositions,a,b,c),expected=normals[owner],alignment=normal.reduce((sum,n,k)=>sum+n*expected[k],0),magnitude=Math.hypot(...normal);
    if(!magnitude||alignment<=0){
      // Extremely thin exact cells can collapse or reverse when uploaded as
      // Float32. Only their final display winding changes; retained weights
      // still describe the same material. Bound the affected source area per
      // real triangle, so rounding cannot silently erase a meaningful flap.
      const base=[a,b,c].flatMap(v=>[0,1,2].map(k=>weights[v].reduce((sum,[s,w])=>sum+w*positions[s*3+k],0)));
      roundingArea[owner]+=Math.hypot(...triangleNormal(base,0,1,2))/2;
      if(!magnitude||alignment===0)continue;
      finalIndices.push(a,c,b);sourceTriangles.push(triangles[owner].face);
    }else {finalIndices.push(a,b,c);sourceTriangles.push(triangles[owner].face);}
  }
  if(roundingArea.some((area,f)=>area>Math.max(1e-12,Math.hypot(...normals[f])/2*1e-6)))return null;
  return {positions:finalPositions,indices:new Uint32Array(finalIndices),edgesVertices,edgesAssignment,sourceVertices:new Uint32Array(source),sourceVertexWeights:weights,
    layerCount:cellOrders.reduce((maximum,order)=>Math.max(maximum,order?.size??0),mesh.layerCount),layerNormals:[...mesh.layerNormals,[...group.plane.normal]],layerGap:gap,
    gapBasePositions:Float64Array.from(gapBases),gapDirections:Float64Array.from(gapDirections),gapLimit:mesh.gapLimit??gap,gapAllowSliverRepair:mesh.gapAllowSliverRepair,sourceTriangles:Uint32Array.from(sourceTriangles)};
}
