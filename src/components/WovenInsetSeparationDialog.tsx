import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {api} from '../app/api';
import {readWovenParams,type WovenParams} from '../app/wovenParams';
import {TessDialog} from './TessellationEditor';
import './WovenInsetSeparationDialog.css';

export interface WovenInsetSeparationResult {
  insets:number[];
  separations:number[];
  firstPositiveVertexCollision:number|null;
  faceCount:number;
  insetPointCount:number;
  uniformInset?:boolean;
}

const format=(value:number)=>Number(value.toPrecision(5)).toString();

function checkedResponse(value:WovenInsetSeparationResult,count:number):WovenInsetSeparationResult{
  if(!value||!Array.isArray(value.insets)||!Array.isArray(value.separations)||value.insets.length!==count||
    value.separations.length!==count||value.insets.some(x=>!Number.isFinite(x))||
    value.separations.some(x=>!Number.isFinite(x)||x<0)||
    value.insets.some((x,index)=>index>0&&x<=value.insets[index-1])||
    !Number.isInteger(value.faceCount)||value.faceCount<1||
    !Number.isInteger(value.insetPointCount)||value.insetPointCount<3||
    (value.firstPositiveVertexCollision!==null&&(!Number.isFinite(value.firstPositiveVertexCollision)||value.firstPositiveVertexCollision<=0))){
    throw Error('内缩间距服务返回的数据不完整，未显示曲线。');
  }
  return value;
}

function SeparationCurve({data}:{data:WovenInsetSeparationResult}){
  const [hover,setHover]=useState<number|null>(null);
  const left=49,right=16,top=18,bottom=29,width=720,height=240;
  const spanX=width-left-right,spanY=height-top-bottom;
  const start=data.insets[0],stop=data.insets.at(-1)!,range=Math.max(stop-start,1e-12);
  const maxY=Math.max(...data.separations,1e-9),scaleY=maxY*1.08;
  const x=(h:number)=>left+(h-start)/range*spanX;
  const y=(distance:number)=>top+spanY-distance/scaleY*spanY;
  const points=data.insets.map((h,i)=>`${x(h).toFixed(2)},${y(data.separations[i]).toFixed(2)}`).join(' ');
  const first=data.firstPositiveVertexCollision;
  const firstVisible=first!==null&&first>=start&&first<=stop;
  const onMove=(event:PointerEvent<SVGSVGElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect(),coordinate=(event.clientX-rect.left)/rect.width*width;
    const index=Math.max(0,Math.min(data.insets.length-1,Math.round((coordinate-left)/spanX*(data.insets.length-1))));
    setHover(index);
  };
  const index=hover;
  return <svg className="woven-inset-curve" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
    role="img" aria-label="统一内缩 h 的最小顶点距曲线" onPointerMove={onMove} onPointerLeave={()=>setHover(null)}>
    <title>统一内缩 h 的最小顶点距</title><desc>横轴为统一垂直内缩 h，纵轴为所有内缩面顶点两两之间的最小距离。红线标出扫描范围内首次正向顶点重合。</desc>
    {[0,.5,1].map(fraction=><g key={fraction}><line className="woven-inset-grid" x1={left} x2={width-right} y1={y(scaleY*fraction)} y2={y(scaleY*fraction)}/><text className="woven-inset-axis-text" x={left-7} y={y(scaleY*fraction)+4} textAnchor="end">{format(scaleY*fraction)}</text></g>)}
    <line className="woven-inset-axis" x1={left} x2={width-right} y1={height-bottom} y2={height-bottom}/>
    {[start,(start+stop)/2,stop].map((h,i)=><text className="woven-inset-axis-text" key={i} x={x(h)} y={height-8} textAnchor={i===0?'start':i===2?'end':'middle'}>{format(h)}</text>)}
    <text className="woven-inset-axis-title" x={width-right} y={height-8} textAnchor="end">h</text>
    <polygon className="woven-inset-area" points={`${left},${height-bottom} ${points} ${width-right},${height-bottom}`}/>
    <polyline className="woven-inset-line" points={points}/>
    {firstVisible&&<g><line className="woven-inset-collision" x1={x(first)} x2={x(first)} y1={top} y2={height-bottom}/><circle className="woven-inset-collision-dot" cx={x(first)} cy={y(0)} r="4"/></g>}
    {index!==null&&<g className="woven-inset-hover"><line x1={x(data.insets[index])} x2={x(data.insets[index])} y1={top} y2={height-bottom}/><circle cx={x(data.insets[index])} cy={y(data.separations[index])} r="4"/><text x={x(data.insets[index])+(x(data.insets[index])>width/2?-7:7)} y={Math.max(top+15,y(data.separations[index])-10)} textAnchor={x(data.insets[index])>width/2?'end':'start'}>h {format(data.insets[index])} · 距离 {format(data.separations[index])}</text></g>}
  </svg>;
}

/** Origamica's diagnostic uses one common perpendicular inset for every mother edge. */
export default function WovenInsetSeparationDialog({params,onClose}:{params:WovenParams;onClose:()=>void}){
  const originalSource=params.mode==='graph'&&!!params.graphSource;
  const [start,setStart]=useState('0'),[stop,setStop]=useState(originalSource?'10':'0.2'),[count,setCount]=useState(originalSource?'21':'64');
  const [result,setResult]=useState<WovenInsetSeparationResult|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const change=(setter:(text:string)=>void)=>(text:string)=>{request.current?.abort();request.current=null;setBusy(false);setError('');setResult(null);setter(text);};
  const calculate=async()=>{
    const startValue=Number(start),stopValue=Number(stop),countValue=Number(count);
    if(!start.trim()||!stop.trim()||!count.trim()||!Number.isFinite(startValue)||!Number.isFinite(stopValue)||
      startValue<0||stopValue<=startValue||stopValue>100||!Number.isInteger(countValue)||countValue<2||countValue>201){
      setError('请输入 0 ≤ 起点 < 终点 ≤ 100，采样数为 2–201 的整数。');return;
    }
    const raw=structuredClone(params) as unknown as Record<string,unknown>;
    delete raw.paper;delete raw.pruneBoundary;
    const current=readWovenParams(raw);
    if(!current){setError('当前线组参数无效，请先检查或恢复线组构造。');return;}
    request.current?.abort();setError('');setResult(null);
    const controller=new AbortController();request.current=controller;setBusy(true);
    try{
      const response=await api<WovenInsetSeparationResult>('tessellation/woven-inset-separation',
        {params:current,start:startValue,stop:stopValue,count:countValue},controller.signal);
      if(!controller.signal.aborted)setResult(checkedResponse(response,countValue));
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:String(cause));}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  };
  const usesVariableWidths='lines' in params&&new Set(params.lines.map(line=>line[2])).size>1;
  const hasSegmentInsets=!!params.segmentInsets?.length;
  return <TessDialog title="线组内缩间距" onClose={onClose}>
    <div className="woven-inset-dialog">
      <p className="woven-inset-intro">沿当前编织母结构的每条边统一垂直内缩 h，观察所有内缩面顶点的最小距离。查询只分析母结构，不修改折痕。</p>
      <div className="woven-inset-controls">
        <label>h 起点<input aria-label="内缩起点" type="number" min="0" max="100" step="0.001" value={start} onChange={event=>change(setStart)(event.target.value)}/></label>
        <label>h 终点<input aria-label="内缩终点" type="number" min="0" max="100" step="0.001" value={stop} onChange={event=>change(setStop)(event.target.value)}/></label>
        <label>采样数<input aria-label="内缩采样数" type="number" min="2" max="201" step="1" value={count} onChange={event=>change(setCount)(event.target.value)}/></label>
        <button className="primary" disabled={busy} onClick={()=>void calculate()}>{busy?'计算中…':'计算间距'}</button>
      </div>
      <div className="woven-inset-plot" data-testid="woven-inset-plot">{result?<SeparationCurve data={result}/>:<div className="woven-inset-placeholder" role="status">{busy?'正在重建当前母线组并采样…':'设置范围后计算最小顶点距曲线'}</div>}</div>
      {result&&<div className="woven-inset-readout" aria-label="内缩分析结果">
        <div><span>首个正向顶点碰撞</span><strong data-testid="woven-first-collision">{result.firstPositiveVertexCollision===null?'范围内未发现':`h = ${format(result.firstPositiveVertexCollision)}`}</strong></div>
        <div><span>母结构采样对象</span><strong>{result.faceCount} 面 · {result.insetPointCount} 内缩点</strong></div>
      </div>}
      {error&&<p className="woven-inset-error" role="alert">{error}</p>}
      <p className="woven-inset-caveat">{result?.firstPositiveVertexCollision===null?'“未发现”只表示当前扫描上界内未见顶点精确重合。':''}此处每条母边统一内缩同一个 h{usesVariableWidths||hasSegmentInsets?`；当前构造${usesVariableWidths?'有不同逐线倍率':''}${usesVariableWidths&&hasSegmentInsets?'，':''}${hasSegmentInsets?'还有逐段内缩覆盖':''}`:''}。碰撞 h 不能直接当作实际褶宽安全上限，仍须验证实际构造与平折。</p>
    </div>
  </TessDialog>;
}
