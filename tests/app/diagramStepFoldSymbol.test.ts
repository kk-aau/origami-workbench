import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import type {Point} from '../../src/core/types';
import {type DiagramSymbolAnnotation,validateDiagramAnnotations} from '../../src/app/diagramAnnotations';
import {SYMBOL_CATALOG} from '../../src/app/diagramSymbolCatalog';
import {getDiagramCadSymbol} from '../../src/app/diagramCadSymbolCatalog';
import {CAD_SYMBOL_SOURCE,getCadSymbolBlock,cadPropertyDefinitions} from '../../src/app/diagramCadSymbols';
import {buildCadSymbolGeometry,moveCadSymbolPropertyGrip,type CadSymbolPrimitive} from '../../src/app/diagramCadSymbolGeometry';
import {diagramAnnotationMarkup,diagramSymbolPreview,annotationBounds} from '../../src/app/diagramAnnotationSVG';
import {createDiagramProject,updateDiagramAnnotations,duplicateDiagramStep,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';

const symbol=(kind:'swivel'|'swivelDouble',cadProperties:Record<string,number>={}):DiagramSymbolAnnotation=>({id:kind,kind:'symbol',symbol:kind,position:[20,30],size:100,rotation:0,color:'#293d35',width:.7,cadProperties});
const near=(a:Point,b:Point)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7,`${a} != ${b}`);
const paths=(a:DiagramSymbolAnnotation)=>buildCadSymbolGeometry(a).primitives.filter(p=>p.kind==='path') as Extract<CadSymbolPrimitive,{kind:'path'}>[];

test('step-fold names preserve the old kind and identify the extension as a variant of the original immutable block',()=>{
  assert.equal(SYMBOL_CATALOG.find(e=>e.kind==='swivel')!.label,'段折箭头');
  const variant=SYMBOL_CATALOG.find(e=>e.kind==='swivelDouble')!;
  assert.equal(variant.label,'双向段折箭头');assert.equal(variant.variantOf,'swivel');assert.equal(variant.sourceOnly,true);
  assert.equal(getDiagramCadSymbol('swivelDouble')!.variantOf,'swivel');
  assert.equal(getCadSymbolBlock('swivelDouble'),getCadSymbolBlock('swivel'));
  assert.equal(getCadSymbolBlock('swivelDouble')!.cadName,'2-NSwFold');
  assert.equal(CAD_SYMBOL_SOURCE.sha256,'899c4964559e0284cb7f30a0678453169eff9eda8643958de981159f7d4e65ce');
});

test('double step-fold pairs complete mirrored source shafts with heads at the same forward ends through all source edits',()=>{
  const source=getCadSymbolBlock('swivel')!,before=JSON.stringify(source);
  const values:Record<string,number>[]=[{}, {'距离1':18},{'距离3':22},{'距离2':6},{'角度3':37},{'角度1':125},{'翻转状态2':1},
    {'距离1':18,'距离3':22,'距离2':6,'角度3':37,'角度1':125,'翻转状态2':1}];
  for(const properties of values){
    const single=symbol('swivel',properties),double=symbol('swivelDouble',properties),s=paths(single),d=paths(double),g=buildCadSymbolGeometry(double);
    const shafts=d.filter(p=>p.sourceHandle===3356),heads=d.filter(p=>p.sourceHandle===3369),center:Point=[(g.baseline.start[0]+g.baseline.end[0])/2,(g.baseline.start[1]+g.baseline.end[1])/2];
    assert.equal(shafts.length,2);assert.equal(heads.length,2);assert.equal(g.joints.length,2);
    const length=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]),dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1],delta:Point=[shafts[0].points[1][0]-shafts[0].points[0][0],shafts[0].points[1][1]-shafts[0].points[0][1]],axis:Point=[delta[0]/Math.hypot(...delta),delta[1]/Math.hypot(...delta)],normal:Point=[-axis[1],axis[0]];
    for(let copy=0;copy<2;copy++){
      assert.equal(shafts[copy].points.length,4);near(heads[copy].points[1],shafts[copy].points.at(-1)!);near(g.joints[copy].point,g.joints[copy].headOrigin);
      // A copy is a rigid transform of the complete source illustration, not
      // another head attached to the same shaft or a guessed replacement path.
      for(let shape=0;shape<s.length;shape++)for(let i=1;i<s[shape].points.length;i++)
        assert.ok(Math.abs(length(d[copy*s.length+shape].points[i-1],d[copy*s.length+shape].points[i])-length(s[shape].points[i-1],s[shape].points[i]))<1e-7);
      assert.ok(dot([shafts[copy].points[1][0]-shafts[copy].points[0][0],shafts[copy].points[1][1]-shafts[copy].points[0][1]],axis)>0,'both shafts must point in the same evaluated direction');
    }
    for(let shape=0;shape<s.length;shape++)for(let i=0;i<s[shape].points.length;i++){
      const left=d[shape].points[i],right=d[s.length+shape].points[i];
      assert.ok(Math.abs(dot([right[0]-left[0],right[1]-left[1]],axis)-6)<1e-7,'the right copy has the same whole-symbol forward stagger');
      assert.ok(Math.abs(dot([left[0]+right[0]-2*center[0],left[1]+right[1]-2*center[1]],normal))<1e-7,'copies remain mirror symmetric about the evaluated stem axis');
    }
    near(g.baseline.start,[(shafts[0].points[0][0]+shafts[1].points[0][0])/2,(shafts[0].points[0][1]+shafts[1].points[0][1])/2]);
    near(g.baseline.end,[(heads[0].points[1][0]+heads[1].points[1][0])/2,(heads[0].points[1][1]+heads[1].points[1][1])/2]);
    const sourceControls=buildCadSymbolGeometry(single).controls;
    assert.deepEqual(g.controls.map(c=>[c.key,c.id]),['left','right'].flatMap(side=>sourceControls.map(c=>[c.key,`${c.id}:${side}`])));
  }
  assert.equal(JSON.stringify(source),before);
});

test('double step-fold uses native artwork without a legacy CAD field and keeps both heads in previews and mirrored export bounds',()=>{
  const a=symbol('swivelDouble'),legacyShape={...a};delete legacyShape.cadProperties;
  assert.equal(diagramAnnotationMarkup(legacyShape),diagramAnnotationMarkup(a));
  const preview=diagramSymbolPreview('swivelDouble'),inner=preview.slice(preview.indexOf('>')+1,preview.lastIndexOf('</g>'));
  assert.ok(diagramAnnotationMarkup(a).includes(inner));assert.equal((inner.match(/data-source-handle="3369"/g)??[]).length,2);assert.equal((inner.match(/data-source-handle="3356"/g)??[]).length,2);
  for(const mirrored of [false,true])for(const rotation of [0,43,90,213]){
    const edited={...a,mirrored,rotation,size:170,cadProperties:{'距离1':18,'距离3':22,'距离2':6,'角度3':37,'角度1':125}},bounds=annotationBounds([edited])!,theta=rotation*Math.PI/180;
    for(const p of paths(edited).flatMap(p=>p.points)){
      const x=p[0]*edited.size/100*(mirrored?-1:1),y=p[1]*edited.size/100,q:Point=[edited.position[0]+x*Math.cos(theta)-y*Math.sin(theta),edited.position[1]+x*Math.sin(theta)+y*Math.cos(theta)];
      assert.ok(q[0]>=bounds.x-1e-7&&q[0]<=bounds.x+bounds.width+1e-7&&q[1]>=bounds.y-1e-7&&q[1]<=bounds.y+bounds.height+1e-7);
    }
  }
});

test('old step-fold and double step-fold kinds and their independently editable source properties save, reload and duplicate',()=>{
  let serial=0;const ids=()=>`stepfold-${++serial}`,project=createDiagramProject(blankDoc('段折测试',100,100),ids);
  const annotations=[symbol('swivel',{'距离1':18}),{...symbol('swivelDouble',{'距离1':22,'距离3':19,'翻转状态2':1,'箭头间距':63,'上下错位':-5}),mirrored:true,rotation:37}];
  assert.doesNotThrow(()=>validateDiagramAnnotations(annotations));
  assert.deepEqual(cadPropertyDefinitions('swivelDouble').slice(0,-2),cadPropertyDefinitions('swivel'));
  const drawn=updateDiagramAnnotations(project,project.steps[0].id,annotations),copied=duplicateDiagramStep(drawn,drawn.steps[0].id,ids),loaded=importDiagramProject(exportDiagramProject(copied));
  assert.deepEqual(loaded.steps.map(s=>s.annotations),[annotations,annotations]);
  const second=loaded.steps[1].annotations![1] as DiagramSymbolAnnotation;second.cadProperties!['距离1']=31;
  assert.equal((loaded.steps[0].annotations![1] as DiagramSymbolAnnotation).cadProperties!['距离1'],22);
});

test('pair-only spacing and signed stagger remain explicit properties while only original source grips are exposed',()=>{
  const definitions=cadPropertyDefinitions('swivelDouble'),spacing=definitions.find(d=>d.key==='箭头间距')!,stagger=definitions.find(d=>d.key==='上下错位')!;
  assert.equal(spacing.defaultValue,48);assert.equal(stagger.defaultValue,6);
  assert.equal(spacing.origin,'variant');assert.equal(stagger.origin,'variant');assert.ok(spacing.parameterHandle<0&&stagger.parameterHandle<0);
  assert.ok(!getCadSymbolBlock('swivel')!.propertyDefinitions.some(d=>d.origin==='variant'));
  const a=symbol('swivelDouble',{'箭头间距':64,'上下错位':-12}),g=buildCadSymbolGeometry(a),shafts=g.primitives.filter(p=>p.kind==='path'&&p.sourceHandle===3356) as Extract<CadSymbolPrimitive,{kind:'path'}>[];
  const delta:Point=[shafts[0].points[1][0]-shafts[0].points[0][0],shafts[0].points[1][1]-shafts[0].points[0][1]],axis:Point=[delta[0]/Math.hypot(...delta),delta[1]/Math.hypot(...delta)],normal:Point=[-axis[1],axis[0]];
  for(const control of g.controls)assert.deepEqual(moveCadSymbolPropertyGrip(a,control.id??control.key,control.point),a);
  assert.ok(g.controls.every(control=>/^source-grip:\d+:(left|right)$/.test(control.id!)));
  assert.ok(!g.controls.some(control=>['箭头间距','上下错位'].includes(control.key)));
  const wider={...a,cadProperties:{...a.cadProperties,'箭头间距':70}},staggered={...a,cadProperties:{...a.cadProperties,'上下错位':-4}};
  const widerShafts=paths(wider).filter(p=>p.sourceHandle===3356),staggeredShafts=paths(staggered).filter(p=>p.sourceHandle===3356);
  for(let copy=0;copy<2;copy++){
    const direction=copy===0?-1:1;
    near(widerShafts[copy].points[0],[shafts[copy].points[0][0]+normal[0]*3*direction,shafts[copy].points[0][1]+normal[1]*3*direction]);
    near(staggeredShafts[copy].points[0],[shafts[copy].points[0][0]+axis[0]*4*direction,shafts[copy].points[0][1]+axis[1]*4*direction]);
  }
  assert.equal(wider.cadProperties['上下错位'],-12);assert.equal(staggered.cadProperties['箭头间距'],64);
  for(const edited of [wider,staggered]){const baseline=buildCadSymbolGeometry(edited).baseline;near(baseline.start,g.baseline.start);near(baseline.end,g.baseline.end);}
  assert.doesNotThrow(()=>validateDiagramAnnotations([a]));
  assert.throws(()=>validateDiagramAnnotations([{...a,symbol:'swivel'}]),/属性字段/);
  assert.throws(()=>validateDiagramAnnotations([{...a,cadProperties:{'箭头间距':-1}}]),/超出/);
});
