import {useEffect,useState} from 'react';
import {parseModelRotation} from '../app/modelProjection';

export default function ModelRotationControl({rotation,onChange}:{rotation:number;onChange:(angle:number)=>void}){
  const [draft,setDraft]=useState(String(rotation)),[error,setError]=useState('');
  useEffect(()=>{setDraft(String(rotation));setError('');},[rotation]);
  function cancel(){setDraft(String(rotation));setError('');}
  function change(next:number){onChange(next);setDraft(String(next));setError('');}
  function apply(){try{change(parseModelRotation(draft));}catch(e){setError((e as Error).message);}}
  return <div role="group" aria-label="模型旋转" style={{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
    <button aria-label="模型逆时针旋转45度" onClick={()=>change((rotation+315)%360)}>↶ 45°</button>
    <button aria-label="模型顺时针旋转45度" onClick={()=>change((rotation+45)%360)}>↷ 45°</button>
    <input aria-label="模型旋转角度" aria-invalid={!!error} inputMode="decimal" value={draft} style={{width:68,maxWidth:68}} title="角度；Enter 或应用确认，Esc 或右击取消输入；仅改变显示"
      onChange={e=>{setDraft(e.target.value);setError('');}}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();apply();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}}}
      onContextMenu={e=>{e.preventDefault();e.stopPropagation();cancel();}}/>
    <span>°</span><button aria-label="应用模型旋转角度" onClick={apply}>应用</button>
    <button aria-label="模型旋转归零" onClick={()=>change(0)} title="仅重置显示角度，不修改模型">归零</button>
    {error&&<span role="alert">{error}</span>}
  </div>;
}
