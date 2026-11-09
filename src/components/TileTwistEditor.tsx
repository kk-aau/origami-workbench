import {useState} from 'react';
import {readTessParams,type TessParams,type TileTwist} from '../app/tessellation';
import {LEGACY_MONOLITHIC_OPTIONS,ORIGINAL_MONOLITHIC_OPTIONS,type TileMonolithicOptions} from '../app/tileMonolithicOptions';
import {TessDialog} from './TessellationEditor';

type CustomParams=Extract<TessParams,{family:'custom'}>;
const centeredTilt=(width:number,alpha:number)=>Math.atan2(Math.sin(alpha*Math.PI/180),width*Math.cos(alpha*Math.PI/180))*180/Math.PI;
const centeredAngle=(width:number,tilt:number)=>Math.atan2(width*Math.sin(tilt*Math.PI/180),Math.cos(tilt*Math.PI/180))*180/Math.PI;

export default function TileTwistEditor({params,onApply,onClose}:{params:CustomParams;onApply:(twists:TileTwist[],stationaryFace:number,monolithicOptions:TileMonolithicOptions)=>void;onClose:()=>void}){
  const [rows,setRows]=useState<TileTwist[]>(()=>structuredClone(params.tileTwists??[]));
  const [stationaryFace,setStationaryFace]=useState(params.stationaryFace??0);
  const [monolithic,setMonolithic]=useState<TileMonolithicOptions>(()=>structuredClone(params.monolithicOptions??LEGACY_MONOLITHIC_OPTIONS));
  const [error,setError]=useState('');
  const change=(index:number,patch:Partial<TileTwist>)=>setRows(old=>old.map((row,i)=>i===index?{...row,...patch}:row));
  const angleMode=(index:number,twist:boolean)=>setRows(old=>old.map((row,i)=>{
    if(i!==index)return row;
    if(twist){
      const {tilt:_tilt,ccw:_ccw,...centered}=row;
      return {...centered,offset:0,angleMode:'twist',twistAngle:centeredAngle(row.width,row.tilt??70)};
    }
    const tilt=centeredTilt(row.width,row.twistAngle??30);
    const {angleMode:_mode,twistAngle:_angle,...ordinary}=row;
    return {...ordinary,tilt,...(row.construction==='split'?{ccw:tilt<90}:{})};
  }));
  const construction=(index:number,split:boolean)=>setRows(old=>old.map((row,i)=>{
    if(i!==index)return row;
    if(split)return {...row,construction:'split',baseVertex:0,connection:'M',...(row.angleMode==='twist'?{}:{ccw:(row.tilt??70)<90})};
    const {construction:_kind,baseVertex:_base,connection:_connection,ccw:_ccw,...plain}=row;
    return plain;
  }));
  return <TessDialog title="逐块扭转参数" onClose={onClose}>
    <p>相邻拼块的接缝褶宽与偏置须匹配。固定中心扭角按原版随褶宽重算褶角，偏置固定为 0；不相容的图样会被拒绝。</p>
    <label className="lff-reduction-presets">折后固定面 <input aria-label="逐块扭转折后固定面" type="number" min={1} max={4097} step={1} value={stationaryFace+1} onChange={event=>setStationaryFace(Number(event.target.value)-1)} style={{width:72}}/><small>仅定位折后坐标，不改变折痕或层序</small></label>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,340px),1fr))',gap:6,maxHeight:'min(55vh,440px)',overflowY:'auto'}}>{rows.map((row,i)=><fieldset key={i} style={{minWidth:0,border:'1px solid #d6ded5',margin:0,padding:'4px'}}><legend>拼块 {i+1} · {params.faces[i]?.length} 边</legend><div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:4}}>
      <label style={{minWidth:0,fontSize:11}}>褶宽<input aria-label={`第 ${i+1} 块褶宽`} type="number" min={.05} max={.8} step="0.01" value={row.width} onChange={e=>change(i,{width:Number(e.target.value)})} style={{width:'100%'}}/></label>
      <label style={{minWidth:0,fontSize:11}}>偏置<input aria-label={`第 ${i+1} 块偏置`} type="number" min={-.4} max={.4} step="0.01" value={row.offset} disabled={row.angleMode==='twist'} onChange={e=>change(i,{offset:Number(e.target.value)})} style={{width:'100%'}}/></label>
      <label style={{minWidth:0,fontSize:11}}>角度依据<select aria-label={`第 ${i+1} 块角度依据`} value={row.angleMode==='twist'?'twist':'tilt'} onChange={e=>angleMode(i,e.target.value==='twist')} style={{width:'100%'}}><option value="tilt">褶角 τ</option><option value="twist">扭角 α</option></select></label>
      <label style={{minWidth:0,fontSize:11}}>{row.angleMode==='twist'?'扭角 α':'褶角 τ'}<input aria-label={`第 ${i+1} 块${row.angleMode==='twist'?'扭角':'褶角'}`} type="number" min={1} max={179} step="0.01" value={row.angleMode==='twist'?row.twistAngle:row.tilt} title={row.angleMode==='twist'?`当前褶角 ${centeredTilt(row.width,row.twistAngle??30).toFixed(3)}°`:undefined} onChange={e=>change(i,row.angleMode==='twist'?{twistAngle:Number(e.target.value)}:{tilt:Number(e.target.value)})} style={{width:'100%'}}/></label>
      <label style={{minWidth:0,fontSize:11}}>中心山谷<input aria-label={`第 ${i+1} 块中心山谷`} value={row.centralTypes.join('')} onChange={e=>change(i,{centralTypes:e.target.value.toUpperCase().split('') as ('M'|'V')[]})} style={{width:'100%'}}/></label>
    </div><div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:6,marginTop:6}}>
      <label style={{minWidth:0,fontSize:11}}>构造<select aria-label={`第 ${i+1} 块构造`} value={row.construction??'polygon'} onChange={e=>construction(i,e.target.value==='split')} style={{width:'100%'}}><option value="polygon">普通扭转</option><option value="split" disabled={params.faces[i]?.length!==4}>四边形分裂</option></select></label>
      {row.construction==='split'&&<><label style={{minWidth:0,fontSize:11}}>保留顶点<select aria-label={`第 ${i+1} 块分裂基点`} value={row.baseVertex} onChange={e=>change(i,{baseVertex:Number(e.target.value)})} style={{width:'100%'}}>{Array.from({length:4},(_,j)=><option key={j} value={j}>{j+1}</option>)}</select></label>
      <label style={{minWidth:0,fontSize:11}}>连接折痕<select aria-label={`第 ${i+1} 块连接山谷`} value={row.connection} onChange={e=>change(i,{connection:e.target.value as 'M'|'V'})} style={{width:'100%'}}><option value="M">山折</option><option value="V">谷折</option></select></label>
      {row.angleMode!=='twist'&&<label style={{minWidth:0,fontSize:11}}>扭转方向<select aria-label={`第 ${i+1} 块扭转方向`} value={row.ccw?'ccw':'cw'} onChange={e=>change(i,{ccw:e.target.value==='ccw'})} style={{width:'100%'}}><option value="ccw">逆时针</option><option value="cw">顺时针</option></select></label>}</>}
    </div></fieldset>)}</div>
    <details><summary>整体拼块合并 · 原版选项</summary><div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:6,marginTop:6}}>
      <label style={{minWidth:0,fontSize:11}}>共享边<select aria-label="逐块扭转共享边模式" value={monolithic.mergedEdges} onChange={e=>setMonolithic(old=>({...old,mergedEdges:e.target.value as TileMonolithicOptions['mergedEdges']}))} style={{width:'100%'}}><option value="delete">删除 · 原版默认</option><option value="retain">保留为折痕</option><option value="auto">自动 · 旧工程</option></select></label>
      <label style={{minWidth:0,fontSize:11}}>并点容差<input aria-label="逐块扭转并点容差" type="number" min={0} max={.0001} step="0.00000001" value={monolithic.samePtTolerance} onChange={e=>setMonolithic(old=>({...old,samePtTolerance:Number(e.target.value)}))} style={{width:'100%'}}/></label>
      <label style={{minWidth:0,fontSize:11}}>共线清理<select aria-label="逐块扭转共线清理" value={monolithic.collinearCleanup?'on':'off'} onChange={e=>setMonolithic(old=>({...old,collinearCleanup:e.target.value==='on'}))} style={{width:'100%'}}><option value="on">开启 · 原版默认</option><option value="off">关闭</option></select></label>
      <label style={{minWidth:0,fontSize:11}}>共线容差<input aria-label="逐块扭转共线容差" type="number" min={0} max={.0001} step="0.00000001" value={monolithic.collinearTolerance} onChange={e=>setMonolithic(old=>({...old,collinearTolerance:Number(e.target.value)}))} style={{width:'100%'}}/></label>
    </div><button className="text-button" onClick={()=>setMonolithic(structuredClone(ORIGINAL_MONOLITHIC_OPTIONS))}>使用原版默认</button><small>容差按工作区坐标计算；不相容接缝会明确拒绝，自动模式保持当前棋盘格样例可用。</small></details>
    {error&&<p role="alert">{error}</p>}
    <footer><button className="primary" onClick={()=>{if(!readTessParams({...params,tileTwists:rows,stationaryFace,monolithicOptions:monolithic})){setError('逐块参数或整体合并选项无效；请检查褶宽、山谷数量、固定面和 0–0.0001 的容差。');return;}onApply(rows,stationaryFace,monolithic);onClose();}}>采用逐块参数</button></footer>
  </TessDialog>;
}
