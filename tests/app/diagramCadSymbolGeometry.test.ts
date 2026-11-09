import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DIAGRAM_SYMBOL_KINDS,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {buildCadSymbolGeometry,moveCadSymbolPropertyGrip,type CadSymbolPrimitive} from '../../src/app/diagramCadSymbolGeometry';
import {getCadSymbolBlock,cadAttributeDefinitions,cadPropertyDefinitions} from '../../src/app/diagramCadSymbols';
import {annotationBounds,diagramAnnotationMarkup,diagramSymbolPreview,moveSymbolNativeGrip,pointHitsDiagramSymbol,symbolIntersectsBox,symbolIntersectsSegment,symbolNativeGrips,symbolNativeBaseline,toggleSymbolNativeMirror} from '../../src/app/diagramAnnotationSVG';
import type {Point} from '../../src/core/types';

const CAD_KINDS=DIAGRAM_SYMBOL_KINDS.filter(kind=>getCadSymbolBlock(kind));
const annotation=(symbol:DiagramSymbolAnnotation['symbol']):DiagramSymbolAnnotation=>({id:'source',kind:'symbol',symbol,position:[0,0],size:100,rotation:0,color:'#333333',width:1,cadProperties:{}});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const pointClose=(a:Point,b:Point)=>{close(a[0],b[0]);close(a[1],b[1]);};
const paths=(a:DiagramSymbolAnnotation)=>buildCadSymbolGeometry(a).primitives.filter(p=>p.kind==='path') as Extract<CadSymbolPrimitive,{kind:'path'}>[];
function world(a:DiagramSymbolAnnotation,p:Point):Point{const theta=a.rotation*Math.PI/180,x=p[0]*a.size/100*(a.mirrored?-1:1),y=p[1]*a.size/100;return [a.position[0]+x*Math.cos(theta)-y*Math.sin(theta),a.position[1]+x*Math.sin(theta)+y*Math.cos(theta)];}

test('all source blocks and the double step-fold variant have immutable provenance, finite artwork and shared palette/export primitives',()=>{
 assert.equal(DIAGRAM_SYMBOL_KINDS.length,36);
 for(const kind of CAD_KINDS){
  const a=annotation(kind),block=getCadSymbolBlock(kind)!,before=JSON.stringify(block),g=buildCadSymbolGeometry(a);
  assert.ok(g.primitives.length>0,kind);assert.ok(Object.isFrozen(block)&&Object.isFrozen(block.entities));
  for(const primitive of g.primitives){assert.ok(primitive.sourceHandle>0&&primitive.blockHandle>0&&primitive.sourceType);assert.ok((primitive.kind==='path'?primitive.points:[primitive.point]).every(p=>p.every(Number.isFinite)),kind);}
  const b=annotationBounds([a])!;assert.ok(Object.values(b).every(Number.isFinite)&&b.width>0&&b.height>0,kind);assert.ok(Math.max(b.width,b.height)<250,`${kind} normalized drawing unexpectedly large`);
  const preview=diagramSymbolPreview(kind),inner=preview.slice(preview.indexOf('>')+1,preview.lastIndexOf('</g>'));assert.ok(diagramAnnotationMarkup(a).includes(inner),kind);
  assert.equal(JSON.stringify(block),before);
 }
});

test('fold is the actual two-span cubic spline plus an open nested arrow head at their shared endpoint',()=>{
 const a=annotation('fold'),g=buildCadSymbolGeometry(a),shaft=paths(a).find(p=>p.sourceHandle===1644)!,head=paths(a).find(p=>p.sourceHandle===1670)!;
 assert.equal(shaft.sourceType,'SPLINE');assert.equal((shaft.d.match(/\bC\b/g)??[]).length,2);assert.equal(head.blockHandle,1666);
 assert.equal(head.fill,'none');assert.equal((head.d.match(/\bL\b/g)??[]).length,2);assert.ok(!head.d.endsWith('Z'));
 assert.equal(g.joints.length,1);pointClose(g.joints[0].point,g.joints[0].headOrigin);pointClose(g.baseline.end,g.joints[0].point);
});

test('prefold and double prefold retain the original unlike heads and a connected returning bulge path',()=>{
 const single=paths(annotation('unfold'));
 assert.equal(single.filter(p=>p.sourceType==='HATCH'&&p.fill==='currentColor').length,1);
 assert.equal(single.filter(p=>p.sourceType==='LWPOLYLINE'&&p.blockHandle!==2272).length,2);
 const double=paths(annotation('unfoldDouble')),shaft=double.find(p=>p.sourceHandle===5158)!;
 assert.equal((shaft.d.match(/\bM\b/g)??[]).length,1);assert.equal((shaft.d.match(/\bC\b/g)??[]).length,2);
 assert.equal(double.filter(p=>p.sourceHandle===5171).length,1);assert.ok(!double.some(p=>p.sourceType==='HATCH'));
 const baseline=buildCadSymbolGeometry(annotation('unfoldDouble')).baseline;
 assert.ok(Math.hypot(baseline.end[0]-baseline.start[0],baseline.end[1]-baseline.start[1])>70);
});

test('the swivel reverses through its middle segment and open/pull retain truncated tip and tapered tail',()=>{
 const p=paths(annotation('swivel')).find(p=>p.sourceHandle===3356)!.points;
 assert.ok((p[1][1]-p[0][1])*(p[2][1]-p[1][1])<0);assert.ok((p[2][1]-p[1][1])*(p[3][1]-p[2][1])<0);
 const open=paths(annotation('open')).find(p=>p.sourceHandle===17752)!.points;
 assert.ok(Math.abs(open[3][0]-open[4][0])>20);close(open[3][1],open[4][1]);
 const pull=paths(annotation('pull')).find(p=>p.sourceHandle===17852)!.points;
 assert.ok(Math.abs(pull[0][0]-pull.at(-2)![0])>Math.abs(pull[1][0]-pull[5][0]));
});

test('flip preserves a separate circle and arc; mountain fold uses the original ellipse, and blow has four source curves',()=>{
 const flip=paths(annotation('flip'));assert.equal(flip.filter(p=>p.sourceType==='CIRCLE').length,1);assert.equal(flip.filter(p=>p.sourceType==='ARC').length,1);
 const mountain=paths(annotation('mountainFold'));assert.equal(mountain.filter(p=>p.sourceType==='ELLIPSE').length,1);assert.ok(mountain.some(p=>p.sourceType==='HATCH'&&p.fill==='currentColor'));
 const blow=paths(annotation('blow'));assert.equal(blow.length,4);assert.deepEqual(new Set(blow.map(p=>p.sourceHandle)),new Set([3054,3055,3056,3057]));assert.ok(blow.filter(p=>p.d.includes('C ')).length===3);
});

test('source markers keep wide polyline filled dots and original flap border reference dashes without invented text',()=>{
 const hold=paths(annotation('hold'));assert.ok(hold.some(p=>p.sourceHandle===2762&&p.fill==='currentColor'&&!p.stroke));
 const repeat=paths(annotation('repeat'));assert.ok(repeat.some(p=>p.sourceHandle===3119&&p.fill==='currentColor'));
 for(const kind of ['flapFront','flapBack','repeatSmall'] as const){const a=annotation(kind),g=buildCadSymbolGeometry(a);assert.ok(!g.primitives.some(p=>p.kind==='text'),kind);assert.doesNotMatch(diagramAnnotationMarkup({...a,text:'invented'}),/invented/);}
 assert.ok(paths(annotation('flapFront')).some(p=>p.sourceHandle===18060&&p.dash));assert.ok(paths(annotation('flapBack')).some(p=>p.sourceHandle===17990&&p.dash));
});

test('source attribute keys edit independent labels, first-only legacy text fallback is escaped, and Return retains its independent To text',()=>{
 const a=annotation('equalDivision'),defs=cadAttributeDefinitions(a.symbol);assert.equal(defs.length,2);
 const g=buildCadSymbolGeometry({...a,text:'left',cadAttributes:{[defs[1].key]:'right'}}),texts=g.primitives.filter(p=>p.kind==='text');
 assert.deepEqual(texts.map(p=>p.text),['left','right']);
 const markup=diagramAnnotationMarkup({...a,text:'<script>&"',cadAttributes:{[defs[1].key]:'second'}});assert.match(markup,/&lt;script&gt;&amp;&quot;/);assert.doesNotMatch(markup,/<script\b/);
 const returned=buildCadSymbolGeometry({...annotation('return'),text:'25'}).primitives.filter(p=>p.kind==='text');assert.deepEqual(new Set(returned.map(p=>p.text)),new Set(['25','To']));
});

test('native scale, rotation and flip preserve source shaft/head connections while body-only Scale keeps arrow head dimensions',()=>{
 for(const props of [{'距离1':45},{'角度1':37},{'翻转状态1':1},{'距离1':45,'角度1':37,'翻转状态1':1}]){
  const a={...annotation('fold'),cadProperties:props},g=buildCadSymbolGeometry(a);assert.equal(g.joints.length,1);pointClose(g.joints[0].point,g.joints[0].headOrigin);
  const head=paths(a).find(p=>p.sourceHandle===1670)!,original=paths(annotation('fold')).find(p=>p.sourceHandle===1670)!;
  close(Math.hypot(...[head.points[0][0]-head.points[1][0],head.points[0][1]-head.points[1][1]]),Math.hypot(...[original.points[0][0]-original.points[1][0],original.points[0][1]-original.points[1][1]]));
  assert.notEqual(diagramAnnotationMarkup(a),diagramAnnotationMarkup(annotation('fold')));
 }
});

test('source glyphs scale and rotate about their designated root or midpoint with mirror-safe component grips and exact no-ops',()=>{
 for(const kind of CAD_KINDS)for(const mirrored of [false,true]){
  const a={...annotation(kind),position:[83,-23] as Point,size:170,rotation:127,mirrored},grips=symbolNativeGrips(a,28),center=grips.find(g=>g.id==='center')!.point,{start,end}=symbolNativeBaseline(a)!;
  for(const grip of grips)assert.deepEqual(moveSymbolNativeGrip(a,grip.id,grip.point),a,`${kind}.${grip.id}`);
  const scaled=moveSymbolNativeGrip(a,'end',[center[0]+(end[0]-center[0])*1.2,center[1]+(end[1]-center[1])*1.2]);close(scaled.size,a.size*1.2);pointClose(symbolNativeGrips(scaled).find(g=>g.id==='center')!.point,center);assert.deepEqual(scaled.cadProperties,a.cadProperties);
  const rotated=moveSymbolNativeGrip(a,'rotate',[center[0]+end[0]-start[0],center[1]+end[1]-start[1]]);close(rotated.rotation,37);pointClose(symbolNativeGrips(rotated).find(g=>g.id==='center')!.point,center);
  const geometry=buildCadSymbolGeometry(a);for(const control of geometry.controls){const moved=moveCadSymbolPropertyGrip(a,control.id??control.key,control.point);assert.deepEqual(moved,a);pointClose(grips.find(g=>g.id===`cad:${control.id??control.key}`)!.point,world(a,control.point));}
 }
});

test('source component grips have explicit function semantics and keep paper-contact roots fixed under CAD shape and mirror edits',()=>{
 const semantics=new Set(['move','scale','rotate','mirror','shape']);
 for(const kind of CAD_KINDS){
  const a={...annotation(kind),position:[83,-23] as Point,size:170,rotation:127,mirrored:true},grips=symbolNativeGrips(a,28),baseline=symbolNativeBaseline(a)!;
  assert.ok(grips.every(grip=>semantics.has(grip.semantic)),kind);
  assert.equal(grips.find(grip=>grip.id==='center')!.semantic,'move');assert.ok(!grips.some(grip=>['start','end'].includes(grip.id)||grip.id==='rotate'&&!['repeat','repeatSmall','repeatMark'].includes(kind)));
  for(const control of buildCadSymbolGeometry(a).controls){
   const def=cadPropertyDefinitions(kind).find(def=>def.key===control.key)!,grip=grips.find(grip=>grip.id===`cad:${control.id}`)!;
   if(def.type==='flip')assert.equal(grip.semantic,'mirror',kind+'.'+def.key);
   if(def.type==='angle')assert.equal(grip.semantic,'rotate',kind+'.'+def.key);
  }
  if(!baseline.rooted)continue;
  for(const grip of grips.filter(grip=>grip.kind==='component')){
   const changed=moveSymbolNativeGrip(a,grip.id,[grip.point[0]+.1,grip.point[1]-.2]);pointClose(symbolNativeBaseline(changed)!.start,baseline.start);
   assert.ok(Object.values(annotationBounds([changed])!).every(Number.isFinite));
  }
 }
});

test('native mirror click toggles source properties once and keeps contact roots stable through two toggles',()=>{
 for(const kind of CAD_KINDS)for(const mirrored of [false,true]){
  const a={...annotation(kind),position:[83,-23] as Point,size:170,rotation:127,mirrored},before=structuredClone(a),baseline=symbolNativeBaseline(a)!;
  for(const grip of symbolNativeGrips(a).filter(grip=>grip.semantic==='mirror')){
   const control=buildCadSymbolGeometry(a).controls.find(control=>grip.id===`cad:${control.id}`)!,toggled=toggleSymbolNativeMirror(a,grip.id),again=toggleSymbolNativeMirror(toggled,grip.id),definition=cadPropertyDefinitions(kind).find(def=>control.key===def.key)!;
   assert.equal(toggled.cadProperties?.[definition.key],1-definition.defaultValue);assert.notEqual(diagramAnnotationMarkup(toggled),diagramAnnotationMarkup(a));
   assert.equal(again.cadProperties?.[definition.key],definition.defaultValue);
   if(baseline.rooted){pointClose(symbolNativeBaseline(toggled)!.start,baseline.start);pointClose(symbolNativeBaseline(again)!.start,baseline.start);}
  }
  assert.deepEqual(a,before);assert.deepEqual(toggleSymbolNativeMirror(a,'unknown'),a);
 }
});

test('source empty circle interiors remain unpickable and all picking, swept erase and selection follow exported ink',()=>{
 const circle=annotation('referencePoint');assert.equal(pointHitsDiagramSymbol(circle,[0,0],.01),false);assert.equal(symbolIntersectsBox(circle,[-2,-2],[2,2]),false);assert.equal(symbolIntersectsSegment(circle,[-2,0],[2,0],.01),false);assert.equal(pointHitsDiagramSymbol(circle,[50,0],.01),true);assert.equal(symbolIntersectsBox(circle,[49,-1],[51,1]),true);
 const repeated=annotation('repeat'),dot=paths(repeated).find(p=>p.sourceHandle===3119)!,p:Point=[(Math.min(...dot.points.map(p=>p[0]))+Math.max(...dot.points.map(p=>p[0])))/2,(Math.min(...dot.points.map(p=>p[1]))+Math.max(...dot.points.map(p=>p[1])))/2];
 assert.equal(pointHitsDiagramSymbol(repeated,p,0),true);assert.equal(symbolIntersectsBox(repeated,[p[0]-.01,p[1]-.01],[p[0]+.01,p[1]+.01]),true);
});

test('source dynamic artwork, large independent attributes and mirrored rotations are fully inside shared export bounds',()=>{
 for(const kind of CAD_KINDS){
  const a={...annotation(kind),size:600,rotation:39,mirrored:true,cadProperties:Object.fromEntries(cadPropertyDefinitions(kind).filter(d=>d.editable&&d.type==='angle').map(d=>[d.key,Math.min(d.max,d.defaultValue+27)]))},g=buildCadSymbolGeometry(a),b=annotationBounds([a])!;
  for(const p of g.primitives.flatMap(p=>p.kind==='path'?p.points:[p.point])){const q=world(a,p);assert.ok(q[0]>=b.x-1e-7&&q[0]<=b.x+b.width+1e-7&&q[1]>=b.y-1e-7&&q[1]<=b.y+b.height+1e-7,kind);}
 }
 const a={...annotation('repeat'),text:'宽WW'.repeat(60),rotation:43,mirrored:true},b=annotationBounds([a])!;assert.ok(b.width>500&&b.height>500);
});

test('clockwise HATCH angles preserve the small closed View fan and the matching inner Flap arc',()=>{
 const fan=paths(annotation('view')).find(p=>p.sourceHandle===3172)!,flap=paths(annotation('flapBack')).find(p=>p.sourceHandle===17995)!;
 for(const p of [fan,flap]){assert.equal((p.d.match(/\bM\b/g)??[]).length,1);pointClose(p.start!,p.end!);assert.ok(p.d.endsWith('Z'));}
 const width=Math.max(...fan.points.map(p=>p[0]))-Math.min(...fan.points.map(p=>p[0]));assert.ok(width<20,'View eye fan must not become a nearly complete filled circle');
 assert.equal(pointHitsDiagramSymbol(annotation('view'),[30,0],.01),false);
});

test('every editable native property changes actual source artwork, while unsupported constraint fields reject edits',()=>{
 for(const kind of CAD_KINDS){
  const a=annotation(kind),base=diagramAnnotationMarkup(a);
  for(const def of cadPropertyDefinitions(kind)){
   const value=def.type==='flip'?1:def.values?.find(v=>v!==def.defaultValue)??Math.min(def.max,def.defaultValue+(def.type==='angle'?15:2));
   if(def.editable)assert.notEqual(diagramAnnotationMarkup({...a,cadProperties:{[def.key]:value}}),base,`${kind}.${def.key}`);
   else assert.throws(()=>diagramAnnotationMarkup({...a,cadProperties:{[def.key]:value}}),/不受支持|属性/);
  }
 }
});

test('verified Stretch bindings preserve independent DivLen halves and the original half-distance attribute multiplier',()=>{
 const before=buildCadSymbolGeometry(annotation('equalDivision')),after=buildCadSymbolGeometry({...annotation('equalDivision'),cadProperties:{'距离1':14}});
 const first=(geometry:typeof before,handle:number)=>geometry.primitives.find(p=>p.sourceHandle===handle)!;
 const untouched=first(before,13646),same=first(after,13646);assert.deepEqual(same,untouched);
 const right=first(before,13647),changed=first(after,13647);assert.ok(right.kind==='path'&&changed.kind==='path');pointClose(right.start!,changed.start!);
 const text=first(before,13650),newText=first(after,13650);assert.ok(text.kind==='text'&&newText.kind==='text');
 close(newText.point[0]-text.point[0],(changed.end![0]-right.end![0])*.5);close(newText.point[1],text.point[1]);
});

test('a real polar grip changes distance and angle together, carries its arrow head and leaves the fixed source base',()=>{
 const a=annotation('hold'),before=buildCadSymbolGeometry(a),grip=before.controls.find(c=>c.key==='距离1')!;
 assert.ok(grip.readProperties);assert.ok(!before.controls.some(c=>c.key==='角度1'),'one source polar grip owns both fields');
 const after=buildCadSymbolGeometry({...a,cadProperties:{'距离1':15,'角度1':90}}),shaft=after.primitives.find(p=>p.sourceHandle===2742)!;
 assert.ok(shaft.kind==='path');pointClose(after.baseline.start,before.baseline.start);close(after.baseline.end[0],after.baseline.start[0]);assert.ok(after.baseline.end[1]<after.baseline.start[1]);
 for(const joint of after.joints)pointClose(joint.point,joint.headOrigin);
 const nextGrip=after.controls.find(c=>c.key==='距离1')!,dragged=moveCadSymbolPropertyGrip(a,'距离1',nextGrip.point);close(dragged.cadProperties!['距离1'],15);close(dragged.cadProperties!['角度1'],90);
});

test('paired centered CAD stretch moves source endpoints symmetrically, and enum grip drag snaps to permitted native choices',()=>{
 const a=annotation('unfoldDouble'),before=buildCadSymbolGeometry(a),after=buildCadSymbolGeometry({...a,cadProperties:{'距离2':35}});
 pointClose([(before.baseline.start[0]+before.baseline.end[0])/2,(before.baseline.start[1]+before.baseline.end[1])/2],[(after.baseline.start[0]+after.baseline.end[0])/2,(after.baseline.start[1]+after.baseline.end[1])/2]);
  assert.ok(after.controls.some(c=>c.sourceGripHandle===5143));assert.ok(Math.hypot(...[after.baseline.end[0]-after.baseline.start[0],after.baseline.end[1]-after.baseline.start[1]])>Math.hypot(...[before.baseline.end[0]-before.baseline.start[0],before.baseline.end[1]-before.baseline.start[1]]));
 const repeated=annotation('repeat'),choice=buildCadSymbolGeometry({...repeated,cadProperties:{'距离3':0}}).controls.find(c=>c.key==='距离3')!,original=buildCadSymbolGeometry(repeated).controls.find(c=>c.key==='距离3')!;
 const target:Point=[choice.point[0]*.9+original.point[0]*.1,choice.point[1]*.9+original.point[1]*.1];assert.equal(moveCadSymbolPropertyGrip(repeated,'距离3',target).cadProperties!['距离3'],0);
});

test('a selected Flip axis follows source Rotate actions rather than reflecting the rotated glyph around its old axis',()=>{
 const a=annotation('fold'),original=buildCadSymbolGeometry(a),flipped=paths({...a,cadProperties:{'翻转状态1':1}}),combined=paths({...a,cadProperties:{'角度1':37,'翻转状态1':1}}),block=getCadSymbolBlock('fold')!,parameter=block.parameters.find(p=>p.handle===1611)!,sourceSpline=block.entities.find(e=>e.handle===1644)!;
 const raw=(sourceSpline.ctrl_pts as {x:number;y:number}[]),start=original.baseline.start,end=original.baseline.end,scale=(end[0]-start[0])/(raw.at(-1)!.x-raw[0].x),base:Point=[start[0]+scale*(parameter.def_basept![0]-raw[0].x),start[1]-scale*(parameter.def_basept![1]-raw[0].y)],theta=-37*Math.PI/180;
 for(const p of flipped){const next=combined.find(q=>q.sourceHandle===p.sourceHandle)!;for(let i=0;i<p.points.length;i++){const dx=p.points[i][0]-base[0],dy=p.points[i][1]-base[1];pointClose(next.points[i],[base[0]+dx*Math.cos(theta)-dy*Math.sin(theta),base[1]+dx*Math.sin(theta)+dy*Math.cos(theta)]);}}
});

test('minimum positive native Scale values remain renderable with finite source controls and exact same-point moves',()=>{
 for(const kind of ['fold','equalAngle'] as const){
  const a={...annotation(kind),cadProperties:{'距离1':1e-6}},g=buildCadSymbolGeometry(a);assert.ok(g.primitives.every(p=>(p.kind==='path'?p.points:[p.point]).every(p=>p.every(Number.isFinite))));assert.ok(g.controls.every(c=>c.point.every(Number.isFinite)));
  assert.doesNotMatch(diagramAnnotationMarkup(a),/NaN|Infinity/);assert.ok(Object.values(annotationBounds([a])!).every(Number.isFinite));
  for(const grip of symbolNativeGrips(a))assert.deepEqual(moveSymbolNativeGrip(a,grip.id,grip.point),a);
 }
});

