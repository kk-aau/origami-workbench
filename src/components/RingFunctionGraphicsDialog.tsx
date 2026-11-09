import {useEffect,useState} from 'react';
import {api} from '../app/api';
import type {TessParams} from '../app/tessellation';
import {TessDialog} from './TessellationEditor';

type RingParams=Extract<TessParams,{family:'ring'}>;
type Point=[number,number];
type Reference={
  kind:'origamica-ring-function-graphics';sourceFunction:'RingFunctionGraphics';
  outerCurves:Point[][];creaseCurves:Point[][];sampleCount:101;stepRadians:number;
  outerColor:'Gray';creaseColor:'Lighter[Gray,0.25]';
  creasePattern:false;flatFoldedForm:false;
};

function Drawing({reference}:{reference:Reference}){
  const points=[...reference.outerCurves,...reference.creaseCurves].flat();
  const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const size=Math.max(maxX-minX,maxY-minY,.01),pad=size*.07;
  const path=(curve:Point[])=>curve.map(([x,y],index)=>`${index?'L':'M'}${x} ${-y}`).join(' ');
  return <svg data-testid="ring-function-graphics" aria-label="原版 pfn 与 rfn 输入曲线参考"
    viewBox={`${minX-pad} ${-maxY-pad} ${maxX-minX+2*pad} ${maxY-minY+2*pad}`}
    preserveAspectRatio="xMidYMid meet"
    style={{display:'block',width:'100%',height:285,background:'#fff',border:'1px solid #d5ded6',borderRadius:6}}>
    {reference.outerCurves.map((curve,index)=><path key={`p-${index}`} data-curve={`pfn-${index}`}
      d={path(curve)} fill="none" stroke="#707879" strokeWidth={1.6} vectorEffect="non-scaling-stroke"/>)}
    {reference.creaseCurves.map((curve,index)=><path key={`r-${index}`} data-curve={`rfn-${index}`}
      d={path(curve)} fill="none" stroke="#b2b8ba" strokeWidth={1.5} vectorEffect="non-scaling-stroke"/>)}
  </svg>;
}

/** Origamica RingFunctionGraphics: input curves only; never mutates CP or FF. */
export default function RingFunctionGraphicsDialog({params,onClose}:{params:RingParams;onClose:()=>void}){
  const [reference,setReference]=useState<Reference|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const key=JSON.stringify(params);
  useEffect(()=>{
    const controller=new AbortController();
    let retry:ReturnType<typeof setTimeout>|undefined;
    const run=()=>{
      setBusy(true);setError('');
      void api<Reference>('tessellation/ring-function-graphics',params,controller.signal)
        .then(value=>{if(!controller.signal.aborted)setReference(value);})
        .catch(cause=>{if(controller.signal.aborted)return;
          const message=(cause as Error).message;
          if(message.includes('已有镶嵌计算正在进行'))retry=setTimeout(run,750);
          else setError(message);
        })
        .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    };
    const timer=setTimeout(run,100);
    return()=>{clearTimeout(timer);if(retry)clearTimeout(retry);controller.abort();};
  },[key]);
  return <TessDialog title="原版环状输入曲线" onClose={onClose}>
    <p className="note">对照 RingFunctionGraphics：灰色 pfn {params.rings+1} 条，浅灰 rfn {params.rings} 条；每条按参数角 φ 从 0 到 2π、步长 0.02π 取 101 点。这是输入轮廓预览，不是折痕图或平折图。</p>
    {reference?<Drawing reference={reference}/>:
      <div role="status" style={{height:285,display:'grid',placeItems:'center',background:'#f8faf7',border:'1px solid #d5ded6',borderRadius:6}}>
        {busy?'正在绘制输入曲线…':error||'准备输入曲线…'}
      </div>}
    {error&&<p role="alert" className="tess-editor-error">{error}</p>}
    <footer><span>仅预览输入函数 · 不修改当前折痕</span><button className="primary" onClick={onClose}>关闭</button></footer>
  </TessDialog>;
}
