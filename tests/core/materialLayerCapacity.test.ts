import test from 'node:test';
import assert from 'node:assert/strict';
import {computeFlatGeometry} from '../../src/core/flatFold';
import {materialLayerRegions} from '../../src/core/materialLayerRegions';
import type {FoldGraph,Point} from '../../src/core/types';

function separateGridSheets(size:number):FoldGraph {
  const vertices:Point[]=[],faces:number[][]=[],edges:[number,number][]=[],faceEdges:number[][]=[],owners:number[][]=[];
  const edgeIndex=new Map<string,number>();
  for(let y=0;y<=size;y++)for(let x=0;x<=size;x++)vertices.push([x,y]);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const a=y*(size+1)+x;
    faces.push([a,a+1,a+size+2,a+size+1]);
  }
  const start=vertices.length;
  vertices.push([size+2,0],[size+3,0],[size+3,1],[size+2,1]);
  faces.push([start,start+1,start+2,start+3]);
  faces.forEach((face,f)=>{
    faceEdges.push(face.map((a,k)=>{
      const b=face[(k+1)%face.length],key=a<b?`${a},${b}`:`${b},${a}`;
      let e=edgeIndex.get(key);
      if(e===undefined){e=edges.length;edgeIndex.set(key,e);edges.push([a,b]);owners.push([]);}
      owners[e].push(f);
      return e;
    }));
  });
  const neighbors=faces.map(()=>[] as number[]);
  for(const row of owners)if(row.length===2){neighbors[row[0]].push(row[1]);neighbors[row[1]].push(row[0]);}
  return {vertices_coords:vertices,edges_vertices:edges,edges_assignment:owners.map(row=>row.length===1?'B':'F'),
    edges_foldAngle:edges.map(()=>0),edges_faces:owners,faces_vertices:faces,faces_edges:faceEdges,
    faces_faces:neighbors,faces_holes:faces.map(()=>[]),faces_holeEdges:faces.map(()=>[])};
}

test('separate paper sheets retain every face beyond the former material region capacity',()=>{
  const graph=separateGridSheets(130);
  assert.ok(graph.vertices_coords.length>8192);
  assert.ok(graph.edges_vertices.length>16384);
  assert.ok(graph.faces_vertices!.flat().length>65536);
  const before=structuredClone(graph);
  const regions=materialLayerRegions(graph,1e-6);
  assert.equal(regions.faces_vertices!.length,16901);
  const folded=computeFlatGeometry(graph,1e-6);
  assert.equal(folded.geometry.status,'ready',folded.geometry.message);
  assert.deepEqual(folded.geometry.vertices,graph.vertices_coords);
  assert.deepEqual(graph,before);
});

test('material region validation still rejects incorrect shared-edge ownership',()=>{
  const graph=separateGridSheets(2);
  graph.edges_faces![0]=[];
  assert.throws(()=>materialLayerRegions(graph,1e-6),/实际边所属面不符/);
});
