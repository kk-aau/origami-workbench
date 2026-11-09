import {useEffect,useMemo,useState} from 'react';
import {api} from '../app/api';
import TessNumberField from './TessNumberField';
import {TessDialog} from './TessellationEditor';

type Point=[number,number];
type Mode='sector-patch'|'offset-lines'|'tile-tiling';
type TileSpec={
  tileIndex:number;tileType:'UnitTriangleTile';wedge:number;cell:[number,number];branch:'A'|'B';
  anglesRadians:[number,number,number];anglePiFractions:[[number,number],[number,number],[number,number]];
  offset:Point;rotationRadians:number;rotationPiFraction:[number,number];scale:1;vertices:Point[];
};
type IndexedLineGraph={vertices:Point[];edges:[number,number][];bridgeEdgeIndices:number[];indexBase:0};
type Reference={
  kind:'goldberg-numerical-reference';mode:Mode;order:number;rings:number;offset:number;
  sourceVariant:'full'|'offset'|null;
  segments:[Point,Point][];faces:Point[][];dualTargets:Point[];dualSegments:[Point,Point][];triangleCount:number;
  tileSpecs:TileSpec[];tileFrameTranslation:Point;
  indexedGraph:IndexedLineGraph|null;
  sourceFunction:'GoldbergPatch'|'GoldbergTiling'|'GoldbergOffsetTiling'|'MakeGoldbergTiling'|'MakeOffsetGoldbergTiling';
  topology:string;output:'reference-geometry';creasePattern:false;
  mountainValleyAssigned:false;flatFoldabilityChecked:false;
};

function waitForWorker(signal:AbortSignal){
  return new Promise<void>(resolve=>{
    const cancel=()=>{clearTimeout(timer);resolve();};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},900);
    signal.addEventListener('abort',cancel,{once:true});
  });
}

function piFraction([numerator,denominator]:[number,number]){
  if(!numerator)return '0';
  const prefix=numerator===1?'':numerator===-1?'-':String(numerator);
  return denominator===1?`${prefix}π`:`${prefix}π/${denominator}`;
}

function Drawing({reference,showDual,showIndices,selectedTile,onSelectTile}:{reference:Reference;showDual:boolean;showIndices:boolean;selectedTile:number|null;onSelectTile:(index:number)=>void}){
  const points=[...reference.segments.flat(),...reference.dualTargets],xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
  const minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(1e-6,Math.max(...xs)-minX),height=Math.max(1e-6,Math.max(...ys)-minY);
  const pad=Math.max(width,height)*.07;
  const bridgeEdges=new Set(reference.indexedGraph?.bridgeEdgeIndices??[]);
  return <svg data-testid="goldberg-reference" aria-label={reference.mode==='sector-patch'?'Goldberg 单扇区三角网数值参考':reference.mode==='tile-tiling'?'Goldberg 原版拼块排布数值参考':'Goldberg 原版偏移线图数值参考'}
    viewBox={`${minX-pad} ${minY-pad} ${width+2*pad} ${height+2*pad}`} preserveAspectRatio="xMidYMid meet"
    style={{display:'block',width:'100%',height:285,background:'#f8faf7',border:'1px solid #d5ded6',borderRadius:6}}>
    {reference.faces.map((face,i)=><polygon key={i} points={face.map(p=>p.join(',')).join(' ')} fill="#e3eee5" stroke="none"/>)}
    {reference.segments.map(([a,b],i)=><line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
      stroke={reference.mode==='offset-lines'&&bridgeEdges.has(i)?'#0798a8':'#344946'} strokeWidth={1.2} vectorEffect="non-scaling-stroke"/>)}
    {reference.tileSpecs.map(spec=><polygon key={`tile-${spec.tileIndex}`} data-tile-index={spec.tileIndex}
      points={spec.vertices.map(point=>point.join(',')).join(' ')}
      fill={selectedTile===spec.tileIndex?'#36b7ca':'none'} fillOpacity={selectedTile===spec.tileIndex?.3:1}
      stroke={selectedTile===spec.tileIndex?'#08788a':'none'} strokeWidth={2.2} vectorEffect="non-scaling-stroke"
      style={{cursor:'pointer',pointerEvents:'all',outline:'none'}} role="button" tabIndex={0} aria-label={`查看第 ${spec.tileIndex} 块 Goldberg 三角单元参数`}
      onFocus={()=>onSelectTile(spec.tileIndex)} onClick={()=>onSelectTile(spec.tileIndex)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelectTile(spec.tileIndex);}}}/>) }
    {showIndices&&reference.mode==='sector-patch'&&reference.faces.map((face,i)=><text key={`face-${i}`}
      x={face.reduce((sum,point)=>sum+point[0],0)/face.length}
      y={face.reduce((sum,point)=>sum+point[1],0)/face.length}
      textAnchor="middle" dominantBaseline="central" fill="#225c80" stroke="#f8faf7" strokeWidth={Math.max(width,height)*.025}
      paintOrder="stroke" fontWeight={700} fontSize={Math.max(width,height)*.075}>{i+1}</text>)}
    {showDual&&reference.dualSegments.map(([a,b],i)=><line key={`dual-${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
      stroke="#8d46bc" strokeWidth={1.4} vectorEffect="non-scaling-stroke"/>)}
    {showDual&&reference.dualTargets.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={Math.max(width,height)*.006} fill="#8d46bc" stroke="white" strokeWidth={.7} vectorEffect="non-scaling-stroke"/>)}
  </svg>;
}

export default function GoldbergReferenceDialog({order,rings,onClose}:{order:number;rings:number;onClose:()=>void}){
  const [mode,setMode]=useState<Mode>('sector-patch');
  const [lineOffset,setLineOffset]=useState(order%2?0:Math.min(64,2*rings+1));
  const [tileOffset,setTileOffset]=useState(.5);
  const [sourceVariant,setSourceVariant]=useState<'full'|'offset'>(order%2?'full':'offset');
  const [showDual,setShowDual]=useState(true);
  const [showIndices,setShowIndices]=useState(false);
  const [selectedTile,setSelectedTile]=useState<number|null>(null);
  const [reference,setReference]=useState<Reference|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const offset=mode==='sector-patch'||(mode==='tile-tiling'&&order%2)?0:mode==='offset-lines'?lineOffset:tileOffset;
  const current=useMemo(()=>reference?.mode===mode&&reference.order===order&&reference.rings===rings&&reference.offset===offset&&(mode!=='tile-tiling'||reference.sourceVariant===sourceVariant)?reference:null,[reference,mode,order,rings,offset,sourceVariant]);
  const selectedSpec=current?.tileSpecs.find(spec=>spec.tileIndex===selectedTile);
  useEffect(()=>setSelectedTile(null),[mode,order,rings,offset,sourceVariant]);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setBusy(true);setError('');
      const load=async()=>{
        for(let attempt=0;;attempt++){
          try{return await api<Reference>('tessellation/goldberg-reference',{mode,order,rings,offset,...(mode==='tile-tiling'?{sourceVariant}:{})},controller.signal);}
          catch(cause){
            if(controller.signal.aborted||attempt>=70||!(cause as Error).message.includes('已有镶嵌计算正在进行'))throw cause;
            await waitForWorker(controller.signal);
          }
        }
      };
      void load()
        .then(value=>{if(!controller.signal.aborted)setReference(value);})
        .catch(cause=>{if(!controller.signal.aborted)setError((cause as Error).message);})
        .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    },100);
    return()=>{clearTimeout(timer);controller.abort();};
  },[mode,order,rings,offset,sourceVariant]);
  return <TessDialog title="Goldberg 原版数值参考" onClose={onClose}>
    <div className="spherical-vertex-tabs" role="group" aria-label="Goldberg 参考类型">
      <button aria-pressed={mode==='sector-patch'} onClick={()=>setMode('sector-patch')}>单扇区网格</button>
      <button aria-pressed={mode==='tile-tiling'} onClick={()=>setMode('tile-tiling')}>拼块排布</button>
      <button aria-pressed={mode==='offset-lines'} onClick={()=>setMode('offset-lines')}>偏移线图</button>
      {mode==='sector-patch'&&rings<=4&&<label style={{display:'inline-flex',alignItems:'center',gap:4,marginLeft:'auto',fontSize:11}}><input type="checkbox" checked={showIndices} onChange={event=>setShowIndices(event.target.checked)}/>原版面序</label>}
      {mode!=='tile-tiling'&&<label style={{display:'inline-flex',alignItems:'center',gap:4,marginLeft:mode==='sector-patch'&&rings<=4?0:'auto',fontSize:11}}><input type="checkbox" checked={showDual} onChange={event=>setShowDual(event.target.checked)}/>外心对偶</label>}
    </div>
    <p className="note">m={order}、n={rings}。点选三角面查看原版单元参数；仅供数值参考，没有山谷赋型或平折结果。</p>
    {(mode==='offset-lines'||mode==='tile-tiling')&&<div className="tess-pair">
      {order%2===0?<TessNumberField label={mode==='tile-tiling'?'拼块偏移 o':'参考偏移 o'} value={mode==='tile-tiling'?tileOffset:lineOffset} min={mode==='tile-tiling'?-64:0} max={64} step={mode==='tile-tiling'?.1:1} onChange={mode==='tile-tiling'?value=>{setTileOffset(value);if(value)setSourceVariant('offset');}:setLineOffset}/>:<span className="note">奇数阶完整排布固定 o=0。</span>}
      {mode==='tile-tiling'&&order%2===0&&<label className="select-field">原版函数<select aria-label="Goldberg 拼块原版函数" style={{flex:"1 1 0",minWidth:190,maxWidth:"none"}} value={sourceVariant} onChange={event=>{const variant=event.target.value as 'full'|'offset';setSourceVariant(variant);if(variant==='full')setTileOffset(0);}}><option value="full">GoldbergTiling</option><option value="offset">GoldbergOffsetTiling</option></select></label>}
    </div>}
    {current?<><Drawing reference={current} showDual={showDual} showIndices={showIndices&&rings<=4} selectedTile={selectedTile} onSelectTile={setSelectedTile}/><p className="note">{current.mode==='sector-patch'?`1 个扇区 · ${current.triangleCount} 个三角面`:current.mode==='tile-tiling'?`${current.sourceFunction} · ${current.triangleCount} 个原版三角拼块 · 无桥接线或对偶`:`有序索引线图 ${current.indexedGraph?.vertices.length} 点 / ${current.indexedGraph?.edges.length} 边 · 青色桥接 ${current.indexedGraph?.bridgeEdgeIndices.length} 边${offset>=2*rings&&offset>0?' · 上下三角面不再共边':''}`}{current.dualSegments.length?` · ${current.dualSegments.length} 条紫色有限对偶边`:''}{!current.dualTargets.length&&current.mode==='offset-lines'?' · 当前偏移无连续三角网对偶':''}。</p>{selectedSpec&&<p className="note" data-testid="goldberg-tile-spec" style={{margin:'2px 0',fontVariantNumeric:'tabular-nums'}}>
      第 {selectedSpec.tileIndex} 块 · 扇区 {selectedSpec.wedge} · 单元 ({selectedSpec.cell.join(',')}) {selectedSpec.branch} · UnitTriangleTile 角度 {selectedSpec.anglePiFractions.map(piFraction).join('、')} · 旋转 {piFraction(selectedSpec.rotationPiFraction)} · 起点 ({selectedSpec.offset.map(v=>v.toFixed(4)).join(', ')}) · 缩放 {selectedSpec.scale}
    </p>}</>:
      <div role="status" style={{height:285,display:'grid',placeItems:'center',background:'#f8faf7',border:'1px solid #d5ded6',borderRadius:6}}>{busy?'正在生成数值参考…':error||'准备数值参考…'}</div>}
    {error&&<p role="alert" className="tess-editor-error">{error}</p>}
    <footer><span>参考几何 · 不修改当前折痕</span><button className="primary" onClick={onClose}>关闭</button></footer>
  </TessDialog>;
}
