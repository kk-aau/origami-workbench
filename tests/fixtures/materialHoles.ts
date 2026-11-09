import {materialSlitFixture,materialDoc} from './materialModel';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import {joinMaterialEdges} from '../../src/core/materialJoin';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {cutMaterialSelection} from '../../src/app/materialClipboard';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import type {Doc} from '../../src/core/types';
import {materialCanonical} from '../../src/core/materialFaceCommon';
export function holesMaterial(doc:Doc){const m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);return m;}
export function holeRingSource(){
 const {source,banks}=materialSlitFixture(),m=holesMaterial(source),joined=joinMaterialEdges(source,{kind:'material-join',pairs:[{first:m.edgeSegmentIds[banks[0]],second:m.edgeSegmentIds[banks[1]],assignment:'F'}]}).doc,jm=holesMaterial(joined),cuts=jm.graph.faces_edges![4].map(e=>jm.edgeSegmentIds[e]),split=cutMaterialEdges(joined,{kind:'material-cut',segmentIds:cuts}).doc,sm=holesMaterial(split),island=sm.components.find(c=>c.faces.length===1)!;
 return cutMaterialSelection(split,{kind:'material-clipboard-cut',segmentIds:island.edges.map(e=>sm.edgeSegmentIds[e]),lockBoundary:false}).doc;
}
export function mergeHoleRing(){const source=holeRingSource(),m=holesMaterial(source),intent={kind:'material-face-remove' as const,segmentIds:m.edgeSegmentIds.filter((_,e)=>m.graph.edges_assignment[e]!=='B')},result=editMaterialFaces(source,intent);return {source,intent,result};}
export function mergeTwoHoleRing(){
 const coords=Array.from({length:24},(_,v)=>[v%6*100,Math.floor(v/6)*100] as [number,number]),faces:number[][]=[],faceEdges:number[][]=[],edges:[number,number][]=[],map=new Map<string,number>();
 for(let y=0;y<3;y++)for(let x=0;x<5;x++){const v=y*6+x,r=[v,v+1,v+7,v+6];faces.push(r);faceEdges.push(r.map((a,k)=>{const b=r[(k+1)%4],key=[a,b].sort((a,b)=>a-b).join(',');let e=map.get(key);if(e===undefined){e=edges.length;map.set(key,e);edges.push([a,b]);}return e;}));}
 const counts=edges.map((_,e)=>faceEdges.filter(r=>r.includes(e)).length),g=materialCanonical(coords,edges,counts.map(n=>n===1?'B':'F'),edges.map(()=>0),faces,faceEdges),doc=materialDoc(g,coords),m=holesMaterial(doc),split=cutMaterialEdges(doc,{kind:'material-cut',segmentIds:[6,8].flatMap(f=>g.faces_edges![f].map(e=>m.edgeSegmentIds[e]))}).doc,sm=holesMaterial(split),islands=sm.components.filter(c=>c.faces.length===1),source=cutMaterialSelection(split,{kind:'material-clipboard-cut',segmentIds:islands.flatMap(c=>c.edges.map(e=>sm.edgeSegmentIds[e])),lockBoundary:false}).doc,old=holesMaterial(source),intent={kind:'material-face-remove' as const,segmentIds:old.edgeSegmentIds.filter((_,e)=>old.graph.edges_assignment[e]!=='B')};return {source,intent,result:editMaterialFaces(source,intent)};
}
