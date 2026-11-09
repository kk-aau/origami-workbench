import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {fetchTestPleat,readTestPleatQuery,type TestPleatResult} from '../app/testPleat';
import {download} from '../app/api';
import type {XY} from '../app/tessellation';
import TessNumberField from './TessNumberField';
import TessellationEditor,{TessDialog} from './TessellationEditor';
function PleatPlot({result}:{result:TestPleatResult}){
 const primitives=result.data.graphics,points=primitives.flatMap(p=>p.points),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),xx=Math.max(...xs),yy=Math.max(...ys),span=Math.max(xx-x,yy-y,1e-20),pad=span*.08;
 return <svg aria-label="原TestPleat四图元" viewBox={`${x-pad} ${-yy-pad} ${xx-x+2*pad} ${yy-y+2*pad}`} style={{width:'100%',height:300,background:'#f5f7f6'}}><g transform="scale(1,-1)"><polygon points={primitives[0].points.map(p=>p.join(',')).join(' ')} fill="#000" fillOpacity={.1}/>{primitives.slice(1).map((l,i)=><polyline key={i} points={l.points.map(p=>p.join(',')).join(' ')} fill="none" stroke={['#000','#f00','#00f'][i]} strokeWidth={1} vectorEffect="non-scaling-stroke"/>)}</g></svg>;
}
function PleatDialog({initial,initialAngle,onClose}:{initial:[XY,XY];initialAngle:number;onClose:()=>void}){
 const [points,setPoints]=useState<[XY,XY]>(()=>structuredClone(initial)),[angle,setAngle]=useState(initialAngle),[result,setResult]=useState<TestPleatResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false),generation=useRef(0),request=useRef<AbortController|null>(null);
 useEffect(()=>()=>{generation.current++;request.current?.abort();},[]);
 const invalidate=()=>{generation.current++;request.current?.abort();setBusy(false);setResult(null);setError('');};
 const update=(i:number,j:number,value:number)=>{invalidate();const next=structuredClone(points);next[i][j]=value;setPoints(next);};
 const calculate=async()=>{const q=readTestPleatQuery({family:'test-pleat-native',points,angleDeg:angle});if(!q){setError('需要两个不重合的有限端点和±36000°内原α。');return;}const id=++generation.current;request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setResult(null);setError('');try{const r=await fetchTestPleat(q,controller.signal);if(id===generation.current)setResult(r);}catch(e){if(id===generation.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}finally{if(id===generation.current)setBusy(false);}};
 return <TessDialog title="原TestPleat · 两端点四图元" onClose={onClose}><p>原In[2682]：透明四角Polygon、黑色原边、红色qa→pa、蓝色qb→pb；没有额外选项。</p>{points.map((p,i)=><div className="tess-pair" key={i}><TessNumberField label={`${i?'qb':'qa'} X`} value={p[0]} min={-1000} max={1000} step={.1} onChange={v=>update(i,0,v)}/><TessNumberField label={`${i?'qb':'qa'} Y`} value={p[1]} min={-1000} max={1000} step={.1} onChange={v=>update(i,1,v)}/></div>)}<TessNumberField label="原α °" value={angle} min={-36000} max={36000} step={1} onChange={v=>{invalidate();setAngle(v);}}/><button className="text-button" onClick={()=>setEditing(true)}>拖动原输入端点</button><button disabled={busy} onClick={()=>void calculate()}>{busy?'构造四图元…':'构造原TestPleat图'}</button>{error&&<p role="alert">{error}</p>}{result&&<><PleatPlot result={result}/><p role="status">4个原图元；原qa/qb及pa/pb顺序、三条原线和样式均已独立回读。</p><button onClick={()=>download(JSON.stringify(result,null,2),'TestPleat-完整原图.json')}>导出完整原图 JSON</button></>}<p className="note">α以度输入，计算时转原弧度。0°/180°等退化Polygon仍保四角与原三线。此函数输出原图形数据，不附带CP采用、层序或路径认证。</p>{editing&&<TessellationEditor title="原TestPleat端点" initial={points} edges={[[0,1]]} min={-1000} max={1000} xLabel="原X" yLabel="原Y" invertY orderedPath="open" minPoints={2} maxPoints={2} validateGeometry={p=>readTestPleatQuery({family:'test-pleat-native',points:p,angleDeg:angle})?'':'端点需要不重合。'} onClose={()=>setEditing(false)} onApply={p=>{invalidate();setPoints(p as [XY,XY]);setEditing(false);}}/>}</TessDialog>;
}
export default function TestPleatControls({initial=[[0,0],[1,0]],angle=36}:{initial?:[XY,XY];angle?:number}){
 const [open,setOpen]=useState(false);return <><button className="outline" aria-label="原TestPleat完整图形" onClick={()=>setOpen(true)}>原TestPleat图</button>{open&&createPortal(<PleatDialog initial={initial} initialAngle={angle} onClose={()=>setOpen(false)}/>,document.body)}</>;
}
