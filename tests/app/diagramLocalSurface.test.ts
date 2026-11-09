import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FlatFoldResult,Point} from '../../src/core/types';
import {flatLayerOrder} from '../../src/core/flatLayerOrder';
import {computeFlatFold} from '../../src/core/flatFold';
import type {DiagramPose} from '../../src/app/diagramProject';
import {blankDoc} from '../../src/app/state';
import {defaultModelView} from '../../src/app/modelViewState';
import {diagramPresentation,diagramModelMarkup,drawingSVG} from '../../src/app/diagramDrawing';
import {diagramLocalSurface,diagramLocalSurfaceIssue,diagramLocalSurfaceClips,type DiagramLocalSurfaceClips} from '../../src/app/diagramLocalSurface';
import {modelProjection} from '../../src/app/modelProjection';
import {modelRegionBoundaries} from '../../src/app/modelRegionBoundaries';
import {XMLValidator} from 'fast-xml-parser';

/** Three strips overlap in pairs around a triangle, without a triple overlap.
 * The true local cycle cannot be flattened to an invented whole-face order. */
function cyclicPose():DiagramPose {
  const polygons:Point[][]=[[[0,0],[10,0],[10,2],[0,2]],[[8,0],[10,0],[10,10],[8,10]],[[0,2],[8,10],[10,10],[10,8],[2,0],[0,0]]];
  const vertices:Point[]=[],faces=polygons.map(polygon=>polygon.map(p=>vertices.push(p)-1));
  const result:FlatFoldResult={geometry:{status:'ready',message:'pairwise cycle',vertices,faces},layers:{status:'solved',message:'local',faceOrders:[[0,1,-1],[1,2,1],[2,0,-1]]},warnings:[]};
  assert.deepEqual(flatLayerOrder(vertices,faces,result.layers.faceOrders!),[]);
  return {sourceStateId:'cp',sourceRevision:0,sourceDoc:blankDoc('局部层序',100,100),result,view:{...defaultModelView(),colors:{front:'#123456',back:'#fedcba',line:'#334455'}}};
}
function actualPose():DiagramPose {
  const sourceDoc=blankDoc('单次对折',100,100);sourceDoc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const result=computeFlatFold(sourceDoc);assert.equal(result.layers.status,'solved');delete result.layers.faceOrder;
  return {sourceStateId:'cp',sourceRevision:0,sourceDoc,result,view:defaultModelView()};
}
const at=(data:NonNullable<ReturnType<typeof diagramLocalSurface>>,faces:number[])=>data.regions.filter(region=>region.faces.length===faces.length&&faces.every(face=>region.faces.includes(face)));

test('saved reflection centers move local paint and ink clips together without reusing the old-center cache',()=>{
  const pose=actualPose(),view={...defaultModelView(),side:'back' as const,projectionCenter:[50,50] as Point};
  const shifted={...view,projectionCenter:[70,50] as Point},first=diagramLocalSurfaceClips(pose,view)!,second=diagramLocalSurfaceClips(pose,shifted)!;
  assert.ok(first&&second);assert.notEqual(first,second);assert.equal(diagramLocalSurfaceClips(pose,view),first);
  const data=diagramLocalSurface(pose,'back')!;
  for(const region of data.regions){
    if(region.layers.status!=='ordered')continue;
    const n=region.polygon.length,raw:Point=[region.polygon.reduce((s,p)=>s+p[0],0)/n,region.polygon.reduce((s,p)=>s+p[1],0)/n];
    const a=modelProjection(pose.result.geometry.vertices,true,0,view.projectionCenter).project(raw),b=modelProjection(pose.result.geometry.vertices,true,0,shifted.projectionCenter).project(raw);
    assert.equal(b[0]-a[0],40);assert.equal(b[1],a[1]);
    const face=region.layers.topToBottom[0];assert.ok(clippedIn(first,face,a));assert.ok(clippedIn(second,face,b));
  }
  const a=diagramModelMarkup(pose,view),b=diagramModelMarkup(pose,shifted);
  assert.notEqual(a,b);assert.match(a,/<g transform="translate\(/);assert.equal(diagramModelMarkup(pose,view),a);
});
function clippedIn(clips:DiagramLocalSurfaceClips,face:number,point:Point):boolean {
  const id=clips.clipForFace(face).slice(5,-1),path=clips.definitions.match(new RegExp(`<clipPath id="${id}"[^>]*><path d="([^"]*)"`))?.[1];assert.notEqual(path,undefined);
  let winding=0;
  for(const match of path!.matchAll(/M([^Z]+)Z/g)){
    const ring=match[1].split('L').map(pair=>pair.split(',').map(Number));
    for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],cross=(b[0]-a[0])*(point[1]-a[1])-(point[0]-a[0])*(b[1]-a[1]);if(a[1]<=point[1]&&b[1]>point[1]&&cross>0)winding++;if(a[1]>point[1]&&b[1]<=point[1]&&cross<0)winding--;}
  }
  return winding!==0;
}

test('globally cyclic solved faces paint exact opaque local surfaces without fabricating a global rank',()=>{
  const pose=cyclicPose(),before=structuredClone(pose),data=diagramLocalSurface(pose)!;
  assert.ok(data);assert.ok(data.regions.length>3);assert.ok(data.regions.every(region=>region.layers.status==='ordered'));
  for(const [faces,top] of [[[0,1],1],[[1,2],2],[[0,2],0]] as [number[],number][]){
    const regions=at(data,faces);assert.ok(regions.length);for(const region of regions)assert.equal(region.layers.status==='ordered'?region.layers.topToBottom[0]:null,top);
  }
  const markup=diagramModelMarkup(pose),svg=drawingSVG(pose,[],'区域遮挡','');
  assert.match(markup,/data-model-region-surface="true"/);assert.match(markup,/data-region-status="ordered"/);
  assert.match(markup,/fill="#123456"/);assert.match(markup,/fill="#fedcba"/);assert.doesNotMatch(markup,/fill-opacity="0\.09"|data-diagram-paper-face=/);
  assert.equal(XMLValidator.validate(svg),true);assert.match(svg,/data-model-region-surface="true"/);
  assert.equal(diagramPresentation(pose).solid,false,'global rank consumers must retain the original contract');
  assert.deepEqual(pose,before);assert.equal(diagramLocalSurface(pose),data,'hover and camera updates reuse the exact region analysis');
  assert.equal(diagramLocalSurface({...pose,view:{...pose.view!,rotation:45}}),data);
});

test('the back view reverses each actual local stack and material side',()=>{
  const pose=cyclicPose(),front=diagramLocalSurface(pose,'front')!,back=diagramLocalSurface(pose,'back')!;
  assert.equal(front.regions.length,back.regions.length);
  for(let i=0;i<front.regions.length;i++){
    const a=front.regions[i].layers,b=back.regions[i].layers;assert.equal(a.status,'ordered');assert.equal(b.status,'ordered');
    if(a.status==='ordered'&&b.status==='ordered')assert.deepEqual(b.topToBottom,[...a.topToBottom].reverse());
  }
  assert.notEqual(diagramModelMarkup(pose),diagramModelMarkup(pose,{...pose.view!,side:'back'}));
});

test('hiding the top layer exposes the next actual face and removes hidden outlines and coverage',()=>{
  const pose=cyclicPose(),hidden={...pose,hiddenFaces:[1]},data=diagramLocalSurface(hidden)!;
  assert.ok(data.regions.every(region=>!region.faces.includes(1)));
  const original=diagramLocalSurface(pose)!;
  for(const region of at(original,[0,1])){
    const shown=data.regions.find(other=>JSON.stringify(other.polygon)===JSON.stringify(region.polygon));assert.ok(shown);
    assert.deepEqual(shown.layers,{status:'ordered',topToBottom:[0]});
  }
  assert.equal(data.boundaries?.ambiguousEdges,0);
  assert.ok(data.boundaries!.edges.every(edge=>[edge.a,edge.b].every(point=>!(point[0]===8&&point[1]>2&&point[1]<6))),'hidden vertical strip must not contribute ghost boundaries');
  const allHidden=diagramLocalSurface({...pose,hiddenFaces:[0,1,2]})!;
  assert.deepEqual(allHidden.regions,[]);assert.deepEqual(allHidden.boundaries,{edges:[],ambiguousEdges:0});
  assert.doesNotMatch(diagramModelMarkup({...pose,hiddenFaces:[0,1,2]}),/data-region-fill|data-region-boundary/);
  assert.equal(diagramLocalSurface({...pose,hiddenFaces:[1,1]}),data,'equivalent hidden sets share cached regions');
});

test('X-ray, unknown layers, global and manual orders retain their established paint contracts',()=>{
  const pose=actualPose(),unknown={...pose,result:{...pose.result,layers:{status:'unknown' as const,message:'尚未分析'}}};
  assert.match(diagramModelMarkup(pose),/data-model-region-surface/);
  for(const current of [unknown,{...pose,view:{...pose.view!,xray:true}}]){
    const markup=diagramModelMarkup(current);assert.doesNotMatch(markup,/data-model-region-surface/);assert.match(markup,/fill-opacity="0\.09"/);
  }
  const order=pose.result.geometry.faces.map((_,i)=>i),global={...pose,result:{...pose.result,layers:{...pose.result.layers,faceOrder:order}}},manual={...pose,displayOrder:order};
  for(const current of [global,manual]){assert.equal(diagramLocalSurface(current),null);assert.doesNotMatch(diagramModelMarkup(current),/data-model-region-surface/);assert.match(diagramModelMarkup(current),/fill-opacity="1"/);}
});

test('uncertain and conflicting local regions keep diagnostic patterns instead of claiming opaque valid paper',()=>{
  for(const status of ['unconfirmed','conflict'] as const){
    const pose=actualPose();pose.result.layers.faceOrders=status==='unconfirmed'?[]:[[0,1,1],[0,1,-1]];
    const data=diagramLocalSurface(pose)!;assert.ok(data.regions.some(region=>region.layers.status===status));
    const markup=diagramModelMarkup(pose);assert.match(markup,new RegExp(`data-region-status="${status}"`));assert.match(markup,new RegExp(`fill="url\\(#model-region-${status==='conflict'?'conflict':'unknown'}\\)"`));
    assert.equal(pose.result.layers.faceOrder,undefined);
  }
});

test('cutaway and deforming material keep the existing per-face fallback',()=>{
  const pose=actualPose();
  const window={id:'window',kind:'symbol' as const,symbol:'tearWindow' as const,position:[75,50] as Point,size:20,rotation:0,color:'#222222',width:1,cutawayFaces:[0]};
  const markup=diagramModelMarkup(pose,undefined,false,[window]);assert.doesNotMatch(markup,/data-model-region-surface/);assert.match(markup,/data-diagram-cutaway-clipped/);assert.match(markup,/fill-opacity="0\.09"/);
  const deformed={...pose,paperDeformation:{nodes:[{}]}} as DiagramPose;assert.equal(diagramLocalSurface(deformed),null);
});

test('malformed or excessive local analysis is cached as an explicit fallback without mutating the result',()=>{
  const pose=actualPose();pose.result.layers.faceOrders=[[0,999,-1]];const before=structuredClone(pose);
  assert.equal(diagramLocalSurface(pose),null);assert.match(diagramLocalSurfaceIssue(pose)!,/关系无效/);assert.equal(diagramLocalSurface(pose),null);assert.deepEqual(pose,before);
  const large=actualPose();large.result.geometry.faces=Array.from({length:513},()=>[0,1,2]);
  assert.equal(diagramLocalSurface(large),null);assert.match(diagramLocalSurfaceIssue(large)!,/预算/);
});

test('the optional visible-face boundary filter validates IDs and accepts an empty visible set',()=>{
  const pose=actualPose(),data=diagramLocalSurface(pose)!;
  assert.deepEqual(modelRegionBoundaries(pose.result,[],new Set()),{edges:[],ambiguousEdges:0});
  assert.throws(()=>modelRegionBoundaries(pose.result,data.regions,new Set([99])),/编号无效/);
});

test('linked F crease previews replace only their real material joints and keep exterior contours',()=>{
  const sourceDoc=blankDoc('已有折痕',100,100);sourceDoc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'V',angle:180},{id:'old',a:[0,40],b:[100,40],assignment:'F',angle:0});
  const result=computeFlatFold(sourceDoc);assert.equal(result.layers.status,'solved');delete result.layers.faceOrder;
  const pose:DiagramPose={sourceStateId:'cp',sourceRevision:0,sourceDoc,result,view:defaultModelView()},data=diagramLocalSurface(pose)!;
  assert.ok(data.regions.every(region=>region.layers.status==='ordered'));
  const raw=diagramModelMarkup(pose),filtered=diagramModelMarkup(pose,undefined,true),lines=(markup:string)=>[...markup.matchAll(/<line data-region-boundary="true"[^>]+>/g)].map(match=>match[0]);
  const atCrease=(line:string)=>['y1','y2'].every(key=>Math.abs(Number(line.match(new RegExp(`${key}="([^"]+)"`))?.[1])-40)<1e-7);
  assert.ok(lines(raw).some(atCrease));assert.ok(!lines(filtered).some(atCrease));
  assert.ok(lines(filtered).some(line=>line.includes('y1="0"')&&line.includes('y2="0"')),'exterior paper edge survives');
  const preview=[{face:0,a:[50,40] as Point,b:[100,40] as Point,assignment:'F' as const,style:'crease' as const,visibility:'visible' as const,existing:true}];
  const svg=drawingSVG(pose,[],'','',preview);assert.match(svg,/<g opacity="0\.55"><line/);assert.match(svg,/data-model-region-surface/);
});

test('post-paper crease ink is clipped to the true local top face, including partial strokes and hidden-top reveal',()=>{
  const pose=cyclicPose(),before=structuredClone(pose),clips=diagramLocalSurfaceClips(pose,pose.view!)!;
  assert.ok(clips);
  for(const [point,top,buried] of [[[9,1],1,0],[[9,9],2,1],[[1,1],0,2]] as [Point,number,number][]){assert.equal(clippedIn(clips,top,point),true);assert.equal(clippedIn(clips,buried,point),false);}
  assert.equal(clippedIn(clips,0,[7,1]),true);assert.equal(clippedIn(clips,0,[9,1]),false,'one original crease can be only partially visible');
  const revealed=diagramLocalSurfaceClips({...pose,hiddenFaces:[1]},pose.view!)!;assert.equal(clippedIn(revealed,0,[9,1]),true);
  assert.equal(diagramLocalSurfaceClips(pose,pose.view!),clips,'hover and camera changes reuse the actual ink coverage');assert.deepEqual(pose,before);
  const span={length:100,offset:7},preview=[{face:0,a:[0,1] as Point,b:[10,1] as Point,assignment:'F' as const,style:'crease' as const,visibility:'hidden' as const,existing:true,strokeSpan:span}];
  const svg=drawingSVG(pose,[],'','',preview);assert.equal(XMLValidator.validate(svg),true);assert.match(svg,new RegExp(`data-diagram-local-ink-face="0" clip-path="${clips.clipForFace(0).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`));assert.deepEqual(preview[0].strokeSpan,span);
});

test('back-side local crease clips exchange exposed material while diagnostic cells and X-ray keep their contracts',()=>{
  const pose=cyclicPose(),view={...pose.view!,side:'back' as const,rotation:22.5},clips=diagramLocalSurfaceClips(pose,view)!,projection=modelProjection(pose.result.geometry.vertices,true,22.5);
  assert.equal(clippedIn(clips,0,projection.project([9,1])),true);assert.equal(clippedIn(clips,1,projection.project([9,1])),false);
  assert.equal(diagramLocalSurfaceClips(pose,{...view,xray:true}),null);
  const uncertain=actualPose();uncertain.result.layers.faceOrders=[];const diagnostic=diagramLocalSurfaceClips(uncertain,uncertain.view!)!;
  for(let face=0;face<uncertain.result.geometry.faces.length;face++)assert.equal(clippedIn(diagnostic,face,[25,50]),true,'an unconfirmed region must not pretend one face is the visible top');
  const unknown={...uncertain,result:{...uncertain.result,layers:{status:'unknown' as const,message:'未确认'}}};assert.equal(diagramLocalSurfaceClips(unknown,unknown.view!),null);
});
