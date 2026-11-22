import assert from 'node:assert/strict';
import test from 'node:test';
import {addDiagramBranch,appendDiagramStep,createDiagramProject,diagramBranchStepCount,importDiagramProject,selectDiagramBranchStep,updateDiagramStep} from '../../src/app/diagramProject';
import {diagramFileCaptionEdits} from '../../src/app/diagramProjectContent';
import {encodePreparedCaptionEdits,encodePreparedDiagramFile,inspectPreparedDiagram} from '../../src/app/diagramPreparedFile';
import {makeDiagramRecoveryPatch,restoreDiagramRecoveryPatch} from '../../src/app/diagramRecoveryPatch';
import {createDiagramLibrary} from '../../src/app/diagramLibrary';
import {blankDoc} from '../../src/app/state';
import {normalizeImportedDiagramCP} from '../../src/app/diagramCP';
import {diagramBranchNumbering,setDiagramBranchLabels} from '../../src/app/diagramBranches';

test('opening a file normalizes crossing creases in inactive branch CPs as well',()=>{
  const original=createDiagramProject(blankDoc('分支交点',100,100));
  const project=addDiagramBranch(original,original.activeStepId);
  const before=project.branchSteps![0].after;
  before.doc.segments.push({id:'h',a:[0,50],b:[100,50],assignment:'V',angle:180},{id:'v',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  const result=normalizeImportedDiagramCP(project);
  assert.ok(result.changedStateIds.includes(before.id));
  assert.equal(result.project.branchSteps![0].after.revision,before.revision+1);
  const after=selectDiagramBranchStep(result.project,project.branchSteps![0].step.id).states.at(-1)!;
  assert.equal(after.doc.segments.filter(s=>s.assignment==='M'||s.assignment==='V').length,4);
});

test('prepared files, imported snapshots, library drafts and recovery patches retain alternate branches',async()=>{
  let seq=0;const id=()=>'branch-'+(++seq);
  const original=appendDiagramStep(createDiagramProject(blankDoc('分支示例',100,100),id),id);
  const a=original.activeStepId,root=original.steps[0].id;
  const fork=addDiagramBranch(updateDiagramStep(original,a,{title:'A 款'}),root,id),b=fork.activeStepId;
  const project=setDiagramBranchLabels(updateDiagramStep(fork,b,{title:'B 款'}),root,'custom',{[a]:'经典',[b]:'墨镜'});
  assert.equal(diagramFileCaptionEdits(original,project),undefined);
  const file=await encodePreparedDiagramFile(project),receipt=inspectPreparedDiagram(JSON.parse(file.text))!;
  assert.ok(file.complete&&await receipt.matches(receipt.project));
  const edited=updateDiagramStep(receipt.project,b,{title:'B 款修改'});
  const captionEdit=diagramFileCaptionEdits(receipt.project,edited)!;
  const fastSaved=await encodePreparedCaptionEdits(file.text,captionEdit);
  assert.ok(fastSaved);
  const fast=inspectPreparedDiagram(JSON.parse(fastSaved))!;
  assert.ok(await fast.matches(fast.project));
  const raw=new Map<string,string>(),storage={getItem:(key:string)=>raw.get(key)??null,setItem:(key:string,text:string)=>{raw.set(key,text);}};
  const entry=createDiagramLibrary(storage).save(edited,{kind:'draft'});
  assert.equal(entry.stepCount,3);
  const patch=makeDiagramRecoveryPatch('base',original,edited);
  for(const opened of [fast.project,importDiagramProject(fastSaved),createDiagramLibrary(storage).load(entry.id),restoreDiagramRecoveryPatch('base',original,JSON.stringify(patch))]){
    assert.equal(diagramBranchStepCount(opened),3);
    assert.equal(diagramBranchNumbering(opened).stepLabels.get(a),'2经典');
    assert.equal(diagramBranchNumbering(opened).cpLabels.get(opened.steps.at(-1)!.afterId),'CP2墨镜');
    assert.equal(selectDiagramBranchStep(opened,a).steps[1].title,'A 款');
    assert.equal(selectDiagramBranchStep(opened,b).steps[1].title,'B 款修改');
  }
});
