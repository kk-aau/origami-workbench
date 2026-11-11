import {blankDoc} from './state';
import {computeFlatFold} from '../core/flatFold';
import type {Doc,Point} from '../core/types';
import type {DiagramProject,DiagramPose} from './diagramProject';
import {defaultModelView} from './modelViewState';
import {defaultModelColors,validateModelColors,type ModelColors} from './modelColors';
import {defaultDiagramLineDefaults,validateDiagramLineDefaults,DIAGRAM_LINE_STYLES,type DiagramLineDefaults} from './diagramLineStyles';

export interface DiagramBasicSettings {
 paper:{shape:'square'|'rectangle'|'triangle'|'regular'|'custom';width:number;height:number;sides:number};
 colors:ModelColors;lineDefaults:DiagramLineDefaults;adaptiveLines:boolean;
}
export function defaultDiagramBasicSettings(width=200,height=200):DiagramBasicSettings {
 const colors=defaultModelColors(),lineDefaults=defaultDiagramLineDefaults();lineDefaults.boundary.color=colors.line;
 return {paper:{shape:width===height?'square':'rectangle',width,height,sides:6},colors,lineDefaults,adaptiveLines:true};
}
export function validateDiagramBasicSettings(value:unknown):asserts value is DiagramBasicSettings {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('绘图基本信息无效。');
 const s=value as DiagramBasicSettings,p=s.paper;
 if(!p||!['square','rectangle','triangle','regular','custom'].includes(p.shape)||![p.width,p.height].every(v=>Number.isFinite(v)&&v>0&&v<=100000)||!Number.isSafeInteger(p.sides)||p.sides<3||p.sides>64||typeof s.adaptiveLines!=='boolean')throw Error('纸张尺寸、形状或边数无效。');
 validateModelColors(s.colors);validateDiagramLineDefaults(s.lineDefaults);
}
function regularPoints(sides:number):Point[]{return Array.from({length:sides},(_,i)=>{const angle=-Math.PI/2+i*2*Math.PI/sides;return [Math.cos(angle),Math.sin(angle)];});}
export function normalizeDiagramBasicSettings(input:DiagramBasicSettings):DiagramBasicSettings {
 validateDiagramBasicSettings(input);const s=structuredClone(input),p=s.paper;
 if(p.shape==='square')p.height=p.width;
 if(p.shape==='triangle'||p.shape==='regular'){
  const points=regularPoints(p.shape==='triangle'?3:p.sides),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  p.height=p.width*(Math.max(...ys)-Math.min(...ys))/(Math.max(...xs)-Math.min(...xs));
 }
 for(const style of DIAGRAM_LINE_STYLES)s.lineDefaults[style].globalFields=['color','width','strokePattern'];
 s.colors.line=s.lineDefaults.boundary.color;
 return s;
}
export function diagramBasicPaperDoc(name:string,input:DiagramBasicSettings):Doc {
 const s=normalizeDiagramBasicSettings(input),p=s.paper;if(p.shape==='custom')throw Error('自定义边界需使用原工程，不能作为空白纸张重建。');
 const doc=blankDoc(name,p.width,p.height);
 if(p.shape==='triangle'||p.shape==='regular'){
  const points=regularPoints(p.shape==='triangle'?3:p.sides),minX=Math.min(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),span=Math.max(...points.map(p=>p[0]))-minX,scale=p.width/span;
  const boundary:Point[]=points.map(q=>[(q[0]-minX)*scale,(q[1]-minY)*scale]);
  doc.segments=boundary.map((a,i)=>({id:crypto.randomUUID(),a,b:boundary[(i+1)%boundary.length],assignment:'B',angle:0}));
 }return doc;
}
export function canChangeDiagramBasicPaper(p:DiagramProject):boolean {
 const s=p.steps[0];return p.steps.length===1&&!s.simulationSurface&&!s.pose?.paperDeformation&&!s.pose?.spatial&&!s.foldLink?.fixed&&!(s.annotations?.length||s.images?.length||s.callouts?.length)&&p.states.every(st=>st.doc.segments.every(s=>s.assignment==='B')&&!st.doc.objects?.length&&!st.doc.background);
}
export function readDiagramBasicSettings(project:DiagramProject,fallbackLines?:DiagramLineDefaults,adaptiveLines=true):DiagramBasicSettings {
 if(project.basicSettings)return structuredClone(project.basicSettings);
 const doc=project.states[0].doc,s=defaultDiagramBasicSettings(doc.paper.width,doc.paper.height),vertices=doc.segments.filter(s=>s.assignment==='B').flatMap(s=>[s.a,s.b]);
 const rectangle=vertices.length===8&&vertices.every(p=>(p[0]===0||p[0]===doc.paper.width)&&(p[1]===0||p[1]===doc.paper.height));
 if(!rectangle)s.paper.shape='custom';
 const step=project.steps.find(s=>s.id===project.activeStepId);s.colors=structuredClone(step?.simulationSurface?.colors??step?.pose?.view?.colors??defaultModelColors());
 if(fallbackLines)s.lineDefaults=structuredClone(fallbackLines);if(!s.lineDefaults.boundary.globalFields?.includes('color'))s.lineDefaults.boundary.color=s.colors.line;s.adaptiveLines=adaptiveLines;return s;
}
export function ensureDiagramBasicSettings(project:DiagramProject,lines?:DiagramLineDefaults,adaptiveLines=true):DiagramProject {
 return project.basicSettings?project:{...project,basicSettings:readDiagramBasicSettings(project,lines,adaptiveLines)};
}
export function initializeDiagramBasicPaper(project:DiagramProject,settings:DiagramBasicSettings):DiagramProject {
 const s=normalizeDiagramBasicSettings(settings),before=project.states[0],result=computeFlatFold(before.doc,undefined,{flatCreases:'marks'});
 if(result.geometry.status!=='ready'||result.layers.status!=='solved')throw Error('无法生成所选纸张。');
 return {...project,basicSettings:s,steps:[{...project.steps[0],pose:{sourceStateId:before.id,sourceRevision:before.revision,sourceDoc:structuredClone(before.doc),result,view:{...defaultModelView(),colors:{...s.colors}}},foldLink:{enabled:true,layers:'all',selectedFaces:[]}}]};
}
/** Paper geometry changes only for an untouched one-sheet project; appearance never rebuilds CP. */
export function applyDiagramBasicSettings(project:DiagramProject,name:string,input:DiagramBasicSettings):DiagramProject {
 const settings=normalizeDiagramBasicSettings(input);if(!name.trim())throw Error('请填写绘图名称。');
 const previous=readDiagramBasicSettings(project),paperChanged=JSON.stringify(previous.paper)!==JSON.stringify(settings.paper);
 let next={...project,name:name.trim(),basicSettings:settings};
 if(paperChanged){
  if(!canChangeDiagramBasicPaper(project)||previous.paper.shape==='custom')throw Error('纸张已用于绘图，不能直接替换其尺寸或边界。');
  const doc=diagramBasicPaperDoc(name.trim(),settings),result=computeFlatFold(doc,undefined,{flatCreases:'marks'});
  if(result.geometry.status!=='ready'||result.layers.status!=='solved')throw Error('无法生成所选纸张。');
  const before={...project.states[0],doc,revision:project.states[0].revision+1};
  const step={...project.steps[0],pose:{sourceStateId:before.id,sourceRevision:before.revision,sourceDoc:structuredClone(doc),result},canvas:{grid:true,snap:true,diagonalGrid:false,gridSubdivisions:1,...project.steps[0].canvas,gridSpacing:settings.paper.width/(project.steps[0].canvas?.gridDivisions??4)}};
  delete step.pendingView;delete step.paperStates;
  next={...next,states:[before,{...project.states[1],doc:structuredClone(doc),revision:project.states[1].revision+1}],steps:[step]};
 }
 const paint=(pose:DiagramPose|undefined)=>pose?{...pose,view:{...(pose.view??defaultModelView()),colors:{...settings.colors}}}:undefined;
 next={...next,steps:next.steps.map(step=>({...step,pose:paint(step.pose??undefined)??null,...(step.paperStates?{paperStates:{...step.paperStates,...(step.paperStates.flat?{flat:paint(step.paperStates.flat)}:{}),...(step.paperStates.spatial?{spatial:paint(step.paperStates.spatial)}:{}),...(step.paperStates.pulled?{pulled:paint(step.paperStates.pulled)}:{})}}:{}),...(step.simulationSurface?{simulationSurface:{...step.simulationSurface,colors:{...settings.colors}}}:{})}))};
 return next;
}
