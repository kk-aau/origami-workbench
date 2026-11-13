import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Doc,Point,Segment} from '../../src/core/types';
import {blankDoc} from '../../src/app/state';
import {paperPath} from '../../src/app/paper';
import {pointBounds} from '../../src/core/pointBounds';
import {buildFold} from '../../src/core/geometry';
import {computeFlatFold} from '../../src/core/flatFold';
import {prepareEditorCommit} from '../../src/app/editorCommit';
import {createPaperShape,paperShapeDoc,paperShapeFromDoc,preparePaperShapeChange,validatePaperShape,type PaperShape} from '../../src/app/paperShapes';

const edges=(points:Point[],prefix='edge'):Segment[]=>points.map((a,i)=>({id:`${prefix}-${i}`,a:[...a],b:[...points[(i+1)%points.length]],assignment:'B',angle:0}));
const shape=(outer:Point[],holes:Point[][]=[]):PaperShape=>{
 const boundary=[...edges(outer),...holes.flatMap((loop,i)=>edges(loop,`hole-${i}`))],bounds=pointBounds(boundary.flatMap(edge=>[edge.a,edge.b]));
 return validatePaperShape({paper:{width:bounds.maxX-bounds.minX,height:bounds.maxY-bounds.minY},boundary:boundary.map(({a,b})=>({a,b}))});
};
const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M',angle:number|null=-90):Segment=>({id,a,b,assignment,angle});
const drawing=(segments:Segment[],width=100,height=100):Doc=>({...blankDoc('原折痕',width,height),segments:[...edges([[0,0],[width,0],[width,height],[0,height]],'boundary'),...segments]});
const coords=(segments:Segment[])=>segments.map(({a,b})=>({a,b}));
const ordinary=(doc:Doc)=>doc.segments.filter(s=>s.assignment!=='B');

test('built-in paper shapes preserve proportions and equal regular sides at a common longest side',()=>{
 assert.deepEqual(createPaperShape('rectangle',[100,200]),createPaperShape('rectangle',[1,2]));
 assert.deepEqual(createPaperShape('rectangle',[1,2]).paper,{width:150,height:300});
 assert.deepEqual(createPaperShape('rectangle',[2,1],6,200).paper,{width:200,height:100});
 for(const [kind,count] of [['square',4],['triangle',3],['regular',7]] as const){
  const value=createPaperShape(kind,[1,1],7,300),before=structuredClone(value),doc=paperShapeDoc(value,'纸形预览');
  assert.equal(value.boundary.length,count);assert.equal(Math.max(value.paper.width,value.paper.height),300);assert.equal(doc.segments.length,count);assert.ok(doc.segments.every(edge=>edge.assignment==='B'&&edge.angle===0));assert.deepEqual(doc.objects,[]);assert.ok(paperPath(doc));
  const lengths=value.boundary.map(({a,b})=>Math.hypot(a[0]-b[0],a[1]-b[1]));assert.ok(lengths.every(n=>Math.abs(n-lengths[0])<1e-9));assert.deepEqual(value,before);
 }
 for(const value of [0,-1,NaN,Infinity])assert.throws(()=>createPaperShape('rectangle',[1,value]),/比例/);
 for(const sides of [2,65,3.5,NaN])assert.throws(()=>createPaperShape('regular',[1,1],sides),/边数/);
 assert.throws(()=>createPaperShape('invalid' as never),/形状/);assert.throws(()=>createPaperShape('square',[1,1],6,0),/长边/);
});

test('saving a real paper copies only its boundary, normalises negative coordinates and preserves holes',()=>{
 const source=drawing([segment('crease',[-45,-50],[-5,-50])]);source.paper={width:800,height:600};
 source.segments=[...edges([[-50,-100],[50,-100],[50,100],[-50,100]],'outer'),...edges([[-20,-30],[0,-30],[0,30],[-20,30]],'hole'),segment('crease',[-45,-50],[-5,-50]),segment('art',[1000,1000],[2000,2000],'A',0)];
 source.metadata={author:'原作者'};source.objects=[{id:'text',kind:'text',position:[900,900],fontSize:12,text:'不带入模板',color:'#123456'}];const before=structuredClone(source),value=paperShapeFromDoc(source);
 assert.deepEqual(source,before);assert.deepEqual(value.paper,{width:100,height:200});assert.equal(value.boundary.length,8);assert.deepEqual(value.boundary[0],{a:[0,0],b:[100,0]});assert.deepEqual(Object.keys(value).sort(),['boundary','paper']);
 const preview=paperShapeDoc(value);assert.equal((paperPath(preview).match(/Z/g)??[]).length,2);assert.equal(preview.metadata,undefined);assert.deepEqual(preview.objects,[]);
 value.boundary[0].a[0]=40;assert.deepEqual(source,before);
});

test('paper validation rejects missing, open, branched, crossing, overlapping and degenerate contours',()=>{
 const square=edges([[0,0],[100,0],[100,100],[0,100]]).map(({a,b})=>({a,b}));
 const invalid=[[],square.slice(0,3),[...square,square[0]],edges([[0,0],[100,100],[0,100],[100,0]]).map(({a,b})=>({a,b})),edges([[0,0],[50,0],[100,0]]).map(({a,b})=>({a,b})),edges([[0,0],[100,0],[50,0],[100,100],[0,100]]).map(({a,b})=>({a,b})),[...square,{a:[0,0],b:[50,50]}]];
 for(const boundary of invalid)assert.throws(()=>validatePaperShape({paper:{width:100,height:100},boundary}),/纸形/);
 const almost=structuredClone(square);almost[3].b=[0,1e-10];assert.throws(()=>validatePaperShape({paper:{width:100,height:100},boundary:almost}),/闭合/);
 const intersecting=shape([[0,0],[100,0],[100,100],[0,100]]);intersecting.boundary.push(...edges([[90,90],[110,90],[110,110],[90,110]]).map(({a,b})=>({a,b})));assert.throws(()=>validatePaperShape(intersecting),/自交/);
 assert.throws(()=>validatePaperShape({paper:{width:50,height:100},boundary:square}),/宽高/);
 assert.throws(()=>validatePaperShape({paper:{width:100,height:100},boundary:[{a:[NaN,0],b:[100,0]}]}),/坐标/);
 assert.throws(()=>validatePaperShape({...createPaperShape('square'),metadata:{}}),/数据/);
 const source=drawing([]);source.segments=[];assert.throws(()=>paperShapeFromDoc(source),/边界/);
});

test('changing shape clips crossing creases, counts removed edges and keeps inside IDs and annotations',()=>{
 const source=drawing([segment('inside',[10,50],[90,50]),segment('crossing',[50,-25],[50,125],'V',123),segment('outside',[10,10],[90,10]),segment('on-new-boundary',[0,25],[100,25],'F',0)]);
 source.objects=[{id:'circle',kind:'circle',center:[-10,-10],radius:7,color:'#123456'}];source.metadata={author:'保留'};source.flatFold={startingFace:[[0,0],[100,0],[100,100],[0,100]]};
 const before=structuredClone(source),template=createPaperShape('rectangle',[2,1]),templateBefore=structuredClone(template),result=preparePaperShapeChange(source,template),kept=ordinary(result.doc);
 assert.equal(result.clipped,1);assert.equal(result.removed,2);assert.deepEqual(result.doc.paper,{width:100,height:50});assert.deepEqual(result.doc.segments.filter(s=>s.assignment==='B').map(s=>s.a),[[0,25],[100,25],[100,75],[0,75]]);
 assert.deepEqual(kept[0],source.segments[4]);assert.equal(kept[1].assignment,'V');assert.equal(kept[1].angle,123);assert.equal(kept[1].id,'crossing::paper:1');assert.deepEqual(coords(kept.slice(1)),[{a:[50,25],b:[50,75]}]);
 assert.deepEqual(result.doc.objects,source.objects);assert.notEqual(result.doc.objects,source.objects);assert.deepEqual(result.doc.metadata,source.metadata);assert.equal(result.doc.flatFold,undefined);assert.deepEqual(source,before);assert.deepEqual(template,templateBefore);
});

test('hole crossings split into stable independent pieces and never bridge the hole or overlap its boundary',()=>{
 const template=shape([[0,0],[100,0],[100,100],[0,100]],[[[40,40],[60,40],[60,60],[40,60]]]),source=drawing([segment('cross',[0,50],[100,50],'U',null),segment('edge',[0,40],[100,40],'A',0),segment('hole',[45,50],[55,50])]);
 source.objects=[{id:'cross::paper:1',kind:'text',position:[10,10],text:'已有ID',fontSize:4,color:'#123456'}];const first=preparePaperShapeChange(source,template),second=preparePaperShapeChange(source,template),kept=ordinary(first.doc);
 assert.equal(first.clipped,2);assert.equal(first.removed,1);assert.deepEqual(first,second);assert.equal(kept.length,4);assert.equal(kept[0].id,'cross::paper:1:2');assert.equal(kept[1].id,'cross::paper:2');assert.ok(kept.slice(0,2).every(s=>s.assignment==='U'&&s.angle===null));
 assert.deepEqual(coords(kept),[{a:[0,50],b:[40,50]},{a:[60,50],b:[100,50]},{a:[0,40],b:[40,40]},{a:[60,40],b:[100,40]}]);assert.equal(new Set(first.doc.segments.map(s=>s.id)).size,first.doc.segments.length);
});

test('concave paper can retain two separated pieces of one line and clips at notch vertices',()=>{
 const template=shape([[0,0],[100,0],[100,40],[40,40],[40,100],[0,100]]),source=drawing([segment('wide',[-20,20],[120,20]),segment('narrow',[-20,60],[120,60]),segment('diagonal',[10,10],[90,90]),segment('two',[80,20],[20,80])]);
 const result=preparePaperShapeChange(source,template),kept=ordinary(result.doc);assert.equal(result.clipped,4);assert.equal(result.removed,0);
 const expected=[{a:[0,20],b:[100,20]},{a:[0,60],b:[40,60]},{a:[10,10],b:[40,40]},{a:[80,20],b:[60,40]},{a:[40,60],b:[20,80]}];
 assert.equal(kept.length,expected.length);kept.forEach((s,i)=>{assert.ok(Math.hypot(s.a[0]-expected[i].a[0],s.a[1]-expected[i].a[1])<1e-10);assert.ok(Math.hypot(s.b[0]-expected[i].b[0],s.b[1]-expected[i].b[1])<1e-10);});
});

test('a tangent hole vertex does not unnecessarily split an entirely retained crease',()=>{
 const template=shape([[0,0],[100,0],[100,100],[0,100]],[[[40,40],[60,40],[60,60],[40,60]]]),source=drawing([segment('tangent',[0,80],[80,0])]);
 const result=preparePaperShapeChange(source,template);assert.equal(result.clipped,0);assert.equal(result.removed,0);assert.deepEqual(ordinary(result.doc),[source.segments[4]]);
});

test('same contour preserves the original document and subdivided boundary identities without an undo change',()=>{
 const source=drawing([segment('retained',[10,30],[90,30])]);source.segments=[...edges([[0,0],[50,0],[100,0],[100,100],[0,100]],'split'),...ordinary(source)];
 source.segments=source.segments.reverse().map(s=>({...s,a:[...s.b],b:[...s.a]}));const before=structuredClone(source),result=preparePaperShapeChange(source,createPaperShape('square'));
 assert.equal(result.doc,source);assert.equal(result.clipped,0);assert.equal(result.removed,0);assert.deepEqual(source,before);
});

test('negative imported paper stays centered in its world frame, including same-shape no-ops',()=>{
 const source=drawing([segment('inside',[10,100],[90,100]),segment('cross',[50,0],[50,200],'V',180)],100,200);
 for(const s of source.segments)for(const p of [s.a,s.b]){p[0]-=500;p[1]-=300;}
 const before=structuredClone(source),sameShape=preparePaperShapeChange(source,paperShapeFromDoc(source));assert.equal(sameShape.doc,source);
 const changed=preparePaperShapeChange(source,createPaperShape('rectangle',[2,1]));assert.deepEqual(changed.doc.paper,{width:200,height:100});
 assert.deepEqual(changed.doc.segments.filter(s=>s.assignment==='B').map(s=>s.a),[[-550,-250],[-350,-250],[-350,-150],[-550,-150]]);
 assert.deepEqual(ordinary(changed.doc),[source.segments[4],{...source.segments[5],id:'cross::paper:1',a:[-450,-250],b:[-450,-150]}]);assert.equal(changed.clipped,1);assert.equal(changed.removed,0);assert.deepEqual(source,before);
});

test('a new real boundary can repair a plain document with no boundary without changing the frame center',()=>{
 const source=drawing([segment('inside',[40,40],[60,40])]);source.segments=ordinary(source);const result=preparePaperShapeChange(source,createPaperShape('triangle'));
 const bounds=pointBounds(result.doc.segments.filter(s=>s.assignment==='B').flatMap(s=>[s.a,s.b]));assert.ok(Math.abs((bounds.minX+bounds.maxX)/2-50)<1e-10);assert.ok(Math.abs((bounds.minY+bounds.maxY)/2-50)<1e-10);assert.ok(paperPath(result.doc));
});

test('material identity and native curve designs cannot be flattened into ordinary paper templates or changes',()=>{
 for(const metadata of [{materialTopology:null},{materialCurveModel:{}},{materialCurveConstruction:{}},{curveDesign:{}}]){
  const source=drawing([]);source.metadata=metadata;const before=structuredClone(source);assert.throws(()=>paperShapeFromDoc(source),/材料|曲面/);assert.throws(()=>preparePaperShapeChange(source,createPaperShape('square')),/材料|曲面/);assert.deepEqual(source,before);
 }
});

test('clipped rectangle and hole fragments survive the real editor commit and build complete calculable paper',()=>{
 const cases=[
  {source:drawing([segment('horizontal',[-20,50],[120,50],'M',-180),segment('vertical',[50,-20],[50,120],'F',0)]),shape:createPaperShape('rectangle',[2,1]),minimumFaces:4},
  {source:drawing([segment('through-hole',[-20,50],[120,50],'F',0)]),shape:shape([[0,0],[100,0],[100,100],[0,100]],[[[40,40],[60,40],[60,60],[40,60]]]),minimumFaces:2},
 ];
 for(const item of cases){
  const before=structuredClone(item.source),proposal=preparePaperShapeChange(item.source,item.shape),committed=prepareEditorCommit(item.source,proposal.doc),built=buildFold(committed.doc),result=computeFlatFold(committed.doc);
  assert.ok((built.graph.faces_vertices?.length??0)>=item.minimumFaces,'split boundary intersections form complete faces');assert.equal(result.geometry.status,'ready',result.geometry.message);assert.equal(result.layers.status,'solved',result.layers.message);assert.ok(paperPath(committed.doc));assert.deepEqual(item.source,before);
  for(const edge of committed.doc.segments.filter(s=>s.assignment!=='B'))assert.ok(built.graph.edges_vertices.some(([a,b],i)=>built.graph.edges_assignment[i]===edge.assignment&&((samePoint(built.graph.vertices_coords[a],edge.a)&&samePoint(built.graph.vertices_coords[b],edge.b))||(samePoint(built.graph.vertices_coords[a],edge.b)&&samePoint(built.graph.vertices_coords[b],edge.a)))));
 }
});
const samePoint=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-10;
