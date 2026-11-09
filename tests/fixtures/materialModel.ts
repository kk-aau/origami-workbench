import fs from 'node:fs';
import {prepareTessResult,tessConstructionKey} from '../../src/app/tessellation';
import {tessFlatInput} from '../../src/app/tessellationFlat';
import {computeTessFlatGeometry} from '../../src/app/tessellationFlatGeometry';
import {splitWovenCutGraph} from '../../src/app/wovenCutTopology';
import {createMaterialTopology} from '../../src/core/materialTopology';
import type {Doc,FoldGraph,Point,FlatFoldResult,Assignment} from '../../src/core/types';

export function materialDoc(graph:FoldGraph,foldedVertices:Point[],startingFace=0):Doc{
 const ids=graph.edges_vertices.map((_,i)=>`material-edge-${i}`);
 const doc:Doc={schemaVersion:2,name:'材料切口模型',paper:{width:300,height:300},segments:graph.edges_vertices.map(([a,b],i)=>({id:ids[i],a:[...graph.vertices_coords[a]],b:[...graph.vertices_coords[b]],assignment:graph.edges_assignment[i] as Assignment,angle:graph.edges_foldAngle[i]}))};
 doc.metadata={materialTopology:createMaterialTopology(doc,graph,ids,{foldedVertices,startingFace})};return doc;
}

/** Actual original CP/FF fixture, kept separate from snapshot serialization. */
export function materialCutFixture(){
 const cases=JSON.parse(fs.readFileSync('tests/fixtures/woven-original-boundaries-20261001.json','utf8')).cases;
 const f=cases.find((c:{name:string})=>c.name==='internal-diagonal-fixed-F2'),r=prepareTessResult(f.response,f.params),input=tessFlatInput(r,r.doc,tessConstructionKey(f.params),false);
 const result=computeTessFlatGeometry(input),source=materialDoc(input.graph,input.wovenCutFoldedVertices!,input.startingFace);
 return {source,result,graph:input.graph};
}

/** Geometric 3×3 grid with one internal slit; its banks share endpoint IDs. */
export function materialSlitFixture(){
 const vertices:Point[]=Array.from({length:16},(_,i)=>[i%4*100,Math.floor(i/4)*100]),faces:number[][]=[],edges:[number,number][]=[],owners:number[]=[];
 const lookup=new Map<string,number>();
 for(let y=0;y<3;y++)for(let x=0;x<3;x++){
  const v=y*4+x,face=[v,v+1,v+5,v+4];faces.push(face);
  face.forEach((a,i)=>{const b=face[(i+1)%4],key=[a,b].sort((a,b)=>a-b).join(',');let e=lookup.get(key);if(e===undefined){e=edges.length;lookup.set(key,e);edges.push([Math.min(a,b),Math.max(a,b)]);owners.push(0);}owners[e]++;});
 }
 const graph:FoldGraph={vertices_coords:vertices,faces_vertices:faces,edges_vertices:edges,edges_assignment:owners.map(n=>n===1?'B':'F'),edges_foldAngle:owners.map(()=>0)};
 const cut=lookup.get('5,6')!;graph.edges_assignment[cut]='B';const split=splitWovenCutGraph(graph,vertices),g=split.splitGraph,banks=split.edgeSource.flatMap((e,i)=>e===cut?[i]:[]);
 const result:FlatFoldResult={geometry:{status:'ready',message:'slit',vertices:g.vertices_coords,faces:g.faces_vertices!,graph:g,startingFace:0},layers:{status:'unknown',message:'pending'},warnings:[]};
 return {source:materialDoc(g,g.vertices_coords),result,graph:g,banks};
}
