import {useEffect,useId,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {learningMaskRegions} from '../app/learningMaskRegions';
import type {DiagramProject} from '../app/diagramProject';
import {learningBottomFace,learningFixedCPFace,learningDrawPoints,type LearningObservation,type LearningTask} from '../app/diagramLearning';
import {modelProjection} from '../app/modelProjection';
import {findLearningControl} from '../app/learningDesignDom';
import './DiagramLearningSpotlight.css';

type Box={x:number;y:number;width:number;height:number};
type Guide={key:string;label:string;box:Box;input?:Box;point?:[number,number];context?:Box;future?:[number,number]};
export const LEARNING_TARGETS:Record<string,string>={compare:'[data-teach="compare"]',line:'[data-teach="line"]',fixed:'[data-teach="fixed"]',next:'[data-teach="next"]',symbols:'[aria-label="放置谷折箭头符号"]',title:'#diagram-step-title',description:'#diagram-step-description',layers:'[data-diagram-layer-stack]',flip:'[data-teach="flip"]','cp-before':'[data-teach="cp-before"]','cp-after':'[data-teach="cp-after"]'};
const visible=(node:Element)=>!!node.getClientRects().length;
const box=(node:Element,pad=6):Box=>{const r=node.getBoundingClientRect();return {x:r.x-pad,y:r.y-pad,width:r.width+2*pad,height:r.height+2*pad};};
const screen=(node:SVGGraphicsElement,p:readonly number[]):[number,number]|undefined=>{const m=node.getScreenCTM();if(!m)return;const q=new DOMPoint(p[0],p[1]).matrixTransform(m);return [q.x,q.y];};
const pointGuide=(key:string,label:string,p:[number,number],context:Element):Guide=>({key,label,point:p,box:{x:p[0]-25,y:p[1]-25,width:50,height:50},context:box(context,0)});

/** Highlighted controls receive real clicks; the shaded area blocks pointer input. */
export default function DiagramLearningSpotlight({host,project,observation,lessonId,task,ready,enabled,compact=false,onStage,onAvoid}:{host:RefObject<HTMLDivElement|null>;project:DiagramProject;observation:LearningObservation;lessonId:string;task:LearningTask;ready:boolean;enabled:boolean;compact?:boolean;onStage:(text:string)=>void;onAvoid:(box:Box)=>void}){
 const [guide,setGuide]=useState<Guide|null>(null),[card,setCard]=useState<Box|null>(null),id=useId().replace(/:/g,'');
 const latest=useRef({project,observation,task,ready,lessonId});latest.current={project,observation,task,ready,lessonId};
 useEffect(()=>{
  if(!enabled||ready||task.question){setGuide(null);onStage('');return;}
  let frame=0,disposed=false,revealed='';
  const measure=()=>{
   frame=0;if(disposed)return;const root=host.current,editor=root?.querySelector('[data-learning-editor]');if(!root||!editor)return;
   const {project:p,observation:o,task:t,ready:done,lessonId:l}=latest.current,s=p.steps.find(s=>s.id===p.activeStepId)!;
   const find=(selector:string)=>Array.from(editor.querySelectorAll<HTMLElement>(selector)).find(visible);
   const elementGuide=(key:string,label:string,el:Element|undefined):Guide|null=>{
    if(!el)return null;
    const r=el.getBoundingClientRect();if((r.bottom>innerHeight-15||r.top<55)&&revealed!==key){revealed=key;el.scrollIntoView({block:'nearest',inline:'nearest'});}
    return {key,label,box:box(el),input:box(el,0)};
   };
   const panel=(name:string)=>find('.tablet-panel-bar')?Array.from(editor.querySelectorAll(' .tablet-panel-bar button')).find(n=>n.textContent?.trim()===name&&visible(n)):undefined;
   const anchor=(target:string,label:string)=>{
    const el=find(LEARNING_TARGETS[target]??'[data-no-learning-target]');if(el)return elementGuide(target,label,el);
    const name=target==='layers'?'纸层':target==='symbols'?'符号':target.startsWith('cp-')?'CP':'';
    return elementGuide('panel-'+name,'先展开“'+name+'”面板',panel(name));
   };
   let next:Guide|null=null;
   if(t.design){
    const g=t.design.guide;
    if(g.kind==='none'){onStage(t.goal);setGuide(null);return;}
    if(g.kind==='control'){
     const el=findLearningControl(editor,g.control);
     if(el instanceof HTMLButtonElement&&el.disabled||el?.matches('input,textarea,select')&&document.activeElement===el){onStage(el instanceof HTMLButtonElement?'正在处理，请等待。':t.goal);setGuide(null);return;}
     next=elementGuide('design-control',t.goal,el);
    }else if(g.kind==='point'||g.kind==='line'){
     if(g.tool!=='select'&&o.tool!==g.tool&&LEARNING_TARGETS[g.tool])next=anchor(g.tool,'先选择对应工具，再按指引操作');
     else{const svg=find('svg[data-diagram-model]') as unknown as SVGSVGElement|undefined,scene=svg?.querySelector<SVGGElement>('[data-diagram-viewport-scene]');
      if(svg&&scene){
       const pending=svg.dataset.teachLineStart?.split(',').map(Number),points=g.kind==='line'?g.points:[g.point],end=g.kind==='line'&&pending?.length===2&&Math.hypot(pending[0]-points[0][0],pending[1]-points[0][1])<=4;
       const q=screen(scene,points[end?1:0]);if(q){next=pointGuide('design-'+(g.kind==='line'?(end?'line-end':'line-start'):'point'),g.kind==='line'?(end?'② 点击终点':pending?'起点不符，请按 Esc 后重新点击 ①':'① 点击起点'):t.goal,q,svg);if(g.kind==='line'&&!end)next.future=screen(scene,points[1]);}
      }
     }
    }else if(g.kind==='cp-face'){
     if(!o.comparison)next=anchor('compare','先打开“左右对照”');
     else{const tab=find(`.diagram-comparison-cp [data-teach="cp-${g.phase}"]`);
      if(tab?.getAttribute('aria-pressed')==='false')next=elementGuide('design-cp-tab',`切换到操作${g.phase==='before'?'前':'后'} CP`,tab);
      else{const face=find(`.diagram-comparison-cp [data-cp-face="${g.face}"]`) as unknown as SVGGElement|undefined;
       if(face){const q=screen(face,[Number(face.dataset.teachCpX),Number(face.dataset.teachCpY)]);if(q)next=pointGuide('cp-design-face',t.goal,q,face.closest('svg')!);}
      }
     }
    }
   }else if((l==='fold'&&t.id==='line')||(l==='layers'&&t.id==='scoped-line')){
    if(o.tool!=='line')next=anchor('line','先选择“画折线”');
    else{
     const svg=find('svg[data-diagram-model]') as unknown as SVGSVGElement|undefined,scene=svg?.querySelector<SVGGElement>('[data-diagram-viewport-scene]');
     if(svg&&scene){
      const shown=learningDrawPoints(p,l),a=screen(scene,shown[0]),b=screen(scene,shown[1]),pending=svg.dataset.teachLineStart?.split(',').map(Number);
      const validStart=pending?.length===2&&Math.hypot(pending[0]-shown[0][0],pending[1]-shown[0][1])<7;
      if(a&&b){next=pointGuide(t.id+(validStart?'-end':'-start'),validStart?'② 点击终点，完成折痕':pending?'起点不对：按 Esc，再点击 ① 起点':'① 点击折痕起点',validStart?b:a,svg);next.future=validStart?undefined:b;}
     }
    }
   }else if(l==='fold'&&t.id==='fixed'){
    if(o.tool!=='fixed')next=anchor('fixed',s.foldLink?.fixed?'固定位置不符，重新选择“固定侧”':'先选择“固定侧”');
    else{const svg=find('svg[data-diagram-model]'),scene=svg?.querySelector<SVGGElement>('[data-diagram-viewport-scene]'),pose=s.pose;
     if(svg&&scene&&pose){const q=modelProjection(pose.result.geometry.vertices,o.side==='back',pose.view?.rotation??0,pose.view?.projectionCenter).project([150,50]),point=screen(scene,q);if(point)next=pointGuide('fixed-main-point','点击这里，固定右上侧纸面',point,svg);}
    }
   }else if(l==='fixed'&&t.id==='anchor'){
    if(!o.comparison)next=anchor('compare','先打开“左右对照”，在 CP 中选纸面');
    else{
     const afterTab=find('.diagram-comparison-cp [data-teach="cp-after"]');
     if(afterTab?.getAttribute('aria-pressed')==='false')next=elementGuide('cp-after-tab','纸张还未折叠，切换到“操作后 CP”选择待折的固定侧',afterTab);
     else{
      const face=learningFixedCPFace(p),chosen=o.cpSelection?.stateId===s.afterId&&o.cpSelection.kind==='face'&&o.cpSelection.index===face;
      if(chosen){const buttons=Array.from(editor.querySelectorAll('.diagram-cp-pin-actions button')),button=buttons.find(b=>visible(b)&&b.textContent?.includes('固定纸面')),panelButton=Array.from(editor.querySelectorAll('.diagram-comparison-heading button')).find(b=>b.textContent?.trim()==='纸层面板'&&visible(b));next=elementGuide('cp-fix-confirm',`点击“固定纸面”，确认右上侧 F${face+1}`,button)??elementGuide('cp-open-actions','展开纸层面板，查看固定操作',panelButton)??anchor('cp-after','展开 CP 面板，查看“固定纸面”操作');}
      else{
       const region=find('.diagram-comparison-cp')??find('[data-teach="cp-after"]'),faceNode=region?.querySelector<SVGGElement>(`[data-cp-face="${face}"]`);
       if(faceNode&&visible(faceNode)){const x=Number(faceNode.dataset.teachCpX),y=Number(faceNode.dataset.teachCpY),point=screen(faceNode,[x,y]);if(point)next=pointGuide('cp-face-'+face,`在 CP 点击 F${face+1} 的圆点`,point,faceNode.closest('svg')!);}
       else next=anchor('cp-after','展开操作后 CP 面板，选择右上侧纸面');
      }
     }
    }
   }else if(l==='layers'&&t.id==='scope'){
    const face=learningBottomFace(p),settings=s.foldLink;
    if(o.selectedLineCount)next=anchor('layers','先按 Esc 取消折线选择，再设置之后画线的纸层');
    else if(settings?.layers!=='selected'){
     const button=Array.from(editor.querySelectorAll('.diagram-layer-scope-actions button')).find(b=>visible(b)&&b.textContent?.trim()==='逐层选择');
     next=elementGuide('future-layer-select','点击“逐层选择”，设置后续画线范围',button)??anchor('layers','先展开纸层面板');
    }else{
     const other=settings.selectedFaces.find(f=>f!==face),target=other??face;
     next=elementGuide('future-layer-'+target,other===undefined?`仅勾选下层 F${face+1}`:`先取消勾选 F${other+1}` ,find(`[aria-label="参与折叠纸面 F${target+1}"]`))??anchor('layers','展开纸层面板，勾选指定纸面');
    }
   }else if(l==='symbols'&&t.id==='symbol'&&o.tool==='symbol'){
    const svg=find('svg[data-diagram-model]'),scene=svg?.querySelector<SVGGElement>('[data-diagram-viewport-scene]');
    if(svg&&scene){const point=screen(scene,[110,60]);if(point)next=pointGuide('place-fold-arrow','点击这里，放置谷折箭头',point,svg);}
   }else{
    const el=find(LEARNING_TARGETS[t.target]??'[data-no-learning-target]');
    if(el&&(el.matches('input,textarea,select')&&document.activeElement===el||el instanceof HTMLButtonElement&&el.disabled)){onStage(el.matches('input,textarea,select')?'在当前输入框中完成内容。':'正在处理，请等待。');setGuide(null);return;}
    next=anchor(t.target,'点击这里：'+t.title);
   }
   if(next?.point&&next.context){const [x,y]=next.point,b=next.context;
    if(x<Math.max(0,b.x)+4||x>Math.min(innerWidth,b.x+b.width)-4||y<Math.max(55,b.y)+4||y>Math.min(innerHeight,b.y+b.height)-4){
     const cp=next.key.startsWith('cp-'),button=Array.from(editor.querySelectorAll('button')).find(node=>visible(node)&&node.textContent?.trim()===(cp?'适配 CP':'适应'));
     next=elementGuide('fit-'+next.key,'目标点在画面外，先适配视图',button);
    }
   }
   if(!next){onStage('当前操作区域尚未显示，请展开对应面板；缩放或滚动画面后指引会跟随。');setGuide(null);return;}
   if(!done&&!t.question)onAvoid(next.box);
   onStage(next.label);setGuide(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
   const cardNode=root.querySelector('.diagram-learning-card');if(cardNode){const b=box(cardNode,0);setCard(old=>JSON.stringify(old)===JSON.stringify(b)?old:b);}
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  const editor=host.current?.querySelector('[data-learning-editor]'),observer=new MutationObserver(schedule),resize=new ResizeObserver(schedule);
  if(editor){observer.observe(editor,{subtree:true,childList:true,attributes:true,attributeFilter:['viewBox','transform','style','class','hidden','data-teach-line-start','aria-pressed','aria-expanded','data-teach-cp-x','data-teach-cp-y']});resize.observe(host.current!);}
  const cardNode=host.current?.querySelector('.diagram-learning-card');if(cardNode){resize.observe(cardNode);observer.observe(cardNode,{attributes:true,attributeFilter:['style','class']});}
  window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);schedule();
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);document.removeEventListener('focusin',schedule);document.removeEventListener('focusout',schedule);};
 },[enabled,project,observation,task,ready,lessonId,host,onStage,onAvoid]);
 if(!enabled||!guide||ready||task.question)return null;
 const point=guide.point??[guide.box.x+guide.box.width/2,guide.box.y+guide.box.height/2],allowed=guide.context??guide.box,holes=[allowed,...(card?[card]:[])],inputHoles=[guide.context??guide.input??guide.box,...(card?[card]:[])],blockers=learningMaskRegions(innerWidth,innerHeight,inputHoles);
 const arrowEnd:[number,number]=[guide.box.x+guide.box.width/2,guide.box.y+guide.box.height/2];
 const arrowStart:[number,number]=[arrowEnd[0]+(arrowEnd[0]>innerWidth-100?-45:45),Math.max(65,arrowEnd[1]-45)];
 return createPortal(<div className="learning-spotlight" data-guide-phase={guide.key} data-guide-canvas-clear={!!guide.context}>
  <svg width="100%" height="100%"><defs><mask id={'learning-mask-'+id}><rect width="100%" height="100%" fill="white"/>{holes.map((b,i)=><rect className="learning-spotlight-hole" key={i} {...b} rx={i===0?10:18} fill="black"/>)}</mask><marker id={'learning-arrow-'+id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#ffd174"/></marker></defs>
   <rect width="100%" height="100%" fill="#152c22" fillOpacity=".56" mask={`url(#learning-mask-${id})`}/>
   {blockers.map((b,i)=><rect key={'block-'+i} {...b} className="learning-input-blocker" data-guide-blocker="true" fill="transparent" onPointerDown={e=>{e.preventDefault();e.stopPropagation();}} onPointerUp={e=>{e.preventDefault();e.stopPropagation();}} onClick={e=>{e.preventDefault();e.stopPropagation();}} onDoubleClick={e=>{e.preventDefault();e.stopPropagation();}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();}}/>)}
   <rect className="learning-spotlight-outline" {...guide.box} rx="9"/>
   {guide.point&&<><circle className="learning-click-pulse" cx={point[0]} cy={point[1]} r="18"/><circle data-guide-click-target="true" cx={point[0]} cy={point[1]} r="5" fill="#ffc76c" stroke="#453314" strokeWidth="1.5"/>{guide.future&&<><line x1={point[0]} y1={point[1]} x2={guide.future[0]} y2={guide.future[1]} stroke="#fff0cd" strokeDasharray="5 5"/><circle cx={guide.future[0]} cy={guide.future[1]} r="9" fill="none" stroke="#fff0cd"/><text x={guide.future[0]+13} y={guide.future[1]-12} fill="#fff7e5" fontSize="14">②</text></>}</>}
   <path d={`M${arrowStart.join(',')}L${arrowEnd.join(',')}`} className="learning-direction-arrow" markerEnd={`url(#learning-arrow-${id})`}/>
  </svg>
  {compact&&<div className="learning-spotlight-caption" style={{left:Math.max(12,Math.min(innerWidth-310,guide.box.x)),top:Math.max(65,Math.min(innerHeight-70,guide.box.y-47))}}>{guide.label}</div>}
 </div>,document.body);
}
