import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {modelBoundsIndex,modelOverlapRegions,modelPolygonBounds} from '../../src/app/modelOverlapRegions';
import {groupFlagstoneFaces} from '../../src/app/flagstoneFaceGroups';
const rect=(x:number,y:number,w:number,h:number):Point[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
function model(polygons:Point[][]):FlatFoldResult{const vertices:Point[]=[],faces:number[][]=[];for(const poly of polygons){const offset=vertices.length;vertices.push(...poly);faces.push(poly.map((_,i)=>offset+i));}return {geometry:{status:'ready',message:'',vertices,faces},layers:{status:'unknown',message:'不计算层序'},warnings:[]};}
function areas(result:ReturnType<typeof modelOverlapRegions>){const sums:Record<string,number>={};for(const c of result.cells){const key=c.faces.join(',');sums[key]=(sums[key]??0)+c.area;}return sums;}
test('overlap cells give exact coverage for disjoint, shared-edge and coincident faces',()=>{
 assert.deepEqual(areas(modelOverlapRegions(model([rect(0,0,10,10),rect(10,0,10,10),rect(30,0,10,10)]))),{'0':100,'1':100,'2':100});
 const same=modelOverlapRegions(model([rect(0,0,10,10),rect(0,0,10,10)]));assert.deepEqual(areas(same),{'0,1':100});assert.equal(same.maxDepth,2);
});
test('nested disconnected boundaries preserve outer coverage and do not fill holes',()=>{
 const nested=modelOverlapRegions(model([rect(0,0,100,100),rect(20,20,60,60),rect(40,40,20,20)]));assert.deepEqual(areas(nested),{'0':6400,'0,1':3200,'0,1,2':400});assert.equal(nested.maxDepth,3);
 const ring=modelOverlapRegions(model([rect(0,0,100,20),rect(0,80,100,20),rect(0,20,20,60),rect(80,20,20,60)]));assert.equal(ring.cells.reduce((sum,c)=>sum+c.area,0),6400);assert.equal(ring.maxDepth,1);
});
test('slanted crossings split triangles and preserve original face area totals',()=>{
 const source=model([[[0,0],[100,0],[0,100]],[[0,0],[100,100],[100,0]]]);const result=modelOverlapRegions(source),sums=areas(result);
 assert.equal(sums['0,1'],2500);assert.equal(sums['0'],2500);assert.equal(sums['1'],2500);
 assert.ok(result.cells.every(c=>c.polygon.length>=3&&c.area>0));
});
test('roundoff-equivalent vertical splits meet exactly instead of leaving an omitted slab',()=>{
 const source=model([rect(0,0,100,100),[[40,30],[60,30],[50,20]],[[40,70],[60,70],[50.00000000000001,80]]]);
 const result=modelOverlapRegions(source),splits=[...new Set(result.cells.flatMap(c=>c.polygon.map(p=>p[0])))].sort((a,b)=>a-b);
 assert.equal(result.omittedThinRegions,0);
 assert.equal(splits.filter(x=>Math.abs(x-50)<result.epsilon).length,1);
 assert.equal(result.cells.reduce((sum,c)=>sum+c.area,0),10000);
 for(const id of [1,2])assert.ok(Math.abs(result.cells.filter(c=>c.faces.includes(id)).reduce((sum,c)=>sum+c.area,0)-100)<1e-10);
});
test('concave face, narrow positive area and layer independence do not mutate input',()=>{
 const source=model([[[0,0],[20,0],[20,10],[10,10],[10,20],[0,20]],rect(5,5,.001,10)]),before=structuredClone(source),result=modelOverlapRegions(source);
 assert.ok(Math.abs(result.cells.filter(c=>c.faces.includes(0)).reduce((s,c)=>s+c.area,0)-300)<1e-8);
 assert.ok(Math.abs(result.cells.filter(c=>c.faces.includes(1)).reduce((s,c)=>s+c.area,0)-.01)<1e-8);
 assert.deepEqual(source,before);source.layers={status:'solved',message:'',faceOrder:[1,0],faceOrders:[[1,0,1]]};assert.deepEqual(modelOverlapRegions(source),result);
});
test('invalid geometry is rejected instead of reporting trustworthy regions',()=>{
 for(const change of [(r:FlatFoldResult)=>r.geometry.vertices[0][0]=Infinity,(r:FlatFoldResult)=>r.geometry.faces[0][0]=99,(r:FlatFoldResult)=>r.geometry.status='invalid']){const source=model([rect(0,0,10,10)]);change(source);assert.throws(()=>modelOverlapRegions(source),/模型|索引/);}
});
test('connected slanted arrangement keeps maximal regions instead of vertical fragments',()=>{
 const source=model([[[0,0],[10,0],[8,10],[2,10]],[[0,0],[10,0],[9,5],[1,5]]]);
 const result=modelOverlapRegions(source);assert.equal(result.cells.length,2);
 assert.deepEqual(areas(result),{'0':35,'0,1':45});assert.equal(result.omittedThinRegions,0);
});
test('concave maximal region uses an interior probe and cached arrangement follows geometry edits',()=>{
 const source=model([[[0,0],[10,0],[10,10],[8,10],[8,2],[2,2],[2,10],[0,10]]]);
 const first=modelOverlapRegions(source);assert.equal(first.cells.reduce((sum,c)=>sum+c.area,0),52);assert.ok(first.cells.every(c=>c.polygon.length===3&&c.faces.join(',')==='0'));
 source.layers={status:'solved',message:'',faceOrders:[]};assert.equal(groupFlagstoneFaces(source,first).status,'grouped');
 source.geometry.vertices[0][0]=-2;
 const changed=modelOverlapRegions(source);assert.equal(changed.cells.reduce((sum,c)=>sum+c.area,0),62);
 assert.equal(changed.cells.some(c=>c.polygon.some(p=>p[0]===-2)),true);
});
test('bounds broad phase keeps point and nearest-distance results exact',()=>{
 const boxes=Array.from({length:30},(_,i)=>rect((i*7)%19,(i*11)%23,1+i%5,2+i%3)),bounds=boxes.map(modelPolygonBounds),index=modelBoundsIndex(bounds);
 for(let x=-1;x<25;x+=.75)for(let y=-1;y<29;y+=1.25){
  const point:Point=[x,y],expected=bounds.flatMap((b,i)=>x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY?[i]:[]);
  assert.deepEqual(index.at(point).sort((a,b)=>a-b),expected);
  const distance=(i:number)=>Math.hypot(Math.max(bounds[i].minX-x,0,x-bounds[i].maxX),Math.max(bounds[i].minY-y,0,y-bounds[i].maxY));
  assert.equal(index.nearest(point,10,distance),Math.min(10,...bounds.map((_,i)=>distance(i))));
 }
});
test('editing a returned cell cannot corrupt the shared planar arrangement',()=>{
 const source=model([rect(0,0,10,10)]),first=modelOverlapRegions(source),before=structuredClone(first);
 first.cells[0].polygon[0][0]=123;
 assert.deepEqual(modelOverlapRegions(source),before);assert.equal(source.geometry.vertices[0][0],0);
});
test('different rays through the origin retain their area after translation',()=>{
 for(const [x,y] of [[0,0],[10,10],[200,-300]]){
  const source=model([[[x,y],[x+100,y],[x+100,y+1]]]),before=structuredClone(source);
  assert.deepEqual(areas(modelOverlapRegions(source)),{'0':50});assert.deepEqual(source,before);
 }
});
test('crossings close to a long edge endpoint preserve both face coverage areas',()=>{
 const source=model([rect(0,0,100,100),rect(.00005,-1,1,2)]),result=modelOverlapRegions(source),sums=areas(result);
 for(const [key,expected] of Object.entries({'0':9999,'1':1,'0,1':1}))assert.ok(Math.abs((sums[key]??0)-expected)<1e-9,`${key}: ${sums[key]} != ${expected}`);
 assert.equal(result.maxDepth,2);
});
test('vertical boundaries split constant upper and lower bands when coverage changes',()=>{
 // The later wide rectangle supplies the lower representative edge on both
 // sides of x=50; the first rectangle supplies the upper edge. Only the
 // middle rectangle's vertical boundary reveals the coverage transition.
 const source=model([rect(0,0,100,100),rect(50,0,50,100),rect(-10,0,120,100),rect(200,200,10,10)]);
 assert.deepEqual(areas(modelOverlapRegions(source)),{'0,2':5000,'0,1,2':5000,'2':2000,'3':100});
});
test('a nearby unrelated x event cannot consume a later vertical coverage boundary',()=>{
 const boundary=50+5e-9,source=model([rect(0,0,100,100),rect(boundary,0,100-boundary,100),rect(-10,0,120,100),rect(50,200,10,10)]);
 const result=modelOverlapRegions(source),sums=areas(result);
 // Existing display epsilon can join these abscissae. That permits only a
 // thin-strip area difference, never losing the middle rectangle's coverage.
 for(const [key,expected] of Object.entries({'0,2':boundary*100,'0,1,2':(100-boundary)*100,'2':2000,'3':100}))assert.ok(Math.abs((sums[key]??0)-expected)<=result.epsilon*100*2,`${key}: ${sums[key]} != ${expected}`);
 assert.equal(result.maxDepth,3);
});
test('clustered vertical barriers are checked at their own x on steep bands',()=>{
 const slope=2**19,offset=-(2**18),boundary=.5+2**-16,height=4;
 const slanted=(left:number,right:number):Point[]=>[[left,slope*left+offset],[right,slope*right+offset],[right,slope*right+offset+height],[left,slope*left+offset+height]];
 const source=model([slanted(0,1),slanted(boundary,1),slanted(-.5,1.5),rect(.5,800000,.125,10)]),result=modelOverlapRegions(source),sums=areas(result);
 // Moving an x split within display epsilon is allowed; evaluating a barrier
 // at the wrong x must not erase the entire layer on a steeply slanted band.
 for(const [key,expected] of Object.entries({'0,2':boundary*height,'0,1,2':(1-boundary)*height,'2':4,'3':1.25}))assert.ok(Math.abs((sums[key]??0)-expected)<=result.epsilon*height*2,`${key}: ${sums[key]} != ${expected}`);
 assert.equal(result.maxDepth,3);
});
test('a nearly vertical edge inside one x cluster still separates face coverage',()=>{
 const bottom=50+5e-9,top=50+1e-8,source=model([rect(0,0,100,100),[[bottom,0],[100,0],[100,100],[top,100]],rect(-10,0,120,100),rect(200,200,10,10)]);
 const result=modelOverlapRegions(source),sums=areas(result),middleArea=(100-(bottom+top)/2)*100;
 for(const [key,expected] of Object.entries({'0,2':10000-middleArea,'0,1,2':middleArea,'2':2000,'3':100}))assert.ok(Math.abs((sums[key]??0)-expected)<=result.epsilon*100*2,`${key}: ${sums[key]} != ${expected}`);
 assert.equal(result.maxDepth,3);
});
test('two clustered crossings of a long slanted edge cannot hide a coverage transition',()=>{
 const height=.001,source=model([rect(0,0,100,height),[[49.5,-500000],[100,-500000],[100,500000],[50.5,500000]],rect(200,0,10,1)]);
 const result=modelOverlapRegions(source),sums=areas(result),overlap=50*height-height*height/(2e6);
 for(const [key,expected] of Object.entries({'0':100*height-overlap,'0,1':overlap}))assert.ok(Math.abs((sums[key]??0)-expected)<=result.epsilon*height*2,`${key}: ${sums[key]} != ${expected}`);
 assert.equal(result.maxDepth,2);
});
test('collapsed positive-area paper and hole rings remain explicit precision diagnostics',()=>{
 const thin=rect(5,2,5e-9,6),paper=model([rect(0,0,10,10),thin]),before=structuredClone(paper);
 const paperResult=modelOverlapRegions(paper);assert.ok(paperResult.omittedThinRegions>0);assert.equal(paperResult.cells.filter(c=>c.faces.includes(1)).length,0);assert.deepEqual(paper,before);
 const hole=model([rect(0,0,10,10)]);hole.geometry.vertices.push(...thin);
 hole.geometry.graph={vertices_coords:hole.geometry.vertices,faces_vertices:hole.geometry.faces,faces_holes:[[[4,5,6,7]]]};
 const holeBefore=structuredClone(hole),holeResult=modelOverlapRegions(hole);assert.ok(holeResult.omittedThinRegions>0);assert.deepEqual(hole,holeBefore);
 // A larger resolvable thin face is still represented with its positive area.
 const resolved=modelOverlapRegions(model([rect(0,0,10,10),rect(5,2,1.1e-8,6)]));
 assert.ok(resolved.cells.filter(c=>c.faces.includes(1)).reduce((s,c)=>s+c.area,0)>6e-8);
 const triangle:Point[]=[[20,0],[20+5e-9,5],[20,10]],narrow=modelOverlapRegions(model([rect(0,0,10,10),triangle]));
 assert.ok(narrow.omittedThinRegions>0,'a positive ring wholly inside one x-event cluster must remain diagnostic');
});
test('slab ownership excludes the union of overlapping and nested holes',()=>{
 for(const [holes,expected] of [[[[2,2,4,4],[4,4,4,4]],72],[[[2,2,6,6],[4,4,2,2]],64]] as const){
  const source=model([rect(0,0,10,10)]),rings:number[][]=[];
  for(const [x,y,w,h] of holes){const offset=source.geometry.vertices.length;source.geometry.vertices.push(...rect(x,y,w,h));rings.push([offset,offset+1,offset+2,offset+3]);}
  source.geometry.graph={vertices_coords:source.geometry.vertices,faces_vertices:source.geometry.faces,faces_holes:[rings]};
  const result=modelOverlapRegions(source);assert.equal(result.cells.reduce((sum,c)=>sum+c.area,0),expected);assert.equal(result.omittedThinRegions,0);
 }
});

test('atomic collinear spans cannot silently erase a real slanted thin face or hole',()=>{
 const thin:Point[]=[[20,20],[80,80],[50,50+5e-9]],paper=model([rect(0,0,100,100),thin]),before=structuredClone(paper);
 const collapsed=modelOverlapRegions(paper);assert.ok(collapsed.omittedThinRegions>0);assert.deepEqual(paper,before);
 const hole=model([rect(0,0,100,100)]);hole.geometry.vertices.push(...thin);
 hole.geometry.graph={vertices_coords:hole.geometry.vertices,faces_vertices:hole.geometry.faces,faces_holes:[[[4,5,6]]]};
 assert.ok(modelOverlapRegions(hole).omittedThinRegions>0);
 const resolved=model([rect(0,0,100,100),[[20,20],[80,80],[50,50+1e-6]]]),regions=modelOverlapRegions(resolved);
 assert.ok(regions.cells.filter(cell=>cell.faces.includes(1)).reduce((sum,cell)=>sum+cell.area,0)>2.9e-5);
 assert.equal(regions.omittedThinRegions,0);
});
