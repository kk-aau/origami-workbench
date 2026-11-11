import test from 'node:test';
import assert from 'node:assert/strict';
import {checkLearningDesignTask,compileLearningDesign,exportLearningDesign,importLearningDesign,learningDesignIssues,loadLearningDesigns,newLearningDesign,newLearningDesignTask,saveLearningDesigns} from '../../src/app/diagramLearningDesign';
import {DIAGRAM_LESSONS,loadLearningProgress,saveLearningProgress,type LearningObservation} from '../../src/app/diagramLearning';
import {importDiagramProject,exportDiagramProject,appendDiagramStep} from '../../src/app/diagramProject';
import {setPreferenceService} from '../../src/app/preferenceStorage';
const observation:LearningObservation={comparison:false,editCP:null,tool:'select',selectedLineCount:0,side:'front'};
test('designs roundtrip self-contained initial and branch projects, guide coordinates and custom questions',()=>{
 const d=newLearningDesign(),t=d.tasks[0];t.message='自己比较两种固定侧';t.guide={kind:'line',points:[[0,0],[200,200]],tool:'line'};t.scene=d.initial;
 const question=newLearningDesignTask();question.message='哪个纸面保持不动？';question.rule={kind:'question',answers:['我选的纸面','屏幕左边'],correct:0};d.tasks.push(question);
 const copy=importLearningDesign(exportLearningDesign(d));assert.deepEqual(copy,d);assert.equal(importDiagramProject(copy.tasks[0].scene!).steps.length,1);assert.equal(compileLearningDesign(copy).tasks[1].question?.correct,0);
 const bad=structuredClone(d) as any;bad.tasks[0].guide={kind:'control',control:{kind:'selector',value:'script',tag:'script',index:0}};assert.throws(()=>importLearningDesign(JSON.stringify(bad)),/位置无效/);
 bad.tasks[0]=structuredClone(t);bad.tasks[1].id=t.id;assert.throws(()=>importLearningDesign(JSON.stringify(bad)),/编号重复/);
});
test('drafts with unfinished text survive storage, but incomplete conditions block preview',()=>{
 const values=new Map<string,string>();setPreferenceService({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)});
 try{const d=newLearningDesign();d.title='';d.tasks[0].rule={kind:'fixed'};saveLearningDesigns([d]);assert.equal(loadLearningDesigns()[0].title,'');assert.equal(learningDesignIssues(d).length,3);assert.deepEqual([...values.keys()],['zhezhi.learning-designs.v1']);}finally{setPreferenceService(undefined);}
});
test('authored fixed and future-scope conditions match the recorded choice rather than assuming a global bottom layer',()=>{
 const d=newLearningDesign(),p=importDiagramProject(d.initial),s=p.steps[0],t=d.tasks[0];
 t.rule={kind:'fixed',expected:{point:[150,50],matrix:[1,0,0,1,0,0]}};s.foldLink!.fixed={point:[50,150],matrix:[1,0,0,1,0,0]};assert.equal(checkLearningDesignTask(t,p,observation),false);
 s.foldLink!.fixed.point=[150,50];assert.equal(checkLearningDesignTask(t,p,observation),true);
 t.rule={kind:'scope',expected:{layers:'selected',faces:[7,2]}};s.foldLink!.layers='selected';s.foldLink!.selectedFaces=[2,7];assert.equal(checkLearningDesignTask(t,p,observation),true);assert.equal(checkLearningDesignTask(t,p,{...observation,selectedLineCount:1}),false);s.foldLink!.selectedFaces=[0];assert.equal(checkLearningDesignTask(t,p,observation),false);
});
test('line completion requires a new real annotation at the selected endpoints; next requires a solved later step',()=>{
 const d=newLearningDesign(),p=importDiagramProject(d.initial),baseline=structuredClone(p),t=d.tasks[0];t.guide={kind:'line',points:[[0,0],[200,200]],tool:'line'};t.rule={kind:'line'};
 assert.equal(checkLearningDesignTask(t,p,observation,baseline),false);p.steps[0].annotations=[{id:'new-line',kind:'line',style:'valley',a:[200,200],b:[0,0],color:'#123456',width:.7}];assert.equal(checkLearningDesignTask(t,p,observation,baseline),true);assert.equal(checkLearningDesignTask(t,p,observation,p),false);
 t.rule={kind:'next'};const next=appendDiagramStep(p);assert.equal(checkLearningDesignTask(t,next,observation,baseline),false);next.steps[1].pose=structuredClone(baseline.steps[0].pose);next.steps[1].pose!.result.layers.status='solved';assert.equal(checkLearningDesignTask(t,next,observation,baseline),true);
});
test('custom progress survives restart and edits without discarding other lessons; disputed built-ins are withdrawn',()=>{
 const values=new Map<string,string>();setPreferenceService({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)});
 try{const d=newLearningDesign(),p=importDiagramProject(d.initial);saveLearningProgress({[d.id]:{task:1,completed:[d.tasks[0].id],skipped:[],project:p,revision:1}});const lesson=compileLearningDesign(d);assert.equal(loadLearningProgress([...DIAGRAM_LESSONS,lesson])[d.id].task,1);d.revision++;d.tasks=[newLearningDesignTask()];assert.doesNotThrow(()=>loadLearningProgress([...DIAGRAM_LESSONS,compileLearningDesign(d)]));assert.equal(DIAGRAM_LESSONS.find(l=>l.id==='fixed')?.withdrawn,true);assert.equal(DIAGRAM_LESSONS.find(l=>l.id==='layers')?.withdrawn,true);assert.ok(exportDiagramProject(p));}finally{setPreferenceService(undefined);}
});
