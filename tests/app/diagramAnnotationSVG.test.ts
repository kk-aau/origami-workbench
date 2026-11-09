import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DIAGRAM_SYMBOL_KINDS,type DiagramAnnotation,type DiagramLineAnnotation,type DiagramSymbolAnnotation,type DiagramSymbolKind} from '../../src/app/diagramAnnotations';
import {diagramAnnotationMarkup,diagramSymbolPreview,annotationBounds,symbolComponentHandles,moveSymbolComponent,symbolNativeGrips,symbolNativeBaseline,moveSymbolNativeGrip,diagramRepeatVisualAngle,setDiagramRepeatVisualAngle,orientDiagramRepeatSymbol,pointHitsDiagramSymbol,symbolIntersectsSegment,symbolIntersectsBox,SYMBOL_LABELS,LINE_LABELS} from '../../src/app/diagramAnnotationSVG';
import {SYMBOL_CATALOG,getSymbolParameters} from '../../src/app/diagramSymbolCatalog';
import type {Point} from '../../src/core/types';

const line:DiagramLineAnnotation={id:'l',kind:'line',a:[-10,5],b:[30,20],style:'valley',color:'#333333',width:2};
const symbol:DiagramSymbolAnnotation={id:'s',kind:'symbol',symbol:'fold',position:[20,30],size:100,rotation:0,color:'#123',width:2};
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);

test('new repeat symbols preserve their native shape after a turned drawing and have an independent overall rotation grip',()=>{
  const mark={...symbol,symbol:'repeatMark' as const,cadProperties:{}};
  near(diagramRepeatVisualAngle(mark,0),0);
  near(diagramRepeatVisualAngle(setDiagramRepeatVisualAngle(mark,20,30),30),20);
  for(const kind of ['repeat','repeatSmall'] as const)for(const drawingRotation of [0,30,-75]){
    const initial={...symbol,symbol:kind,position:[50,60] as Point,cadProperties:{}},oriented=orientDiagramRepeatSymbol(initial,drawingRotation);
    const baseline=symbolNativeBaseline(oriented)!;
    near(Math.sin((diagramRepeatVisualAngle(oriented,drawingRotation)-diagramRepeatVisualAngle(initial,0))*Math.PI/180),0);
    near(Math.cos((diagramRepeatVisualAngle(oriented,drawingRotation)-diagramRepeatVisualAngle(initial,0))*Math.PI/180),1);
    if(kind==='repeat'&&drawingRotation===0)near(oriented.rotation,0);
    const adjusted=setDiagramRepeatVisualAngle(oriented,25,drawingRotation);near(diagramRepeatVisualAngle(adjusted,drawingRotation),25);
    const grip=symbolNativeGrips(oriented).find(item=>item.id==='rotate');assert.ok(grip);
    const pivot=baseline.anchor,dx=grip.point[0]-pivot[0],dy=grip.point[1]-pivot[1];
    const moved=moveSymbolNativeGrip(oriented,'rotate',[pivot[0]-dy,pivot[1]+dx]);
    const turned=symbolNativeBaseline(moved)!;
    near(turned.anchor[0],pivot[0]);near(turned.anchor[1],pivot[1]);
    near(Math.sin((Math.atan2(turned.end[1]-turned.start[1],turned.end[0]-turned.start[0])-Math.atan2(baseline.end[1]-baseline.start[1],baseline.end[0]-baseline.start[0]))),1);
  }
});

test('line types retain their width and have distinct fold-diagram dash patterns',()=>{
  assert.deepEqual(Object.keys(LINE_LABELS),['valley','mountain','crease','auxiliary','boundary']);
  const markup=Object.keys(LINE_LABELS).map(style=>diagramAnnotationMarkup({...line,style:style as DiagramLineAnnotation['style']}));
  assert.match(markup[0],/stroke-dasharray="14 8"/);
  assert.match(markup[1],/stroke-dasharray="18 6 2 6"/);
  assert.doesNotMatch(markup[2],/stroke-dasharray/);
  assert.match(markup[3],/stroke-dasharray="2 8"/);
  assert.doesNotMatch(markup[4],/stroke-dasharray/);
  for(const output of markup){assert.match(output,/stroke-width="2"/);assert.doesNotMatch(output,/<circle|<text|marker-/);}
});

test('all source vector symbols and the double step-fold variant share paths between fitted palettes and diagram export',()=>{
  assert.equal(Object.keys(SYMBOL_LABELS).length,36);
  assert.deepEqual(new Set(Object.keys(SYMBOL_LABELS)),new Set(DIAGRAM_SYMBOL_KINDS));
  const previewShapes:string[]=[];
  for(const type of Object.keys(SYMBOL_LABELS) as DiagramSymbolKind[]){
    const preview=diagramSymbolPreview(type),output=diagramAnnotationMarkup({...symbol,symbol:type,size:200,rotation:450,cadProperties:{}});
    const inner=preview.slice(preview.indexOf('>')+1,preview.lastIndexOf('</g>'));
    if(type==='rotate'||type==='rotateCCW')for(const path of inner.match(/<path\b[^>]*\/>/g)??[])assert.ok(output.includes(path));else assert.ok(output.includes(inner));previewShapes.push(inner);
    assert.match(output,/translate\(20 30\) rotate\(90\) scale\(2 2\)/);
    assert.match(output,/stroke-width="1"/);
    assert.doesNotMatch(output,/<defs|marker-|href=|id=/);
  }
  assert.equal(new Set(previewShapes).size,36);
});

test('annotation bounds include line caps and every rotated symbol with stroke padding',()=>{
  assert.equal(annotationBounds([]),null);
  assert.deepEqual(annotationBounds([line]),{x:-11,y:4,width:42,height:17});
  const circle={...symbol,symbol:'referencePoint' as const};
  assert.deepEqual(annotationBounds([circle]),{x:-6,y:4,width:52,height:52});
  const diagonal=annotationBounds([{...circle,rotation:45}])!,extent=25*Math.SQRT2+1;
  near(diagonal.x,20-extent);near(diagonal.y,30-extent);
  near(diagonal.width,2*extent);near(diagonal.height,2*extent);
  const negative=annotationBounds([{...circle,rotation:-315}])!;
  near(negative.x,diagonal.x);near(negative.y,diagonal.y);near(negative.width,diagonal.width);
  const quarter=annotationBounds([{...circle,rotation:90}])!;
  near(quarter.x,-6);near(quarter.y,4);near(quarter.width,52);
  const combined=annotationBounds([line,{...circle,position:[200,300],rotation:45,width:100}])!;
  near(combined.x,-11);near(combined.y,4);near(combined.width,200+25*Math.SQRT2+50+11);
  near(combined.height,300+25*Math.SQRT2+50-4);
});

test('untrusted text cannot become executable SVG and non-finite geometry is rejected',()=>{
  const injected={...symbol,id:'"><script>alert(1)</script>',color:'red" onload="alert(1)'};
  const markup=diagramAnnotationMarkup(injected);
  assert.match(markup,/color="#333333"/);
  assert.doesNotMatch(markup,/script|onload|alert|id=/);
  const url=diagramAnnotationMarkup({...line,color:'url(https://example.com/paint.svg#x)'});
  assert.match(url,/stroke="#333333"/);assert.doesNotMatch(url,/url\(|https:/);
  assert.throws(()=>diagramAnnotationMarkup({...line,a:[NaN,0]}),/有限数字/);
  assert.throws(()=>diagramAnnotationMarkup({...symbol,size:0}),/大于零/);
  assert.throws(()=>diagramAnnotationMarkup({...symbol,size:Number.MIN_VALUE}),/大于零/);
  assert.throws(()=>diagramAnnotationMarkup({...symbol,size:1e-300,width:1e100}),/有限数字/);
  assert.throws(()=>annotationBounds([{...symbol,rotation:Infinity}]),/有限数字/);
  assert.throws(()=>diagramSymbolPreview('unknown' as DiagramSymbolKind),/未知|缺少原插件/);
  assert.throws(()=>diagramAnnotationMarkup({...line,style:'unknown'} as unknown as DiagramAnnotation),/未知/);
  const text=diagramAnnotationMarkup({...symbol,symbol:'repeat',text:'<script>"&\'</script>'});
  assert.ok(text.includes('&lt;script&gt;&quot;&amp;&apos;&lt;/script&gt;'));
  assert.doesNotMatch(text,/<script\b|onload="|<foreignObject/);
  assert.throws(()=>diagramAnnotationMarkup({...symbol,params:{length:'"><script/>'} as any}),/参数/);
});

function world(a:DiagramSymbolAnnotation,p:Point):Point {
  const angle=a.rotation*Math.PI/180,x=p[0]*a.size/100*(a.mirrored?-1:1),y=p[1]*a.size/100;
  return [a.position[0]+x*Math.cos(angle)-y*Math.sin(angle),a.position[1]+x*Math.sin(angle)+y*Math.cos(angle)];
}

test('the catalogue has one CAD reference per kind and every advertised parameter changes real artwork',()=>{
  assert.equal(SYMBOL_CATALOG.length,36);assert.equal(new Set(SYMBOL_CATALOG.filter(item=>item.cadName).map(item=>item.cadName)).size,33);
  for(const entry of SYMBOL_CATALOG){
    if(entry.sourceOnly){assert.deepEqual(entry.parameters,[]);continue;}
    const a={...symbol,symbol:entry.kind},defaults=getSymbolParameters(a),original=diagramAnnotationMarkup(a);
    assert.ok(entry.parameters.length>0);
    assert.equal(new Set(entry.parameters.map(parameter=>parameter.key)).size,entry.parameters.length);
    for(const parameter of entry.parameters){
      const value=parameter.defaultValue+parameter.step<=parameter.max?parameter.defaultValue+parameter.step:parameter.defaultValue-parameter.step;
      const edited={...a,params:{[parameter.key]:value}};
      assert.notEqual(diagramAnnotationMarkup(edited),original,`${entry.kind}.${parameter.key} has no visible effect`);
      const result=getSymbolParameters(edited);
      for(const key of Object.keys(defaults) as (keyof typeof defaults)[])assert.equal(result[key],key===parameter.key?value:defaults[key]);
    }
  }
});

test('component handles roundtrip under rotation and horizontal mirroring without modifying other values',()=>{
  for(const entry of SYMBOL_CATALOG)for(const mirrored of [false,true]){
    const a={...symbol,symbol:entry.kind,position:[203,-71] as Point,size:225,rotation:143,mirrored},before=structuredClone(a),defaults=getSymbolParameters(a);
    const handles=symbolComponentHandles(a);
    assert.deepEqual(new Set(handles.map(h=>h.key)),new Set(entry.parameters.filter(p=>p.key!=='count').map(p=>p.key)),entry.kind);
    for(const handle of handles){
      const changed=moveSymbolComponent(a,handle.key,handle.point),params=getSymbolParameters(changed);
      near(params[handle.key],defaults[handle.key]);assert.deepEqual(a,before);
    }
  }
});

test('direct component drags independently edit arrowheads, curves, radii, gaps and mark sizes in world coordinates',()=>{
  const a={...symbol,position:[300,-100] as Point,size:200,rotation:90,mirrored:true},p=getSymbolParameters(a),tip:Point=[p.length/2,-p.height/2];
  const direction:Point=[tip[0],tip[1]-p.curve],norm=Math.hypot(...direction),u:Point=[direction[0]/norm,direction[1]/norm];
  const base:Point=[tip[0]-u[0]*25,tip[1]-u[1]*25];
  const head=moveSymbolComponent(a,'headLength',world(a,base));near(getSymbolParameters(head).headLength,25);
  assert.equal(getSymbolParameters(head).headWidth,p.headWidth);assert.equal(getSymbolParameters(head).curve,p.curve);
  near(getSymbolParameters(moveSymbolComponent(a,'curve',world(a,[0,75]))).curve,75);
  near(getSymbolParameters(moveSymbolComponent(a,'length',world(a,[100,-p.height/2]))).length,200);
  const reference={...a,symbol:'referencePoint' as const};near(getSymbolParameters(moveSymbolComponent(reference,'radius',world(reference,[40,0]))).radius,40);
  const parallel={...a,symbol:'equalLength' as const};near(getSymbolParameters(moveSymbolComponent(parallel,'gap',world(parallel,[0,35]))).gap,70);
  const right={...a,symbol:'rightAngle' as const};near(getSymbolParameters(moveSymbolComponent(right,'markSize',world(right,[-5,5]))).markSize,30);
  assert.deepEqual(moveSymbolComponent(a,'count',[0,0]),a);
});

test('dynamic bounds encompass extreme components, every Bezier control point and mirrored text',()=>{
  for(const entry of SYMBOL_CATALOG){
    const params=Object.fromEntries(entry.parameters.map(p=>[p.key,p.key==='count'?12:p.max]));
    const a={...symbol,symbol:entry.kind,params,position:[-110,83] as Point,size:500,rotation:33,mirrored:true};
    const b=annotationBounds([a])!,markup=diagramAnnotationMarkup(a);
    for(const match of markup.matchAll(/<path d="([^"]+)"/g)){
      const values=(match[1].match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)??[]).map(Number);
      for(let i=0;i<values.length;i+=2){const point=world(a,[values[i],values[i+1]]);assert.ok(point[0]>=b.x&&point[0]<=b.x+b.width&&point[1]>=b.y&&point[1]<=b.y+b.height,entry.kind);}
    }
    assert.ok(b.width>0&&b.height>0&&Object.values(b).every(Number.isFinite),entry.kind);
  }
  const wide={...symbol,symbol:'repeat' as const,params:{markSize:60},text:'WW宽纸层'.repeat(20),mirrored:true,rotation:45};
  const bounds=annotationBounds([wide])!;assert.ok(bounds.width>1000&&bounds.height>1000);
  const short=annotationBounds([{...wide,text:'2'}])!;assert.ok(bounds.width>short.width*3);
});

test('blank editable number labels use defaults and CAD zoom arrows remain distinct from reference circles',()=>{
  const repeated={...symbol,symbol:'repeat' as const},defaultMarkup=diagramAnnotationMarkup(repeated);
  assert.equal(diagramAnnotationMarkup({...repeated,text:''}),defaultMarkup);
  assert.equal(diagramAnnotationMarkup({...repeated,text:'   '}),defaultMarkup);
  assert.match(defaultMarkup,/>3<\/text>/);
  assert.match(diagramAnnotationMarkup({...symbol,symbol:'return',text:'10'}),/>To 10<\/text>/);
  assert.match(diagramAnnotationMarkup({...symbol,symbol:'return',text:'To 10'}),/>To 10<\/text>/);
  for(const kind of ['zoom','zoomOut'] as const){
    const markup=diagramAnnotationMarkup({...symbol,symbol:kind});
    assert.match(markup,/fill="white"/);assert.doesNotMatch(markup,/<circle/);
  }
  assert.equal(SYMBOL_CATALOG.find(e=>e.kind==='star')!.parameters.find(e=>e.key==='count')!.min,3);
});

const arrowKinds:DiagramSymbolKind[]=['fold','unfold','foldSmall','mountainFold','unfoldDouble','swivel','swivelDouble','sink','open','pull','zoom','zoomOut','hold','repeatSmall','blow','view','tearWindow'];
const rootedKinds:DiagramSymbolKind[]=['fold','open','pull','hold'];
const pointNear=(actual:Point,expected:Point)=>{near(actual[0],expected[0]);near(actual[1],expected[1]);};

test('saved legacy artwork exposes positioning only while CAD source-only symbols expose verified original controls',()=>{
  for(const kind of DIAGRAM_SYMBOL_KINDS){
    const a={...symbol,symbol:kind},grips=symbolNativeGrips(a);
    assert.ok(grips.some(g=>g.kind==='anchor'),kind);
    if(kind==='tearWindow')assert.deepEqual(grips.map(g=>g.id),['center','component:radius']);
    else if(SYMBOL_CATALOG.find(e=>e.kind===kind)?.sourceOnly)assert.ok(grips.every(g=>g.kind==='anchor'||g.sourceGripHandle!==undefined||kind==='repeatMark'&&g.id==='rotate'),kind);
    else assert.equal(grips.length,1,kind);
    assert.ok(grips.every(g=>g.point.every(Number.isFinite)));
    assert.ok(!grips.some(g=>/scale|rotation/i.test(g.id)));
    assert.doesNotMatch(diagramAnnotationMarkup(a),/data-(?:grip|editor-handle|annotation-id)/);
  }
});

test('native grip moves to the same world point are exact no-ops for all kinds and preserve existing curve controls',()=>{
  for(const kind of DIAGRAM_SYMBOL_KINDS)for(const mirrored of [false,true]){
    const a={...symbol,symbol:kind,rotation:143,mirrored,...(['fold','flip','blow','zoom'].includes(kind)?{curveControl:[-20,-35] as Point}:{})};
    for(const grip of symbolNativeGrips(a))assert.deepEqual(moveSymbolNativeGrip(a,grip.id,grip.point),a,`${kind}.${grip.id}`);
    const points=symbolNativeGrips(a).map(g=>g.point.map(n=>n.toFixed(8)).join(','));
    if(!SYMBOL_CATALOG.find(e=>e.kind===kind)?.sourceOnly)assert.equal(new Set(points).size,points.length,`${kind} has duplicate native grip positions`);
  }
});

test('legacy endpoint scaling API keeps both ends symmetric without exposing extra UI handles',()=>{
  for(const kind of arrowKinds.filter(kind=>!rootedKinds.includes(kind)&&kind!=='tearWindow'&&!SYMBOL_CATALOG.find(e=>e.kind===kind)?.sourceOnly))for(const mirrored of [false,true])for(const movedId of ['start','end'] as const){
    const a={...symbol,symbol:kind,position:[203,-71] as Point,size:225,rotation:143,mirrored,curveControl:[-15,-30] as Point},before=structuredClone(a);
    const {start,end}=symbolNativeBaseline(a)!;
    const center:Point=[(start[0]+end[0])/2,(start[1]+end[1])/2],vector:Point=[(end[0]-start[0])/2,(end[1]-start[1])/2],side=movedId==='end'?1:-1;
    const target:Point=[center[0]+vector[0]*1.35*side,center[1]+vector[1]*1.35*side];
    const length=Math.hypot(...vector),normal:Point=[-vector[1]/length,vector[0]/length];
    const offAxis:Point=[target[0]+normal[0]*21,target[1]+normal[1]*21],result=moveSymbolNativeGrip(a,movedId,offAxis),next=symbolNativeBaseline(result)!;
    pointNear(next[movedId],target);
    pointNear(next[movedId==='end'?'start':'end'],[center[0]-vector[0]*1.35*side,center[1]-vector[1]*1.35*side]);
    pointNear(next.anchor,center);
    near(result.size,a.size*1.35);assert.equal(result.rotation,a.rotation);assert.equal(result.width,a.width);assert.equal(result.mirrored,mirrored);
    assert.deepEqual(result.params,a.params);assert.deepEqual(result.curveControl,a.curveControl);
    const perpendicular:Point=[(movedId==='end'?end:start)[0]+normal[0]*50,(movedId==='end'?end:start)[1]+normal[1]*50];
    assert.deepEqual(moveSymbolNativeGrip(a,movedId,perpendicular),a);
    assert.deepEqual(a,before);
  }
});

test('programmatic rotation keeps the existing root or midpoint without inventing a UI rotation point',()=>{
  for(const kind of arrowKinds.filter(kind=>kind!=='tearWindow'))for(const mirrored of [false,true]){
    const a={...symbol,symbol:kind,position:[203,-71] as Point,size:225,rotation:143,mirrored,curveControl:[-15,-30] as Point},before=structuredClone(a),baseline=symbolNativeBaseline(a)!,center=baseline.anchor,axis:Point=[baseline.end[0]-baseline.start[0],baseline.end[1]-baseline.start[1]],length=Math.hypot(...axis),handle:Point=[center[0]-axis[1]/length*28,center[1]+axis[0]/length*28];
    assert.ok(!symbolNativeGrips(a).some(grip=>grip.id==='rotate'));
    near(Math.hypot(handle[0]-center[0],handle[1]-center[1]),28);
    const delta=-47*Math.PI/180,vector:Point=[handle[0]-center[0],handle[1]-center[1]],target:Point=[center[0]+(vector[0]*Math.cos(delta)-vector[1]*Math.sin(delta))*3,center[1]+(vector[0]*Math.sin(delta)+vector[1]*Math.cos(delta))*3];
    const result=moveSymbolNativeGrip(a,'rotate',target);
    pointNear(symbolNativeBaseline(result)!.anchor,center);near(result.rotation,96);
    const oldBaseline=symbolNativeBaseline(a)!,newBaseline=symbolNativeBaseline(result)!;
    for(const id of ['start','end'] as const){const old=oldBaseline[id],x=old[0]-center[0],y=old[1]-center[1];pointNear(newBaseline[id],[center[0]+x*Math.cos(delta)-y*Math.sin(delta),center[1]+x*Math.sin(delta)+y*Math.cos(delta)]);}
    assert.equal(result.size,a.size);assert.deepEqual(result.params,a.params);assert.deepEqual(result.curveControl,a.curveControl);assert.equal(result.mirrored,mirrored);assert.deepEqual(a,before);
    assert.deepEqual(moveSymbolNativeGrip(a,'rotate',handle),a);
    const translated=moveSymbolNativeGrip(a,'center',[center[0]+16,center[1]-23]);pointNear(translated.position,[a.position[0]+16,a.position[1]-23]);assert.equal(translated.rotation,a.rotation);assert.equal(translated.size,a.size);
  }
});

test('contact-root arrows keep their paper root fixed while their tips scale only along the baseline',()=>{
  for(const kind of rootedKinds)for(const cadProperties of [undefined,{}])for(const mirrored of [false,true]){
    const a:DiagramSymbolAnnotation={...symbol,symbol:kind,position:[203,-71],size:225,rotation:143,mirrored,...(cadProperties?{cadProperties}:{})},before=structuredClone(a),baseline=symbolNativeBaseline(a)!,grips=symbolNativeGrips(a);
    pointNear(grips.find(g=>g.id==='center')!.point,baseline.start);assert.ok(!grips.some(g=>g.id==='start'));
    const vector:Point=[baseline.end[0]-baseline.start[0],baseline.end[1]-baseline.start[1]],length=Math.hypot(...vector),normal:Point=[-vector[1]/length,vector[0]/length];
    const target:Point=[baseline.start[0]+vector[0]*1.4,baseline.start[1]+vector[1]*1.4];
    const result=moveSymbolNativeGrip(a,'end',[target[0]+normal[0]*20,target[1]+normal[1]*20]),next=symbolNativeBaseline(result)!;
    pointNear(next.start,baseline.start);pointNear(next.end,target);near(result.size,a.size*1.4);assert.equal(result.rotation,a.rotation);assert.deepEqual(result.params,a.params);assert.deepEqual(result.cadProperties,a.cadProperties);assert.deepEqual(a,before);
    assert.deepEqual(moveSymbolNativeGrip(a,'end',[baseline.end[0]+normal[0]*20,baseline.end[1]+normal[1]*20]),a);
    assert.throws(()=>moveSymbolNativeGrip(a,'end',baseline.start),/根部/);
  }
});

test('legacy contact roots stay fixed after component shape edits without moving saved artwork on inspection',()=>{
  for(const kind of rootedKinds)for(const mirrored of [false,true]){
    const a:DiagramSymbolAnnotation={...symbol,symbol:kind,position:[203,-71],size:170,rotation:31,mirrored},markup=diagramAnnotationMarkup(a),before=structuredClone(a),root=symbolNativeBaseline(a)!.start;
    for(const grip of symbolNativeGrips(a).filter(g=>g.kind==='component')){
      const changed=moveSymbolNativeGrip(a,grip.id,[grip.point[0]+3,grip.point[1]-5]);pointNear(symbolNativeBaseline(changed)!.start,root);
    }
    for(const handle of symbolComponentHandles(a)){
      const changed=moveSymbolComponent(a,handle.key,[handle.point[0]+3,handle.point[1]-5]);pointNear(symbolNativeBaseline(changed)!.start,root);
    }
    assert.equal(diagramAnnotationMarkup(a),markup);assert.deepEqual(a,before);
  }
});

test('legacy curve-edit API solves a two-dimensional point without exposing an unverified curve grip',()=>{
  for(const kind of ['fold','unfold','foldSmall','mountainFold','unfoldDouble','zoom','zoomOut','flip','blow'] as DiagramSymbolKind[])for(const mirrored of [false,true]){
    const a={...symbol,symbol:kind,position:[203,-71] as Point,size:170,rotation:31,mirrored},before=structuredClone(a),baseline=symbolNativeBaseline(a);
    assert.ok(!symbolNativeGrips(a).some(grip=>grip.component==='curve'));
    const target=world(a,[0,-20]),result=moveSymbolNativeGrip(a,'component:curve',target),next=symbolNativeBaseline(result);
    assert.ok(pointHitsDiagramSymbol(result,target,.05),kind);
    if(baseline&&next){pointNear(next.start,baseline.start);pointNear(next.end,baseline.end);}
    assert.ok(result.curveControl&&result.curveControl.every(Number.isFinite));assert.deepEqual(a,before);
    assert.doesNotMatch(diagramAnnotationMarkup(result),/NaN|Infinity/);
  }
});

test('non-arrow base grips translate the whole symbol and invalid native moves reject without clamping',()=>{
  for(const kind of DIAGRAM_SYMBOL_KINDS.filter(kind=>!arrowKinds.includes(kind)&&!SYMBOL_CATALOG.find(e=>e.kind===kind)?.sourceOnly)){
    const a={...symbol,symbol:kind,rotation:77,mirrored:true},before=structuredClone(a),base=symbolNativeGrips(a).find(g=>g.id==='base')!;
    const target:Point=[base.point[0]-22,base.point[1]+41],result=moveSymbolNativeGrip(a,'base',target);
    pointNear(symbolNativeGrips(result).find(g=>g.id==='base')!.point,target);
    pointNear(result.position,[a.position[0]-22,a.position[1]+41]);assert.equal(result.rotation,a.rotation);assert.equal(result.size,a.size);assert.deepEqual(result.params,a.params);assert.deepEqual(a,before);
  }
  const before=structuredClone(symbol),start=symbolNativeBaseline(symbol)!.start;
  assert.throws(()=>moveSymbolNativeGrip(symbol,'end',start),/根部/);
  assert.throws(()=>moveSymbolNativeGrip(symbol,'end',[1e9,-1e9]),/可调范围/);
  assert.throws(()=>moveSymbolNativeGrip(symbol,'component:curve',[100_000,100_000]),/曲线控制点超出/);
  assert.deepEqual(symbol,before);
  const moved=moveSymbolNativeGrip(symbol,'component:curve',[20,-20]);assert.ok(moved.curveControl);
  assert.equal(moveSymbolComponent(moved,'curve',[20,-30]).curveControl,undefined);
});

test('picking and swept erasing follow actual strokes and fills instead of blank space inside a symbol envelope',()=>{
  const a={...symbol,position:[0,0] as Point},curve=world(a,[0,-27.5]);
  assert.ok(pointHitsDiagramSymbol(a,curve,0));assert.equal(pointHitsDiagramSymbol(a,[0,10],.1),false);
  assert.ok(symbolIntersectsSegment(a,[curve[0]-2,curve[1]-10],[curve[0]+2,curve[1]+10],.1));
  assert.equal(symbolIntersectsSegment(a,[-10,10],[10,10],.1),false);
  const reference={...a,symbol:'referencePoint' as const};assert.equal(pointHitsDiagramSymbol(reference,[0,0],.1),false);assert.ok(pointHitsDiagramSymbol(reference,[25,0],.1));
  assert.equal(symbolIntersectsSegment(reference,[-5,0],[5,0],.1),false);assert.ok(symbolIntersectsSegment(reference,[-30,0],[30,0],.1));
  assert.ok(pointHitsDiagramSymbol({...a,symbol:'angleMarker'},[0,0],0));
  assert.ok(pointHitsDiagramSymbol({...a,symbol:'pull'},[0,0],0));
  const transformed={...a,position:[91,-57] as Point,size:210,rotation:69,mirrored:true};
  assert.ok(pointHitsDiagramSymbol(transformed,world(transformed,[0,-27.5]),.1));
  assert.equal(pointHitsDiagramSymbol(transformed,world(transformed,[0,10]),.1),false);
});

test('box selection tests actual curve strokes, hollow circles, filled interiors and contained isolated dots',()=>{
  const circle={...symbol,symbol:'referencePoint' as const,position:[0,0] as Point};
  assert.equal(symbolIntersectsBox(circle,[-3,-3],[3,3]),false);
  assert.ok(symbolIntersectsBox(circle,[24,-1],[26,1]));
  assert.ok(symbolIntersectsBox(circle,[-40,-40],[40,40]));
  const arrow={...symbol,position:[0,0] as Point};
  assert.equal(symbolIntersectsBox(arrow,[-5,8],[5,12]),false);
  assert.ok(symbolIntersectsBox(arrow,[-2,-28],[2,-27]));
  assert.ok(symbolIntersectsBox(arrow,[-60,-80],[60,30]));
  assert.ok(symbolIntersectsBox({...circle,symbol:'angleMarker'},[-1,-1],[1,1]));
  const dots={...circle,symbol:'equalAngle' as const};
  // The lower-left dot is enclosed, but no box edge or center touches it.
  assert.ok(symbolIntersectsBox(dots,[-32,-32],[1,10]));
  assert.equal(symbolIntersectsBox(dots,[-3,-3],[3,3]),false);
  for(const mirrored of [false,true]){
    const transformed={...arrow,position:[91,-57] as Point,size:210,rotation:69,mirrored},point=world(transformed,[0,-27.5]),blank=world(transformed,[0,10]);
    assert.ok(symbolIntersectsBox(transformed,[point[0]-1,point[1]-1],[point[0]+1,point[1]+1]));
    assert.equal(symbolIntersectsBox(transformed,[blank[0]-1,blank[1]-1],[blank[0]+1,blank[1]+1]),false);
  }
});
