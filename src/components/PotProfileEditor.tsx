import {useEffect,useRef,useState,type ReactNode} from 'react';
import {download} from '../app/api';
import type {TessParams,XY} from '../app/tessellation';
import {potProfileError,potProfileLimits,potProfilePreview,readPotProfile,readPotProfileJson,type PotProfileParams} from '../app/potProfile';
import TessellationEditor from './TessellationEditor';
import PotCrossSectionGraphicsDialog from './PotCrossSectionGraphicsDialog';

export function PotProfileSummary({points,label,onEdit,children}:{points:XY[];label:string;onEdit:()=>void;children?:ReactNode}){
  const {drawn}=potProfilePreview(points);
  return <div className={`radial-pot-profile${children?' twisted-pot-profile':''}`}><svg viewBox="0 0 110 104" aria-label={label}><polyline points={drawn.map(p=>p.join(',')).join(' ')} fill="none" stroke="#087e88" strokeWidth="2"/>{drawn.map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="2.6" fill="#7046a3"/>)}</svg><div><strong>剖面 · {points.length} 点</strong><small>{points.map(p=>`(${p.join(', ')})`).join(' → ')}</small><button className="text-button" onClick={onEdit}>编辑剖面</button>{children}</div></div>;
}

export default function PotProfileEditor({title,params,onApply,onClose,onPreview,onCancelPreview}:{title:string;params:PotProfileParams;onApply:(points:XY[])=>void;onClose:()=>void;onPreview?:(next:TessParams)=>void;onCancelPreview?:()=>void}){
  const [original]=useState(()=>structuredClone(params));
  const [initial]=useState<XY[]>(()=>structuredClone(params.crossSection));
  const [draft,setDraft]=useState(initial),[pointsCommand,setPointsCommand]=useState<{id:number;points:XY[]}>(),[text,setText]=useState(''),[error,setError]=useState('');
  const [reference,setReference]=useState(false);
  const cancellation=useRef(onCancelPreview),cancelled=useRef(false),mounted=useRef(true);
  cancellation.current=onCancelPreview;
  const cancel=()=>{if(!cancelled.current){cancelled.current=true;cancellation.current?.();}};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(!cancelled.current){cancelled.current=true;cancellation.current?.();}};},[]);
  const preview=(points:XY[])=>{
    setDraft(points);
    const next=readPotProfile(original,points);
    if(next){cancelled.current=false;onPreview?.(next);}
    else cancel();
  };
  const load=(points:XY[])=>{setPointsCommand(previous=>({id:(previous?.id??0)+1,points}));setError('');};
  const limits=potProfileLimits(original),{height}=potProfilePreview(draft);
  const radius=Math.max(...draft.map(p=>p[0]));
  const exportJson=()=>{
    return download(JSON.stringify(draft,null,2),`${original.family}-profile.json`);
  };
  const importJson=(value:string)=>{try{load(readPotProfileJson(original,value));}catch(cause){setError((cause as Error).message);}};
  return <><TessellationEditor title={title} initial={initial} pointsCommand={pointsCommand} edges={draft.slice(1).map((_,i)=>[i,i+1])} min={-20} max={20} xLabel="半径 r" yLabel="高度 z" invertY editablePoints orderedPath="open" minPoints={limits.min} maxPoints={limits.max} validateGeometry={points=>potProfileError(original,points)} onPreview={preview} onReset={()=>load(structuredClone(original.crossSection))} onApply={onApply} onClose={()=>{cancel();onClose();}} extraControls={<div className="pot-profile-tools">
    <span className="pot-profile-dimensions">最大半径 {Number(radius.toPrecision(5))} · 高度 {Number(height.toPrecision(5))}</span>
    <span className="pot-profile-rule">{original.family==='twisted-pot'?'首段水平，随后高度同向变化':'高度同向变化，首段可水平'}</span>
    <button className="text-button" onClick={()=>setReference(true)}>原对称剖面</button>
    <details className="pot-profile-advanced" onToggle={event=>{if(event.currentTarget.open){setText(JSON.stringify(draft,null,2));setError('');}}}><summary>高级坐标</summary><div className="pot-profile-json-panel"><label>剖面坐标 JSON<textarea aria-label={`${title} JSON`} value={text} onChange={event=>setText(event.target.value)} spellCheck={false}/></label>{error&&<p role="alert">{error}</p>}<div className="pot-profile-json-actions"><label className="pot-profile-import">导入文件<input aria-label="导入剖面 JSON 文件" type="file" accept=".json,application/json" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>100000){setError('坐标文件过大，请导入仅含剖面点的 JSON。');return;}try{const value=await file.text();if(!mounted.current)return;setText(value);importJson(value);}catch{if(mounted.current)setError('读取坐标文件失败。');}}}/></label><button onClick={exportJson}>导出坐标</button><button className="primary" onClick={()=>importJson(text)}>载入坐标</button></div></div></details>
  </div>}/>{reference&&<PotCrossSectionGraphicsDialog points={draft} onClose={()=>setReference(false)}/>}</>;
}
