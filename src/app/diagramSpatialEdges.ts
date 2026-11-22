import type {FlatFoldResult,Point} from '../core/types';
import type {DiagramPose} from './diagramProject';
import type {ModelViewState} from './modelViewState';
import {depthPlanes,projectDiagramSpatialPoint} from './diagramSpatialPose';
import {modelFaceRings} from './modelRings';
import {modelProjection} from './modelProjection';
import {diagramPiecesStrictlyCoverPoint} from './diagramFoldOcclusion';
import {flatLayerEdges} from '../core/flatLayerOrder';
import {polygonArea} from '../core/geometry';
import type {DiagramSpatialPose} from './diagramSpatialPose';
import {diagramDepthActive} from './diagramDepth';
import {diagramIllustrationMesh} from './diagramIllustrationMesh';
import earcut from 'earcut';

const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const sub=(a:readonly number[],b:readonly number[]):Point=>[a[0]-b[0],a[1]-b[1]];
const cache=new WeakMap<FlatFoldResult,{spatial:DiagramSpatialPose;variants:Map<string,string>}>();

/** Nonzero folds and zero-area outer paper edges have a silhouette. Split their real edges at
 * every occluder boundary and depth crossing; retain only portions in front of
 * all covering faces. A cyclic stack therefore needs no fabricated draw rank. */
export function diagramSpatialEdgeMarkup(pose:DiagramPose,view:ModelViewState,color:string,width=1.35):string {
  const spatial=pose.spatial,graph=pose.result.geometry.graph,marked=graph?.zhezhi_spatialEdgeOnFaces as number[]|undefined;
  if(!spatial||view.xray||pose.paperDeformation?.nodes.length||pose.result.layers.status!=='solved')return '';
  let cached=cache.get(pose.result);if(!cached||cached.spatial!==spatial){cached={spatial,variants:new Map()};cache.set(pose.result,cached);}
  const cacheKey=JSON.stringify([view.side,view.rotation,view.projectionCenter,view.depth,color,width,[...new Set(pose.hiddenFaces??[])].sort((a,b)=>a-b)]),prior=cached.variants.get(cacheKey);if(prior!==undefined)return prior;
  const mesh=diagramDepthActive({...pose,view})?diagramIllustrationMesh({...pose,view}):null;
  const {faces}=pose.result.geometry,vertices=mesh?.vertices??pose.result.geometry.vertices,hidden=new Set(pose.hiddenFaces??[]),edgeOn=new Set(marked??[]),projected=spatial.vertices.map(p=>projectDiagramSpatialPoint(p,spatial.camera));
  // Display relief must not recenter the actual spatial camera.
  const side=view.side==='back'?-1:1,projection=modelProjection(pose.result.geometry.vertices,side<0,view.rotation,view?.projectionCenter),scale=Math.max(1,...projected.flat().map(Math.abs)),epsilon=Number.EPSILON*scale*512;
  const above=new Map<number,number[]>();
  for(const pair of flatLayerEdges(pose.result.layers.faceOrders??[],faces.map(face=>polygonArea(face.map(v=>vertices[v]))>0?1:-1))){const [below,top]=side>0?pair:[pair[1],pair[0]],row=above.get(below)??[];row.push(top);above.set(below,row);}
  const planes=mesh?null:depthPlanes(spatial);
  const covers=faces.flatMap((_,face)=>{
    if(hidden.has(face)||edgeOn.has(face))return [];
    if(mesh)return mesh.triangles[face].map(ids=>{
      // Each display cell maps to the same real material triangle. Interpolate
      // its physical camera depth over its shifted screen area, so even a
      // pinned side-on edge keeps precise partial occlusion. A whole-face
      // paint rank alone cannot certify the visibility of a zero-area edge.
      const [a,b,c]=ids.map(v=>vertices[v]),area=cross(sub(b,a),sub(c,a)),source=ids.map(v=>mesh.graph.vertices_coords[v]),materialArea=cross(sub(source[1],source[0]),sub(source[2],source[0]));
      if(!materialArea||Math.abs(area/materialArea)<=Number.EPSILON*64)throw Error('展开后的空间纸面投影退化，请减小展开量或调整视角。');
      const [za,zb,zc]=ids.map(v=>projected[v][2]),u=zb-za,v=zc-za;
      const dx=(u*(c[1]-a[1])-v*(b[1]-a[1]))/area,dy=((b[0]-a[0])*v-(c[0]-a[0])*u)/area;
      const rings=[[a,b,c]],pieces=[{shown:rings[0]}],touches=(p:Point)=>diagramPiecesStrictlyCoverPoint(pieces,p,epsilon)||rings[0].some((a,i)=>{
        const b=rings[0][(i+1)%3],d=sub(b,a),q=sub(p,a),length=Math.hypot(...d),along=q[0]*d[0]+q[1]*d[1];
        return length>epsilon&&Math.abs(cross(d,q))<=epsilon*length&&along>=-epsilon*length&&along<=length*length+epsilon*length;
      });
      return {face,rings,pieces,touches,depth:(p:Point)=>za+dx*(p[0]-a[0])+dy*(p[1]-a[1]),condition:1+Math.abs(dx)+Math.abs(dy)};
    });
    const plane=planes?.[face];if(!plane)return [];
    const {origin:o,a:dx,b:dy,condition}=plane,rings=modelFaceRings(pose.result,face).map(ring=>ring.map(v=>vertices[v]));
    const points=rings.flat(),holes:number[]=[];let count=rings[0].length;for(const ring of rings.slice(1)){holes.push(count);count+=ring.length;}
    const indices=earcut(points.flat(),holes,2),pieces=Array.from({length:indices.length/3},(_,i)=>({shown:indices.slice(i*3,i*3+3).map(v=>points[v])}));
    const touches=(p:Point)=>diagramPiecesStrictlyCoverPoint(pieces,p,epsilon)||rings.some(ring=>ring.some((a,i)=>{
      const b=ring[(i+1)%ring.length],d=sub(b,a),q=sub(p,a),length=Math.hypot(...d),along=q[0]*d[0]+q[1]*d[1];
      return length>epsilon&&Math.abs(cross(d,q))<=epsilon*length&&along>=-epsilon*length&&along<=length*length+epsilon*length;
    }));
    return [{face,rings,pieces,touches,depth:(p:Point)=>o[2]+dx*(p[0]-o[0])+dy*(p[1]-o[1]),condition}];
  }).map(cover=>{
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(const ring of cover.rings)for(const [x,y] of ring){
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    // touches() admits a small distance both along and across an edge.
    const pad=3*epsilon;
    return {...cover,left:left-pad,right:right+pad,top:top-pad,bottom:bottom+pad};
  });
  const key=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(':'),owners=new Map<string,number[]>(),edges=new Map<string,[number,number]>();
  faces.forEach((_,face)=>{for(const ring of modelFaceRings(pose.result,face))ring.forEach((a,i)=>{const b=ring[(i+1)%ring.length],k=key(a,b),row=owners.get(k)??[];row.push(face);owners.set(k,row);});});
  const graphEdges=new Map(graph?.edges_vertices.map(([a,b],e)=>[key(a,b),e]));
  const folded=(e:number)=>typeof spatial.measuredAngles[e]==='number'&&Math.abs(spatial.measuredAngles[e]!)>1e-5&&['M','V'].includes(graph!.edges_assignment[e]);
  for(const face of marked??[])if(!hidden.has(face))for(const ring of modelFaceRings(pose.result,face))ring.forEach((a,i)=>{const b=ring[(i+1)%ring.length],k=key(a,b),e=graphEdges.get(k);if((owners.get(k)?.length??0)<2||e!==undefined&&(graph!.edges_assignment[e]==='B'||folded(e)))edges.set(k,[a,b]);});
  graph?.edges_vertices.forEach(([a,b],e)=>{const k=key(a,b);if(folded(e)&&owners.get(k)?.some(face=>!hidden.has(face)))edges.set(k,[a,b]);});
  const lines:string[]=[];
  for(const [u,v] of edges.values()){
    const material=(owners.get(key(u,v))??[]).filter(face=>!hidden.has(face)),areaOwners=material.filter(face=>!edgeOn.has(face));
    const a=vertices[u],b=vertices[v],d=sub(b,a),length=Math.hypot(...d);if(length<=epsilon)continue;
    const left=Math.min(a[0],b[0]),right=Math.max(a[0],b[0]),top=Math.min(a[1],b[1]),bottom=Math.max(a[1],b[1]);
    const candidates=covers.filter(c=>c.left<=right&&c.right>=left&&c.top<=bottom&&c.bottom>=top);
    const at=(t:number):Point=>[a[0]+d[0]*t,a[1]+d[1]*t],depth=(t:number)=>projected[u][2]+(projected[v][2]-projected[u][2])*t,breaks=[0,1];
    const add=(t:number)=>{if(t>0&&t<1)breaks.push(t);};
    for(const cover of candidates){
      for(const ring of cover.rings)ring.forEach((p,i)=>{
        const q=ring[(i+1)%ring.length],e=sub(q,p),offset=sub(p,a),den=cross(d,e);
        if(Math.abs(den)>epsilon*Math.max(length,Math.hypot(...e))){const t=cross(offset,e)/den,s=cross(offset,d)/den;if(s>=0&&s<=1)add(t);}
        else if(Math.abs(cross(offset,d))<=epsilon*length){const norm=length*length;add((offset[0]*d[0]+offset[1]*d[1])/norm);const end=sub(q,a);add((end[0]*d[0]+end[1]*d[1])/norm);}
      });
      const da=depth(0)-cover.depth(a),db=depth(1)-cover.depth(b);if(da*db<0)add(da/(da-db));
    }
    breaks.sort((a,b)=>a-b);
    let start:number|undefined,end=0;
    const flush=()=>{if(start===undefined)return;const p=projection.project(at(start)),q=projection.project(at(end));lines.push(`<line data-diagram-spatial-edge="true" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke" stroke-linecap="round" pointer-events="none"/>`);start=undefined;};
    for(let i=0;i<breaks.length-1;i++){
      const lo=breaks[i],hi=breaks[i+1];if((hi-lo)*length<=epsilon)continue;
      const t=(lo+hi)/2,p=at(t),local=candidates.filter(c=>c.left<=p[0]&&p[0]<=c.right&&c.top<=p[1]&&p[1]<=c.bottom&&c.touches(p)),active=new Set([...areaOwners,...local.map(cover=>cover.face)]),reach=new Map<number,Set<number>>();
      const reachable=(face:number)=>{
        const prior=reach.get(face);if(prior)return prior;
        const seen=new Set<number>(),pending=[face];for(let i=0;i<pending.length;i++)for(const top of above.get(pending[i])??[])if(active.has(top)&&!seen.has(top)){seen.add(top);pending.push(top);}
        reach.set(face,seen);return seen;
      };
      const occluders=local.filter(cover=>{
        if(material.includes(cover.face))return false;
        const delta=(cover.depth(p)-depth(t))*side,tolerance=epsilon*cover.condition;
        // On the solved projection a local order already includes contact and
        // strict-depth checks. Re-sampling a shared vertex can differ from
        // its face plane by the accumulated hinge closure residual.
        const aboveOwners=areaOwners.length>0&&areaOwners.every(face=>reachable(face).has(cover.face)&&!reachable(cover.face).has(face));
        if(!mesh&&aboveOwners)return true;
        if(!mesh&&areaOwners.some(face=>reachable(cover.face).has(face)&&!reachable(face).has(cover.face)))return false;
        return delta>tolerance||Math.abs(delta)<=tolerance&&aboveOwners;
      });
      // F subdivision seams are interior to the union, even when no one
      // polygon strictly covers the sample. Triangles preserve concavity and
      // holes while allowing the shared local-interior predicate to certify it.
      const buried=diagramPiecesStrictlyCoverPoint(occluders.flatMap(cover=>cover.pieces),p,epsilon);
      if(buried)flush();else{start??=lo;end=hi;}
    }
    flush();
  }
  const markup=lines.length?`<g data-diagram-spatial-edges="true"${mesh?' data-diagram-spatial-depth="true"':''}>${lines.join('')}</g>`:'';
  cached.variants.set(cacheKey,markup);if(cached.variants.size>8)cached.variants.delete(cached.variants.keys().next().value!);return markup;
}
