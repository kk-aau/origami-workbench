import type {FlatFoldResult,Point} from '../core/types';
import {applyRigidFoldTransform} from '../core/rigidFoldGeometry';
import type {DiagramPose} from './diagramProject';
import type {ModelViewState} from './modelViewState';
import {projectDiagramSpatialPoint,spatialFaceMatrix} from './diagramSpatialPose';
import {modelFaceRings} from './modelRings';
import {modelProjection} from './modelProjection';
import {diagramPiecesStrictlyCoverPoint} from './diagramFoldOcclusion';
import {flatLayerEdges} from '../core/flatLayerOrder';
import {polygonArea} from '../core/geometry';
import type {DiagramSpatialPose} from './diagramSpatialPose';
import earcut from 'earcut';

const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const sub=(a:readonly number[],b:readonly number[]):Point=>[a[0]-b[0],a[1]-b[1]];
const cache=new WeakMap<FlatFoldResult,{spatial:DiagramSpatialPose;variants:Map<string,string>}>();

/** Nonzero folds and zero-area outer paper edges have a silhouette. Split their real edges at
 * every occluder boundary and depth crossing; retain only portions in front of
 * all covering faces. A cyclic stack therefore needs no fabricated draw rank. */
export function diagramSpatialEdgeMarkup(pose:DiagramPose,view:ModelViewState,color:string):string {
  const spatial=pose.spatial,graph=pose.result.geometry.graph,marked=graph?.zhezhi_spatialEdgeOnFaces as number[]|undefined;
  if(!spatial||view.xray||pose.paperDeformation?.nodes.length||pose.result.layers.status!=='solved')return '';
  let cached=cache.get(pose.result);if(!cached||cached.spatial!==spatial){cached={spatial,variants:new Map()};cache.set(pose.result,cached);}
  const cacheKey=JSON.stringify([view.side,view.rotation,color,[...new Set(pose.hiddenFaces??[])].sort((a,b)=>a-b)]),prior=cached.variants.get(cacheKey);if(prior!==undefined)return prior;
  const {vertices,faces}=pose.result.geometry,hidden=new Set(pose.hiddenFaces??[]),edgeOn=new Set(marked??[]),projected=spatial.vertices.map(p=>projectDiagramSpatialPoint(p,spatial.camera));
  const side=view.side==='back'?-1:1,projection=modelProjection(vertices,side<0,view.rotation,view?.projectionCenter),scale=Math.max(1,...projected.flat().map(Math.abs)),epsilon=Number.EPSILON*scale*512;
  const above=new Map<number,number[]>();
  for(const pair of flatLayerEdges(pose.result.layers.faceOrders??[],faces.map(face=>polygonArea(face.map(v=>vertices[v]))>0?1:-1))){const [below,top]=side>0?pair:[pair[1],pair[0]],row=above.get(below)??[];row.push(top);above.set(below,row);}
  const covers=faces.flatMap((_,face)=>{
    if(hidden.has(face)||edgeOn.has(face))return [];
    const t=spatial.faceTransforms[face],m=spatialFaceMatrix(spatial,face),det=m[0]*m[3]-m[1]*m[2];if(Math.abs(det)<Number.EPSILON*64)return [];
    const o=projectDiagramSpatialPoint(applyRigidFoldTransform(t,[0,0,0]),spatial.camera),u=projectDiagramSpatialPoint(applyRigidFoldTransform(t,[1,0,0]),spatial.camera)[2]-o[2],v=projectDiagramSpatialPoint(applyRigidFoldTransform(t,[0,1,0]),spatial.camera)[2]-o[2];
    const dx=(u*m[3]-v*m[1])/det,dy=(-u*m[2]+v*m[0])/det,rings=modelFaceRings(pose.result,face).map(ring=>ring.map(v=>vertices[v]));
    const points=rings.flat(),holes:number[]=[];let count=rings[0].length;for(const ring of rings.slice(1)){holes.push(count);count+=ring.length;}
    const indices=earcut(points.flat(),holes,2),pieces=Array.from({length:indices.length/3},(_,i)=>({shown:indices.slice(i*3,i*3+3).map(v=>points[v])}));
    const touches=(p:Point)=>diagramPiecesStrictlyCoverPoint(pieces,p,epsilon)||rings.some(ring=>ring.some((a,i)=>{
      const b=ring[(i+1)%ring.length],d=sub(b,a),q=sub(p,a),length=Math.hypot(...d),along=q[0]*d[0]+q[1]*d[1];
      return length>epsilon&&Math.abs(cross(d,q))<=epsilon*length&&along>=-epsilon*length&&along<=length*length+epsilon*length;
    }));
    return [{face,rings,pieces,touches,depth:(p:Point)=>o[2]+dx*(p[0]-o[0])+dy*(p[1]-o[1]),condition:1+Math.abs(dx)+Math.abs(dy)}];
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
    const at=(t:number):Point=>[a[0]+d[0]*t,a[1]+d[1]*t],depth=(t:number)=>projected[u][2]+(projected[v][2]-projected[u][2])*t,breaks=[0,1];
    const add=(t:number)=>{if(t>0&&t<1)breaks.push(t);};
    for(const cover of covers){
      for(const ring of cover.rings)ring.forEach((p,i)=>{
        const q=ring[(i+1)%ring.length],e=sub(q,p),offset=sub(p,a),den=cross(d,e);
        if(Math.abs(den)>epsilon*Math.max(length,Math.hypot(...e))){const t=cross(offset,e)/den,s=cross(offset,d)/den;if(s>=0&&s<=1)add(t);}
        else if(Math.abs(cross(offset,d))<=epsilon*length){const norm=length*length;add((offset[0]*d[0]+offset[1]*d[1])/norm);const end=sub(q,a);add((end[0]*d[0]+end[1]*d[1])/norm);}
      });
      const da=depth(0)-cover.depth(a),db=depth(1)-cover.depth(b);if(da*db<0)add(da/(da-db));
    }
    breaks.sort((a,b)=>a-b);
    let start:number|undefined,end=0;
    const flush=()=>{if(start===undefined)return;const p=projection.project(at(start)),q=projection.project(at(end));lines.push(`<line data-diagram-spatial-edge="true" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${color}" stroke-width="1.35" vector-effect="non-scaling-stroke" stroke-linecap="round" pointer-events="none"/>`);start=undefined;};
    for(let i=0;i<breaks.length-1;i++){
      const lo=breaks[i],hi=breaks[i+1];if((hi-lo)*length<=epsilon)continue;
      const t=(lo+hi)/2,p=at(t),local=covers.filter(cover=>cover.touches(p)),active=new Set([...areaOwners,...local.map(cover=>cover.face)]),reach=new Map<number,Set<number>>();
      const reachable=(face:number)=>{
        const prior=reach.get(face);if(prior)return prior;
        const seen=new Set<number>(),pending=[face];for(let i=0;i<pending.length;i++)for(const top of above.get(pending[i])??[])if(active.has(top)&&!seen.has(top)){seen.add(top);pending.push(top);}
        reach.set(face,seen);return seen;
      };
      const occluders=local.filter(cover=>{
        if(material.includes(cover.face))return false;
        const delta=(cover.depth(p)-depth(t))*side,tolerance=epsilon*cover.condition;
        return delta>tolerance||Math.abs(delta)<=tolerance&&areaOwners.length>0&&areaOwners.every(face=>reachable(face).has(cover.face)&&!reachable(cover.face).has(face));
      });
      // F subdivision seams are interior to the union, even when no one
      // polygon strictly covers the sample. Triangles preserve concavity and
      // holes while allowing the shared local-interior predicate to certify it.
      const buried=diagramPiecesStrictlyCoverPoint(occluders.flatMap(cover=>cover.pieces),p,epsilon);
      if(buried)flush();else{start??=lo;end=hi;}
    }
    flush();
  }
  const markup=lines.length?`<g data-diagram-spatial-edges="true">${lines.join('')}</g>`:'';
  cached.variants.set(cacheKey,markup);if(cached.variants.size>8)cached.variants.delete(cached.variants.keys().next().value!);return markup;
}
