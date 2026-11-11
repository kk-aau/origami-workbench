import test from 'node:test';
import assert from 'node:assert/strict';
import {DIAGRAM_LESSONS,createLearningProject,learningBottomFace,learningFixedCPFace,loadLearningProgress,saveLearningProgress,type LearningObservation} from '../../src/app/diagramLearning';
import {fixedDiagramCPSelection} from '../../src/app/diagramCPSelection';
import {setPreferenceService} from '../../src/app/preferenceStorage';
import {buildDiagramFold} from '../../src/core/geometry';
const observation:LearningObservation={comparison:false,editCP:null,tool:'line',selectedLineCount:0,side:'front'};
test('all five teaching seeds are real solved CP projects, two-layer lessons have overlapping material faces',()=>{
 for(const l of DIAGRAM_LESSONS){const p=createLearningProject(l);assert.equal(p.steps[0].pose?.result.layers.status,'solved');assert.equal(p.steps[0].pose?.sourceStateId,p.states[0].id);if(l.folded){assert.equal(p.steps[0].pose?.result.geometry.faces.length,2);assert.ok(p.steps[0].pose!.result.layers.faceOrder!.includes(learningBottomFace(p)));}}
});
test('fold lesson requires the actual full diagonal in operation-after CP, independent of toolbar clicks',()=>{
 const l=DIAGRAM_LESSONS[1],p=createLearningProject(l),check=l.tasks[0].check!;
 assert.equal(check(p,observation),false);p.states[1].doc.segments.push({id:'test',a:[0,0],b:[20,20],assignment:'V',angle:180});assert.equal(check(p,observation),false);
 p.states[1].doc.segments.at(-1)!.b=[200,200];assert.equal(check(p,observation),true);p.states[1].doc.segments.at(-1)!.assignment='M';assert.equal(check(p,observation),false);
});
test('selected-line state cannot count as setting future scope, and a wrong material face cannot complete a line task',()=>{
 const l=DIAGRAM_LESSONS[4],p=createLearningProject(l),face=learningBottomFace(p);p.steps[0].foldLink={enabled:true,layers:'selected',selectedFaces:[face]};
 assert.equal(l.tasks[0].check!(p,{...observation,selectedLineCount:1}),false);assert.equal(l.tasks[0].check!(p,observation),true);
 const line={id:'practice-line',kind:'line' as const,style:'valley' as const,a:[25,30] as [number,number],b:[70,30] as [number,number],color:'#123456',width:.7,foldFaces:[1-face]};p.steps[0].annotations=[line];
 assert.equal(l.tasks[1].check!(p,observation),false);line.foldFaces=[face];assert.equal(l.tasks[1].check!(p,observation),false,'correct layer with wrong endpoints must remain incomplete');line.a=[100,50];line.b=[150,75];assert.equal(l.tasks[1].check!(p,observation),true);
});
test('progress roundtrips validated practice projects and task baselines without touching regular library keys',()=>{
 const values=new Map<string,string>();setPreferenceService({getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);}});
 try{const p=createLearningProject(DIAGRAM_LESSONS[0]);saveLearningProgress({cp:{task:1,completed:['compare'],skipped:[],project:p,baseline:p}});const restored=loadLearningProgress();assert.equal(restored.cp.task,1);assert.deepEqual(restored.cp.project.states,p.states);assert.deepEqual(restored.cp.baseline?.states,p.states);assert.deepEqual(restored.cp.project.steps[0].pose?.result.geometry.vertices,p.steps[0].pose?.result.geometry.vertices);assert.equal(restored.cp.project.steps[0].pose?.result.layers.status,'unknown','restoring a snapshot must not trust an old layer certificate');assert.deepEqual([...values.keys()],['zhezhi.diagram-learning.v1']);}finally{setPreferenceService(undefined);}
});
test('fixed-side teaching checks the specified material position and requires CP provenance in the CP lesson',()=>{
 const mainLesson=DIAGRAM_LESSONS[1],p=createLearningProject(mainLesson),s=p.steps[0];
 s.foldLink!.fixed={point:[50,150],matrix:[1,0,0,1,0,0]};assert.equal(mainLesson.tasks[1].check!(p,observation),false);
 s.foldLink!.fixed.point=[150,50];assert.equal(mainLesson.tasks[1].check!(p,observation),true);
 const cpLesson=DIAGRAM_LESSONS[3],q=createLearningProject(cpLesson),step=q.steps[0],graph=buildDiagramFold(q.states[1].doc).graph,face=learningFixedCPFace(q);
 const center=(face:number)=>graph.faces_vertices![face].reduce((sum,v,_i,a)=>[sum[0]+graph.vertices_coords[v][0]/a.length,sum[1]+graph.vertices_coords[v][1]/a.length],[0,0]) as [number,number];
 step.foldLink!.fixed={point:center(face),matrix:[1,0,0,1,0,0]};assert.equal(cpLesson.tasks[0].check!(q,observation),false,'main canvas or layer-list fixation cannot satisfy CP teaching');
 step.foldLink!.fixed.target={stateId:step.beforeId,kind:'face',point:center(face)};assert.equal(cpLesson.tasks[0].check!(q,observation),false,'before CP has no fold yet and cannot specify a folding side');
 step.foldLink!.fixed.target.stateId=step.afterId;assert.equal(cpLesson.tasks[0].check!(q,observation),true);
 step.foldLink!.fixed.point=center(1-face);assert.equal(cpLesson.tasks[0].check!(q,observation),false,'wrong CP face remains incomplete');
});

test('CP fixed-side lesson starts unfolded and can fix a pending after-CP face through the real mapping',()=>{
 const lesson=DIAGRAM_LESSONS[3],p=createLearningProject(lesson),s=p.steps[0],before=p.states[0],after=p.states[1];
 assert.equal(s.pose!.result.geometry.faces.length,1,'main drawing must start as a flat sheet');
 assert.equal(before.doc.segments.filter(s=>s.assignment==='V').length,0);
 assert.equal(after.doc.segments.filter(s=>s.assignment==='V'&&s.angle===180).length,1);
 assert.equal(buildDiagramFold(after.doc).graph.faces_vertices!.length,2);
 assert.equal(s.foldLink!.fixed,undefined,'the learner must choose the fixed side');
 assert.equal(lesson.tasks[1].id,'next','execute the fold after selecting the fixed side');
 s.foldLink!.fixed=fixedDiagramCPSelection(s.pose!,after,{kind:'face',index:learningFixedCPFace(p)},0,after.doc,[150,50],before);
 assert.equal(lesson.tasks[0].check!(p,observation),true);
 assert.equal(s.pose!.result.geometry.faces.length,1,'selecting the fixed side must not fold the main drawing');
});
