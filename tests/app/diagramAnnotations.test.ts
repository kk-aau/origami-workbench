import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {
  createDiagramProject,appendDiagramStep,duplicateDiagramStep,adoptDiagramPose,updateDiagramCP,
  updateDiagramAnnotations,validateDiagramProject,exportDiagramProject,importDiagramProject,
} from '../../src/app/diagramProject';
import {validateDiagramAnnotations,validateDiagramSymbolParams,validateDiagramCadProperties,validateDiagramCadAttributes,isDiagramSymbolKind,DIAGRAM_SYMBOL_KINDS,DIAGRAM_SYMBOL_PARAM_LIMITS,
  DIAGRAM_ANNOTATION_LIMITS,type DiagramAnnotation,type DiagramSymbolParams} from '../../src/app/diagramAnnotations';
import {cadPropertyDefinitions,cadAttributeDefinitions} from '../../src/app/diagramCadSymbols';

function ids(){let index=0;return ()=>`annotation-project-${++index}`;}
const line=():DiagramAnnotation=>({id:'required-fold',kind:'line',a:[12,18],b:[70,54],style:'valley',color:'#333333',width:0.35});
const symbol=():DiagramAnnotation=>({id:'direction',kind:'symbol',symbol:'fold',position:[20,30],size:25,rotation:45,color:'#385F50',width:0.4});
function fixture(){
  const doc=blankDoc('折线与符号',100,100),factory=ids(),project=createDiagramProject(doc,factory);
  const result=computeFlatFold(doc);
  assert.equal(result.geometry.status,'ready');
  return {doc,factory,project,result};
}

test('linked line material faces persist and copy independently while legacy drawing lines remain valid',()=>{
  const {project,factory}=fixture(),linked={...line(),kind:'line' as const,foldFaces:[0,7]};
  const drawn=updateDiagramAnnotations(project,project.activeStepId,[linked]);
  const copied=duplicateDiagramStep(drawn,drawn.activeStepId,factory),loaded=importDiagramProject(exportDiagramProject(copied));
  assert.deepEqual(loaded.steps[0].annotations,[linked]);assert.deepEqual(loaded.steps[1].annotations,[linked]);
  const item=loaded.steps[1].annotations![0];assert.equal(item.kind,'line');if(item.kind==='line')item.foldFaces!.pop();
  assert.deepEqual(loaded.steps[0].annotations,[linked]);assert.deepEqual(copied.steps[1].annotations,[linked]);
  assert.doesNotThrow(()=>validateDiagramAnnotations([line()]));
});

test('linked line material face identities reject malformed and unbounded imported arrays without accepting them on symbols',()=>{
  const {project}=fixture();
  for(const foldFaces of [undefined,null,{},[0,0],[-1],[Number.MAX_SAFE_INTEGER+1],[.5],[NaN],[Infinity],['0']]){
    const invalid={...line(),foldFaces};assert.throws(()=>validateDiagramAnnotations([invalid]));
    // JSON omits undefined properties, so use an explicit malformed value for
    // the corresponding imported-file trust boundary.
    const raw=JSON.parse(exportDiagramProject(project));raw.steps[0].annotations=[{...invalid,foldFaces:foldFaces===undefined?null:foldFaces}];
    assert.throws(()=>importDiagramProject(JSON.stringify(raw)));
  }
  assert.throws(()=>validateDiagramAnnotations([{...symbol(),foldFaces:[0]}]));
});

test('an explicitly empty linked material range survives duplication and project save without becoming an ordinary line',()=>{
  const {project,factory}=fixture(),inactive={...line(),kind:'line' as const,foldFaces:[]};
  const drawn=updateDiagramAnnotations(project,project.activeStepId,[inactive]);
  const copied=duplicateDiagramStep(drawn,drawn.activeStepId,factory),loaded=importDiagramProject(exportDiagramProject(copied));
  assert.deepEqual(loaded.steps[0].annotations,[inactive]);assert.deepEqual(loaded.steps[1].annotations,[inactive]);
  assert.doesNotThrow(()=>validateDiagramAnnotations([inactive]));
});

test('new steps own independent empty overlays and old version 1 files remain compatible',()=>{
  const {project,factory}=fixture(),next=appendDiagramStep(project,factory);
  assert.deepEqual(next.steps.map(step=>step.annotations),[[],[]]);
  assert.notEqual(next.steps[0].annotations,next.steps[1].annotations);
  const old=structuredClone(next);for(const step of old.steps){delete step.annotations;delete step.canvas;}
  assert.doesNotThrow(()=>validateDiagramProject(old));
  const loaded=importDiagramProject(exportDiagramProject(old));
  assert.deepEqual(loaded.steps,old.steps);
  const drawn=updateDiagramAnnotations(loaded,loaded.steps[0].id,[line()]);
  assert.equal(drawn.steps[0].annotations!.length,1);assert.equal(drawn.steps[1].annotations,undefined);
  assert.equal(loaded.steps[0].annotations,undefined);
  assert.equal(loaded.steps[0].canvas,undefined);
});

test('drawing updates isolate input objects and affect only the selected step without touching CP or pose',()=>{
  const {doc,project,result,factory}=fixture();
  const posed=adoptDiagramPose(project,project.steps[0].id,project.states[0].id,result);
  const two=appendDiagramStep(posed,factory),before=structuredClone(two),annotations=[line(),symbol()];
  const next=updateDiagramAnnotations(two,two.steps[0].id,annotations);
  assert.deepEqual(two,before);assert.deepEqual(doc,two.states[0].doc);
  assert.deepEqual(next.states,two.states);assert.deepEqual(next.steps[0].pose,two.steps[0].pose);
  assert.deepEqual(next.steps[1],two.steps[1]);
  assert.notEqual(next.steps[0].annotations,annotations);
  if(annotations[0].kind==='line')annotations[0].a[0]=-10;
  if(annotations[1].kind==='symbol')annotations[1].position[0]=-10;
  assert.deepEqual(next.steps[0].annotations,[line(),symbol()]);
  next.steps[0].annotations![0].color='#000';assert.deepEqual(two,before);
});

test('duplicate steps deeply copy symbols and endpoints while allowing the same object IDs in separate steps',()=>{
  const {project,factory}=fixture();
  const drawn=updateDiagramAnnotations(project,project.steps[0].id,[line(),symbol()]);
  const copied=duplicateDiagramStep(drawn,drawn.steps[0].id,factory);
  assert.deepEqual(copied.steps[1].annotations,copied.steps[0].annotations);
  assert.notEqual(copied.steps[1].annotations,copied.steps[0].annotations);
  assert.notEqual(copied.steps[1].annotations![0],copied.steps[0].annotations![0]);
  const changed=structuredClone(copied.steps[1].annotations!);
  if(changed[0].kind==='line')changed[0].a[0]=22;
  if(changed[1].kind==='symbol'){changed[1].position[1]=44;changed[1].rotation=90;}
  const next=updateDiagramAnnotations(copied,copied.steps[1].id,changed);
  assert.deepEqual(next.steps[0].annotations,[line(),symbol()]);
  assert.deepEqual(copied.steps[1].annotations,[line(),symbol()]);
  assert.doesNotThrow(()=>validateDiagramProject(next));
});

test('shared CP replacement and model adoption preserve the step illustration objects',()=>{
  const {doc,project,factory,result}=fixture();
  let next=appendDiagramStep(project,factory);
  next=updateDiagramAnnotations(next,next.steps[0].id,[line(),symbol()]);
  next=updateDiagramAnnotations(next,next.steps[1].id,[{...symbol(),symbol:'flip'}]);
  const before=next.steps.map(step=>structuredClone(step.annotations)),changed=structuredClone(doc);
  changed.name='编辑中间 CP';next=updateDiagramCP(next,next.states[1].id,changed);
  next=adoptDiagramPose(next,next.steps[0].id,next.states[0].id,result);
  assert.deepEqual(next.steps.map(step=>step.annotations),before);
  assert.equal(next.steps[0].afterId,next.steps[1].beforeId);
});

test('save and reload preserve vector geometry, styles and symbols in every step',()=>{
  const {project,factory}=fixture();let next=appendDiagramStep(project,factory);
  next=updateDiagramAnnotations(next,next.steps[0].id,[line(),symbol()]);
  const second:DiagramAnnotation[]=[{...line(),style:'mountain',color:'#f00'},{...symbol(),symbol:'repeat',rotation:-90}];
  next=updateDiagramAnnotations(next,next.steps[1].id,second);
  const before=structuredClone(next),loaded=importDiagramProject(exportDiagramProject(next));
  assert.deepEqual(loaded,next);assert.deepEqual(next,before);
  const item=loaded.steps[1].annotations![1];if(item.kind==='symbol')item.position[0]=99;
  assert.deepEqual(next,before);
});

test('all supported line styles and symbol kinds validate with bounded finite geometry',()=>{
  const overlays:DiagramAnnotation[]=[];
  for(const style of ['valley','mountain','crease','auxiliary'] as const)overlays.push({...line(),kind:'line',id:style,a:[-1_000_000,1_000_000],b:[0,0],style});
  for(const kind of ['fold','unfold','flip','rotate','repeat','zoom'] as const)overlays.push({...symbol(),kind:'symbol',id:kind,position:[0,0],symbol:kind,size:1_000_000,rotation:-360_000});
  overlays.push({...symbol(),id:'minimum-size-width',size:1e-6,width:1e-6});
  assert.doesNotThrow(()=>validateDiagramAnnotations(overlays));
  assert.doesNotThrow(()=>validateDiagramAnnotations([]));
});

test('invalid drawing edits reject atomically including duplicate IDs, unsafe color and unknown fields',()=>{
  const {project}=fixture(),before=structuredClone(project),stepId=project.steps[0].id;
  const bad:unknown[]=[
    null,{},[null],[{}],[{...line(),id:''}],[{...line(),id:'bad\u0000id'}],[{...line(),id:'x'.repeat(257)}],
    [line(),{...symbol(),id:line().id}],
    [{...line(),extra:true}],[{...line(),kind:'script'}],
    [{...line(),color:'url(https://example.test/image)'}],[{...line(),color:'red'}],[{...line(),color:'#1234'}],
    [{...line(),width:0}],[{...line(),width:-1}],[{...line(),width:NaN}],[{...line(),width:Infinity}],
    [{...line(),width:Number.MIN_VALUE}],[{...line(),width:0.0000009}],
    [{...line(),width:DIAGRAM_ANNOTATION_LIMITS.width+1}],
    [{...line(),a:[0,0,1]}],[{...line(),a:[NaN,0]}],[{...line(),a:[1_000_001,0]}],
    [{...line(),b:[0,-1_000_001]}],[{...line(),a:[0,0],b:[0,0]}],[{...line(),style:'B'}],
    [{...symbol(),symbol:'unknown'}],[{...symbol(),position:[null,0]}],[{...symbol(),position:[0,-Infinity]}],
    [{...symbol(),size:0}],[{...symbol(),size:1_000_001}],
    [{...symbol(),size:Number.MIN_VALUE}],[{...symbol(),size:0.0000009}],
    [{...symbol(),rotation:Infinity}],[{...symbol(),rotation:360_001}],
  ];
  for(const annotations of bad)assert.throws(()=>updateDiagramAnnotations(project,stepId,annotations as DiagramAnnotation[]));
  assert.throws(()=>updateDiagramAnnotations(project,'missing',[line()]),/不存在/);
  assert.deepEqual(project,before);
});

test('malformed saved annotations reject on import even when the step has no paper pose',()=>{
  const {project}=fixture(),valid=updateDiagramAnnotations(project,project.steps[0].id,[line(),symbol()]);
  const saved=JSON.parse(exportDiagramProject(valid));
  const mutations=[
    (value:any)=>value.steps[0].annotations=null,
    (value:any)=>value.steps[0].annotations[0].a[1]=null,
    (value:any)=>value.steps[0].annotations[0].id=value.steps[0].annotations[1].id,
    (value:any)=>value.steps[0].annotations[1].rotation='90',
    (value:any)=>value.steps[0].annotations[1].onload='unsafe',
  ];
  for(const mutate of mutations){const value=structuredClone(saved);mutate(value);assert.throws(()=>importDiagramProject(JSON.stringify(value)));}
  const raw=structuredClone(valid);raw.steps[0].annotations=undefined;
  assert.throws(()=>validateDiagramProject(raw));
});

test('all source catalogue kinds and the double step-fold variant validate while original symbols remain unchanged',()=>{
  assert.equal(DIAGRAM_SYMBOL_KINDS.length,36);assert.equal(new Set(DIAGRAM_SYMBOL_KINDS).size,36);
  const annotations=DIAGRAM_SYMBOL_KINDS.map(kind=>({...symbol(),kind:'symbol' as const,id:kind,symbol:kind}));
  assert.doesNotThrow(()=>validateDiagramAnnotations(annotations));
  for(const kind of DIAGRAM_SYMBOL_KINDS)assert.equal(isDiagramSymbolKind(kind),true);
  for(const kind of [null,undefined,{},42,'unknown','Fold',''])assert.equal(isDiagramSymbolKind(kind),false);
  const {project}=fixture();
  const loaded=importDiagramProject(exportDiagramProject(updateDiagramAnnotations(project,project.steps[0].id,annotations)));
  assert.deepEqual(loaded.steps[0].annotations,annotations);
});

test('symbol components, mirror and editable labels persist and copy independently of their originals',()=>{
  const {project,factory}=fixture();
  const params:DiagramSymbolParams={length:150,height:70,curve:-50,headLength:20,headWidth:12,radius:35,gap:8,count:3,markSize:10};
  const annotations:DiagramAnnotation[]=[{...symbol(),kind:'symbol',symbol:'return',params,mirrored:true,text:'重复步骤 2–5'}];
  const drawn=updateDiagramAnnotations(project,project.steps[0].id,annotations);
  params.length=220;assert.equal(drawn.steps[0].annotations![0].kind,'symbol');
  const first=drawn.steps[0].annotations![0];if(first.kind==='symbol')assert.equal(first.params!.length,150);
  const copy=duplicateDiagramStep(drawn,drawn.steps[0].id,factory),copied=copy.steps[1].annotations![0];
  if(copied.kind==='symbol'){copied.params!.curve=100;copied.text='步骤 6';copied.mirrored=false;}
  const original=copy.steps[0].annotations![0];
  if(original.kind==='symbol'){assert.equal(original.params!.curve,-50);assert.equal(original.text,'重复步骤 2–5');assert.equal(original.mirrored,true);}
  const loaded=importDiagramProject(exportDiagramProject(copy));
  assert.deepEqual(loaded.steps.map(step=>step.annotations),copy.steps.map(step=>step.annotations));
  if(loaded.steps[1].annotations![0].kind==='symbol')loaded.steps[1].annotations![0].params!.height=100;
  assert.deepEqual(drawn.steps[0].annotations,[{...symbol(),kind:'symbol',symbol:'return',params:{...params,length:150},mirrored:true,text:'重复步骤 2–5'}]);
});

test('symbol parameter bounds include both ends and reject nonfinite, unknown or noninteger component values',()=>{
  assert.doesNotThrow(()=>validateDiagramSymbolParams({}));
  for(const key of Object.keys(DIAGRAM_SYMBOL_PARAM_LIMITS) as (keyof DiagramSymbolParams)[]) {
    const [min,max]=DIAGRAM_SYMBOL_PARAM_LIMITS[key];
    assert.doesNotThrow(()=>validateDiagramSymbolParams({[key]:min}));
    assert.doesNotThrow(()=>validateDiagramSymbolParams({[key]:max}));
    for(const value of [min-0.01,max+0.01,NaN,Infinity,-Infinity,null,undefined,'10',true]) {
      assert.throws(()=>validateDiagramSymbolParams({[key]:value}));
    }
  }
  for(const params of [null,undefined,[],{count:1.5},{unknown:1},{length:100,extra:2}])assert.throws(()=>validateDiagramSymbolParams(params));
  const {project}=fixture(),before=structuredClone(project);
  for(const params of [{headLength:100},{count:2.5},{curve:Infinity},{unknown:1}])assert.throws(()=>updateDiagramAnnotations(project,project.steps[0].id,[{...symbol(),params} as DiagramAnnotation]));
  assert.deepEqual(project,before);
});

test('optional symbol labels and mirror retain legacy compatibility and reject malformed saved values',()=>{
  assert.doesNotThrow(()=>validateDiagramAnnotations([{...symbol(),text:'',mirrored:false,params:{}}]));
  assert.doesNotThrow(()=>validateDiagramAnnotations([{...symbol(),text:'折'.repeat(200)}]));
  assert.doesNotThrow(()=>validateDiagramAnnotations([{...symbol(),text:'😀'.repeat(200)}]));
  const bad=[{text:'折'.repeat(201)},{text:'line\nnext'},{text:'\u0000'},{text:'\u0085'},{text:undefined},{text:null},{text:123},
    {mirrored:undefined},{mirrored:null},{mirrored:1},{mirrored:'false'},{params:null},{params:undefined}];
  const {project}=fixture();
  for(const patch of bad) {
    const annotations=[{...symbol(),...patch}];
    assert.throws(()=>validateDiagramAnnotations(annotations));
    // Explicit undefined cannot be represented in JSON; all other corruptions
    // must also be rejected before replacing a loaded project.
    if(!Object.values(patch).includes(undefined)) {
      const saved=structuredClone(project);saved.steps[0].annotations=annotations as DiagramAnnotation[];
      assert.throws(()=>importDiagramProject(JSON.stringify(saved)));
    }
  }
});

test('local curve control coordinates persist and deeply copy without touching CP, pose or default symbol parameters',()=>{
  const {project,factory,result}=fixture();
  const posed=adoptDiagramPose(project,project.steps[0].id,project.states[0].id,result),before=structuredClone(posed);
  const control:[number,number]=[35,-80],drawn=updateDiagramAnnotations(posed,posed.steps[0].id,[{...symbol(),curveControl:control}]);
  control[0]=99;
  assert.deepEqual(drawn.states,posed.states);assert.deepEqual(drawn.steps[0].pose,posed.steps[0].pose);assert.deepEqual(posed,before);
  const copied=duplicateDiagramStep(drawn,drawn.steps[0].id,factory),copy=copied.steps[1].annotations![0];
  if(copy.kind==='symbol'){assert.deepEqual(copy.curveControl,[35,-80]);copy.curveControl![0]=100;}
  const original=copied.steps[0].annotations![0];if(original.kind==='symbol')assert.deepEqual(original.curveControl,[35,-80]);
  const loaded=importDiagramProject(exportDiagramProject(copied));
  assert.deepEqual(loaded.steps.map(step=>step.annotations),copied.steps.map(step=>step.annotations));
  const reset=structuredClone(loaded.steps[1].annotations!);
  if(reset[0].kind==='symbol')delete reset[0].curveControl;
  const edited=updateDiagramAnnotations(loaded,loaded.steps[1].id,reset);
  if(edited.steps[1].annotations![0].kind==='symbol')assert.equal(Object.hasOwn(edited.steps[1].annotations![0],'curveControl'),false);
  if(loaded.steps[1].annotations![0].kind==='symbol')assert.deepEqual(loaded.steps[1].annotations![0].curveControl,[100,-80]);
});

test('local curve controls reject undefined, malformed and unbounded coordinates but keep legacy missing values valid',()=>{
  assert.doesNotThrow(()=>validateDiagramAnnotations([symbol()]));
  assert.doesNotThrow(()=>validateDiagramAnnotations([{...symbol(),curveControl:[-1000,1000]}]));
  const {project}=fixture(),before=structuredClone(project);
  for(const curveControl of [undefined,null,[],[0],[0,0,0],[NaN,0],[0,Infinity],[-1000.01,0],[0,1001],['0',0],{x:0,y:0}]) {
    const annotations=[{...symbol(),curveControl}] as DiagramAnnotation[];
    assert.throws(()=>updateDiagramAnnotations(project,project.steps[0].id,annotations));
    if(curveControl!==undefined) {
      const corrupted=structuredClone(project);corrupted.steps[0].annotations=annotations;
      assert.throws(()=>importDiagramProject(JSON.stringify(corrupted)));
    }
  }
  assert.deepEqual(project,before);
});

test('native CAD properties use per-symbol source ranges, finite types and exact allowed value sets',()=>{
  assert.doesNotThrow(()=>validateDiagramCadProperties('fold',{}));
  assert.doesNotThrow(()=>validateDiagramCadProperties('fold',{'距离1':40,'翻转状态1':1}));
  assert.doesNotThrow(()=>validateDiagramCadProperties('open',{'距离2':1.5}));
  assert.doesNotThrow(()=>validateDiagramCadProperties('open',{'距离2':4}));
  for(const patch of [{'unknown':1},{'距离1':NaN},{'距离1':Infinity},{'距离1':-1},{'距离1':'30'},{'翻转状态1':true},
                      {'翻转状态1':.5},{'翻转状态1':1e-10},{'翻转状态1':2}])assert.throws(()=>validateDiagramCadProperties('fold',patch));
  for(const value of [1,2.2,4.5,2+1e-10])assert.throws(()=>validateDiagramCadProperties('open',{'距离2':value}));
  assert.throws(()=>validateDiagramCadProperties('flip',{'距离1':30}));
  assert.throws(()=>validateDiagramCadProperties('paperFront',{'距离1':30}));
  for(const kind of ['mountainFold','equalAngle','hold'] as const) {
    const unsupported=cadPropertyDefinitions(kind).find(definition=>!definition.editable);
    assert.ok(unsupported);assert.throws(()=>validateDiagramCadProperties(kind,{[unsupported.key]:unsupported.defaultValue}));
  }
  for(const value of [null,undefined,[],new Date(),42])assert.throws(()=>validateDiagramCadProperties('fold',value));
  assert.throws(()=>validateDiagramCadProperties('mountainFold',{'距离1':5,'角度3':250}));
  assert.doesNotThrow(()=>validateDiagramCadProperties('angleMarker',{'距离1':5,'角度1':45}));
  assert.throws(()=>validateDiagramCadProperties('hold',{'距离1':2.9}));
});

test('native CAD scale rejects collapsed geometry while ordinary zero-length stretch remains source-compatible',()=>{
  for(const kind of ['fold','equalAngle'] as const) {
    assert.throws(()=>validateDiagramCadProperties(kind,{'距离1':0}));
    assert.throws(()=>validateDiagramCadProperties(kind,{'距离1':1e-7}));
    assert.doesNotThrow(()=>validateDiagramCadProperties(kind,{'距离1':1e-6}));
  }
  assert.doesNotThrow(()=>validateDiagramCadProperties('fold',{'距离2':0}));
  assert.doesNotThrow(()=>validateDiagramCadProperties('repeat',{'距离3':0}));
});

test('native CAD attributes are whitelisted by source ATTDEF handles and preserve separate division labels',()=>{
  const definitions=cadAttributeDefinitions('equalDivision');assert.equal(definitions.length,2);
  const labels={[definitions[0].key]:'8',[definitions[1].key]:'3'};
  assert.doesNotThrow(()=>validateDiagramCadAttributes('equalDivision',labels));
  assert.doesNotThrow(()=>validateDiagramCadAttributes('equalDivision',{[definitions[0].key]:'折'.repeat(200)}));
  assert.doesNotThrow(()=>validateDiagramCadAttributes('equalDivision',{[definitions[0].key]:'😀'.repeat(200)}));
  for(const value of ['折'.repeat(201),'line\nnext','\u0000','\u0085',undefined,null,8])assert.throws(()=>validateDiagramCadAttributes('equalDivision',{[definitions[0].key]:value}));
  assert.throws(()=>validateDiagramCadAttributes('equalDivision',{'unknown':'8'}));
  assert.throws(()=>validateDiagramCadAttributes('fold',labels));
  for(const value of [null,undefined,[],new Date(),42])assert.throws(()=>validateDiagramCadAttributes('equalDivision',value));
});

test('source CAD mode, native properties and attributes deeply copy and roundtrip without affecting CP or legacy data',()=>{
  const {project,factory,result}=fixture(),posed=adoptDiagramPose(project,project.steps[0].id,project.states[0].id,result);
  const definitions=cadAttributeDefinitions('equalDivision'),properties={'距离1':12,'距离2':9},attributes={[definitions[0].key]:'8',[definitions[1].key]:'2'};
  const native:DiagramAnnotation={...symbol(),id:'native-division',symbol:'equalDivision',cadProperties:properties,cadAttributes:attributes};
  const drawn=updateDiagramAnnotations(posed,posed.steps[0].id,[symbol(),native]),before=structuredClone(drawn);
  properties['距离1']=25;attributes[definitions[0].key]='99';
  assert.deepEqual(drawn,before);assert.deepEqual(drawn.states,posed.states);assert.deepEqual(drawn.steps[0].pose,posed.steps[0].pose);
  const copied=duplicateDiagramStep(drawn,drawn.steps[0].id,factory),copy=copied.steps[1].annotations![1];
  if(copy.kind==='symbol'){copy.cadProperties!['距离1']=30;copy.cadAttributes![definitions[1].key]='5';}
  assert.deepEqual(copied.steps[0].annotations,before.steps[0].annotations);
  const loaded=importDiagramProject(exportDiagramProject(copied));
  assert.deepEqual(loaded.steps.map(step=>step.annotations),copied.steps.map(step=>step.annotations));
  const legacy=loaded.steps[0].annotations![0];assert.equal(Object.hasOwn(legacy,'cadProperties'),false);
  const nativeLoaded=loaded.steps[0].annotations![1];
  if(nativeLoaded.kind==='symbol'){assert.equal(nativeLoaded.cadProperties!['距离1'],12);assert.equal(nativeLoaded.cadAttributes![definitions[1].key],'2');}
  assert.doesNotThrow(()=>validateDiagramAnnotations([{...symbol(),cadProperties:{},cadAttributes:{}}]));
  for(const patch of [{cadProperties:undefined},{cadProperties:null},{cadAttributes:undefined},{cadAttributes:null}])assert.throws(()=>validateDiagramAnnotations([{...symbol(),...patch}]));
});
