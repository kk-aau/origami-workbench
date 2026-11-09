import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {computeFlatFold} from '../../src/core/flatFold';
import {createDiagramProject,adoptDiagramPose,updateDiagramFoldLink,updateDiagramPoseView} from '../../src/app/diagramProject';
import {defaultModelView} from '../../src/app/modelViewState';
import {reconcileDiagramFoldAnnotations,refreshDiagramFoldDrawing,adoptDiagramFoldCP} from '../../src/app/diagramFoldTransactions';
import {diagramFoldPreviewAttributes,drawingSVG} from '../../src/app/diagramDrawing';
import {pickTopDiagramAnnotation} from '../../src/app/diagramLinePick';
import {changeGlobalDiagramLineStyle,defaultDiagramLineDefaults,overrideDiagramLineAppearance,applyDiagramLineAppearance} from '../../src/app/diagramLineStyles';
import type {DiagramLineAnnotation} from '../../src/app/diagramAnnotations';

const line=(id='instruction'):DiagramLineAnnotation=>({id,kind:'line',a:[0,30],b:[50,30],style:'valley',color:'#293d35',width:.7});
const segment={face:0,a:[0,30] as [number,number],b:[50,30] as [number,number],assignment:'V' as const,visibility:'visible' as const};
const palette=()=>changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'valley',{color:'#bc2431',width:2,strokePattern:'dotted'});

test('ordinary artwork and linked preview resolve the same global fields without changing authored annotations',()=>{
  const source=line(),before=structuredClone(source),styles=palette();
  const ordinary=drawingSVG(null,[source],'','',undefined,[],true,styles);
  const linked=drawingSVG(null,[source],'','',[segment],[],true,styles);
  for(const svg of [ordinary,linked]){
    assert.match(svg,/stroke="#bc2431" stroke-width="2"[^>]*stroke-dasharray="2 8"/);
    assert.doesNotMatch(svg,/stroke="#293d35"/);
  }
  assert.deepEqual(source,before);
});

test('new CP feedback and material-specific local exceptions share the global resolver',()=>{
  const styles=palette(),raw=overrideDiagramLineAppearance({...line(),foldFaces:[0]},{color:'#d08415'}),other={...line('other-bank'),foldFaces:[1]};
  const snapshot=structuredClone([raw,other]);
  const local=diagramFoldPreviewAttributes(segment,[raw,other],'#41634e',styles);
  assert.equal(local.color,'#d08415');assert.equal(local.width,2);assert.equal(local.strokePattern,'dotted');
  assert.deepEqual(local.appearanceOverrides,['color']);assert.notStrictEqual(local.appearanceOverrides,raw.appearanceOverrides);
  assert.equal(diagramFoldPreviewAttributes({...segment,face:1},[raw,other],'#41634e',styles).color,'#bc2431');
  assert.equal(diagramFoldPreviewAttributes(segment,[],'#41634e',styles).color,'#bc2431');
  assert.deepEqual([raw,other],snapshot);
});

test('picking uses displayed global width but returns the original authored handle',()=>{
  const source=line(),before=structuredClone(source),styles=changeGlobalDiagramLineStyle(defaultDiagramLineDefaults(),'valley',{width:10});
  assert.equal(pickTopDiagramAnnotation([source],[25,34],0,null),null);
  assert.strictEqual(pickTopDiagramAnnotation([source],[25,34],0,null,undefined,false,styles)?.annotation,source);
  assert.deepEqual(source,before);
});

test('CP refreshes preserve field-specific local styling without merging unlike material ownership',()=>{
  const doc=blankDoc('外观与纸层绑定',100,100);doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'V',angle:180});
  let id=0,project=createDiagramProject(doc,()=>`appearance-${++id}`),stepId=project.activeStepId;
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,computeFlatFold(doc));
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[]});
  const own=overrideDiagramLineAppearance({...line('local-bank'),foldFaces:[0]},{color:'#293d35'}),inherited={...line('global-bank'),foldFaces:[1]};
  const linked=reconcileDiagramFoldAnnotations(project,stepId,[own,inherited]),saved=structuredClone(linked),after=linked.states.find(s=>s.id===linked.steps[0].afterId)!;
  for(const refreshed of [refreshDiagramFoldDrawing(linked,stepId),adoptDiagramFoldCP(linked,stepId,after.doc)]){
    const handles=(refreshed.steps[0].annotations??[]).filter((a):a is DiagramLineAnnotation=>a.kind==='line'&&a.style==='valley');
    assert.equal(handles.length,2,'same raw colors with different local scope remain separate');
    const local=handles.find(a=>a.foldFaces?.includes(0))!,global=handles.find(a=>a.foldFaces?.includes(1))!;
    assert.deepEqual(local.appearanceOverrides,['color']);assert.equal(global.appearanceOverrides,undefined);
    assert.equal(applyDiagramLineAppearance(local,palette()).color,'#293d35');assert.equal(applyDiagramLineAppearance(global,palette()).color,'#bc2431');
    assert.deepEqual(refreshed.states,linked.states);
  }
  assert.deepEqual(linked,saved);
});

for(const explicit of [true,false])test(explicit?'an explicitly selected standard dash stays fixed across front/back crease exchanges':'an inherited standard dash follows the front/back crease category',()=>{
  const doc=blankDoc('翻面时单线外观',100,100),front=defaultModelView(),back={...front,side:'back' as const};
  let id=0,project=createDiagramProject(doc,()=>`side-appearance-${++id}`),stepId=project.activeStepId;
  project=adoptDiagramPose(project,stepId,project.steps[0].beforeId,computeFlatFold(doc),front);
  project=updateDiagramFoldLink(project,stepId,{enabled:true,layers:'all',selectedFaces:[]});
  const raw={...line(),strokePattern:'dashed' as const},instruction=explicit?overrideDiagramLineAppearance(raw,{strokePattern:'dashed'}):raw;
  const linked=reconcileDiagramFoldAnnotations(project,stepId,[instruction]),saved=structuredClone(linked);
  const flipped=refreshDiagramFoldDrawing(updateDiagramPoseView(linked,stepId,back),stepId,front);
  const changed=(flipped.steps[0].annotations??[]).find((a):a is DiagramLineAnnotation=>a.kind==='line'&&a.id===instruction.id)!;
  assert.equal(changed.style,'mountain');assert.equal(changed.strokePattern,explicit?'dashed':'dash-dot');
  assert.deepEqual(changed.appearanceOverrides,explicit?['strokePattern']:undefined);
  const restored=refreshDiagramFoldDrawing(updateDiagramPoseView(flipped,stepId,front),stepId,back);
  const returned=(restored.steps[0].annotations??[]).find((a):a is DiagramLineAnnotation=>a.kind==='line'&&a.id===instruction.id)!;
  assert.equal(returned.style,'valley');assert.equal(returned.strokePattern,'dashed');
  assert.deepEqual(returned.appearanceOverrides,explicit?['strokePattern']:undefined);
  assert.deepEqual(flipped.states,linked.states);assert.deepEqual(restored.states,linked.states);assert.deepEqual(linked,saved);
});
