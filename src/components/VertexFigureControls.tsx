import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ARCHIMEDEAN_PATCH_CATALOG} from '../app/archimedeanPatchSource';
import {fetchVertexFigure,readVertexFigureQuery,type VertexFigureResult} from '../app/vertexFigure';
import {download} from '../app/api';
import {ORIGAMICA_TILE_TILING_STYLE} from '../app/tileDecorations';
import {TessDialog} from './TessellationEditor';

function FigurePlot({result}:{result:VertexFigureResult}){
 const lines=result.data.graphics[0].flatMap(group=>group[0]),points=lines.flatMap(l=>l.points),all=[[0,0],...points],xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),span=Math.max(1,Math.max(...xs)-x,Math.max(...ys)-y),pad=.07*span;
 return <svg aria-label="原阿基米德顶点图" viewBox={`${x-pad} ${-Math.max(...ys)-pad} ${Math.max(...xs)-x+2*pad} ${Math.max(...ys)-y+2*pad}`} style={{width:'100%',height:300,background:'#f5f7f6'}}><g transform="scale(1,-1)">{lines.map((l,i)=><line key={i} x1={l.points[0][0]} y1={l.points[0][1]} x2={l.points[1][0]} y2={l.points[1][1]} stroke={ORIGAMICA_TILE_TILING_STYLE.lineColor} strokeWidth={4/3} vectorEffect="non-scaling-stroke" strokeLinecap="round"/>)}<line x1={0} y1={0} x2={0} y2={0} stroke="#202124" strokeWidth={5*4/3} strokeLinecap="round" vectorEffect="non-scaling-stroke"/></g></svg>;
}
function FigureDialog({initial,onClose}:{initial:number[];onClose:()=>void}){
 const [text,setText]=useState(JSON.stringify(initial)),[result,setResult]=useState<VertexFigureResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),generation=useRef(0),request=useRef<AbortController|null>(null);
 useEffect(()=>()=>{generation.current++;request.current?.abort();},[]);
 const edit=(value:string)=>{generation.current++;request.current?.abort();setBusy(false);setResult(null);setError('');setText(value);};
 const calculate=async()=>{let vertexType:unknown;try{vertexType=JSON.parse(text);}catch{setError('vtype须为整数JSON列表。');return;}const q=readVertexFigureQuery({family:'archimedean-vertex-figure-native',vertexType});if(!q){setError('最多16项，每个边数为3–24整数。空列表按原式返回原点。');return;}const id=++generation.current;request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setResult(null);setError('');try{const r=await fetchVertexFigure(q,controller.signal);if(id===generation.current)setResult(r);}catch(e){if(id===generation.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}finally{if(id===generation.current)setBusy(false);}};
 return <TessDialog title="原阿基米德顶点图 · MakeArchimedeanVertexFigure" onClose={onClose}><p>输入围绕原点依次放置的单位正多边形边数；按原式累计内角旋转，保留全部原边组。</p><label className="select-field">原目录快捷输入<select aria-label="原顶点图目录" value="" onChange={e=>{const row=ARCHIMEDEAN_PATCH_CATALOG.find(r=>r.number===Number(e.target.value));if(row)edit(JSON.stringify(row.vertexType.split('.').map(Number)));}}><option value="">选择构型</option>{ARCHIMEDEAN_PATCH_CATALOG.map(r=><option key={r.number} value={r.number}>{r.number} · ({r.vertexType})</option>)}</select></label><label>原vtype JSON<textarea aria-label="原顶点图vtype" value={text} onChange={e=>edit(e.target.value)} style={{width:'100%',minHeight:60}}/></label><button disabled={busy} onClick={()=>void calculate()}>{busy?'构造完整原图…':'构造原顶点图'}</button>{error&&<p role="alert">{error}</p>}{result&&<><FigurePlot result={result}/><p role="status">{result.query.vertexType.length}块；{result.query.vertexType.reduce((a,b)=>a+b,0)}条原边；累计内角{(result.source.totalInteriorAngleRad*180/Math.PI).toFixed(6)}°。原图元、旋转与原点已独立回读。</p><button onClick={()=>download(JSON.stringify(result,null,2),'MakeArchimedeanVertexFigure-原图数据.json')}>导出完整原图 JSON</button></>}<p className="note">原默认RenderTile输出逐边Line及TilingLine样式符号，按TilingStyle[]显示；没有填色Polygon。原点的AbsolutePointSize[5]保存在数据中。开放或重叠构型按原式完整输出；它是原帮助图形，不自动代表可平铺或材料纸面。</p></TessDialog>;
}
export default function VertexFigureControls({initial=[3,4,6,4]}:{initial?:number[]}){
 const [open,setOpen]=useState(false);return <><button className="outline" aria-label="构造原阿基米德顶点图" onClick={()=>setOpen(true)}>原顶点图</button>{open&&createPortal(<FigureDialog initial={initial} onClose={()=>setOpen(false)}/>,document.body)}</>;
}
