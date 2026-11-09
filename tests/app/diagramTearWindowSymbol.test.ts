import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDiagramAnnotations,type DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import {SYMBOL_CATALOG,getSymbolParameters} from '../../src/app/diagramSymbolCatalog';
import {getCadSymbolBlock} from '../../src/app/diagramCadSymbols';
import {getDiagramCadSymbol} from '../../src/app/diagramCadSymbolCatalog';
import {diagramAnnotationMarkup,diagramSymbolPreview,annotationBounds,symbolNativeGrips,symbolNativeBaseline,moveSymbolNativeGrip,moveSymbolComponent,pointHitsDiagramSymbol} from '../../src/app/diagramAnnotationSVG';
import {diagramTearWindowLocalOutline,diagramTearWindowOutline,diagramTearWindowPath,diagramTearWindowContainsPoint,diagramTearWindowHidesFace} from '../../src/app/diagramTearWindowGeometry';
import {blankDoc} from '../../src/app/state';
import {createDiagramProject,adoptDiagramPose,updateDiagramAnnotations,duplicateDiagramStep,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {computeFlatFold} from '../../src/core/flatFold';
import type {Point} from '../../src/core/types';

const symbol=(patch:Partial<DiagramSymbolAnnotation>={}):DiagramSymbolAnnotation=>({id:'tear',kind:'symbol',symbol:'tearWindow',position:[125,-37],size:100,rotation:0,color:'#293d35',width:.7,...patch});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const pointNear=(a:Point,b:Point)=>{near(a[0],b[0]);near(a[1],b[1]);};
function world(a:DiagramSymbolAnnotation,[x,y]:Point):Point{const t=a.rotation*Math.PI/180,dx=x*a.size/100*(a.mirrored?-1:1),dy=y*a.size/100;return [a.position[0]+dx*Math.cos(t)-dy*Math.sin(t),a.position[1]+dx*Math.sin(t)+dy*Math.cos(t)];}

test('tear window is a native parameterised symbol with an independently persistent original-face range',()=>{
  const entry=SYMBOL_CATALOG.find(entry=>entry.kind==='tearWindow')!;
  assert.equal(entry.label,'撕纸透视');assert.equal(entry.cadName,'');assert.equal(entry.sourceOnly,undefined);
  assert.deepEqual(entry.parameters.map(p=>[p.key,p.defaultValue]),[['radius',30]]);assert.equal(getSymbolParameters(symbol()).radius,30);
  assert.equal(getCadSymbolBlock('tearWindow'),undefined);assert.equal(getDiagramCadSymbol('tearWindow'),undefined);
  for(const cutawayFaces of [undefined,[],[0,2,8191]])assert.doesNotThrow(()=>validateDiagramAnnotations([symbol(cutawayFaces===undefined?{}:{cutawayFaces})]));
  const doc=blankDoc('撕纸透视练习',200,200);doc.segments.push({id:'first-fold',a:[66,0],b:[66,200],assignment:'V',angle:180},{id:'second-fold',a:[133,0],b:[133,200],assignment:'V',angle:180});
  let project=createDiagramProject(doc);project=adoptDiagramPose(project,project.activeStepId,project.states[0].id,computeFlatFold(doc));
  project=updateDiagramAnnotations(project,project.activeStepId,[symbol({cutawayFaces:[0,2],params:{radius:42},mirrored:true,rotation:27})]);
  const next=duplicateDiagramStep(project,project.activeStepId),loaded=importDiagramProject(exportDiagramProject(next));
  assert.deepEqual(loaded.steps[0].annotations,loaded.steps[1].annotations);
  const copied=loaded.steps[1].annotations![0] as DiagramSymbolAnnotation;copied.cutawayFaces!.push(3);
  assert.deepEqual((loaded.steps[0].annotations![0] as DiagramSymbolAnnotation).cutawayFaces,[0,2]);
});

test('cutaway face selections reject malformed values and remain exclusive to native tear windows',()=>{
  for(const cutawayFaces of [undefined,null,{},[0,0],[-1],[Number.MAX_SAFE_INTEGER+1],[.5],[NaN],[Infinity],['0'],Array(1)])assert.throws(()=>validateDiagramAnnotations([symbol({cutawayFaces} as any)]));
  assert.doesNotThrow(()=>validateDiagramAnnotations([symbol({cutawayFaces:Array.from({length:8192},(_,i)=>i)})]));
  for(const kind of ['fold','rotate','referencePoint'] as const)assert.throws(()=>validateDiagramAnnotations([symbol({symbol:kind,cutawayFaces:[]})]));
  for(const patch of [{cadProperties:{}},{cadAttributes:{}}])assert.throws(()=>validateDiagramAnnotations([symbol(patch)]));
});

test('the same deterministic near-circular torn boundary follows complete world transforms and radius edits',()=>{
  const local=diagramTearWindowLocalOutline();assert.equal(local.length,96);
  assert.deepEqual(diagramTearWindowLocalOutline(),local);assert.ok(new Set(local.map(p=>Math.hypot(...p).toFixed(5))).size>20,'the edge is irregular rather than a plain circle');
  assert.ok(local.every(p=>Math.hypot(...p)>28&&Math.hypot(...p)<32));
  for(const mirrored of [false,true])for(const rotation of [-123,0,67,540])for(const position of [[125,-37],[999999,-999999]] as Point[]){
    const a=symbol({position,rotation,mirrored,size:170,params:{radius:43}}),outline=diagramTearWindowOutline(a),expected=diagramTearWindowLocalOutline(43).map(point=>world(a,point));
    outline.forEach((point,i)=>pointNear(point,expected[i]));
    assert.equal(diagramTearWindowPath(a),outline.map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ')+' Z');
    assert.equal(diagramTearWindowPath(a),diagramTearWindowPath({...a,id:'copied'}));
    assert.equal(diagramTearWindowContainsPoint(a,a.position),true);
    for(const point of outline)assert.equal(diagramTearWindowContainsPoint(a,point),true,'boundary picking matches the exported mask');
    assert.equal(diagramTearWindowContainsPoint(a,world(a,[50,50])),false);
  }
});

test('native SVG supplies torn fibres without painting over the window and keeps the interior free for underlying folds',()=>{
  const a=symbol(),markup=diagramAnnotationMarkup(a),preview=diagramSymbolPreview('tearWindow');
  assert.match(markup,/data-role="tear-window-fibre-edge"/);assert.equal((markup.match(/data-role="tear-window-fibre"/g)??[]).length,32);
  assert.doesNotMatch(markup,/<image|href=|<script|<foreignObject|fill="(?:white|currentColor|transparent)"/);
  assert.match(preview,/tear-window-fibre/);assert.doesNotMatch(preview,/data-source-handle/);
  assert.equal(pointHitsDiagramSymbol(a,a.position,.01),false,'window interior must permit selecting the lower paper crease');
  assert.equal(pointHitsDiagramSymbol(a,diagramTearWindowOutline(a)[0],.01),true);
  const bounds=annotationBounds([a])!;for(const point of diagramTearWindowOutline(a))assert.ok(point[0]>=bounds.x&&point[0]<=bounds.x+bounds.width&&point[1]>=bounds.y&&point[1]<=bounds.y+bounds.height);
});

test('local windows expose only centre and radius handles while size and rotation properties preserve face selections',()=>{
  const a=symbol({rotation:31,mirrored:true,size:150,cutawayFaces:[1,3]}),before=structuredClone(a),baseline=symbolNativeBaseline(a)!;
  pointNear(baseline.anchor,a.position);assert.equal(baseline.rooted,false);
  const grips=symbolNativeGrips(a);assert.equal(new Set(grips.map(g=>g.point.map(n=>n.toFixed(8)).join(','))).size,grips.length);
  assert.deepEqual(grips.map(grip=>grip.id),['center','component:radius']);
  for(const grip of grips)assert.deepEqual(moveSymbolNativeGrip(a,grip.id,grip.point),a);
  const center=grips.find(g=>g.id==='center')!.point,moved=moveSymbolNativeGrip(a,'center',[center[0]+13,center[1]-7]);pointNear(moved.position,[a.position[0]+13,a.position[1]-7]);
  const scaled={...structuredClone(a),size:a.size*1.5};near(scaled.size,a.size*1.5);pointNear(scaled.position,a.position);
  const turned={...structuredClone(a),rotation:121};near(turned.rotation,121);pointNear(turned.position,a.position);
  const resized=moveSymbolNativeGrip(a,'component:radius',world(a,[45*Math.SQRT1_2,45*Math.SQRT1_2]));near(getSymbolParameters(resized).radius,45);pointNear(resized.position,a.position);
  for(const next of [moved,scaled,turned,resized]){assert.deepEqual(next.cutawayFaces,[1,3]);assert.doesNotThrow(()=>validateDiagramAnnotations([next]));}
  assert.deepEqual(a,before);
});

test('local paper hiding affects only each window range and leaves every outside or unselected face untouched',()=>{
  const first=symbol({cutawayFaces:[1,3]}),second=symbol({id:'other',position:[500,500],cutawayFaces:[2]});
  for(const face of [1,3])assert.equal(diagramTearWindowHidesFace([first,second],face,first.position),true);
  assert.equal(diagramTearWindowHidesFace([first,second],2,first.position),false);
  assert.equal(diagramTearWindowHidesFace([first,second],1,[500,500]),false);
  assert.equal(diagramTearWindowHidesFace([first,second],2,[500,500]),true);
  assert.equal(diagramTearWindowHidesFace([symbol({cutawayFaces:[]})],1,first.position),false);
  assert.equal(diagramTearWindowHidesFace([first],1,[first.position[0]+50,first.position[1]]),false);
});
