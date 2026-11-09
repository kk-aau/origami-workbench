import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import type {Doc,Point} from '../../src/core/types';
import {blankDoc} from '../../src/app/state';
import {prepareEditorCommit,type EditorMaterialIntent} from '../../src/app/editorCommit';
import {emptyEditorHistory,editorHistoryReducer} from '../../src/app/editorHistory';
import {setSelectedFoldAngle} from '../../src/app/foldAngles';
import {selectionAfterCommit} from '../../src/app/selectionPersistence';
import {hasMaterialTopology,inspectMaterialTopology} from '../../src/core/materialTopology';
import {buildMaterialLineProperties} from '../../src/core/materialLineProperties';
import {inspectMaterialCurveModel} from '../../src/core/materialCurveModel';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {computeFlatFold} from '../../src/core/flatFold';
import {normalizeDiagramCP} from '../../src/app/diagramCP';
import {createDiagramProject,adoptDiagramPose,updateDiagramFoldLink,defaultDiagramCanvas,resyncDiagramStepViews,type DiagramProject} from '../../src/app/diagramProject';
import {diagramPoseView} from '../../src/app/diagramDrawing';
import {reconcileDiagramFoldAnnotations,refreshDiagramFoldDrawing} from '../../src/app/diagramFoldTransactions';
import {isolateDiagramLineEdits} from '../../src/app/diagramLineEditScope';
import {editDiagramCPEdge,findDiagramCPEdge,diagramCPEdgeSegment,diagramCPEdgeFoldAngle} from '../../src/app/diagramCPEdgeEdit';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {propertiesModelCase,propertiesRecipe} from '../fixtures/materialPropertiesModel';

/** Execute the shipped handlers, including their history transactions. Canvas,
 * workers and toast rendering are outside these angle-property transactions. */
function componentFunctions(file:string,names:string[],environment:Record<string,unknown>){
  const source=ts.createSourceFile(file,readFileSync(new URL(`../../src/${file}`,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const functions=new Map<string,string>();
  function visit(node:ts.Node){
    if(ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text))functions.set(node.name.text,node.getText(source));
    ts.forEachChild(node,visit);
  }
  visit(source);for(const name of names)assert.ok(functions.has(name),`${file}: ${name}`);
  const code=ts.transpileModule([...functions.values()].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  return new Function(...Object.keys(environment),`${code}\nreturn {${names.join(',')}};`)(...Object.values(environment));
}

function editorFixture(){
  const raw=blankDoc('已有折痕角度提交',100,100);
  raw.segments.push({id:'old-m',a:[0,50],b:[100,50],assignment:'M',angle:-180},{id:'old-v',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const doc=prepareEditorCommit(blankDoc('未编辑',100,100),raw).doc;
  const selected=new Set([doc.segments.find(s=>s.assignment==='M')!.id,doc.segments.find(s=>s.assignment==='V')!.id,doc.segments.find(s=>s.assignment==='B')!.id]);
  return {doc,selected};
}
function appAngle(doc:Doc,selected:Set<string>,options:{reject?:boolean;material?:boolean|null}={}){
  let history=emptyEditorHistory(doc),currentSelection=selected;const commits:{doc:Doc;selection?:Set<string>}[]=[],messages:string[]=[];
  const environment={doc,selected,chosen:doc.segments.filter(s=>selected.has(s.id)),inspectMaterialTopology,setSelectedFoldAngle,
    applyMaterialLineOperation:()=>options.material??null,
    commit:(next:Doc,selection?:Set<string>)=>{commits.push({doc:next,selection});if(options.reject)return false;const prepared=prepareEditorCommit(history.present,next);currentSelection=selectionAfterCommit(currentSelection,prepared.descendants,selection,false);history=editorHistoryReducer(history,{type:'commit',doc:prepared.doc});return true;},
    inform:(message:string)=>messages.push(message),setError:(message:string)=>messages.push(message),errorText:(error:Error)=>error.message,
  };
  const handlers=componentFunctions('App.tsx',['modifyTargetAngle'],environment);
  return {apply:handlers.modifyTargetAngle as (angle:number|null)=>boolean,get history(){return history;},get selection(){return currentSelection;},commits,messages};
}

test('existing CP angle application commits only selected atomic creases and retains selection through undo/redo',()=>{
  const {doc,selected}=editorFixture(),before=structuredClone(doc),run=appAngle(doc,selected);
  assert.equal(run.apply(63.5),true);assert.equal(run.commits.length,1);assert.deepEqual(run.selection,selected,'angle properties retain selection even with operation persistence disabled');
  const next=run.history.present;
  for(const segment of next.segments){
    const old=doc.segments.find(s=>s.id===segment.id)!;
    assert.equal(segment.angle,selected.has(segment.id)&&['M','V'].includes(segment.assignment)?segment.assignment==='M'?-63.5:63.5:old.angle);
    assert.deepEqual([segment.a,segment.b,segment.assignment],[old.a,old.b,old.assignment]);
  }
  assert.deepEqual(doc,before);assert.equal(run.history.past.length,1);assert.equal(run.history.error,null);
  const undone=editorHistoryReducer(run.history,{type:'undo'});assert.deepEqual(undone.present,doc);
  assert.deepEqual(editorHistoryReducer(undone,{type:'redo'}).present,next);
});

test('rejected CP commits and rejected material operations report failure without a fallback edit',()=>{
  const {doc,selected}=editorFixture(),rejected=appAngle(doc,selected,{reject:true});
  assert.equal(rejected.apply(40),false);assert.deepEqual(rejected.history.present,doc);assert.equal(rejected.history.past.length,0);
  for(const material of [false,true]){
    const run=appAngle(doc,selected,{material});assert.equal(run.apply(40),material);assert.equal(run.commits.length,0);
  }
});

function materialAngle(reject=false){
  const doc=propertiesModelCase('angle'),ids=[...propertiesRecipe(doc).segmentIds],selected=new Set(ids),messages:string[]=[];
  let history=emptyEditorHistory(doc),currentSelection=selected,intent:EditorMaterialIntent|undefined;
  const environment={doc,selected,hasMaterialTopology,inspectMaterialTopology,buildMaterialLineProperties,inspectMaterialCurveModel,editMaterialFaces,
    commit:(next:Doc,selection:Set<string>|undefined,transform:EditorMaterialIntent)=>{intent=transform;if(reject)return false;const prepared=prepareEditorCommit(history.present,next,transform);currentSelection=selectionAfterCommit(currentSelection,prepared.descendants,selection,false);history=editorHistoryReducer(history,{type:'commit',doc:prepared.doc});return true;},
    inform:(message:string)=>messages.push(message),setError:(message:string)=>messages.push(message),errorText:(error:Error)=>error.message,
  };
  const handlers=componentFunctions('App.tsx',['applyMaterialLineOperation'],environment);
  return {doc,ids,apply:handlers.applyMaterialLineOperation as (operation:{kind:'angle';magnitude:number|null},ids:string[])=>boolean|null,get history(){return history;},get selection(){return currentSelection;},get intent(){return intent;},messages};
}

test('material angle application edits the existing parameter recipe and preserves complete undo/redo frames',()=>{
  const run=materialAngle(),before=structuredClone(run.doc),old=inspectMaterialCurveModel(run.doc);assert.ok(old.ok);
  assert.equal(run.apply({kind:'angle',magnitude:51},run.ids),true);assert.equal(run.intent?.kind,'material-curve-group-edit');
  assert.deepEqual(run.selection,new Set(run.ids),'material angle properties retain selection with operation persistence disabled');
  const next=run.history.present,model=inspectMaterialCurveModel(next),topology=inspectMaterialTopology(next);assert.ok(model.ok);assert.ok(topology.ok);
  assert.equal(model.model.groups.length,old.model.groups.length);assert.equal(run.history.past.length,1);assert.equal(run.history.error,null);
  for(const id of run.ids){const segment=next.segments.find(s=>s.id===id)!;assert.equal(segment.angle,segment.assignment==='M'?-51:51);const edge=topology.edgeSegmentIds.indexOf(id);assert.equal(topology.graph.edges_foldAngle[edge],segment.angle);}
  assert.deepEqual(run.doc,before);const undone=editorHistoryReducer(run.history,{type:'undo'});assert.deepEqual(undone.present,run.doc);
  assert.deepEqual(editorHistoryReducer(undone,{type:'redo'}).present,next);
});

test('a rejected material angle transaction cannot claim success or alter the parameter model',()=>{
  const run=materialAngle(true),before=structuredClone(run.doc);
  assert.equal(run.apply({kind:'angle',magnitude:51},run.ids),false);assert.deepEqual(run.history.present,before);assert.equal(run.history.past.length,0);assert.deepEqual(run.messages,[]);
});

const settings={enabled:true,layers:'all' as const,selectedFaces:[]};
const stroke=(a:Point,b:Point,id='existing-instruction'):DiagramLineAnnotation=>({id,kind:'line',a,b,style:'valley',color:'#293d35',width:.7,foldAngle:180});
function projectFixture(folded=false){
  const raw=blankDoc('已有操作线角度',100,100);
  if(folded)raw.segments.push({id:'prior-fold',a:[50,0],b:[50,100],assignment:'V',angle:180});
  const doc=normalizeDiagramCP(raw).doc;let id=0;
  let project=createDiagramProject(doc,()=>`apply-angle-${++id}`);
  project=adoptDiagramPose(project,project.activeStepId,project.steps[0].beforeId,computeFlatFold(doc));
  return updateDiagramFoldLink(project,project.activeStepId,settings);
}
function diagramHistory(project:DiagramProject){
  const projectRef={current:project},past={current:[] as DiagramProject[]},future={current:[] as DiagramProject[]};
  const noOp=()=>{};
  const environment={projectRef,past,future,HISTORY_LIMIT:60,setProject:noOp,setHistoryVersion:noOp,recordActivity:noOp,cancelTask:noOp,resetDrawingSelection:noOp,setSelection:noOp,emptySelection:()=>({group:[],selected:[]}),
    defaultDiagramCanvas,resyncDiagramStepViews,poseView:diagramPoseView,refreshDiagramFoldDrawing,
  };
  const handlers=componentFunctions('components/DiagramWorkspace.tsx',['refreshChangedViewDrawings','keepCurrentViews','commit','undo','redo'],environment);
  return {commit:handlers.commit as (next:DiagramProject)=>void,undo:handlers.undo as ()=>void,redo:handlers.redo as ()=>void,projectRef,past,future};
}
function assertDiagramUndo(before:DiagramProject,next:DiagramProject){
  const history=diagramHistory(before);history.commit(next);assert.equal(history.past.current.length,1);assert.deepEqual(history.projectRef.current,next);
  history.undo();assert.deepEqual(history.projectRef.current,before);assert.equal(history.future.current.length,1);
  history.redo();assert.deepEqual(history.projectRef.current,next);assert.equal(history.past.current.length,1);
}

test('an existing main-diagram fold updates its physical angle and precrease excursion in one reversible transaction',()=>{
  for(const foldAction of ['fold','precrease'] as const){
    const empty=projectFixture(),line={...stroke([50,0],[50,100]),foldAction};
    const project=reconcileDiagramFoldAnnotations(empty,empty.activeStepId,[line]),before=structuredClone(project);
    const edited=(project.steps[0].annotations??[]).map(a=>a.id===line.id?{...a,foldAngle:72.5}:a);
    const next=reconcileDiagramFoldAnnotations(project,project.activeStepId,edited);
    const edge=diagramCPEdgeSegment(next.states[1],findDiagramCPEdge(next.states[1],line));
    assert.equal(edge.angle,foldAction==='fold'?72.5:0);assert.equal(edge.assignment,foldAction==='fold'?'V':'F');
    assert.equal(diagramCPEdgeFoldAngle(next,next.activeStepId,next.states[1].id,findDiagramCPEdge(next.states[1],line)),72.5);
    assert.deepEqual(next.states[0],project.states[0]);assert.deepEqual(next.steps[0].pose,project.steps[0].pose);assert.deepEqual(project,before);
    assertDiagramUndo(project,next);
  }
});

test('changing the clicked occurrence of a shared main-diagram crease preserves the other paper layer angle',()=>{
  const empty=projectFixture(true),line=stroke([10,30],[40,30]);
  const project=reconcileDiagramFoldAnnotations(empty,empty.activeStepId,[line]),annotation=project.steps[0].annotations!.find(a=>a.id===line.id) as DiagramLineAnnotation;
  assert.equal(annotation.foldFaces?.length,2);
  const edited=isolateDiagramLineEdits(project.steps[0].annotations!,project.steps[0].annotations!.map(a=>a.id===line.id?{...a,foldAngle:45}:a),{[line.id]:[annotation.foldFaces![0]]},()=> 'unselected-occurrence');
  const next=reconcileDiagramFoldAnnotations(project,project.activeStepId,edited),generated=next.steps[0].foldLink!.generated!;
  assert.deepEqual(generated.map(s=>Math.abs(s.angle!)).sort((a,b)=>a-b),[45,180]);
  assert.equal(next.states[1].doc.segments.find(s=>s.id==='prior-fold')!.angle,180);
  assert.deepEqual(next.states[0],project.states[0]);assertDiagramUndo(project,next);
});

test('before and after CP selections apply angles to the current after CP and restore the whole step on undo',()=>{
  for(const route of ['before','after'] as const){
    const empty=projectFixture(route==='before'),line=stroke([50,0],[50,100]);
    const project=route==='before'?empty:reconcileDiagramFoldAnnotations(empty,empty.activeStepId,[line]);
    const state=project.states[route==='before'?0:1],index=findDiagramCPEdge(state,line),snapshot=structuredClone(project);
    const next=editDiagramCPEdge(project,project.activeStepId,state.id,index,'V','fold',55);
    assert.equal(diagramCPEdgeSegment(next.states[1],findDiagramCPEdge(next.states[1],line)).angle,55);
    assert.deepEqual(next.states[0],project.states[0]);assert.deepEqual(project,snapshot);assertDiagramUndo(project,next);
  }
});
