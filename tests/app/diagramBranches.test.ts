import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {diagramBranchNumbering,setDiagramBranchLabels} from '../../src/app/diagramBranches';
import {computeFlatFold} from '../../src/core/flatFold';
import {addDiagramBranch,adoptDiagramPose,appendDiagramStep,createDiagramProject,diagramBranchTree,diagramBranchFoldPreference,
  duplicateDiagramStep,exportDiagramProject,importDiagramProject,insertDiagramStepBefore,insertDiagramStepOnBranch,removeDiagramStep,
  selectDiagramBranchStep,updateDiagramCP,updateDiagramStep,validateDiagramProject} from '../../src/app/diagramProject';

function fork(){
  const doc=blankDoc('分支');
  const root=createDiagramProject(doc),parent=root.activeStepId;
  let first=appendDiagramStep(root);const a=first.activeStepId;
  first=updateDiagramStep(first,a,{title:'A'});
  const second=addDiagramBranch(first,parent),b=second.activeStepId;
  return {parent,a,b,project:updateDiagramStep(second,b,{title:'B'}),doc};
}

test('adding at a shared fork splices only the chosen arm, even when another route is active',()=>{
  const {project,parent,a,b}=fork();
  const named=setDiagramBranchLabels(project,parent,'custom',{[a]:'甲',[b]:'乙'});
  const bLeafProject=appendDiagramStep(named),bLeaf=bLeafProject.activeStepId;
  const aRoute=selectDiagramBranchStep(bLeafProject,a),snapshot=exportDiagramProject(aRoute);
  const sibling=diagramBranchTree(aRoute).children[0];
  const result=insertDiagramStepOnBranch(aRoute,{leafId:bLeaf,anchorId:parent,position:'after'});
  const inserted=result.activeStepId,tree=diagramBranchTree(result);
  assert.deepEqual(result.steps.map(s=>s.id),[parent,inserted,b,bLeaf]);
  assert.deepEqual(tree.children.map(n=>n.step.id),[a,inserted]);
  assert.equal(tree.children[0].step,sibling.step);
  assert.equal(tree.children[0].after,sibling.after);
  assert.equal(tree.after,sibling.before);
  assert.equal(result.steps[2].beforeId,result.steps[1].afterId);
  assert.equal(diagramBranchNumbering(result).stepLabels.get(inserted),'2乙');
  assert.equal(diagramBranchNumbering(result).stepLabels.get(b),'3乙');
  assert.equal(exportDiagramProject(aRoute),snapshot);
  const restored=importDiagramProject(exportDiagramProject(result));
  assert.deepEqual(diagramBranchTree(restored).children.map(n=>n.step.id),[a,inserted]);
});

test('before and after use the selected step on legacy branches, and append only at its leaf',()=>{
  const {project,parent,a,b}=fork(),continued=appendDiagramStep(appendDiagramStep(project));
  const [,,middle,leaf]=continued.steps;
  const parked=selectDiagramBranchStep(continued,a);
  const {branchOrder:_legacy,...oldProject}=parked;
  for(const [anchorId,position,expected] of [
    [middle.id,'before',[parent,b,'new',middle.id,leaf.id]],
    [b,'after',[parent,b,'new',middle.id,leaf.id]],
    [leaf.id,'after',[parent,b,middle.id,leaf.id,'new']],
  ] as const){
    const result=insertDiagramStepOnBranch(oldProject,{leafId:leaf.id,anchorId,position});
    assert.deepEqual(result.steps.map(s=>s.id===result.activeStepId?'new':s.id),expected);
    assert.deepEqual(selectDiagramBranchStep(result,a).steps.map(s=>s.id),[parent,a]);
    validateDiagramProject(result);
  }
  assert.throws(()=>insertDiagramStepOnBranch(parked,{leafId:leaf.id,anchorId:a,position:'after'}),/不属于/);
  assert.throws(()=>insertDiagramStepOnBranch(parked,{leafId:b,anchorId:parent,position:'after'}),/完整分支/);
  assert.throws(()=>insertDiagramStepOnBranch(parked,{leafId:'missing',anchorId:parent,position:'before'}),/不存在/);
});

test('step labels and shared CP numbers inherit nested fork tags across routes and portable saves',()=>{
  const {project,parent,a,b}=fork(),defaults=diagramBranchNumbering(project);
  assert.equal(defaults.stepLabels.get(parent),'1');assert.equal(defaults.stepLabels.get(a),'2A');assert.equal(defaults.stepLabels.get(b),'2B');
  assert.equal(defaults.cpLabels.get(project.states[0].id),'CP0');
  assert.equal(defaults.cpLabels.get(project.steps[1].beforeId),'CP1');
  const named=setDiagramBranchLabels(project,parent,'custom',{[a]:'  左翼  ',[b]:'右翼'});
  const c=appendDiagramStep(named),d=addDiagramBranch(c,b),e=appendDiagramStep(d);
  const numbers=setDiagramBranchLabels(e,b,'number');
  for(const copy of [numbers,selectDiagramBranchStep(numbers,a),importDiagramProject(exportDiagramProject(numbers))]){
    const n=diagramBranchNumbering(copy);
    assert.equal(n.stepLabels.get(b),'2右翼');assert.equal(n.stepLabels.get(c.activeStepId),'3右翼.1');
    assert.equal(n.stepLabels.get(d.activeStepId),'3右翼.2');assert.equal(n.stepLabels.get(e.activeStepId),'4右翼.2');
    assert.equal(n.ownerForks.get(b),parent);assert.equal(n.ownerForks.get(e.activeStepId),b);
    assert.equal(n.cpLabels.get(d.steps.at(-1)!.beforeId),'CP2右翼');assert.equal(n.cpLabels.get(d.steps.at(-1)!.afterId),'CP3右翼.2');
  }
  const lower=setDiagramBranchLabels(numbers,parent,'lower');
  assert.equal(diagramBranchNumbering(lower).stepLabels.get(e.activeStepId),'4b.2');
  assert.equal(diagramBranchNumbering(setDiagramBranchLabels(lower,parent,'number')).stepLabels.get(e.activeStepId),'4-2.2');
  const literal=setDiagramBranchLabels(numbers,parent,'custom',{[a]:'A.1',[b]:'A'});
  assert.equal(diagramBranchNumbering(literal).stepLabels.get(a),'2〔A.1〕');
  assert.equal(diagramBranchNumbering(literal).stepLabels.get(c.activeStepId),'3A.1');
});

test('editing the head of a named branch transfers its tag and deleting a sibling leaves the survivors intact',()=>{
  const {project,parent,a,b}=fork(),third=addDiagramBranch(project,parent),c=third.activeStepId;
  const named=setDiagramBranchLabels(third,parent,'custom',{[a]:'A',[b]:'B',[c]:'C'});
  const removed=removeDiagramStep(named,c);
  assert.deepEqual(diagramBranchNumbering(removed).forks.get(parent)?.arms.map(row=>row.label),['A','B']);
  const routed=selectDiagramBranchStep(removed,b);
  const inserted=insertDiagramStepBefore(routed,b);
  assert.equal(diagramBranchNumbering(inserted).stepLabels.get(inserted.activeStepId),'2B');
  assert.equal(diagramBranchNumbering(inserted).stepLabels.get(b),'3B');
  const duplicated=duplicateDiagramStep(inserted,parent),restored=removeDiagramStep(duplicated,duplicated.activeStepId);
  assert.equal(diagramBranchNumbering(duplicated).stepLabels.get(b),'4B');
  assert.equal(diagramBranchNumbering(restored).stepLabels.get(b),'3B');
  for(const p of [removed,inserted,duplicated,restored])validateDiagramProject(p);
});

test('invalid fork numbering is rejected and new arms get unused custom defaults',()=>{
  const {project,parent,a,b}=fork();
  const named=setDiagramBranchLabels(project,parent,'custom',{[a]:'B',[b]:'A'});
  const next=addDiagramBranch(named,parent);
  assert.equal(diagramBranchNumbering(next).stepLabels.get(next.activeStepId),'2C');
  assert.throws(()=>setDiagramBranchLabels(named,parent,'custom',{[a]:'X',[b]:'X'}),/重复/);
  assert.throws(()=>setDiagramBranchLabels(named,parent,'custom',{[a]:' '}),/单行/);
  assert.throws(()=>validateDiagramProject({...named,branchLabels:{missing:{mode:'number'}}}),/分叉/);
});

test('forking a leaf creates two independent continuations in a single immutable edit',()=>{
  const before=createDiagramProject(blankDoc());
  const next=addDiagramBranch(before,before.activeStepId),root=diagramBranchTree(next);
  assert.equal(before.steps.length,1);
  assert.equal(before.branchSteps,undefined);
  assert.equal(root.children.length,2);
  assert.equal(root.children[1].step.id,next.activeStepId);
  assert.notEqual(root.children[0].after.id,root.children[1].after.id);
  const shared=updateDiagramCP(next,root.after.id,blankDoc('共同起点'));
  assert.equal(selectDiagramBranchStep(shared,root.children[0].step.id).states[1].doc.name,'共同起点');
});

test('shared input and private outcomes survive nested branching, route switching and saving',()=>{
  const {project,parent,a,b}=fork();
  const c=appendDiagramStep(project);
  const d=addDiagramBranch(c,b);
  const altered=updateDiagramCP(d,d.states.at(-1)!.id,blankDoc('D 的结果'));
  const back=selectDiagramBranchStep(altered,a);
  assert.deepEqual(back.steps.map(s=>s.id),[parent,a]);
  assert.equal(back.states[1],altered.states[1]);
  assert.equal(back.states.at(-1)!.doc.name,'分支');
  const saved=importDiagramProject(exportDiagramProject(back));
  const tree=diagramBranchTree(saved);
  assert.deepEqual(tree.children.map(n=>n.step.id),[a,b]);
  assert.deepEqual(tree.children[1].children.map(n=>n.step.id),[c.activeStepId,d.activeStepId]);
  assert.deepEqual(tree.children.map(n=>n.before),[tree.after,tree.after]);
  assert.equal(selectDiagramBranchStep(saved,d.activeStepId).states.at(-1)!.doc.name,'D 的结果');
  assert.equal(selectDiagramBranchStep(saved,c.activeStepId).states.at(-1)!.doc.name,'分支');
});

test('inserting or copying on one route preserves its sibling and its shared boundary',()=>{
  const {project,parent,a,b}=fork();
  const original=diagramBranchTree(project).children[0];
  const inserted=insertDiagramStepBefore(project,b);
  assert.equal(inserted.states[1],project.states[1]);
  assert.deepEqual(diagramBranchTree(inserted).children.map(n=>n.step.id),[a,inserted.activeStepId]);
  assert.equal(selectDiagramBranchStep(inserted,a).steps[1],original.step);
  const dup=duplicateDiagramStep(inserted,parent);
  validateDiagramProject(dup);
  assert.deepEqual(diagramBranchTree(dup).children.map(n=>n.step.id),[a,dup.activeStepId]);
  const restored=removeDiagramStep(dup,dup.activeStepId);
  assert.deepEqual(restored.steps.map(s=>s.id),inserted.steps.map(s=>s.id));
  assert.equal(diagramBranchTree(restored).children[0].before.id,original.before.id);
});

test('deleting the last step of a route exposes the surviving continuation; deleting an internal fork reparents all arms',()=>{
  const {project,a,b}=fork();
  assert.equal(removeDiagramStep(project,b).steps.at(-1)!.id,a);
  const c=appendDiagramStep(project),d=addDiagramBranch(c,b);
  const removed=removeDiagramStep(d,b);
  validateDiagramProject(removed);
  const children=diagramBranchTree(removed).children;
  assert.deepEqual(new Set(children.map(n=>n.step.id)),new Set([a,c.activeStepId,d.activeStepId]));
  assert.ok(children.every(node=>node.before.id===removed.states[1].id));
});

test('a fork inherits its parent drawing and a saved inactive pose can be reopened',()=>{
  const {project,b,doc}=fork();
  const posed=adoptDiagramPose(project,b,project.steps.at(-1)!.beforeId,computeFlatFold(doc));
  const continued=appendDiagramStep(posed),branch=addDiagramBranch(continued,b);
  assert.ok(branch.steps.at(-1)?.pose);
  const parked=selectDiagramBranchStep(branch,continued.activeStepId);
  const resumed=selectDiagramBranchStep(importDiagramProject(exportDiagramProject(parked)),branch.activeStepId);
  assert.equal(resumed.steps.at(-1)?.pose?.sourceStateId,resumed.states.at(-2)?.id);
});

test('a new arm can reuse a solved common input without copying the sibling artwork or edited geometry',()=>{
  const doc=blankDoc(),root=createDiagramProject(doc),a=appendDiagramStep(root);
  const input=a.states[1],solved=computeFlatFold(doc);
  const candidate=adoptDiagramPose(a,a.activeStepId,input.id,solved);
  const titled=updateDiagramStep(candidate,a.activeStepId,{title:'仅在 A 出现'});
  const next=addDiagramBranch(titled,root.activeStepId),b=next.steps.at(-1)!;
  assert.equal(b.pose?.sourceStateId,input.id);
  assert.equal(b.pose?.result.layers.status,'solved');
  assert.equal(b.title,'');assert.deepEqual(b.annotations,[]);
  const edited=structuredClone(titled);edited.steps.at(-1)!.pose!.result.geometry.modified=true;
  const unknown=addDiagramBranch(edited,root.activeStepId),unposed=unknown.steps.at(-1)!;
  assert.equal(unposed.pose,null);
  assert.deepEqual(diagramBranchFoldPreference(unknown,unposed,input),{startingFace:0,solutionIndex:0});
  assert.equal(diagramBranchFoldPreference(unknown,unposed,input,2),undefined);
  assert.equal(diagramBranchFoldPreference(unknown,unposed,{...input,revision:input.revision+1}),undefined);
  assert.equal(diagramBranchFoldPreference(unknown,unposed,{...input,doc:blankDoc('不同折法')}),undefined);
  assert.equal(diagramBranchFoldPreference(unknown,unposed,unknown.states.at(-1)!),undefined);
  const stale=updateDiagramCP(titled,input.id,blankDoc('输入已修改'));
  assert.equal(addDiagramBranch(stale,root.activeStepId).steps.at(-1)?.pose,null);
});

test('invalid branches, duplicate IDs and disconnected cycles are rejected on open',()=>{
  const {project,b}=fork(),entry=project.branchSteps![0];
  assert.throws(()=>validateDiagramProject({...project,branchOrder:[b,b]}));
  assert.throws(()=>validateDiagramProject({...project,branchSteps:[{...entry,parentId:'missing'}]}));
  assert.throws(()=>validateDiagramProject({...project,branchSteps:[{...entry,step:{...entry.step,id:b}}]}));
  assert.throws(()=>validateDiagramProject({...project,branchSteps:[{...entry,parentId:entry.step.id,step:{...entry.step,beforeId:entry.after.id}}]}));
});
