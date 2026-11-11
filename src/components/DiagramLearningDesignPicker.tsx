import {useEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {LearningDesignGuide} from '../app/diagramLearningDesign';
import {learningControlFromElement} from '../app/learningDesignDom';
import type {LearningDesignPick} from './DiagramLearningDesigner';
import type {Point} from '../core/types';

export default function DiagramLearningDesignPicker({host,kind,tool,onPick,onCancel}:{host:RefObject<HTMLDivElement|null>;kind:LearningDesignPick;tool:string;onPick:(guide:LearningDesignGuide)=>void;onCancel:()=>void}){
 const [outline,setOutline]=useState<{left:number;top:number;width:number;height:number}|null>(null),[stage,setStage]=useState(0),points=useRef<Point[]>([]);
 useEffect(()=>{
  const root=host.current?.querySelector('[data-learning-editor]');if(!root)return;
  const eligible=(target:Element)=>kind==='control'?target.closest('button,input,textarea,select'):target.closest('svg[data-diagram-model]');
  const block=(e:Event)=>{if(e.target instanceof Element&&root.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}};
  const move=(e:PointerEvent)=>{const el=e.target instanceof Element&&root.contains(e.target)?eligible(e.target):null;if(!el){setOutline(null);return;}const b=el.getBoundingClientRect();setOutline({left:b.left,top:b.top,width:b.width,height:b.height});};
  const click=(e:MouseEvent)=>{if(!(e.target instanceof Element)||!root.contains(e.target))return;block(e);
   if(kind==='control'){const control=learningControlFromElement(root,e.target);if(control)onPick({kind:'control',control});return;}
   const el=eligible(e.target),scene=el?.querySelector<SVGGElement>('[data-diagram-viewport-scene]'),matrix=scene?.getScreenCTM();if(!matrix)return;
   const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),point:Point=[p.x,p.y];
   if(kind==='point')onPick({kind:'point',point,tool});
   else{points.current.push(point);setStage(points.current.length);if(points.current.length===2)onPick({kind:'line',points:[points.current[0],points.current[1]],tool:'line'});}
  };
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();onCancel();}};
  document.addEventListener('pointerdown',block,true);document.addEventListener('pointerup',block,true);document.addEventListener('click',click,true);document.addEventListener('pointermove',move,true);document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('pointerdown',block,true);document.removeEventListener('pointerup',block,true);document.removeEventListener('click',click,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('keydown',key,true);};
 },[host,kind,tool,onPick,onCancel]);
 return createPortal(<><div className="learning-design-pick-banner" role="status">{kind==='control'?'点击需要高亮的按钮或输入框':kind==='point'?'在主图点击需要引导的位置':stage?'② 点击折线终点':'① 点击折线起点'} · 此次点选不会执行操作<button onClick={onCancel}>取消选取</button></div>{outline&&<div className="learning-design-pick-outline" style={outline}/>}</>,document.body);
}
