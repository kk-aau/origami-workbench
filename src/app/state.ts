import type { Doc, Segment, Assignment, Point } from '../core/types';
import { defaultAngle } from '../core/types';
import {DEFAULT_PAPER_SIZE} from './paperDefaults';
export const VERSION = '0.13.53';
export const NAMES: Record<Assignment,string> = {M:'山折',V:'谷折',B:'边界',A:'辅助',U:'未指派',F:'平面边'};
export const COLORS: Record<Assignment,string> = {M:'#b23d42',V:'#315ebe',B:'#2a3c34',A:'#60938d',U:'#997327',F:'#869085'};
export function uid() { return crypto.randomUUID(); }
export function line(a:Point,b:Point,assignment:Assignment,angle:number|null=defaultAngle(assignment)):Segment {return {id:uid(),a,b,assignment,angle};}
export function blankDoc(name='未命名作品',width=DEFAULT_PAPER_SIZE,height=DEFAULT_PAPER_SIZE):Doc {
  return {schemaVersion:2,objects:[],name,paper:{width,height},segments:[line([0,0],[width,0],'B'),line([width,0],[width,height],'B'),line([width,height],[0,height],'B'),line([0,height],[0,0],'B')]};
}
export function exampleDoc(kind='accordion'):Doc {
  if(kind==='blank')return blankDoc();
  const doc=blankDoc(kind==='waterbomb'?'水雷基础形':'手风琴折',200,200);
  if(kind==='waterbomb') {
    doc.segments.push(line([0,0],[100,100],'M'),line([200,0],[100,100],'M'),line([200,200],[100,100],'M'),line([0,200],[100,100],'M'),line([0,100],[100,100],'V'),line([100,100],[200,100],'V'));
  } else for(let i=1;i<4;i++)doc.segments.push(line([i*50,0],[i*50,200],i%2?'M':'V'));
  return doc;
}
export function assign(segments:Segment[], ids:Set<string>, type:Assignment):Segment[] {
  return segments.map(s=>{
    if(!ids.has(s.id)||s.assignment===type)return s;
    const wasFold=s.assignment==='M'||s.assignment==='V';
    const magnitude=wasFold?(s.angle===null?null:Math.abs(s.angle)):180;
    return {...s,assignment:type,angle:type==='M'?(magnitude===null?null:-magnitude):type==='V'?magnitude:defaultAngle(type)};
  });
}
export function swap(segments:Segment[],ids:Set<string>):Segment[] {
  return segments.map(s=>ids.has(s.id)&&(s.assignment==='M'||s.assignment==='V')?{...s,assignment:s.assignment==='M'?'V':'M',angle:s.angle===null?null:-s.angle}:s);
}
export interface History {past:Doc[];present:Doc;future:Doc[]}
export type Action={type:'commit';doc:Doc}|{type:'replace';doc:Doc}|{type:'undo'}|{type:'redo'};
export function historyReducer(state:History,action:Action):History {
  if(action.type==='replace')return {past:[],present:action.doc,future:[]};
  if(action.type==='commit')return JSON.stringify(state.present)===JSON.stringify(action.doc)?state:{past:[...state.past.slice(-59),state.present],present:action.doc,future:[]};
  if(action.type==='undo'&&state.past.length)return {past:state.past.slice(0,-1),present:state.past.at(-1)!,future:[state.present,...state.future]};
  if(action.type==='redo'&&state.future.length)return {past:[...state.past,state.present],present:state.future[0],future:state.future.slice(1)};
  return state;
}
export function distance(a:Point,b:Point){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
export function distanceToSegment(p:Point,s:Pick<Segment,'a'|'b'>){const [dx,dy]=[s.b[0]-s.a[0],s.b[1]-s.a[1]];const d=dx*dx+dy*dy;const t=d?Math.max(0,Math.min(1,((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dy)/d)):0;return distance(p,[s.a[0]+t*dx,s.a[1]+t*dy]);}
export function transformSelection(doc:Doc,ids:Set<string>,kind:'move'|'copy'|'rotate'|'mirrorX'|'mirrorY'|'scale',a:number,b=0):Doc {
  const chosen=doc.segments.filter(s=>ids.has(s.id));if(!chosen.length)return doc;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const s of chosen)for(const p of [s.a,s.b]){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  const change=(p:Point):Point=>{const x=p[0]-cx,y=p[1]-cy,t=a*Math.PI/180;if(kind==='move'||kind==='copy')return[p[0]+a,p[1]+b];if(kind==='rotate')return[cx+x*Math.cos(t)-y*Math.sin(t),cy+x*Math.sin(t)+y*Math.cos(t)];if(kind==='mirrorX')return[cx-x,p[1]];if(kind==='mirrorY')return[p[0],cy-y];return[cx+x*a,cy+y*a];};
  const altered=chosen.map(s=>({...s,id:kind==='copy'?uid():s.id,a:change(s.a),b:change(s.b)}));
  const byId=new Map(altered.map(s=>[s.id,s]));
  return {...doc,segments:kind==='copy'?[...doc.segments,...altered]:doc.segments.map(s=>byId.get(s.id)??s)};
}
