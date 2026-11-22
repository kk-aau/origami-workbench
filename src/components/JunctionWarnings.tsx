import {setJunctionWarningsEnabled,useJunctionWarningsEnabled} from '../app/junctionWarningPreference';
import {useEffect,useRef,useState} from 'react';
import type {Doc,Point} from '../core/types';
import {checkedJunctions,EditedJunctionCheck,type JunctionWarning} from '../core/editedJunctions';
import './JunctionWarnings.css';

export const emptyJunctionWarnings:JunctionWarning[]=[];
const empty=emptyJunctionWarnings;
export function JunctionWarningSwitch(){
  const enabled=useJunctionWarningsEnabled();
  return <label className="cp-junction-switch"><input type="checkbox" checked={enabled} onChange={e=>setJunctionWarningsEnabled(e.target.checked)}/>CP 错误提醒</label>;
}
export function useEditedJunctions(doc:Doc|undefined,scope:string|number,spatial=false,revision?:number,source?:Doc){
  const enabled=useJunctionWarningsEnabled();
  const last=useRef<{doc?:Doc;scope:string|number;revision?:number;spatial:boolean} | undefined>(undefined);
  const checker=useRef<EditedJunctionCheck|undefined>(undefined);
  const [issues,setIssues]=useState<JunctionWarning[]>(empty);
  useEffect(()=>{
    if(!enabled)return;
    const prior=last.current;
    if(scope===prior?.scope&&spatial===prior.spatial&&doc===prior.doc&&revision===prior.revision)return;
    if(!prior||scope!==prior.scope)checker.current=new EditedJunctionCheck();
    last.current={doc,scope,revision,spatial};
    setIssues(doc?checkedJunctions(doc,spatial,scope===prior?.scope?prior.doc:source,checker.current):empty);
  },[enabled,doc,scope,revision,spatial,source]);
  return enabled?issues:empty;
}
const names={loose:'悬空端点',t:'T 型交点',angle:'交替夹角和异常'};
const at=(w:JunctionWarning)=>'（'+w.point.map(x=>Number(x.toFixed(3))).join(', ')+'）';
export function JunctionWarnings({issues,label='CP 检查'}:{issues:JunctionWarning[];label?:string}){
  const enabled=useJunctionWarningsEnabled();
  const [open,setOpen]=useState(false);
  if(!enabled||!issues.length)return null;
  const summary=(['loose','t','angle'] as const).flatMap(kind=>{
    const count=issues.filter(w=>w.kind===kind).length;
    return count?[names[kind]+(count>1?' ×'+count:'')]:[];
  }).join(' · ');
  return <details className="junction-warnings" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary aria-live="polite">{label} · {summary}{issues.length===1&&at(issues[0])}</summary>
    {open&&<ul>{issues.map((w,i)=><li key={i}><svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true"><WarningGlyph kind={w.kind}/></svg> {names[w.kind]}{at(w)}{w.rayCount!==undefined&&` · ${w.rayCount} 个折线方向，夹角无法交替分成两组`}{w.degrees!==undefined&&` · ${Number(w.degrees.toFixed(3))}°，应为 180°`}</li>)}</ul>}</details>;
}

function WarningGlyph({kind}:{kind:JunctionWarning['kind']}){
  if(kind==='angle')return <circle r="5.5" fill="none" stroke="#a32c6b" strokeWidth="2"/>;
  if(kind==='t')return <path d="M0 -6.5 6 4.5 -6 4.5Z" fill="#fff1d4" stroke="#af520c" strokeWidth="1.8"/>;
  return <rect x="-4.5" y="-4.5" width="9" height="9" fill="#fff2ef" stroke="#bc3331" strokeWidth="1.8"/>;
}
export function JunctionMarks({issues,units,project}:{issues:readonly JunctionWarning[];units?:number;project?:(p:Point)=>Point}){
  const group=useRef<SVGGElement>(null);
  const [scale,setScale]=useState(1);
  const enabled=useJunctionWarningsEnabled();
  const visible=enabled&&issues.length>0;
  useEffect(()=>{
    const g=group.current,svg=g?.ownerSVGElement;
    if(units!==undefined||!visible||!svg||!g)return;
    const update=()=>{const m=g.getScreenCTM();if(m){const k=Math.hypot(m.a,m.b);if(k>0)setScale(1/k);}};
    update();
    const size=new ResizeObserver(update),view=new MutationObserver(update);
    size.observe(svg);
    for(let el:Element|null=g.parentElement;el instanceof SVGElement;el=el.parentElement)
      view.observe(el,{attributes:true,attributeFilter:['viewBox','transform']});
    return ()=>{size.disconnect();view.disconnect();};
  },[units,visible]);
  if(!visible)return null;
  return <g ref={group} className="cp-junction-marks" pointerEvents="none">{issues.map((w,i)=>{
    const [x,y]=project?project(w.point):w.point;
    return <g key={i} data-junction={w.kind} transform={`translate(${x} ${y}) scale(${units??scale})`}>
      <title>{names[w.kind]}{at(w)}</title><WarningGlyph kind={w.kind}/>
    </g>;
  })}</g>;
}
export function DocumentJunctionMarks({doc,spatial=false,flipY=false}:{doc:Doc;spatial?:boolean;flipY?:boolean}){
  const issues=useEditedJunctions(doc,'preview',spatial);
  return <JunctionMarks issues={issues} project={flipY?([x,y])=>[x,-y]:undefined}/>;
}
