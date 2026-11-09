import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagramCPHitAreas} from '../../src/components/diagramCPHitAreas';
import type {Point} from '../../src/core/types';

const distanceToEdge=(p:Point,a:Point,b:Point)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
};

test('dense CP cells keep their interior available for face selection at every viewport scale',()=>{
  const vertices:Point[]=[],edges:[number,number][]=[],faces:{rings:number[][];clearance:number}[]=[],count=8,cell=2;
  const index=(x:number,y:number)=>y*(count+1)+x;
  for(let y=0;y<=count;y++)for(let x=0;x<=count;x++)vertices.push([x*cell,y*cell]);
  for(let y=0;y<=count;y++)for(let x=0;x<count;x++)edges.push([index(x,y),index(x+1,y)]);
  for(let y=0;y<count;y++)for(let x=0;x<=count;x++)edges.push([index(x,y),index(x,y+1)]);
  for(let y=0;y<count;y++)for(let x=0;x<count;x++)faces.push({rings:[[index(x,y),index(x+1,y),index(x+1,y+1),index(x,y+1)]],clearance:cell/2});
  const {vertexRadii,edgeWidths}=diagramCPHitAreas(vertices,edges,faces);
  for(const viewportScale of [.2,.5,1,2])for(let y=0;y<count;y++)for(let x=0;x<count;x++)for(const dx of [.3,.5,.7])for(const dy of [.3,.5,.7]){
    const p:Point=[(x+dx)*cell,(y+dy)*cell];
    vertices.forEach((v,i)=>assert.ok(Math.hypot(p[0]-v[0],p[1]-v[1])*viewportScale>vertexRadii[i]*viewportScale,'vertex hit disc covered a face interior'));
    edges.forEach(([a,b],i)=>assert.ok(distanceToEdge(p,vertices[a],vertices[b])*viewportScale>edgeWidths[i]*viewportScale/2,'edge hit stroke covered a face interior'));
  }
  assert.ok(vertexRadii.every(r=>Number.isFinite(r)&&r>0));
  assert.ok(edgeWidths.every(w=>Number.isFinite(w)&&w>0));
});

test('a long narrow face retains a selectable center while all boundary points and lines remain targets',()=>{
  const vertices:Point[]=[[20,20],[236,20],[236,20.4],[20,20.4]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0]],center:Point=[128,20.2];
  const {vertexRadii,edgeWidths}=diagramCPHitAreas(vertices,edges,[{rings:[[0,1,2,3]],clearance:.2}]);
  edges.forEach(([a,b],i)=>assert.ok(distanceToEdge(center,vertices[a],vertices[b])>edgeWidths[i]/2));
  vertices.forEach((p,i)=>assert.ok(Math.hypot(center[0]-p[0],center[1]-p[1])>vertexRadii[i]));
  assert.ok(vertexRadii.every(r=>r>0));assert.ok(edgeWidths.every(w=>w>0));
});
