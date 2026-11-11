import {createLearningProject,type LearningLesson,type LearningObservation,type LearningTask} from './diagramLearning';
import {exportDiagramProject,importDiagramProject,type DiagramProject} from './diagramProject';
import {preferenceStorage} from './preferenceStorage';
import type {Point} from '../core/types';
import type {DiagramFoldAnchor} from './diagramFoldLinkTypes';

export type LearningControl={kind:'teach'|'id'|'label'|'text';value:string;tag:string;index:number};
export type LearningDesignGuide=
 |{kind:'none'}
 |{kind:'control';control:LearningControl}
 |{kind:'point';point:Point;tool:string}
 |{kind:'line';points:[Point,Point];tool:'line'}
 |{kind:'cp-face';phase:'before'|'after';face:number};
export type LearningDesignRule=
 |{kind:'manual'|'click'|'next'|'line'}
 |{kind:'fixed';expected?:DiagramFoldAnchor}
 |{kind:'scope';expected?:{layers:string;faces:number[]}}
 |{kind:'question';answers:string[];correct:number};
export interface LearningDesignTask {
 id:string;title:string;message:string;hint:string;guide:LearningDesignGuide;rule:LearningDesignRule;
 /** Optional independent starting point, allowing comparisons to branch from the same CP. */
 scene?:string;
 /** Real demonstrated actions in order; the canvas stays interactive while authoring. */
 route?:LearningDesignGuide[];
 demo?:{after:string};
}
export interface LearningDesign {format:'zhezhi-learning';version:1;id:string;revision:number;title:string;description:string;initial:string;tasks:LearningDesignTask[]}
const KEY='zhezhi.learning-designs.v1';
export const newLearningDesignTask=():LearningDesignTask=>({id:crypto.randomUUID(),title:'新环节',message:'',hint:'',guide:{kind:'none'},rule:{kind:'manual'}});
export function newLearningDesign(project?:DiagramProject):LearningDesign {
 return {format:'zhezhi-learning',version:1,id:'custom-'+crypto.randomUUID(),revision:1,title:'我的教学',description:'',initial:exportDiagramProject(project??createLearningProject({id:'author',title:'教学空白工程',description:'',tasks:[]})),tasks:[newLearningDesignTask()]};
}
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string';
const point=(v:unknown):v is Point=>Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1_000_000);
const natural=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const validAnchor=(v:unknown)=>isRecord(v)&&point(v.point)&&Array.isArray(v.matrix)&&v.matrix.length===6&&v.matrix.every(n=>typeof n==='number'&&Number.isFinite(n));
function validateGuide(g:unknown):void {
 if(!isRecord(g))throw Error('引导位置无效。');
 if(g.kind==='control'){
  const c=g.control;if(!isRecord(c)||!['teach','id','label','text'].includes(String(c.kind))||!text(c.value)||!c.value||!['button','input','textarea','select'].includes(String(c.tag))||!natural(c.index))throw Error('界面操作位置无效。');
 }else if(g.kind==='point'){if(!point(g.point)||!text(g.tool))throw Error('画布引导点无效。');}
 else if(g.kind==='line'){if(!Array.isArray(g.points)||g.points.length!==2||!g.points.every(point)||g.tool!=='line')throw Error('折线引导端点无效。');}
 else if(g.kind==='cp-face'){if(!['before','after'].includes(String(g.phase))||!natural(g.face))throw Error('CP 纸面引导无效。');}
 else if(g.kind!=='none')throw Error('不支持的引导方式。');
}
export function validateLearningDesign(v:unknown):asserts v is LearningDesign {
 if(!isRecord(v)||v.format!=='zhezhi-learning'||v.version!==1||!text(v.id)||!v.id.startsWith('custom-')||!natural(v.revision)||!text(v.title)||!text(v.description)||!text(v.initial)||!Array.isArray(v.tasks)||!v.tasks.length)throw Error('教学方案格式不正确，或缺少起始工程、教学环节。');
 importDiagramProject(v.initial);
 const ids=new Set<string>();
 for(const t of v.tasks){
  if(!isRecord(t)||!text(t.id)||!t.id||ids.has(t.id)||!text(t.title)||!text(t.message)||!text(t.hint)||!isRecord(t.guide)||!isRecord(t.rule))throw Error('教学环节内容无效或编号重复。');ids.add(t.id);
  if(t.scene!==undefined){if(!text(t.scene))throw Error('环节起始工程无效。');importDiagramProject(t.scene);}
  if(t.demo!==undefined){if(!isRecord(t.demo)||!text(t.demo.after))throw Error('示范结果无效。');importDiagramProject(t.demo.after);}
  if(t.route!==undefined){
   if(!Array.isArray(t.route))throw Error('示范操作序列无效。');
   for(const guide of t.route)validateGuide(guide);
  }
  validateGuide(t.guide);const r=t.rule;
  if(r.kind==='fixed'){if(r.expected!==undefined&&!validAnchor(r.expected))throw Error('记录的固定设置无效。');}
  else if(r.kind==='scope'){if(r.expected!==undefined&&(!isRecord(r.expected)||!['all','top','selected'].includes(String(r.expected.layers))||!Array.isArray(r.expected.faces)||!r.expected.faces.every(natural)))throw Error('记录的纸层范围无效。');}
  else if(r.kind==='question'){if(!Array.isArray(r.answers)||r.answers.length<2||!r.answers.every(text)||!natural(r.correct)||r.correct>=r.answers.length)throw Error('问答的选项或正确答案无效。');}
  else if(!['manual','click','next','line'].includes(String(r.kind)))throw Error('不支持的完成条件。');
 }
}
export function importLearningDesign(source:string):LearningDesign {const value:unknown=JSON.parse(source);validateLearningDesign(value);return value;}
export function exportLearningDesign(design:LearningDesign):string {validateLearningDesign(design);return JSON.stringify(design,null,2);}
export function loadLearningDesigns():LearningDesign[]{
 const raw=preferenceStorage.getItem(KEY);if(!raw)return [];const data:unknown=JSON.parse(raw);
 if(!Array.isArray(data))throw Error('本机教学方案列表无效。');const ids=new Set<string>();
 for(const item of data){validateLearningDesign(item);if(ids.has(item.id))throw Error('教学方案编号重复。');ids.add(item.id);}return data;
}
/** Fields and project snapshots are already immutable; no solver or image conversion runs on typing. */
export function saveLearningDesigns(designs:LearningDesign[]){preferenceStorage.setItem(KEY,JSON.stringify(designs));}
const active=(p:DiagramProject)=>p.steps.find(s=>s.id===p.activeStepId)!;
const near=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=4;
export function checkLearningDesignTask(task:LearningDesignTask,p:DiagramProject,_o:LearningObservation,baseline?:DiagramProject):boolean {
 const rule=task.rule,s=active(p);
 if(rule.kind==='next')return !!baseline&&p.steps.findIndex(s=>s.id===p.activeStepId)>baseline.steps.findIndex(s=>s.id===baseline.activeStepId)&&s.pose?.result.layers.status==='solved';
 if(rule.kind==='fixed'){
  const f=s.foldLink?.fixed,e=rule.expected;
  return !!f&&!!e&&near(f.point,e.point)&&f.matrix.every((v,i)=>Math.abs(v-e.matrix[i])<1e-6)&&f.target?.kind===e.target?.kind&&f.target?.stateId===e.target?.stateId;
 }
 if(rule.kind==='scope')return _o.selectedLineCount===0&&!!rule.expected&&s.foldLink?.layers===rule.expected.layers&&JSON.stringify([...(s.foldLink?.selectedFaces??[])].sort((a,b)=>a-b))===JSON.stringify([...rule.expected.faces].sort((a,b)=>a-b));
 if(rule.kind==='line'&&task.guide.kind==='line'){
  const [a,b]=task.guide.points,previous=new Set(baseline?.steps.flatMap(s=>s.annotations?.map(a=>a.id)??[])??[]);
  return s.annotations?.some(line=>line.kind==='line'&&!line.id.startsWith('cp-existing:')&&!previous.has(line.id)&&(near(line.a,a)&&near(line.b,b)||near(line.a,b)&&near(line.b,a)))??false;
 }return false;
}
export function compileLearningDesign(design:LearningDesign):LearningLesson {
 return {id:design.id,title:design.title||'未命名教学',description:design.description,revision:design.revision,tasks:design.tasks.map((t):LearningTask=>({id:t.id,title:t.title,goal:t.message,hints:[t.hint||t.message,t.hint||t.message],target:'',design:t,...(t.rule.kind==='question'?{question:{answers:t.rule.answers,correct:t.rule.correct}}:{}),check:(p,o,b)=>checkLearningDesignTask(t,p,o,b)}))};
}
export function learningDesignIssues(design:LearningDesign):string[]{
 const issues:string[]=[];if(!design.title.trim())issues.push('请填写教学名称。');
 design.tasks.forEach((t,i)=>{const prefix=`环节 ${i+1}：`;
  if(!t.message.trim())issues.push(prefix+'请填写对用户说的话。');
  if(t.rule.kind==='line'&&(t.guide.kind!=='line'||near(t.guide.points[0],t.guide.points[1])))issues.push(prefix+'请选取不同的折线两端。');
  if(t.rule.kind==='click'&&['none','line'].includes(t.guide.kind))issues.push(prefix+'请选取要点击的控件、画布点或 CP 纸面。');
  if((t.rule.kind==='fixed'||t.rule.kind==='scope')&&!t.rule.expected)issues.push(prefix+'请先记录完成条件需要的实际设置。');
  if(t.rule.kind==='question'&&t.rule.answers.some(a=>!a.trim()))issues.push(prefix+'请填写所有答案选项。');
 });return issues;
}
