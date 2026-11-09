import {useState} from 'react';
import {changeTessParams,readTessParams,type TessParams,type TessResult,type XY} from '../app/tessellation';
import TessNumberField from './TessNumberField';
import TessellationEditor,{TessDialog} from './TessellationEditor';

type Params=Extract<TessParams,{family:'nonperiodic'}>;
const BOX:XY[]=[[0,0],[1,0],[1,1],[0,1]];
export default function SiteControls({params,result,onChange}:{params:Params;result:TessResult|null;onChange:(p:TessParams)=>void}){
 const [dialog,setDialog]=useState<'points'|'boundary'|'data'|null>(null),[seedText,setSeedText]=useState(''),[borderText,setBorderText]=useState(''),[error,setError]=useState('');
 const change=(patch:Record<string,unknown>)=>onChange(changeTessParams(params,patch));
 const points=params.points??result?.source.seedPoints as XY[]|undefined;
 const boundary=params.kind==='voronoi'?params.boundary??BOX:params.boundaryMode==='hull'?undefined:BOX;
 const openData=()=>{setSeedText(params.points?JSON.stringify(params.points):'');setBorderText(JSON.stringify(params.boundary??BOX));setError('');setDialog('data');};
 const apply=()=>{
  try{
   const raw={...params} as Record<string,unknown>;
   if(seedText.trim()){raw.points=JSON.parse(seedText);raw.count=Array.isArray(raw.points)?raw.points.length:0;}else delete raw.points;
   if(params.kind==='voronoi')raw.boundary=JSON.parse(borderText);
   const next=readTessParams(raw);if(!next)throw Error('种子需为 3–96 个不同坐标，边界需为 3–32 点凸多边形；坐标范围 -10 至 10，Voronoi 种子需在边界内。');
   if('dualTargets' in next)delete next.dualTargets;
   onChange(next);setDialog(null);
  }catch(e){setError(e instanceof SyntaxError?'请输入 JSON 坐标数组，如 [[0,0],[1,0],[0,1]]。':(e as Error).message);}
 };
 return <>
  <div className="tess-pair"><TessNumberField label="种子数量" value={params.count} min={3} max={96} onChange={count=>change({count})}/><TessNumberField label="随机种子" value={params.seed} min={0} max={999999} onChange={seed=>change({seed})}/></div>
  {params.kind==='delaunay'&&<label className="select-field">边界规则<select aria-label="Delaunay 边界规则" value={params.boundaryMode??'square'} onChange={e=>change({boundaryMode:e.target.value})}><option value="hull">种子凸包</option><option value="square">旧版正方形补角</option></select></label>}
  <div className="tess-actions"><button className="outline" disabled={!points?.length} onClick={()=>setDialog('points')}>编辑种子点</button>{params.kind==='voronoi'&&<button className="outline" onClick={()=>setDialog('boundary')}>编辑裁剪边界</button>}<button className="outline" onClick={openData}>输入坐标</button>{params.points&&<button onClick={()=>change({points:undefined})}>重置种子</button>}</div>
  {dialog==='points'&&points&&<TessellationEditor title="编辑种子点" seed min={-10} max={10} minPoints={3} maxPoints={96} pointDomain={boundary??points} seedBoundary={params.kind==='voronoi'?boundary:undefined} initial={points} onApply={points=>change({points,count:points.length})} onClose={()=>setDialog(null)}/>}
  {dialog==='boundary'&&boundary&&<TessellationEditor title="编辑 Voronoi 裁剪边界" min={-10} max={10} initial={boundary} faces={[boundary.map((_,i)=>i)]} edges={boundary.map((_,i)=>[i,(i+1)%boundary.length])} onApply={boundary=>change({boundary})} onClose={()=>setDialog(null)}/>}
  {dialog==='data'&&<TessDialog title="种子与边界坐标" onClose={()=>setDialog(null)}><p className="note">按实际坐标输入，种子留空则按随机种子重新生成。边界不会裁掉或移动手工种子。</p><label>种子坐标<textarea className="site-coordinate-input" aria-label="种子坐标" value={seedText} onChange={e=>setSeedText(e.target.value)} placeholder="留空使用自动种子"/></label>{params.kind==='voronoi'&&<label>边界坐标<textarea className="site-coordinate-input" aria-label="Voronoi 边界坐标" value={borderText} onChange={e=>setBorderText(e.target.value)}/></label>}{error&&<p role="alert">{error}</p>}<footer><button className="primary" onClick={apply}>保存种子与边界</button></footer></TessDialog>}
 </>;
}
