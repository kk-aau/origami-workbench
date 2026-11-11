import type {LearningControl} from './diagramLearningDesign';
import type {LearningDesignGuide} from './diagramLearningDesign';
export const learningVisible=(el:Element)=>!!el.getClientRects().length;
const value=(el:Element,kind:LearningControl['kind'])=>kind==='teach'?el.getAttribute('data-teach'):kind==='id'?el.id:kind==='label'?el.getAttribute('aria-label'):el.textContent?.trim().replace(/\s+/g,' ');
export function findLearningControl(root:Element,control:LearningControl):HTMLElement|undefined {
 return Array.from(root.querySelectorAll<HTMLElement>('button,input,textarea,select')).filter(el=>el.tagName.toLowerCase()===control.tag&&learningVisible(el)&&value(el,control.kind)===control.value)[control.index];
}
export function learningControlFromElement(root:Element,target:Element):LearningControl|undefined {
 const el=target.closest('button,input,textarea,select');if(!el||!root.contains(el))return;
 for(const kind of ['teach','id','label','text'] as const){const v=value(el,kind);if(!v)continue;const control={kind,value:v,tag:el.tagName.toLowerCase(),index:0};
  const all=Array.from(root.querySelectorAll('button,input,textarea,select')).filter(n=>n.tagName===el.tagName&&learningVisible(n)&&value(n,kind)===v);control.index=all.indexOf(el);return control;
 }
}
export function matchesLearningGuide(root:Element,guide:LearningDesignGuide,event:{target:EventTarget|null;clientX:number;clientY:number},tool:string):boolean {
 if(!(event.target instanceof Element)||!root.contains(event.target))return false;
 if(guide.kind==='control'){const el=findLearningControl(root,guide.control);return !!el?.contains(event.target)&&!(el instanceof HTMLButtonElement&&el.disabled);}
 if(guide.kind==='point'){
  const svg=event.target.closest('svg[data-diagram-model]'),matrix=svg?.querySelector<SVGGElement>('[data-diagram-viewport-scene]')?.getScreenCTM();
  if(!matrix||svg?.getAttribute('data-diagram-disabled')==='true'||tool!==guide.tool)return false;
  const q=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return Math.hypot(q.x-guide.point[0],q.y-guide.point[1])<=4;
 }
 if(guide.kind==='cp-face'){
  const face=event.target.closest('[data-cp-face]');if(face?.getAttribute('data-cp-face')!==String(guide.face))return false;
  const comparison=face.closest('.diagram-comparison-cp');return comparison?comparison.querySelector(`button[data-teach="cp-${guide.phase}"]`)?.getAttribute('aria-pressed')==='true':!!face.closest(`[data-teach="cp-${guide.phase}"]`);
 }return false;
}
