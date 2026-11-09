import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {buildExactModelTopology,walkExactCoverage,type ExactModelTopology} from '../../src/app/modelExactTopology';
import {modelExactSurface,modelExactSurfacePath,modelExactSurfaceShadowQueries,modelExactSurfaceShadows,modelExactSurfaceShadowSVG,modelExactSurfaceShadowChains,type ExactCellSurfaceOrder,type ExactModelSurface} from '../../src/app/modelExactSurface';
import {modelOverlapRegions} from '../../src/app/modelOverlapRegions';
import {modelRegionLayers} from '../../src/app/modelRegionLayers';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {modelRegionShadows} from '../../src/app/modelRegionShadows';
import {XMLValidator} from 'fast-xml-parser';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ModelExactSurface from '../../src/components/ModelExactSurface';
import {defaultModelColors} from '../../src/app/modelColors';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import {exactGeometryBinding} from '../../src/app/flatExactProof';

const rect=(x:number,y:number,w:number,h:number):Point[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
function model(polygons:Point[][],holes:Point[][][]=[]):FlatFoldResult {
 const vertices:Point[]=[],faces:number[][]=[],faces_holes:number[][][]=[];
 const append=(ring:Point[])=>{const start=vertices.length;vertices.push(...ring);return ring.map((_,i)=>start+i);};
 polygons.forEach((ring,face)=>{faces.push(append(ring));faces_holes.push((holes[face]??[]).map(append));});
 const faceOrders:[number,number,number][]=[];for(let a=0;a<faces.length;a++)for(let b=a+1;b<faces.length;b++)faceOrders.push([a,b,1]);
 return {geometry:{status:'ready',message:'',vertices,faces,graph:{vertices_coords:vertices,faces_vertices:faces,faces_holes}},layers:{status:'solved',message:'',faceOrders},warnings:[]};
}
/** Independent toy certificate: these examples have one known global rank. */
function orders(topology:ExactModelTopology):ExactCellSurfaceOrder {
 const front=new Int32Array(topology.cellCount).fill(-2),back=front.slice();
 walkExactCoverage(topology,{onCell(cell,faces){if(!faces.size){front[cell]=back[cell]=-1;return;}let low=Infinity,high=-Infinity;for(const face of faces){low=Math.min(low,face);high=Math.max(high,face);}front[cell]=low;back[cell]=high;}});
 return {front,back};
}
const point=(surface:ExactModelSurface,v:number):Point=>[surface.vertexXY[v*2],surface.vertexXY[v*2+1]];
function ringPoints(surface:ExactModelSurface,ring:number){return Array.from(surface.ringVertices.subarray(surface.ringVertexOffsets[ring],surface.ringVertexOffsets[ring+1]),v=>point(surface,v));}
function area(surface:ExactModelSurface,fill:number){let sum=0;for(let r=surface.faceRingOffsets[fill];r<surface.faceRingOffsets[fill+1];r++){const ps=ringPoints(surface,r);for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];sum+=(a[0]*b[1]-b[0]*a[1])/2;}}return sum;}
function hit(surface:ExactModelSurface,fill:number,p:Point){let winding=0;for(let r=surface.faceRingOffsets[fill];r<surface.faceRingOffsets[fill+1];r++){const ps=ringPoints(surface,r);for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],cross=(b[0]-a[0])*(p[1]-a[1])-(p[0]-a[0])*(b[1]-a[1]);if(a[1]<=p[1]&&b[1]>p[1]&&cross>0)winding++;if(b[1]<=p[1]&&a[1]>p[1]&&cross<0)winding--;}}return winding!==0;}
function boundaryLength(surface:ExactModelSurface){let sum=0;for(let i=0;i<surface.boundaryVertices.length;i+=2){const a=point(surface,surface.boundaryVertices[i]),b=point(surface,surface.boundaryVertices[i+1]);sum+=Math.hypot(b[0]-a[0],b[1]-a[1]);}return sum;}
function shadows(topology:ExactModelTopology,surface:ExactModelSurface){const q=modelExactSurfaceShadowQueries(topology,surface);walkExactCoverage(topology,{onCell(cell,faces){for(let i=q.cellOffsets[cell];i<q.cellOffsets[cell+1];i++)q.answers[q.slots[i]]=Number(faces.has(q.faces[i]));}});return modelExactSurfaceShadows(surface,q.answers);}

test('certified same-top cells merge without probing, preserving face identity on either side',()=>{
 const source=model([rect(0,0,100,100),rect(25,25,50,50)]),topology=buildExactModelTopology(source),order=orders(topology),before=structuredClone(topology);
 const front=modelExactSurface(topology,order,'front'),back=modelExactSurface(topology,order,'back');
 assert.deepEqual([...front.faceIds],[0]);assert.equal(area(front,0),10000);assert.equal(front.faceRingOffsets[1],1);assert.equal(boundaryLength(front),400);
 assert.deepEqual([...back.faceIds],[0,1]);assert.equal(area(back,0),7500);assert.equal(area(back,1),2500);assert.equal(boundaryLength(back),600);
 assert.ok(hit(back,0,[10,10]));assert.equal(hit(back,0,[50,50]),false);assert.ok(hit(back,1,[50,50]));
 assert.equal((modelExactSurfacePath(back,0).match(/M/g)??[]).length,2);
 assert.deepEqual(topology,before);assert.notEqual(front.vertexXY.buffer,topology.vertexXY.buffer);assert.equal('cellRingOffsets' in front,false);
});

test('visible boundaries agree with the legacy geometric reference on ordinary models',()=>{
 for(const source of [model([rect(0,0,100,100),rect(25,25,50,50)]),model([rect(0,0,50,100),rect(50,0,50,100)]),model([rect(0,0,10,10),rect(20,0,10,10)]),model([rect(0,0,100,20),rect(0,80,100,20),rect(0,20,20,60),rect(80,20,20,60)])]){
  const topology=buildExactModelTopology(source),order=orders(topology),analysis=modelOverlapRegions(source);
  for(const side of ['front','back'] as const){const actual=modelExactSurface(topology,order,side),reference=modelRegionBoundaries(source,modelRegionLayers(source,analysis,side));assert.equal(reference.ambiguousEdges,0);const length=reference.edges.reduce((sum,e)=>sum+Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]),0);assert.equal(boundaryLength(actual),length);}
 }
});

test('same-color adjacent original faces keep their visible crease and separate pickable fills',()=>{
 const topology=buildExactModelTopology(model([rect(0,0,1,1),rect(1,0,1,1)])),surface=modelExactSurface(topology,orders(topology));
 assert.deepEqual([...surface.faceIds],[0,1]);assert.equal(boundaryLength(surface),7);
 assert.ok(Array.from({length:surface.sourceEdgeIds.length},(_,i)=>[surface.boundaryFaces[i*2],surface.boundaryFaces[i*2+1]]).some(([a,b])=>a>=0&&b>=0&&a!==b));
 assert.ok(hit(surface,0,[.5,.5]));assert.equal(hit(surface,1,[.5,.5]),false);assert.ok(hit(surface,1,[1.5,.5]));
});

test('compact face paths expose the original face ID to constraint capture and naming',()=>{
 const result=model([rect(0,0,100,100),rect(25,25,50,50)]),topology=buildExactModelTopology(result),surface=modelExactSurface(topology,orders(topology),'back');
 const markup=renderToStaticMarkup(createElement('svg',null,createElement(ModelExactSurface,{result,surface,side:'back',rotation:0,colors:defaultModelColors(),face:1,onSelect(){},interactive:true})));
 for(const id of surface.faceIds){
  assert.match(markup,new RegExp(`data-face-id="${id}" data-region-fill="true" data-region-top="${id}"`));
  assert.match(markup,new RegExp(`aria-label="可见纸面 F${id+1}，`));
 }
 assert.match(markup,/data-face-id="1"[^>]*fill="#d2b57b"/);
});

test('visible original-face numbers render above exact fills and export at the same safe anchors',()=>{
 const result=model([rect(0,0,100,100),rect(25,25,50,50)]),topology=buildExactModelTopology(result),surface=modelExactSurface(topology,orders(topology),'back');
 const markup=renderToStaticMarkup(createElement('svg',null,createElement(ModelExactSurface,{result,surface,side:'back',rotation:0,colors:defaultModelColors(),face:null,onSelect(){},interactive:true,displayNumbers:true})));
 const data={exact:surface,exactAnalysis:{cellCount:topology.cellCount,verifiedCells:topology.cellCount,emptyCells:0,maxDepth:2,faceCount:2,geometryBinding:exactGeometryBinding(result)}};
 const exported=foldedModelSVG(result,{name:'label test',side:'back',regions:data,displayNumbers:true});
 const labels=(text:string)=>[...text.matchAll(/<text data-face-number="(\d+)" x="([^"]+)" y="([^"]+)"/g)].map(m=>({face:Number(m[1])-1,x:Number(m[2]),y:Number(m[3])}));
 assert.deepEqual(labels(markup),labels(exported));assert.equal(labels(markup).length,2);
 assert.ok(markup.lastIndexOf('data-face-number=')>markup.lastIndexOf('data-region-boundary='));
 assert.ok(exported.lastIndexOf('data-face-number=')>exported.lastIndexOf('data-region-boundary='));
 for(const label of labels(markup))assert.ok(hit(surface,Array.from(surface.faceIds).indexOf(label.face),[100-label.x,label.y]),'back-projected label lies in its own visible face');
 assert.doesNotMatch(foldedModelSVG(result,{name:'without labels',side:'back',regions:data}),/data-face-number=/);
});

test('holes, disconnected pieces and touching weak rings retain nonzero-fill and picking semantics',()=>{
 const annulus:Point[]=[[0,0],[5,0],[5,5],[0,5],[0,0],[1,1],[1,4],[4,4],[4,1],[1,1],[0,0]];
 const disconnected:Point[]=[[0,0],[2,0],[2,2],[0,2],[0,0],[4,0],[6,0],[6,2],[4,2],[4,0],[0,0]];
 const touching:Point[]=[[0,0],[2,0],[2,2],[4,2],[4,4],[2,4],[2,2],[0,2]];
 for(const [ring,expected] of [[annulus,16],[disconnected,8],[touching,8]] as const){const topology=buildExactModelTopology(model([ring])),surface=modelExactSurface(topology,orders(topology));assert.deepEqual([...surface.faceIds],[0]);assert.equal(area(surface,0),expected);assert.equal(surface.ringVertexOffsets.at(-1),surface.ringVertices.length);}
 const t=buildExactModelTopology(model([rect(0,0,10,10),rect(4,4,1,1)],[[rect(2,2,4,4),rect(3,3,4,4)]])),s=modelExactSurface(t,orders(t));
 assert.equal(area(s,0),77);assert.equal(area(s,1),1);assert.ok(hit(s,0,[1,1]));assert.equal(hit(s,0,[4.5,4.5]),false);assert.ok(hit(s,1,[4.5,4.5]));
 // Back/rotation transforms reverse all subpath winding together, not holes alone.
 const mirrored=modelExactSurfacePath(s,0,([x,y])=>[-y,-x]);assert.equal((mirrored.match(/M/g)??[]).length,s.faceRingOffsets[1]);
});

test('collinear split vertices remain certified boundary identities without invented seams',()=>{
 const topology=buildExactModelTopology(model([rect(0,0,10,10),rect(2,0,6,10)])),surface=modelExactSurface(topology,orders(topology));
 assert.equal(area(surface,0),100);assert.equal(boundaryLength(surface),40);assert.equal(surface.faceIds.length,1);
 assert.ok(surface.boundaryVertices.length>8,'source-boundary split points are retained instead of epsilon simplification');
});

test('incomplete orders and broken halfedge cycles fail before any surface can be published',()=>{
 const topology=buildExactModelTopology(model([rect(0,0,1,1)])),order=orders(topology);
 assert.throws(()=>modelExactSurface(topology,{...order,front:new Int32Array([-2])}),/认证/);
 assert.throws(()=>modelExactSurface(topology,{...order,front:new Int32Array([-1])}),/认证/);
 assert.throws(()=>modelExactSurface({...topology,halfedgeNext:new Uint32Array(topology.halfedgeNext.length)},order),/半边环/);
});

test('coverage queries reproduce legacy illustrative shadows and share one lower-face clip',()=>{
 const source=model([rect(0,0,100,100),rect(25,25,50,50)]),topology=buildExactModelTopology(source),order=orders(topology),surface=modelExactSurface(topology,order,'back');
 surface.shadows=shadows(topology,surface);const regions=modelRegionLayers(source,modelOverlapRegions(source),'back'),reference=modelRegionShadows(regions,modelRegionBoundaries(source,regions));
 assert.equal(surface.shadows.strips.length,reference.strips.length);assert.equal(surface.shadows.strips.length,4);
 for(const strip of surface.shadows.strips){assert.equal(strip.upperFace,1);assert.equal(strip.lowerFace,0);assert.equal(surface.faceIds[strip.clipFill],0);const a=point(surface,surface.boundaryVertices[strip.edge*2]),b=point(surface,surface.boundaryVertices[strip.edge*2+1]),receiving:Point=[(a[0]+b[0])/2+strip.inward[0],(a[1]+b[1])/2+strip.inward[1]];assert.ok(hit(surface,strip.clipFill,receiving));}
 const markup=modelExactSurfaceShadowSVG(surface,p=>p,'test-shadow');assert.equal(XMLValidator.validate(`<svg>${markup}</svg>`),true);assert.equal((markup.match(/<clipPath /g)??[]).length,1);assert.equal((markup.match(/data-region-shadow=/g)??[]).length,4);assert.doesNotMatch(markup,/<polygon[^>]*clipRegions/);
 const adjacent=buildExactModelTopology(model([rect(0,0,1,1),rect(1,0,1,1)])),plain=modelExactSurface(adjacent,orders(adjacent));assert.equal(shadows(adjacent,plain).strips.length,0);
 const queries=modelExactSurfaceShadowQueries(topology,surface);assert.throws(()=>modelExactSurfaceShadows(surface,queries.answers),/未完成/);queries.answers.fill(1);assert.throws(()=>modelExactSurfaceShadows(surface,queries.answers),/冲突/);
});

test('mathematically distinct vertices with identical rounded coordinates retain edges and shadow normals',()=>{
 const source=model([rect(0,1,4,1),[[1,0],[2,100],[3,0]],[[1,0],[2,100+2**-46],[4,0]]]),topology=buildExactModelTopology(source),order=orders(topology);let collapsed=0;
 for(const side of ['front','back'] as const){const surface=modelExactSurface(topology,order,side);for(let e=0;e<surface.sourceEdgeIds.length;e++){const a=surface.boundaryVertices[e*2],b=surface.boundaryVertices[e*2+1];if(surface.vertexXY[a*2]===surface.vertexXY[b*2]&&surface.vertexXY[a*2+1]===surface.vertexXY[b*2+1]){collapsed++;assert.notEqual(a,b);assert.ok(Math.abs(Math.hypot(surface.boundaryDirectionXY[e*2],surface.boundaryDirectionXY[e*2+1])-1)<1e-12);}}const shadow=shadows(topology,surface);assert.ok(shadow.strips.every(s=>s.inward.every(Number.isFinite)&&Math.abs(Math.hypot(...s.inward)-1)<1e-12));}
 assert.ok(collapsed>0,'display rounding must not erase certified microscopic edges');
});

test('random rectangle unions match independent area and face-picking oracles',()=>{
 let seed=58302;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let trial=0;trial<50;trial++){
  const boxes=Array.from({length:6},()=>{const x=random()%6,y=random()%6;return [x,y,x+1+random()%4,y+1+random()%4];});
  const topology=buildExactModelTopology(model(boxes.map(([x,y,r,t])=>rect(x,y,r-x,t-y)))),order=orders(topology);
  for(const side of ['front','back'] as const){
   const surface=modelExactSurface(topology,order,side),expectedAreas=new Map<number,number>();
   for(let x=0;x<10;x++)for(let y=0;y<10;y++){
    const covering=boxes.flatMap(([a,b,c,d],face)=>a<x+.5&&x+.5<c&&b<y+.5&&y+.5<d?[face]:[]),expected=covering.length?(side==='front'?covering[0]:covering.at(-1)!):-1;
    const hits=Array.from(surface.faceIds).filter((_,fill)=>hit(surface,fill,[x+.5,y+.5]));
    assert.deepEqual(hits,expected<0?[]:[expected],`trial ${trial}, ${side}, point ${x+.5},${y+.5}`);
    if(expected>=0)expectedAreas.set(expected,(expectedAreas.get(expected)??0)+1);
   }
   for(let fill=0;fill<surface.faceIds.length;fill++)assert.equal(area(surface,fill),expectedAreas.get(surface.faceIds[fill]));
  }
 }
});

test('positive exact cells whose floating area underflows are not dropped from the compact surface',()=>{
 const side=2**-600,topology=buildExactModelTopology(model([rect(0,0,side,side)])),surface=modelExactSurface(topology,orders(topology));
 assert.equal(topology.cellArea[0],0);assert.equal(surface.coveredCellCount,1);assert.deepEqual([...surface.faceIds],[0]);assert.equal(surface.sourceEdgeIds.length,4);assert.equal(surface.ringVertices.length,4);assert.equal(surface.vertexXY.length,8);
});

function chainInput(vertices:Point[],edges:[number,number][],sourceLineIds:number[]):ExactModelSurface {
 const topology=buildExactModelTopology(model([rect(-20,-20,100,100)])),surface=modelExactSurface(topology,orders(topology));
 return {...surface,vertexXY:Float64Array.from(vertices.flat()),boundaryVertices:Uint32Array.from(edges.flat()),sourceEdgeIds:Uint32Array.from(edges,(_,i)=>i),sourceLineIds:Uint32Array.from(sourceLineIds),shadows:{ambiguousEdges:0,strips:edges.map((_,edge)=>({edge,upperFace:1,lowerFace:0,clipFill:0,inward:[0,1]}))}};
}

test('shadow chains require exact source and vertex identities and retain disconnected intervals',()=>{
 const s=chainInput([[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[2,0],[3,0]],[[1,2],[0,1],[3,4],[4,5],[6,7]],[7,7,7,7,7]),before=structuredClone(s);
 const chains=modelExactSurfaceShadowChains(s);assert.deepEqual(chains.map(c=>[c.startVertex,c.endVertex,c.stripIndices]),[[0,2,[1,0]],[3,5,[2,3]],[6,7,[4]]]);
 assert.deepEqual(s,before);assert.equal(chains.flatMap(c=>c.stripIndices).length,5);
 const distinct=structuredClone(s);distinct.sourceLineIds=Uint32Array.from([1,2,3,4,5]);assert.equal(modelExactSurfaceShadowChains(distinct).length,5,'equal rounded directions and endpoints alone cannot prove a source line');
 const otherLayer=structuredClone(s);otherLayer.shadows!.strips[0].upperFace=2;assert.equal(modelExactSurfaceShadowChains(otherLayer).length,4);
 const otherDirection=structuredClone(s);otherDirection.shadows!.strips[0].inward=[0,-1];assert.equal(modelExactSurfaceShadowChains(otherDirection).length,4);
 assert.equal(modelExactSurfaceShadowSVG({...s,shadows:undefined},p=>p),'');
});

test('damaged shadow branches and cycles retain each original rectangle without looping or dropping a branch',()=>{
 for(const edges of [[[0,1],[1,2],[1,3]],[[0,1],[1,2],[2,0]]] as [number,number][][]){
  const s=chainInput([[0,0],[1,0],[2,0],[3,0]],edges,[0,0,0]),chains=modelExactSurfaceShadowChains(s);
  assert.equal(chains.length,3);assert.ok(chains.every(c=>c.stripIndices.length===1));assert.deepEqual(chains.flatMap(c=>c.stripIndices).sort(),[0,1,2]);
 }
});

test('merged shadow image samples equal individual strips while retaining the receiving face holes',()=>{
 const source=model([rect(0,0,40,20),rect(-10,-10,60,50),rect(3,-5,4,30),rect(12,-5,2,30),rect(26,-5,4,30)],[[],[rect(15,22,8,8)]]),topology=buildExactModelTopology(source),surface=modelExactSurface(topology,orders(topology));
 surface.shadows=shadows(topology,surface);const before=structuredClone(surface),chains=modelExactSurfaceShadowChains(surface);
 assert.ok(chains.length<surface.shadows.strips.length);assert.deepEqual(chains.flatMap(c=>c.stripIndices).sort((a,b)=>a-b),surface.shadows.strips.map((_,i)=>i));
 for(let e=0;e<surface.sourceEdgeIds.length;e++)assert.equal(surface.sourceLineIds[e],topology.edgeSource[surface.sourceEdgeIds[e]]);
 type SampleRect={a:Point;b:Point;inward:Point;fill:number};
 const original:SampleRect[]=surface.shadows.strips.map(s=>({a:point(surface,surface.boundaryVertices[s.edge*2]),b:point(surface,surface.boundaryVertices[s.edge*2+1]),inward:s.inward,fill:s.clipFill}));
 const merged:SampleRect[]=chains.map(c=>({a:point(surface,c.startVertex),b:point(surface,c.endVertex),inward:c.strip.inward,fill:c.strip.clipFill}));
 const alpha=(rects:SampleRect[],p:Point)=>{
  let transparent=1;for(const {a,b,inward,fill}of rects){const x=p[0]-a[0],y=p[1]-a[1],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy,t=(x*dx+y*dy)/length2,d=x*inward[0]+y*inward[1];if(t>0&&t<1&&d>0&&d<10&&hit(surface,fill,p))transparent*=1-(50/255)*(1-d/10);}return 1-transparent;
 };
 const imageBefore=new Uint8Array(280*200),imageAfter=imageBefore.slice();
 for(let y=0;y<200;y++)for(let x=0;x<280;x++){const p:Point=[-15+(x+.371)/4,-15+(y+.619)/4],a=alpha(original,p),b=alpha(merged,p);assert.ok(Math.abs(a-b)<1e-12);imageBefore[y*280+x]=Math.round(a*255);imageAfter[y*280+x]=Math.round(b*255);}
 assert.deepEqual(imageAfter,imageBefore,'all 56,000 shadow-image samples preserve clipping and gradient alpha');assert.ok(imageBefore.some(alpha=>alpha>0));assert.equal(alpha(merged,[18,25]),0,'the hole never receives the lower face shadow');
 const svg=modelExactSurfaceShadowSVG(surface,p=>p);assert.equal(XMLValidator.validate(`<svg>${svg}</svg>`),true);assert.equal((svg.match(/data-region-shadow=/g)??[]).length,chains.length);assert.deepEqual(surface,before,'display merging cannot mutate certified strips or boundaries');
});
