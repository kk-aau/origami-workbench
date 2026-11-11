import {blankDoc} from './state';
import {computeFlatFold} from '../core/flatFold';
import {buildDiagramFold} from '../core/geometry';
import {materialFaceInside} from '../core/materialRings';
import {modelProjection} from './modelProjection';
import type {Point} from '../core/types';
import {createDiagramProject,exportDiagramProject,importDiagramProject,type DiagramProject} from './diagramProject';
import {preferenceStorage} from './preferenceStorage';
import type {LearningDesignTask} from './diagramLearningDesign';

export interface LearningObservation {comparison:boolean;editCP:string|null;tool:string;selectedLineCount:number;side:string;cpSelection?:{stateId:string;kind:string;index:number}|null}
export interface LearningTask {id:string;title:string;goal:string;hints:[string,string];target:string;question?:{answers:string[];correct:number};check?:(p:DiagramProject,o:LearningObservation,baseline?:DiagramProject)=>boolean;design?:LearningDesignTask}
export interface LearningLesson {id:string;title:string;description:string;tasks:LearningTask[];folded?:boolean;revision?:number;withdrawn?:boolean}
const current=(p:DiagramProject)=>p.steps.find(s=>s.id===p.activeStepId)!;
const lines=(p:DiagramProject)=>current(p).annotations?.filter((a):a is import('./diagramAnnotations').DiagramLineAnnotation=>a.kind==='line'&&a.style==='valley')??[];
export const learningBottomFace=(p:DiagramProject)=>p.steps[0].pose?.result.layers.faceOrder?.[0]??0;
/** The fixed-side exercise starts flat; select a material region in its pending after CP. */
export function learningFixedCPFace(p:DiagramProject):number {
 const step=p.steps[0],graph=buildDiagramFold(p.states.find(s=>s.id===step.afterId)!.doc).graph;
 return (graph.faces_vertices??[]).findIndex((_,face)=>materialFaceInside(graph,face,[150,50]));
}
export function learningDrawPoints(p:DiagramProject,lessonId:string):Point[]{
 const points:Point[]=lessonId==='fold'?[[0,0],[200,200]]:[[100,50],[150,75]],pose=current(p).pose;
 return pose?points.map(modelProjection(pose.result.geometry.vertices,pose.view?.side==='back',pose.view?.rotation??0,pose.view?.projectionCenter).project):points;
}
const matchesDrawPoints=(a:Point,b:Point,points:Point[])=>{
 const near=(p:Point,q:Point)=>Math.hypot(p[0]-q[0],p[1]-q[1])<=6;
 return near(a,points[0])&&near(b,points[1])||near(b,points[0])&&near(a,points[1]);
};
const diagonal=(p:DiagramProject)=>p.states[1].doc.segments.some(s=>s.assignment==='V'&&Math.abs(s.angle??0)===180&&(([s.a,s.b].every(q=>Math.abs(q[0]-q[1])<.01)&&Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])>280)));
export const DIAGRAM_LESSONS:LearningLesson[]=[
 {id:'cp',title:'认识主图与 CP',description:'找到操作前后 CP，理解相邻步骤怎样连接。',tasks:[
  {id:'compare',title:'打开左右对照',goal:'把主图与 CP 放到一起观察。',hints:['使用顶部的“左右对照”。','点击“左右对照”；左右两边仍可分别操作。'],target:'compare',check:(_p,o)=>o.comparison},
  {id:'chain',title:'理解操作后 CP',goal:'本步修改的操作后 CP，会成为哪里使用的 CP？',hints:['看步骤标题中的 CP0 → CP1。','相邻步骤共享一个中间 CP，后一步从它开始。'],target:'cp-after',question:{answers:['下一步的操作前 CP','始终只影响本步图片','折痕编辑区的原工程'],correct:0}},
  {id:'before',title:'辨认操作前 CP',goal:'操作前 CP 已与上一步共享，需要改它时应到哪里？',hints:['共享状态会影响相邻步骤。','使用“到上一步修改”，再更新本步结果。'],target:'cp-before',question:{answers:['直接覆盖当前主图','到上一步修改共享的操作后 CP','删除所有步骤'],correct:1}},
 ]},
 {id:'fold',title:'完成第一次对折',description:'画谷折线、选择固定纸面，生成下一步。',tasks:[
  {id:'line',title:'沿对角线画谷折',goal:'在正方形上从左上角画到右下角，折角保持 180°。',hints:['选择“画折线”，使用谷折，在网格角点之间画线。','点击正方形左上角，再点击右下角。完成后按 Esc 结束画线。'],target:'line',check:diagonal},
  {id:'fixed',title:'在主图选固定侧',goal:'点击主图中指针标出的圆点，固定对角线右上侧的纸面。',hints:['先选择“固定侧”，再按画布指引点击。','圆点是材料坐标 (150, 50)，要在主图中点击；点到另一侧不会通过。'],target:'fixed',check:p=>{const f=p.steps[0].foldLink?.fixed,q=f?.point;return !!q&&!f?.target&&Math.hypot(q[0]-150,q[1]-50)<=12;}},
  {id:'next',title:'进入下一步',goal:'点击下一步，等待折图计算完成。',hints:['右下角的“下一步”会按操作后 CP 生成新结果。','计算期间可以等待或手动停止；有报错时修正后再计算。'],target:'next',check:p=>p.steps.length>1&&p.activeStepId!==p.steps[0].id&&!!current(p).pose&&current(p).pose!.result.layers.status==='solved'},
 ]},
 {id:'symbols',title:'写成可读的步骤',description:'添加折纸符号、标题与动作说明。',tasks:[
  {id:'symbol',title:'放一个折纸符号',goal:'选择一个谷折箭头，放在纸面附近。',hints:['从右侧折纸符号栏选择箭头。','点击“谷折箭头”，再点击画布放置；可选中后拖动位置。'],target:'symbols',check:p=>current(p).annotations?.some(a=>a.kind==='symbol'&&a.symbol==='fold')??false},
  {id:'title',title:'为步骤命名',goal:'输入一个你自己的步骤标题。',hints:['画布底部有“标题”。','写下动作，如“沿对角线对折”，然后离开输入框。'],target:'title',check:p=>current(p).title.trim().length>0},
  {id:'description',title:'说明怎么折',goal:'添加一句动作说明，帮助读者理解方向或对齐位置。',hints:['在标题旁的“说明”中输入文字。','例如“将左下角折向右上角，对齐边缘”，然后离开输入框。'],target:'description',check:p=>current(p).description.trim().length>=4},
 ]},
 {id:'fixed',title:'固定纸层与翻面',description:'从展开的纸张开始，在 CP 选择固定侧，再折叠和翻面观察。',revision:2,withdrawn:true,tasks:[
  {id:'anchor',title:'从 CP 固定指定纸面',goal:'主图还未折叠。打开左右对照，在操作后 CP 点击对角线右上侧纸面，再点击“固定纸面”。',hints:['操作前是展开的正方形，操作后 CP 的对角线是待执行的谷折。','切换到操作后 CP，点击指针标出的右上侧纸面，再确认“固定纸面”；不能用主图或纸层列表代替。'],target:'cp-after',check:p=>{const s=p.steps[0],f=s.foldLink?.fixed;if(f?.target?.stateId!==s.afterId||f.target.kind!=='face')return false;const graph=buildDiagramFold(p.states.find(st=>st.id===s.afterId)!.doc).graph,face=learningFixedCPFace(p);return face>=0&&materialFaceInside(graph,face,f.point);}},
  {id:'next',title:'折叠并观察固定侧',goal:'点击下一步，观察右上侧保持不动，左下侧沿对角线折过去。',hints:['固定侧已经选好，现在才执行折叠。','点击右下角“下一步”，等待折图生成；对比折叠前后固定侧的位置。'],target:'next',check:p=>p.steps.length>1&&p.activeStepId!==p.steps[0].id&&current(p).pose?.result.layers.status==='solved'},
  {id:'flip',title:'翻到背面观察',goal:'点击翻面，观察颜色和固定纸面的显示位置。',hints:['使用画布上方的“翻面”。','保持当前固定设置，再切换正反面；不需要重新画 CP。'],target:'flip',check:(_p,o)=>o.side==='back'},
  {id:'material',title:'确认固定的含义',goal:'翻面后，保持固定的对象应该是什么？',hints:['屏幕上的左右位置会随视角改变。','固定设置跟随原材料纸面，而不是屏幕某个角。'],target:'layers',question:{answers:['屏幕左下角的任何纸层','原来选定的那张材料纸面','现在最上面的一层'],correct:1}},
 ]},
 {id:'layers',title:'只在下层画线',description:'区分后续画线范围与已有折线的作用范围。',folded:true,withdrawn:true,tasks:[
  {id:'scope',title:'设置后续画线范围',goal:'先取消折线选择，再把后续画线设为指定的下层纸面。',hints:['当前没有选中折线时，作用纸层设置只影响之后画的线。','在纸层区使用“画布点层”或“逐层选择”，仅勾选任务卡标出的纸面。'],target:'layers',check:(p,o)=>{const f=current(p).foldLink;return o.selectedLineCount===0&&f?.layers==='selected'&&f.selectedFaces.length===1&&f.selectedFaces[0]===learningBottomFace(p);}},
  {id:'scoped-line',title:'给下层画谷折线',goal:'依次点击三角形中指定的两个点，画一条只作用于指定下层的谷折线。',hints:['选择“画折线”，依次跟随 ① 起点、② 终点。','完成后按 Esc。任务会检查两个端点和实际作用纸层，不只检查工具设置。'],target:'line',check:p=>lines(p).some(a=>a.foldFaces?.length===1&&a.foldFaces[0]===learningBottomFace(p)&&matchesDrawPoints(a.a,a.b,learningDrawPoints(p,'layers')))},
  {id:'range',title:'辨认当前编辑状态',goal:'想改变后面画线的作用纸层，第一步应该做什么？',hints:['选中折线时，设置会修改这条折线。','先按 Esc 取消已有线段选择，再设置后续画线范围。'],target:'layers',question:{answers:['一直选中最后画的折线','先取消折线选择，再设置作用纸层','隐藏主图'],correct:1}},
 ]},
];

export function createLearningProject(lesson:LearningLesson):DiagramProject {
 const doc=blankDoc('练习 · '+lesson.title,200,200);
 if(lesson.folded)doc.segments.push({id:'lesson-diagonal',a:[0,0],b:[200,200],assignment:'V',angle:180});
 const p=createDiagramProject(doc),s=p.steps[0],result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
 if(result.geometry.status!=='ready'||result.layers.status!=='solved')throw Error('教学示例无法生成：'+result.layers.message);
 s.pose={sourceStateId:s.beforeId,sourceRevision:0,sourceDoc:structuredClone(doc),result};
 if(lesson.id==='fixed'){
  const after=p.states.find(state=>state.id===s.afterId)!;
  after.doc.segments.push({id:'lesson-pending-diagonal',a:[0,0],b:[200,200],assignment:'V',angle:180});
  after.revision=1;
 }
 s.foldLink={enabled:true,layers:'all',selectedFaces:[]};return p;
}
export interface LearningProgress {task:number;completed:string[];skipped:string[];project:DiagramProject;baseline?:DiagramProject;revision?:number}
const KEY='zhezhi.diagram-learning.v1';
export function loadLearningProgress(lessons:LearningLesson[]=DIAGRAM_LESSONS):Record<string,LearningProgress>{
 const raw=preferenceStorage.getItem(KEY);if(!raw)return {};
 const data=JSON.parse(raw);if(data.version!==1||!data.lessons||typeof data.lessons!=='object')throw Error('教学进度格式无效。');
 const out:Record<string,LearningProgress>={};
 for(const lesson of lessons){const entry=data.lessons[lesson.id];if(!entry)continue;
  const updated=(entry.revision??1)!==(lesson.revision??1);
  if(!Number.isInteger(entry.task)||entry.task<0||!Array.isArray(entry.completed)||!Array.isArray(entry.skipped)||[...entry.completed,...entry.skipped].some(id=>typeof id!=='string')||!updated&&(entry.task>lesson.tasks.length||[...entry.completed,...entry.skipped].some(id=>!lesson.tasks.some(t=>t.id===id))))throw Error('教学进度内容无效。');
  out[lesson.id]={...entry,project:importDiagramProject(entry.project),...(entry.baseline?{baseline:importDiagramProject(entry.baseline)}:{})};
 }return out;
}
export function saveLearningProgress(progress:Record<string,LearningProgress>){
 const lessons=Object.fromEntries(Object.entries(progress).map(([id,p])=>[id,{...p,project:exportDiagramProject(p.project),...(p.baseline?{baseline:exportDiagramProject(p.baseline)}:{})}]));
 preferenceStorage.setItem(KEY,JSON.stringify({version:1,lessons}));
}
