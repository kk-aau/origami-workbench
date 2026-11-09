import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import type {DiagramAnnotation,DiagramLineAnnotation,DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {
  snapDiagramPoint,snapDiagramSymbolPoint,snapDiagramSymbolAxisPoint,snapDiagramSymbolRotationPoint,intersectDiagramLines,diagramLineIntersections,diagramNearbyLineIntersections,diagramGridLineIntersections,constructDiagramLine,bisectDiagramLines,trimDiagramLine,extendDiagramLine,
  transformDiagramAnnotations,copyDiagramAnnotations,diagramAnnotationsInBox,diagramEraseHits,diagramVisibleRect,snapDiagramTranslation,diagramMoveSnapTargets,
  pointHitsDiagramAnnotation,pickDiagramAnnotation,
} from '../../src/app/diagramDrawingTools';
import {symbolNativeGrips,symbolNativeBaseline} from '../../src/app/diagramAnnotationSVG';
import {buildCadSymbolGeometry} from '../../src/app/diagramCadSymbolGeometry';

const line=(id:string,a:Point,b:Point):DiagramLineAnnotation=>({id,kind:'line',a,b,color:'#333333',style:'valley',width:.4});
const symbol=():DiagramSymbolAnnotation=>({id:'arrow',kind:'symbol',symbol:'fold',position:[20,30],size:50,rotation:37,color:'#41634e',width:.4,params:{length:100,curve:15},text:'A'});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);

test('rotation grips snap to actual reference points, finite edges and grid points without changing their center',()=>{
  const options={enabled:true,radius:1,targets:[[10,10] as Point],gridSpacing:5};
  assert.deepEqual(snapDiagramSymbolRotationPoint([10.2,9.8],[0,0],-45,options),[10,10]);
  assert.deepEqual(snapDiagramSymbolRotationPoint([11,7.3],[0,0],0,{...options,targets:[],lines:[line('edge',[8,7],[16,7])]}),[11,7]);
  assert.deepEqual(snapDiagramSymbolRotationPoint([20.2,15.3],[0,0],0,{...options,targets:[]}),[20,15]);
  assert.deepEqual(snapDiagramSymbolRotationPoint([22,7.3],[0,0],0,{...options,targets:[],gridSpacing:undefined,lines:[line('edge',[8,7],[16,7])]}),[22,7.3]);
  assert.deepEqual(snapDiagramSymbolRotationPoint([10.2,9.8],[0,0],-45,{...options,enabled:false}),[10.2,9.8]);
});

test('rotation grip snapping with Shift keeps the actual baseline on fifteen-degree increments',()=>{
  const options={enabled:true,radius:2,targets:[[10,10] as Point,[10,11] as Point],constrain:true};
  const snapped=snapDiagramSymbolRotationPoint([9.8,10.2],[0,0],-38,options);
  close(snapped[0],10);close(snapped[1],10);
  close(Math.atan2(snapped[1],snapped[0])*180/Math.PI-90,-45);
  const free=snapDiagramSymbolRotationPoint([8,12],[0,0],123,{...options,enabled:false});
  close((Math.atan2(free[1],free[0])*180/Math.PI-90)/15,Math.round((Math.atan2(free[1],free[0])*180/Math.PI-90)/15));
});

test('rotation point snapping never collapses a grip onto the rotation center or reverses its constrained ray',()=>{
  assert.deepEqual(snapDiagramSymbolRotationPoint([.2,.2],[0,0],0,{enabled:true,radius:1,targets:[[0,0]],gridSpacing:5}),[.2,.2]);
  const actual=snapDiagramSymbolRotationPoint([.2,.2],[0,0],-45,{enabled:true,radius:1,targets:[[0,0],[-.1,-.1]],gridSpacing:5,constrain:true});
  assert.ok(actual[0]>0&&actual[1]>0);
  assert.deepEqual(snapDiagramSymbolRotationPoint([0,0],[0,0],0,{enabled:true,radius:1,targets:[[1,1]],constrain:true}),[0,0]);
});

test('snapping uses the nearest point to the pointer rather than chaining through targets',()=>{
  assert.deepEqual(snapDiagramPoint([0,0],{enabled:true,radius:10,targets:[[9,0],[15,0]]}),[9,0]);
  assert.deepEqual(snapDiagramPoint([0,0],{enabled:true,radius:10,targets:[[15,0],[9,0]]}),[9,0]);
  assert.deepEqual(snapDiagramPoint([9.6,10.2],{enabled:true,radius:2,targets:[],gridSpacing:5}),[10,10]);
  assert.deepEqual(snapDiagramPoint([9.6,10.2],{enabled:false,radius:10,targets:[[10,10]],gridSpacing:5}),[9.6,10.2]);
});

test('real off-grid vertices win over closer grid nodes for point picks and group moves',()=>{
 const options={enabled:true,radius:2,targets:[[9.2,9.4] as Point],gridSpacing:10};
 assert.deepEqual(snapDiagramPoint([10,10],options),[9.2,9.4]);
 assert.deepEqual(snapDiagramTranslation([0,0],[10,10],options),[9.2,9.4]);
});

test('all finite intersections remain available to point picks and symbol moves after 120 references',()=>{
 const references=[...Array.from({length:200},(_,i)=>line('far-'+i,[1000+i,1000],[1000+i,1100])),line('h',[0,20],[40,20]),line('v',[20,0],[20,40])];
 const intersections=diagramLineIntersections(references);assert.deepEqual(intersections,[[20,20]]);
 const targets=diagramMoveSnapTargets([],[],[],references);
 assert.deepEqual(snapDiagramSymbolPoint([21,20.4],{enabled:true,radius:2,targets}),[20,20]);
});

test('duplicate multi-line crossings yield one snap target without mutating reference geometry',()=>{
 const references=[line('h',[-10,0],[10,0]),line('v',[0,-10],[0,10]),line('d',[-10,-10],[10,10])],before=structuredClone(references);
 assert.deepEqual(diagramLineIntersections(references),[[0,0]]);assert.deepEqual(references,before);
});

test('large grid queries return only local real intersections without a source-order cutoff',()=>{
 const references=Array.from({length:2000},(_,i)=>i<1000?line('v'+i,[i,0],[i,1000]):line('h'+i,[0,i-1000],[1000,i-1000]));
 const points=diagramNearbyLineIntersections([800.1,800.1],references,1);
 assert.ok(points.some(point=>Math.hypot(point[0]-800,point[1]-800)<1e-8));assert.ok(points.length<10);
 const intersections=diagramGridLineIntersections([40.3,17.9],[line('sloped',[0,3],[100,40])],5,1);
 assert.ok(intersections.some(point=>Math.hypot(point[0]-40,point[1]-17.8)<1e-8));
});
test('direction constraint survives snapping, including grid points and reversed rays',()=>{
  const result=snapDiagramPoint([8,1],{enabled:true,radius:4,targets:[[9,2],[7,0]],anchor:[0,0],constrain:true});
  assert.deepEqual(result,[7,0]);
  const negative=snapDiagramPoint([-2,.01],{enabled:true,radius:5,targets:[[1,0],[-3,0]],anchor:[0,0],constrain:true});
  assert.deepEqual(negative,[-3,0]);
  const unsnapped=snapDiagramPoint([8,1],{enabled:false,radius:10,targets:[[9,2]],anchor:[0,0],constrain:true});
  close(unsnapped[0],Math.sqrt(65));close(unsnapped[1],0);
});
test('CAD symbol snapping prioritises actual non-grid corners and native endpoints over closer edges or grid points',()=>{
  const nonGridCorner:Point=[9.2,9.4];
  const options={enabled:true,radius:2,targets:[nonGridCorner],gridSpacing:10,lines:[line('paper-edge',[0,10],[20,10])]};
  assert.deepEqual(snapDiagramSymbolPoint([10,10],options),nonGridCorner);
  assert.deepEqual(snapDiagramSymbolPoint([10,10],{...options,targets:[[9.5,9.5],[9.2,9.4]]}),[9.5,9.5]);
  assert.deepEqual(snapDiagramSymbolPoint([10,10],{...options,targets:[[9.2,9.4],[9.5,9.5]]}),[9.5,9.5]);
  assert.deepEqual(snapDiagramSymbolPoint([10,10],{...options,targets:[[20,20]],lines:[]}),[10,10]);
});
test('CAD symbol grips snap to arbitrary positions on finite paper edges before the grid',()=>{
  const paperEdge=line('paper-edge',[0,6],[20,6]);
  assert.deepEqual(snapDiagramSymbolPoint([7.3,5.4],{enabled:true,radius:2,targets:[],gridSpacing:5,lines:[paperEdge]}),[7.3,6]);
  assert.deepEqual(snapDiagramSymbolPoint([21,6.3],{enabled:true,radius:2,targets:[],lines:[paperEdge]}),[20,6]);
  assert.deepEqual(snapDiagramSymbolPoint([30,6],{enabled:true,radius:2,targets:[],lines:[paperEdge]}),[30,6]);
  const source:Point=[7.3,5.4],before=structuredClone(paperEdge);
  snapDiagramSymbolPoint(source,{enabled:true,radius:2,targets:[],lines:[paperEdge]});
  assert.deepEqual(source,[7.3,5.4]);assert.deepEqual(paperEdge,before);
});
test('CAD grip direction constraints only accept forward ray points or finite edge crossings while Alt disables snapping',()=>{
  const crossing=line('paper-edge',[9,-5],[9,5]),base={enabled:true,radius:3,targets:[[8,1]] as Point[],anchor:[0,0] as Point,constrain:true,lines:[crossing],gridSpacing:5};
  assert.deepEqual(snapDiagramSymbolPoint([8,1],base),[9,0]);
  assert.deepEqual(snapDiagramSymbolPoint([8,1],{...base,targets:[[7,0]]}),[7,0]);
  const alt=snapDiagramSymbolPoint([8,1],{...base,enabled:false,targets:[[7,0]]});close(alt[0],Math.sqrt(65));close(alt[1],0);
  const beyondFinite=snapDiagramSymbolPoint([8,1],{...base,lines:[line('miss',[9,2],[9,4])],gridSpacing:undefined});
  close(beyondFinite[0],Math.sqrt(65));close(beyondFinite[1],0);
  const reversed=snapDiagramSymbolPoint([-2,.01],{...base,targets:[[1,0]],lines:[line('wrong-ray',[1,-5],[1,5])],gridSpacing:undefined});
  close(reversed[0],-Math.hypot(2,.01));close(reversed[1],0);
  assert.deepEqual(snapDiagramSymbolPoint([8,1],{...base,targets:[],lines:[line('same-ray',[9,0],[12,0])]}),[9,0]);
});
test('baseline endpoint snapping projects the pointer and accepts only nearby target points on the original axis',()=>{
  const center:Point=[10,20],endpoint:Point=[20,25],options={enabled:true,radius:3,targets:[[20,26],[18,24]] as Point[]};
  const snapped=snapDiagramSymbolAxisPoint([19,27],center,endpoint,options);
  assert.deepEqual(snapped,[18,24]);
  const disabled=snapDiagramSymbolAxisPoint([19,27],center,endpoint,{...options,enabled:false});
  close(disabled[0],20);close(disabled[1],25);
  const noTarget=snapDiagramSymbolAxisPoint([19,27],center,endpoint,{...options,targets:[[20,26]]});
  close(noTarget[0],20);close(noTarget[1],25);
  const behind=snapDiagramSymbolAxisPoint([0,10],center,endpoint,{...options,enabled:false});
  close((behind[1]-20)/(behind[0]-10),.5);assert.ok(behind[0]<center[0]);
  assert.deepEqual(snapDiagramSymbolAxisPoint([19,27],center,center,options),center);
});
test('baseline endpoint snapping uses only finite paper-edge crossings and prioritises axis keypoints',()=>{
  const center:Point=[0,0],endpoint:Point=[10,5],options={enabled:true,radius:2,targets:[] as Point[],gridSpacing:5,
    lines:[line('edge',[9,0],[9,10])]};
  const crossing=snapDiagramSymbolAxisPoint([8.1,5.8],center,endpoint,options);
  close(crossing[0],9);close(crossing[1],4.5);
  const keypoint=snapDiagramSymbolAxisPoint([8.1,5.8],center,endpoint,{...options,targets:[[8,4]]});
  close(keypoint[0],8);close(keypoint[1],4);
  const missed=snapDiagramSymbolAxisPoint([8.1,5.8],center,endpoint,{...options,gridSpacing:undefined,lines:[line('short',[9,6],[9,10])]});
  close(missed[0],8.8);close(missed[1],4.4);
  const reversed=snapDiagramSymbolAxisPoint([-8,-5],center,endpoint,{...options,gridSpacing:undefined,lines:[line('negative',[-9,-10],[-9,0])]});
  close(reversed[0],-9);close(reversed[1],-4.5);
});
test('baseline grid snapping intersects horizontal or vertical grid lines without leaving diagonal or shifted axes',()=>{
  const options={enabled:true,radius:2,targets:[] as Point[],gridSpacing:5};
  const diagonal=snapDiagramSymbolAxisPoint([8.5,4.25],[0,0],[10,5],options);
  close(diagonal[0],10);close(diagonal[1],5);
  // This axis never meets a two-dimensional grid point: y remains 2.3.
  assert.deepEqual(snapDiagramSymbolAxisPoint([9.6,8],[0,2.3],[10,2.3],options),[10,2.3]);
  const vertical=snapDiagramSymbolAxisPoint([9,9.6],[2.3,0],[2.3,10],options);
  close(vertical[0],2.3);close(vertical[1],10);
  const shifted=snapDiagramSymbolAxisPoint([11.2,8.1],[1.3,2.7],[11.3,7.7],{...options,radius:3});
  close((shifted[1]-2.7)/(shifted[0]-1.3),.5);
  assert.ok(Math.abs(shifted[0]/5-Math.round(shifted[0]/5))<1e-7||Math.abs(shifted[1]/5-Math.round(shifted[1]/5))<1e-7);
});
test('group translation snaps its anchor to the grid and applies one shared delta',()=>{
  const annotations:DiagramAnnotation[]=[line('moving',[1,1],[11,1]),symbol()];
  const delta=snapDiagramTranslation([1,1],[3,4],{enabled:true,radius:2,targets:[],gridSpacing:5});
  assert.deepEqual(delta,[4,4]);
  const moved=transformDiagramAnnotations(annotations,['moving','arrow'],{kind:'translate',delta});
  assert.deepEqual((moved[0] as DiagramLineAnnotation).a,[5,5]);
  assert.deepEqual((moved[0] as DiagramLineAnnotation).b,[15,5]);
  assert.deepEqual((moved[1] as DiagramSymbolAnnotation).position,[24,34]);
  assert.deepEqual(snapDiagramTranslation([1,1],[3,4],{enabled:false,radius:2,targets:[[5,5]],gridSpacing:5}),[3,4]);
});
test('move snapping excludes selected endpoints and intersections but retains model references',()=>{
  const moving=line('moving',[0,0],[10,0]),fixed=line('fixed',[5,-5],[5,5]),model=line('model',[20,0],[30,0]);
  const targets=diagramMoveSnapTargets([moving,fixed],['moving'],[[50,50]],[model]);
  assert.ok(targets.some(p=>p[0]===5&&p[1]===-5));
  assert.ok(targets.some(p=>p[0]===20&&p[1]===0));
  assert.ok(targets.some(p=>p[0]===50&&p[1]===50));
  assert.ok(!targets.some(p=>p[0]===0&&p[1]===0));
  assert.ok(!targets.some(p=>p[0]===10&&p[1]===0));
  assert.ok(!targets.some(p=>p[0]===5&&p[1]===0));
});
test('symbol move targets use the other symbol original insert point and exclude its dynamic controls',()=>{
  const fixed:DiagramSymbolAnnotation={...symbol(),id:'fixed',position:[200,300],rotation:90,mirrored:true,cadProperties:{}};
  const moving:DiagramSymbolAnnotation={...symbol(),id:'moving-symbol',position:[1000,2000]};
  const model:Point=[-250,500],grips=symbolNativeGrips(fixed);
  const nativePoints=grips.filter(grip=>grip.kind==='anchor'||grip.kind==='endpoint').map(grip=>grip.point);
  assert.equal(nativePoints.length,1);
  const targets=diagramMoveSnapTargets([fixed,moving],['moving-symbol'],[model]);
  assert.deepEqual(targets,[model,...nativePoints]);
  const centerGrip=grips.find(grip=>grip.id==='center'),source=buildCadSymbolGeometry(fixed).basePoints[0].point;
  assert.ok(centerGrip);assert.equal(centerGrip.kind,'anchor');assert.deepEqual(centerGrip.point,[fixed.position[0]-source[1]*.5,fixed.position[1]-source[0]*.5]);
  assert.ok(!grips.some(grip=>['start','end','rotate','component:curve'].includes(grip.id)));
  assert.ok(targets.some(p=>Math.hypot(p[0]-centerGrip.point[0],p[1]-centerGrip.point[1])<1e-7));
  assert.deepEqual(snapDiagramPoint([centerGrip.point[0]+.5,centerGrip.point[1]],{enabled:true,radius:2,targets}),centerGrip.point);
  assert.ok(grips.some(grip=>grip.kind==='component'));
  const components=grips.filter(grip=>grip.kind==='component'&&!nativePoints.some(p=>Math.hypot(p[0]-grip.point[0],p[1]-grip.point[1])<1e-7));
  for(const grip of components)assert.ok(!targets.some(p=>Math.hypot(p[0]-grip.point[0],p[1]-grip.point[1])<1e-7));
  const anchor=nativePoints[0],near:Point=[anchor[0]+0.25,anchor[1]-0.5];
  assert.deepEqual(snapDiagramPoint(near,{enabled:true,radius:2,targets}),anchor);
  assert.deepEqual(diagramMoveSnapTargets([fixed,moving],['fixed','moving-symbol'],[model]),[model]);
});
test('symbol picking and swept erasure use the visible geometry instead of its empty bounding rectangle',()=>{
  const arrow:DiagramSymbolAnnotation={id:'visible-arrow',kind:'symbol',symbol:'fold',position:[0,0],rotation:0,size:100,color:'#333333',width:.4,
    params:{length:100,height:40,curve:0}};
  const background=line('background',[-10,15],[10,15]);
  assert.equal(pointHitsDiagramAnnotation([0,0],arrow,.3),true);
  assert.equal(pointHitsDiagramAnnotation([0,15],arrow,.3),false);
  assert.equal(pointHitsDiagramAnnotation([0,-15],arrow,.3),false);
  assert.equal(pickDiagramAnnotation([background,arrow],[0,15],.3)?.id,'background');
  assert.equal(pickDiagramAnnotation([arrow],[0,15],.3),null);
  assert.deepEqual(diagramEraseHits([arrow],[-5,15],[5,15],.3),[]);
  assert.deepEqual(diagramEraseHits([arrow],[0,-10],[0,10],.3),['visible-arrow']);
  assert.equal(pointHitsDiagramAnnotation([0,15.5],background,.3),true);
  assert.equal(pointHitsDiagramAnnotation([0,16],background,.3),false);
});
test('parallel and perpendicular finite constructions pass through the requested point',()=>{
  const reference=line('ref',[0,0],[10,0]);
  assert.deepEqual(constructDiagramLine(reference,[5,7],'parallel',20),{a:[-5,7],b:[15,7]});
  assert.deepEqual(constructDiagramLine(reference,[5,7],'perpendicular',20),{a:[5,-3],b:[5,17]});
  assert.equal(constructDiagramLine(reference,[5,7],'parallel',0),null);
  assert.equal(constructDiagramLine(line('zero',[0,0],[0,0]),[1,1],'parallel',10),null);
});
test('bisector uses the indicated internal or external ray and rejects parallel references',()=>{
  const horizontal=line('h',[-10,0],[10,0]),vertical=line('v',[0,-10],[0,10]);
  const positive=bisectDiagramLines(horizontal,vertical,[8,9])!;
  assert.deepEqual(positive.a,[0,0]);close(positive.b[0],8.5);close(positive.b[1],8.5);
  const external=bisectDiagramLines(horizontal,vertical,[8,-9])!;
  close(external.b[0],8.5);close(external.b[1],-8.5);
  assert.equal(bisectDiagramLines(horizontal,line('parallel',[-10,5],[10,5]),[1,1]),null);
});
test('trim removes only the clicked finite interval and preserves two independent remaining pieces',()=>{
  const source=line('source',[0,0],[100,0]),crossings=[line('left',[30,-10],[30,10]),line('right',[70,-10],[70,10])];
  const trimmed=trimDiagramLine(source,[source,...crossings],[50,0],()=> 'second')!;
  assert.equal(trimmed.length,2);assert.equal(trimmed[0].id,'source');assert.equal(trimmed[1].id,'second');
  close(trimmed[0].b[0],30);close(trimmed[1].a[0],70);assert.deepEqual(source.b,[100,0]);
  const outer=trimDiagramLine(source,[source,...crossings],[10,0])!;
  assert.equal(outer.length,1);close(outer[0].a[0],30);assert.equal(outer[0].id,'source');
  assert.equal(trimDiagramLine(source,[source,line('too-short',[50,2],[50,5])],[10,0]),null);
});
test('extend selects the nearest crossing in the clicked endpoint direction and respects target extent',()=>{
  const source=line('source',[0,0],[10,0]),targets=[line('left',[-5,-10],[-5,10]),line('near',[20,-10],[20,10]),line('far',[30,-10],[30,10]),line('non-crossing',[15,3],[15,5])];
  assert.deepEqual(extendDiagramLine(source,[source,...targets],[9,0])!.b,[20,0]);
  assert.deepEqual(extendDiagramLine(source,[source,...targets],[1,0])!.a,[-5,0]);
  assert.equal(extendDiagramLine(source,[source,line('parallel',[0,5],[10,5])],[9,0]),null);
  assert.deepEqual(intersectDiagramLines(source,line('cross',[5,-10],[5,10]))!.point,[5,0]);
});
test('box selection catches crossing lines and swept erasure cannot skip fast crossings',()=>{
  const annotations=[line('cross',[-20,0],[20,0]),line('away',[30,30],[40,40]),line('vertical',[10,-20],[10,20])];
  assert.deepEqual(diagramAnnotationsInBox(annotations,[-5,-5],[5,5]),['cross']);
  assert.deepEqual(diagramAnnotationsInBox(annotations,[5,5],[-5,-5]),['cross']);
  assert.deepEqual(diagramEraseHits(annotations,[0,-10],[20,-10],.5),['vertical']);
});
test('symbol box selection excludes hollow circle interiors but includes actual curved strokes and whole symbols',()=>{
  const circle:DiagramSymbolAnnotation={id:'circle',kind:'symbol',symbol:'referencePoint',position:[0,0],size:100,rotation:0,color:'#333333',width:.4,params:{radius:25}};
  const curved:DiagramSymbolAnnotation={id:'curved',kind:'symbol',symbol:'fold',position:[0,0],size:100,rotation:0,color:'#333333',width:.4,
    params:{length:100,height:40,curve:0},curveControl:[0,80]};
  assert.deepEqual(diagramAnnotationsInBox([circle],[-2,-2],[2,2]),[]);
  assert.deepEqual(diagramAnnotationsInBox([circle],[2,2],[-2,-2]),[]);
  assert.deepEqual(diagramAnnotationsInBox([circle],[24,-1],[26,1]),['circle']);
  assert.deepEqual(diagramAnnotationsInBox([curved],[-1,39],[1,41]),['curved']);
  assert.deepEqual(diagramAnnotationsInBox([curved],[-1,-1],[1,1]),[]);
  assert.deepEqual(diagramAnnotationsInBox([circle,curved],[-100,-100],[100,100]),['circle','curved']);
});
test('symbol box selection finds isolated filled components without selecting the empty space between them',()=>{
  const dots:DiagramSymbolAnnotation={id:'dots',kind:'symbol',symbol:'equalAngle',position:[0,0],size:100,rotation:0,color:'#333333',width:.4,
    params:{count:2,gap:80,markSize:20}};
  assert.deepEqual(diagramAnnotationsInBox([dots],[-2,-2],[2,2]),[]);
  // This box lies within the first filled dot but neither crosses its perimeter
  // nor contains its native base point or the centre of the whole symbol.
  assert.deepEqual(diagramAnnotationsInBox([dots],[-36,-41],[-35,-40]),['dots']);
  assert.deepEqual(diagramAnnotationsInBox([dots],[39,39],[41,41]),['dots']);
  assert.deepEqual(diagramAnnotationsInBox([dots],[-100,-100],[100,100]),['dots']);
});
test('selected transforms preserve unselected geometry, symbol parameters and source immutability',()=>{
  const source:DiagramAnnotation[]=[line('selected',[0,0],[10,0]),line('other',[20,0],[30,0]),symbol()],snapshot=structuredClone(source);
  const translated=transformDiagramAnnotations(source,['selected','arrow'],{kind:'translate',delta:[3,4]});
  assert.deepEqual((translated[0] as DiagramLineAnnotation).a,[3,4]);assert.deepEqual(translated[1],source[1]);
  assert.deepEqual((translated[2] as DiagramSymbolAnnotation).position,[23,34]);assert.deepEqual(source,snapshot);
  assert.deepEqual((translated[2] as DiagramSymbolAnnotation).params,{length:100,curve:15});
  const scaled=transformDiagramAnnotations(source,['selected','arrow'],{kind:'scale',center:[0,0],factor:2});
  assert.deepEqual((scaled[0] as DiagramLineAnnotation).b,[20,0]);assert.equal((scaled[2] as DiagramSymbolAnnotation).size,100);
  assert.equal((scaled[2] as DiagramSymbolAnnotation).width,.4);
  assert.throws(()=>transformDiagramAnnotations(source,['selected'],{kind:'scale',center:[0,0],factor:-1}));
});
function worldPoint(symbol:DiagramSymbolAnnotation,local:Point):Point {
  const x=(symbol.mirrored?-local[0]:local[0])*symbol.size/100,y=local[1]*symbol.size/100,r=symbol.rotation*Math.PI/180;
  return [symbol.position[0]+x*Math.cos(r)-y*Math.sin(r),symbol.position[1]+x*Math.sin(r)+y*Math.cos(r)];
}
test('symbol mirrors match SVG local horizontal mirroring under arbitrary rotation',()=>{
  const source=symbol(),local:Point=[23,11],original=worldPoint(source,local);
  const mirrorX=transformDiagramAnnotations([source],['arrow'],{kind:'mirror',axis:'x',center:[0,0]})[0] as DiagramSymbolAnnotation;
  const pointX=worldPoint(mirrorX,local);close(pointX[0],original[0]);close(pointX[1],-original[1]);
  const mirrorY=transformDiagramAnnotations([source],['arrow'],{kind:'mirror',axis:'y',center:[0,0]})[0] as DiagramSymbolAnnotation;
  const pointY=worldPoint(mirrorY,local);close(pointY[0],-original[0]);close(pointY[1],original[1]);
  const twice=transformDiagramAnnotations([mirrorX],['arrow'],{kind:'mirror',axis:'x',center:[0,0]})[0] as DiagramSymbolAnnotation;
  const restored=worldPoint(twice,local);close(restored[0],original[0]);close(restored[1],original[1]);
});
test('copy produces new selectable IDs and independent translated params without changing originals',()=>{
  const annotations:DiagramAnnotation[]=[line('line',[0,0],[10,0]),symbol()],copied=copyDiagramAnnotations(annotations,['arrow'],[5,6]);
  assert.equal(copied.annotations.length,3);assert.equal(copied.ids.length,1);assert.notEqual(copied.ids[0],'arrow');
  const copy=copied.annotations[2] as DiagramSymbolAnnotation;
  assert.deepEqual(copy.position,[25,36]);copy.params!.length=120;
  assert.equal((annotations[1] as DiagramSymbolAnnotation).params!.length,100);
  assert.deepEqual(copied.annotations[0],annotations[0]);
});
test('visible viewport includes aspect ratio margins uniformly and preserves the world center',()=>{
  const visible=diagramVisibleRect({x:10,y:20,width:100,height:100},{width:900,height:300});
  assert.deepEqual(visible,{x:-90,y:20,width:300,height:100});
  close(visible.width/900,visible.height/300);close(visible.x+visible.width/2,60);close(visible.y+visible.height/2,70);
});
