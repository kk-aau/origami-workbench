import type {Doc,Point,FoldGraph} from '../../src/core/types';
import {createMaterialTopology} from '../../src/core/materialTopology';
export function singleMountainFold(size:number,offset=0):Doc {
 const points:Point[]=[[offset,offset],[offset+size,offset],[offset+size,offset+size],[offset,offset+size]];
 return {name:`数值边界-方纸${size}-偏置${offset}`,paper:{width:size,height:size},segments:[...points.map((a,i)=>({id:`b${i}`,a,b:points[(i+1)%4],assignment:'B' as const,angle:0})),{id:'fold',a:[offset+size/2,offset],b:[offset+size/2,offset+size],assignment:'M',angle:-180}]};
}
export function overlappingMaterialPairs(groups=17):Doc {
 const vertices:Point[]=[],foldedVertices:Point[]=[],faces:number[][]=[],edges:[number,number][]=[],faceEdges:number[][]=[],edgeFaces:number[][]=[];
 for(let f=0;f<groups*2;f++){
  const v=vertices.length,e=edges.length,x=f*20,ffx=Math.floor(f/2)*20;
  vertices.push([x,0],[x+10,0],[x+10,10],[x,10]);foldedVertices.push([ffx,0],[ffx+10,0],[ffx+10,10],[ffx,10]);
  faces.push([v,v+1,v+2,v+3]);edges.push([v,v+1],[v+1,v+2],[v+2,v+3],[v+3,v]);faceEdges.push([e,e+1,e+2,e+3]);for(let k=0;k<4;k++)edgeFaces.push([f]);
 }
 const graph:FoldGraph={vertices_coords:vertices,edges_vertices:edges,edges_assignment:edges.map(()=>'B'),edges_foldAngle:edges.map(()=>0),faces_vertices:faces,faces_edges:faceEdges,edges_faces:edgeFaces,faces_faces:faces.map(()=>[null,null,null,null]) as unknown as number[][]};
 const ids=edges.map((_,e)=>`boundary-${e}`),doc:Doc={name:'约束候选截断-17组两层材料',paper:{width:groups*40,height:10},segments:edges.map(([a,b],e)=>({id:ids[e],a:vertices[a],b:vertices[b],assignment:'B',angle:0}))};
 doc.metadata={materialTopology:createMaterialTopology(doc,graph,ids,{foldedVertices,startingFace:0})};return doc;
}

